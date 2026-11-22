import { describe, expect, it } from 'vitest';
import type { SceneLord } from '../../village-view';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { LORD_CYCLE, LORD_CYCLE_S } from '../lord-day';
import { RIDE_PACE, straightLeg } from '../rider-route';
import {
  createRideState,
  isAway,
  isRiding,
  LEAD_M_S,
  withLead,
  rideState,
  ridingHorseIds,
  RIDE_HORSE_SCALE,
  RIDER_SEAT_M,
  ridePlans,
  rideHorsePose,
  riderPose,
  type RidePlanInput,
} from '../riders';
import { createVillagerPose } from '../villager-motion';

const LORD: SceneLord = {
  home: 1,
  trainees: [],
  household: [],
  riders: [
    { id: 10, horseId: 1, training: 40, hours: 2 },
    { id: 12, horseId: 2, training: 10, hours: 2 },
  ],
};
const DAY_MS = 86_400;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + DAY_MS };
const input = (lord: SceneLord, month = 6): RidePlanInput => ({
  village: {
    fields: [
      { id: 1, parts: [{ x: 0, z: 40, size: 20 }] },
      { id: 2, parts: [{ x: 0, z: -40, size: 20 }] },
    ],
    trails: [],
    labor: { month },
  } as unknown as RidePlanInput['village'],
  lord,
  hitch: { x: 4, z: 0, headingX: 1, headingZ: 0 },
  homes: [{ x: 0, z: 0 }],
  leg: straightLeg,
  window,
});
/**
 * Čas (s) `s` sekund po začátku výcvikové jízdy cyklu `k` dne rodiny (lord-day.ts – `rideSlot`;
 * villagers.md – Bez časosběru): jízda ve skutečném čase, ne v hodinách herního dne.
 */
const ride = (s: number, k = 3): number => k * LORD_CYCLE_S + LORD_CYCLE.ride + s;
/** Jízda dvou hodin jádra = 4 minuty. */
const RIDE_S = 240;

describe('jezdec na koni (horses.md – Ve scéně)', () => {
  it('jezdec sedí na svém koni – stejná poloha, zvednutý o sed, klip sedu', () => {
    const plans = ridePlans(input(LORD));
    expect(plans.map((p) => [p.riderId, p.horseId])).toEqual([
      [10, 1],
      [12, 2],
    ]);
    for (const plan of plans) {
      const t = ride(100);
      const horse = rideHorsePose(plan, t, createRideState(), createLivestockPose());
      const rider = riderPose(plan)(t, [], createVillagerPose());
      expect(rider.x).toBeCloseTo(horse.x, 6);
      expect(rider.z).toBeCloseTo(horse.z, 6);
      expect(rider.headingX).toBeCloseTo(horse.forwardX, 6);
      expect(['ride', 'ride-trot']).toContain(rider.clip);
      expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    }
  });

  it('druhý ve skupině na začátku jízdy čeká na stojícím koni – klip sedu na místě', () => {
    const [lead] = ridePlans(input(LORD));
    // jezdec kus za čelem skupiny (rideGroups – jedou po dvou)
    const second = { ...lead!, behind: 0.5 };
    const start = ride(0.01);
    const horse = rideHorsePose(second, start, createRideState(), createLivestockPose());
    const rider = riderPose(second)(start, [], createVillagerPose());
    expect(horse.stride).toBe(0);
    expect(rider.clip).toBe('ride-idle');
    expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    // za chvíli už jede
    expect(['ride', 'ride-trot']).toContain(
      riderPose(second)(ride(100), [], createVillagerPose()).clip,
    );
  });

  it('jede v každém cyklu dne rodiny minuty ve skutečném čase, jinak kůň stojí u kůlu', () => {
    const [lead, second] = ridePlans(input(LORD));
    expect(lead!.blocks).toBeNull();
    expect(lead!.period).toBe(LORD_CYCLE_S * 1000);
    expect((lead!.span![1] - lead!.span![0]) / 1000).toBe(RIDE_S);
    const still = rideHorsePose(lead!, ride(-300), createRideState(), createLivestockPose());
    expect(still.stride).toBe(0);
    // u kůlu vedle koně je jezdec vidět – noc herního dne nic neschovává
    expect(riderPose(lead!)(ride(-300), [], createVillagerPose()).hidden).toBe(false);
    expect(isRiding(lead!, ride(-60))).toBe(false);
    expect(isRiding(lead!, ride(RIDE_S + 10))).toBe(false);
    expect(isRiding(lead!, ride(100))).toBe(true);
    expect(isRiding(lead!, ride(100, 4))).toBe(true);
    const a = rideHorsePose(lead!, ride(100), createRideState(), createLivestockPose());
    const b = rideHorsePose(second!, ride(100), createRideState(), createLivestockPose());
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    expect(Math.hypot(a.x - still.x, a.z - still.z)).toBeGreaterThan(0);
    // po trase krokem až klusem – nikdy rychleji (na ose skupiny, bez odsazení do strany)
    const state = createRideState();
    const axis = { ...lead!, side: 0 };
    let prev: { x: number; z: number } | null = null;
    for (let t = ride(0); t < ride(RIDE_S); t += 0.5) {
      const p = rideHorsePose(axis, t, state, createLivestockPose());
      if (prev)
        expect(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.5).toBeLessThanOrEqual(
          RIDE_PACE.trot * 1.05,
        );
      prev = { x: p.x, z: p.z };
    }
  });

  it('skupina jede spolu – délku jízdy dá nejdelší jízda ve skupině', () => {
    const lord: SceneLord = {
      ...LORD,
      riders: [
        { id: 10, horseId: 1, training: 40, hours: 1 },
        { id: 12, horseId: 2, training: 10, hours: 2 },
      ],
    };
    const plans = ridePlans(input(lord));
    expect(plans.map((p) => p.span)).toEqual([plans[1]!.span, plans[1]!.span]);
    expect((plans[0]!.span![1] - plans[0]!.span![0]) / 1000).toBe(RIDE_S);
  });

  it('jízda, která zasáhne do lovu jezdce (`except`), se nejede – další ano', () => {
    const [plan] = ridePlans(input(LORD));
    const ms = (t: number): number => LIVESTOCK_EPOCH_MS + t * 1000;
    const hunted = { ...plan!, except: [ms(ride(-30)), ms(ride(600))] as const };
    expect(isRiding(hunted, ride(100))).toBe(false);
    expect(isRiding(hunted, ride(100, 4))).toBe(true);
    expect(isRiding(hunted, ride(100, 2))).toBe(true);
  });

  it('jízda začíná i končí u kůlu – žádný pop-in uprostřed trasy, žádný skok', () => {
    const [plan] = ridePlans(input(LORD));
    const pose = (t: number): { x: number; z: number } =>
      rideHorsePose(plan!, t, createRideState(), createLivestockPose());
    const hitch = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - plan!.hitch.x, p.z - plan!.hitch.z);
    expect(hitch(pose(ride(-0.01)))).toBeLessThan(0.5);
    expect(hitch(pose(ride(0.01)))).toBeLessThan(3);
    expect(hitch(pose(ride(RIDE_S - 0.01)))).toBeLessThan(3);
    expect(hitch(pose(ride(RIDE_S + 0.01)))).toBeLessThan(0.5);
    // v půlce jízdy ujel po trase nejvíc, pak se vrací; na obratu se nepřenese stranou
    const far = (t: number): number => rideState(plan!, t, createRideState()).distance;
    expect(far(ride(RIDE_S / 2))).toBeGreaterThan(far(ride(20)));
    expect(far(ride(RIDE_S / 2))).toBeGreaterThan(far(ride(RIDE_S - 20)));
    const turn = (dt: number): { x: number; z: number } => pose(ride(RIDE_S / 2 + dt));
    expect(Math.hypot(turn(0.1).x - turn(-0.1).x, turn(0.1).z - turn(-0.1).z)).toBeLessThan(1);
  });

  it('na koni je jezdec vidět, i když ho rozvrh posílá domů – kůň nikdy bez jezdce', () => {
    const plans = ridePlans(input(LORD));
    // pózy, které rozvrh vrátí skryté: doma, konec průvodu domů (pohřeb, svatba), povodeň či pauza
    const scheduled = [
      { ...createVillagerPose(), hidden: true, stage: 'home' as const },
      { ...createVillagerPose(), hidden: true, stage: 'back' as const },
      { ...createVillagerPose(), hidden: true },
    ];
    let mounted = 0;
    for (const plan of plans) {
      const pose = riderPose(plan);
      for (let t = ride(-20); t < ride(RIDE_S + 20); t += 1) {
        if (!isRiding(plan, t)) continue;
        mounted++;
        for (const s of scheduled) {
          const out = pose(t, [], { ...s });
          expect(out.hidden).toBe(false);
          // úsek rozvrhu (domů) přepíše jízda – panel řekne „jede na koni“
          expect(out.stage).toBe('ride');
          expect(['ride', 'ride-trot', 'ride-idle']).toContain(out.clip);
        }
      }
    }
    expect(mounted).toBeGreaterThan(0);
  });

  // lord-real-time.md – Co zbylo: kůň skočil z ohrady ke kůlu na začátku jízdy (a zpět)
  it('kůň dojde z branky ohrady ke kůlu před jízdou a po ní zpět – neskočí', () => {
    const gate = { x: 30, z: 20 };
    const [plan] = ridePlans(input(LORD)).map((p) => withLead(p, gate, straightLeg));
    const state = createRideState();
    let prev: { x: number; z: number; away: boolean } | null = null;
    let led = 0;
    for (let t = ride(-120); t < ride(RIDE_S + 120); t += 0.25) {
      const away = isAway(plan!, t);
      const p = rideHorsePose(plan!, t, state, createLivestockPose());
      if (prev && prev.away !== away) {
        // z ohrady vyjde a do ní vejde u branky
        const at = away ? p : prev;
        expect(Math.hypot(at.x - gate.x, at.z - gate.z), `${t}`).toBeLessThan(1);
      }
      // cestou z ohrady a do ní krokem (jízdu po trase hlídají testy výš)
      if (prev?.away && away && !isRiding(plan!, t) && !isRiding(plan!, t - 0.25)) {
        const speed = Math.hypot(p.x - prev.x, p.z - prev.z) / 0.25;
        expect(speed, `${t}`).toBeLessThanOrEqual(LEAD_M_S * 1.05);
        if (speed > 0.5) led++;
      }
      prev = { x: p.x, z: p.z, away };
    }
    // tam i zpět krokem bez jezdce
    expect(led * 0.25).toBeGreaterThan((2 * plan!.lead!.length) / LEAD_M_S - 2);
    // u kůlu stojí, kde jízda začne, když jezdec nasedá
    const start = rideHorsePose(plan!, ride(-1), state, createLivestockPose());
    const go = rideHorsePose(plan!, ride(0.01), state, createLivestockPose());
    expect(Math.hypot(start.x - go.x, start.z - go.z)).toBeLessThan(0.1);
    expect(Math.hypot(start.x - plan!.hitch.x, start.z - plan!.hitch.z)).toBeLessThan(5);
    expect(start.stride).toBe(0);
  });

  it('koně na jízdě v čase (ohrada je pustí jen v jízdě)', () => {
    const plans = ridePlans(input(LORD));
    const ms = (t: number): number => LIVESTOCK_EPOCH_MS + t * 1000;
    expect([...ridingHorseIds(plans, ms(ride(100)))].sort()).toEqual([1, 2]);
    expect(ridingHorseIds(plans, ms(ride(-200))).size).toBe(0);
    expect(ridingHorseIds(plans, ms(ride(600))).size).toBe(0);
  });

  it('bez jezdců žádné jízdy', () => {
    expect(ridePlans(input({ ...LORD, riders: [] }))).toEqual([]);
  });
});
