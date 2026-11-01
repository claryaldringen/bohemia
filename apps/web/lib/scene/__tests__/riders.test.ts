import { describe, expect, it } from 'vitest';
import type { SceneLord } from '../../village-view';
import { createLivestockPose, LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import {
  HUNT_PACE,
  HUNT_SWEEP_M,
  HUNT_WAY_SHARE,
  huntRoute,
  straightLeg,
  wayLength,
} from '../rider-route';
import {
  createRideState,
  HUNT_REAL_S,
  HUNT_START_H,
  huntPlans,
  isRiding,
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
import type { Point } from '../villager-plan-types';

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
/** Čas (s) v hodinu `hour` herního dne. */
const at = (hour: number): number => ((hour / 24) * DAY_MS) / 1000;

describe('jezdec na koni (horses.md – Ve scéně)', () => {
  it('jezdec sedí na svém koni – stejná poloha, zvednutý o sed, klip sedu', () => {
    const plans = ridePlans(input(LORD));
    expect(plans.map((p) => [p.riderId, p.horseId])).toEqual([
      [10, 1],
      [12, 2],
    ]);
    for (const plan of plans) {
      const t = at(8.4);
      const horse = rideHorsePose(plan, t, createRideState(), createLivestockPose());
      const rider = riderPose(plan)(t, [], createVillagerPose());
      expect(rider.x).toBeCloseTo(horse.x, 6);
      expect(rider.z).toBeCloseTo(horse.z, 6);
      expect(rider.headingX).toBeCloseTo(horse.forwardX, 6);
      expect(['ride', 'ride-trot']).toContain(rider.clip);
      expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    }
  });

  it('druhý ve skupině na začátku bloku čeká na stojícím koni – klip sedu na místě', () => {
    const [lead] = ridePlans(input(LORD));
    // jezdec kus za čelem skupiny (rideGroups – jedou po dvou)
    const second = { ...lead!, behind: 0.5 };
    const start = at(8) + 0.01;
    const horse = rideHorsePose(second, start, createRideState(), createLivestockPose());
    const rider = riderPose(second)(start, [], createVillagerPose());
    expect(horse.stride).toBe(0);
    expect(rider.clip).toBe('ride-idle');
    expect(rider.lift).toBeCloseTo(RIDER_SEAT_M * RIDE_HORSE_SCALE, 6);
    // v půli bloku už jede
    expect(['ride', 'ride-trot']).toContain(
      riderPose(second)(at(8.4), [], createVillagerPose()).clip,
    );
  });

  it('jede jen v bloku jízdy (po luku a boji), jinak kůň stojí u kůlu a jezdec je doma', () => {
    const [lead, second] = ridePlans(input(LORD));
    // trainees prázdné: luk ani boj, bloky jízdy 8–9 a 14–15 h (po hodině z dvou)
    expect(lead!.blocks).toEqual([
      [8, 9],
      [14, 15],
    ]);
    const night = rideHorsePose(lead!, at(23), createRideState(), createLivestockPose());
    expect(night.stride).toBe(0);
    expect(riderPose(lead!)(at(23), [], createVillagerPose()).hidden).toBe(true);
    expect(isRiding(lead!, at(12))).toBe(false);
    expect(isRiding(lead!, at(8.4))).toBe(true);
    expect(isRiding(lead!, at(14.4))).toBe(true);
    const a = rideHorsePose(lead!, at(8.4), createRideState(), createLivestockPose());
    const b = rideHorsePose(second!, at(8.4), createRideState(), createLivestockPose());
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
    expect(Math.hypot(a.x - night.x, a.z - night.z)).toBeGreaterThan(0);
  });

  it('blok jízdy začíná po luku a boji podle hodin jádra', () => {
    const lord: SceneLord = {
      ...LORD,
      trainees: [{ id: 10, bow: 2, combat: 2, riding: 2 } as SceneLord['trainees'][number]],
    };
    const [plan] = ridePlans(input(lord));
    expect(plan!.blocks).toEqual([
      [10, 11],
      [16, 17],
    ]);
  });

  it('blok začíná i končí u kůlu – ráno žádný pop-in uprostřed trasy, večer žádný skok', () => {
    const [plan] = ridePlans(input(LORD));
    const pose = (hour: number): { x: number; z: number } =>
      rideHorsePose(plan!, at(hour), createRideState(), createLivestockPose());
    const hitch = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - plan!.hitch.x, p.z - plan!.hitch.z);
    // těsně před začátkem (u kůlu) a těsně po začátku bloku: kousek od kůlu
    expect(hitch(pose(7.99))).toBeLessThan(0.5);
    expect(hitch(pose(8.01))).toBeLessThan(3);
    // konec bloku: zpět u kůlu a hned po něm stojí tamtéž
    expect(hitch(pose(8.99))).toBeLessThan(3);
    expect(hitch(pose(9.01))).toBeLessThan(0.5);
    // v půlce bloku je od kůlu nejdál
    expect(hitch(pose(8.5))).toBeGreaterThan(hitch(pose(8.1)));
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
      for (let hour = 0; hour < 24; hour += 0.05) {
        const t = at(hour);
        if (!isRiding(plan, t)) continue;
        mounted++;
        for (const s of scheduled) {
          const out = pose(t, [], { ...s });
          expect(out.hidden).toBe(false);
          expect(out.stage).toBeUndefined();
          expect(['ride', 'ride-trot', 'ride-idle']).toContain(out.clip);
        }
      }
    }
    expect(mounted).toBeGreaterThan(0);
  });

  it('koně na jízdě v čase (ohrada je pustí jen v bloku)', () => {
    const plans = ridePlans(input(LORD));
    const ms = (hour: number): number => LIVESTOCK_EPOCH_MS + at(hour) * 1000;
    expect([...ridingHorseIds(plans, ms(8.4))].sort()).toEqual([1, 2]);
    expect(ridingHorseIds(plans, ms(12)).size).toBe(0);
    expect(ridingHorseIds(plans, ms(23)).size).toBe(0);
  });

  it('bez jezdců žádné jízdy', () => {
    expect(ridePlans(input({ ...LORD, riders: [] }))).toEqual([]);
  });
});

describe('lov ve scéně (huntPlans – wildlife.md, Ve scéně)', () => {
  const hunt = {
    target: 'game' as const,
    riders: [
      { id: 10, horseId: 1 },
      { id: 12, horseId: 2 },
    ],
    foot: [20, 21],
    kills: 1,
  };
  const huntInput = {
    hunt,
    hitch: { x: 4, z: 0, headingX: 1, headingZ: 0 },
    edge: { x: 104, z: 0 },
    leg: straightLeg,
    walkable: (): boolean => true,
    window,
  };
  const hourT = (h: number): number => (h / 24) * (DAY_MS / 1000);
  /** Lov ve skutečném čase (s): za šera dne lovu, HUNT_REAL_S dlouho. */
  const HUNT_T = [hourT(HUNT_START_H), hourT(HUNT_START_H) + HUNT_REAL_S] as const;

  it('jezdci a pěší vyrazí za šera, v půlce lovu jsou u lesa a na konci zase u kůlu', () => {
    const { rides, foot } = huntPlans(huntInput);
    expect(rides.map((r) => r.riderId)).toEqual([10, 12]);
    expect(foot.map((r) => r.riderId)).toEqual([20, 21]);
    const state = createRideState();
    for (const plan of [rides[0]!, foot[0]!]) {
      expect(isRiding(plan, HUNT_T[0] - 2)).toBe(false);
      expect(isRiding(plan, HUNT_T[1] + 2)).toBe(false);
      rideState(plan, (HUNT_T[0] + HUNT_T[1]) / 2 - 1, state);
      // u okraje lesa (sem a tam podél něj nejvýš o HUNT_SWEEP_M)
      expect(Math.hypot(state.x - 104, state.z)).toBeLessThan(HUNT_SWEEP_M.along + 8);
      rideState(plan, HUNT_T[1] - 0.05, state);
      expect(Math.hypot(state.x - 4, state.z)).toBeLessThan(6);
    }
  });

  it('trasa pokryje půlku bloku – jízda se nepřetočí na začátek; pěší stojí s oštěpem', () => {
    const halfS = HUNT_REAL_S / 2;
    const way = [huntInput.hitch, { x: 44, z: 0 }];
    const sweep: [Point, Point] = [
      { x: 50, z: 20 },
      { x: 50, z: -20 },
    ];
    const ride = huntRoute(way, sweep, false, halfS)!;
    const walk = huntRoute(way, sweep, true, halfS)!;
    expect(ride.period).toBeGreaterThanOrEqual(halfS);
    expect(walk.period).toBeGreaterThanOrEqual(halfS);
    expect(Math.max(...ride.pace)).toBeLessThanOrEqual(HUNT_PACE.ride.max);
    expect(walk.pace.some((p) => p === HUNT_PACE.stop)).toBe(true);
    expect(ride.pace.some((p) => p === HUNT_PACE.stop)).toBe(false);
  });

  it('pěší lovec stojí s oštěpem u okraje lesa dřív, než se v půlce bloku obrátí', () => {
    const halfS = HUNT_REAL_S / 2;
    // cesta k lesu na hranici dosahu – zabere celých 70 % půlky bloku
    const way = [huntInput.hitch, { x: 104, z: 0 }];
    const sweep: [Point, Point] = [
      { x: 110, z: 22 },
      { x: 110, z: -22 },
    ];
    const walk = huntRoute(way, sweep, true, halfS)!;
    const k = walk.pace.findIndex((p) => p === HUNT_PACE.stop);
    expect(k).toBeGreaterThan(0);
    // úsek zastávky začne i skončí před obratem
    expect(walk.times[k + 1]!).toBeLessThan(halfS);
    expect(Math.hypot(walk.points[k + 1]!.x - 104, walk.points[k + 1]!.z)).toBeLessThan(0.5);
  });

  it('lovci vždy stihnou dojít k lesu a vrátit se – daleký les u zvěře nahradí bližší', () => {
    const halfS = HUNT_REAL_S / 2;
    const state = createRideState();
    // les u zvěře dál, než dojdou pěší chůzí i jezdci klusem za 70 % půlky lovu
    const far = { ...huntInput, edge: { x: 1004, z: 0 } };
    // bližší okraj lesa 90 m od kůlu – pěší i jezdci k němu
    const near = huntPlans({ ...far, nearEdge: { x: 4, z: 90 } });
    for (const plan of [near.foot[0]!, near.rides[0]!]) {
      rideState(plan, (HUNT_T[0] + HUNT_T[1]) / 2 - 1, state);
      expect(Math.hypot(state.x - 4, state.z - 90)).toBeLessThan(HUNT_SWEEP_M.along + 8);
    }
    // bez bližšího lesa svižnou chůzí, nejdál kam za cestu dojdou – cesta se vejde do půlky lovu
    const alone = huntPlans(far).foot[0]!;
    const route = alone.route!;
    const wayEnd = route.points.findIndex((p) => p.x > 1003 || p.z !== 0);
    expect(Math.max(...route.pace)).toBeLessThanOrEqual(HUNT_PACE.foot.max);
    expect(route.times[wayEnd === -1 ? route.points.length - 1 : wayEnd - 1]!).toBeLessThanOrEqual(
      HUNT_WAY_SHARE * halfS + 1e-6,
    );
    expect(wayLength(route.points.slice(0, 2))).toBeLessThanOrEqual(
      HUNT_PACE.foot.max * HUNT_WAY_SHARE * halfS + 1e-6,
    );
    for (const plan of [near.foot[0]!, near.rides[0]!, alone]) {
      rideState(plan, HUNT_T[1] - 0.05, state);
      expect(Math.hypot(state.x - 4, state.z)).toBeLessThan(6);
    }
  });

  it('plán lovu je čistá funkce vstupu a bez hodin světa se neloví', () => {
    expect(JSON.stringify(huntPlans(huntInput))).toBe(JSON.stringify(huntPlans(huntInput)));
    expect(huntPlans({ ...huntInput, window: null })).toEqual({ rides: [], foot: [] });
  });
});
