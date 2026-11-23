// Lidé ve scéně nesprintují (villagers.md – Činnosti od začátku do konce; Martin 1. 11. 2026:
// „Občas ve hře vidím nějakého vesničana, jak brutálně sprintuje“): kování, trasa k lesu
// (`huntRoute`), karavany, výcviková jízda a svoz úrody jdou přirozenou chůzí – rychlost nejvýš ≈ 1,3× chůze a klip chůze nejvýš ≈ 1,3× –
// ve skutečném čase přes tolik herních dní, kolik trvají.
import { describe, expect, it } from 'vitest';
import type { SceneExpedition, SceneLord, SceneVillage } from '../../village-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { LORD_CYCLE, LORD_CYCLE_S } from '../lord-day';
import { ActivityMemory, caravanEndMs } from '../activity-memory';
import { CART_SPEED_M_S, shuttleAt, shuttleRoute } from '../cart-layout';
import { caravanHead, caravanSpeed, caravanTimeline } from '../caravan';
import { HUNT_PACE, huntRoute } from '../rider-route';
import { shoeingSchedule } from '../shoeing-plan';
import { walkSpeed } from '../villager-motion';

const DAY_MS = 86_400;
const window = (day: number): { startMs: number; endMs: number } => ({
  startMs: day * DAY_MS,
  endMs: (day + 1) * DAY_MS,
});
const LENGTHS = [100, 300, 600, 1000];
const BRISK = 1.3;
/** Půlka desetiminutového bloku trasy k lesu (s) – tam nebo zpět. */
const HUNT_HALF_S = 300;

describe('lidé ve scéně nesprintují', () => {
  it('kovář jde ke koním a zpět chůzí – kování trvá ve skutečném čase', () => {
    const walk = walkSpeed('man', 'walk', 1.2);
    for (const m of LENGTHS) {
      const s = shoeingSchedule(m, 3, 0, walk);
      expect(s.speed / walk, `${m} m`).toBeLessThanOrEqual(BRISK);
      // cesta 1 km trvá ≈ 14 minut – přes deset herních dní, ne pár sekund
      expect((s.arriveMs - s.departMs) / 1000, `${m} m`).toBeCloseTo(m / walk, 6);
    }
  });

  it('trasa k lesu: pěší jdou chůzí, jezdci nejvýš klusem', () => {
    const foot = walkSpeed('man', 'walk-spear', 1.2);
    for (const m of LENGTHS) {
      const way = [
        { x: 0, z: 0 },
        { x: m, z: 0 },
      ];
      const walking = huntRoute(way, null, true, HUNT_HALF_S)!;
      expect(Math.max(...walking.pace) / foot, `${m} m`).toBeLessThanOrEqual(BRISK);
      const riding = huntRoute(way, null, false, HUNT_HALF_S)!;
      expect(Math.max(...riding.pace), `${m} m`).toBeLessThanOrEqual(HUNT_PACE.ride.max);
    }
  });

  it('karavana jde chůzí, s vozem nebo dobytkem tempem volů', () => {
    const walk = walkSpeed('man', 'walk', 1.2);
    const people = { carts: [], onMap: 0.75 };
    const oxen = { carts: [7], onMap: 0.75 };
    expect(caravanSpeed(people) / walk).toBeLessThanOrEqual(BRISK);
    expect(caravanSpeed(oxen)).toBeLessThanOrEqual(CART_SPEED_M_S);
    for (const m of LENGTHS) {
      const columns = { out: 6, back: 6 };
      const t = caravanTimeline(people, window(0), m, columns);
      const head = caravanHead(t, t.startMs + 10_000, m, columns);
      expect(head.speed / walk, `${m} m`).toBeLessThanOrEqual(BRISK);
      // tam, den u souseda, zpátky
      expect((t.outEndMs - t.startMs) / 1000).toBeCloseTo((m + 6) / caravanSpeed(people), 6);
      expect(t.awayEndMs - t.outEndMs).toBe(DAY_MS);
      expect(caravanHead(t, (t.outEndMs + t.awayEndMs) / 2, m, columns).leg).toBe('away');
      expect(caravanHead(t, t.endMs - 1000, m, columns).leg).toBe('back');
      expect(caravanHead(t, t.endMs + 3_600_000, m, columns).leg).toBe('done');
    }
  });

  it('vůz se svozem úrody jede tempem volů', () => {
    for (const m of LENGTHS) {
      const shuttle = shuttleRoute(
        [
          { x: 0, z: 0 },
          { x: m, z: 0 },
        ],
        'two-wheel',
      );
      const out = { s: 0, speed: 0, loaded: false };
      for (let ms = 0; ms < 600_000; ms += 5000) {
        shuttleAt(shuttle, { phase: 0 }, ms, out);
        expect(out.speed, `${m} m`).toBeLessThanOrEqual(CART_SPEED_M_S);
      }
    }
  });
});

const TRAIL = {
  id: 40,
  direction: 'E' as const,
  built: true,
  points: [
    { x: 0, z: 0 },
    { x: 600, z: 0 },
  ],
};

function expedition(over: Partial<SceneExpedition> = {}): SceneExpedition {
  return {
    id: 9,
    trailId: 40,
    porters: 4,
    carts: [],
    cartCrew: 2,
    leaving: [],
    coming: [],
    carriesOut: true,
    carriesBack: true,
    progress: 0,
    rate: 0.25,
    day: 10,
    startDay: 10,
    onMap: 0.75,
    ...over,
  };
}

const village = (over: Partial<SceneVillage>): SceneVillage =>
  ({ dwellings: [], fields: [], trails: [TRAIL], ...over }) as SceneVillage;

describe('scéna dohraje karavanu a výcvikovou jízdu, které data už nemají (activity-memory.ts)', () => {
  it('karavana vrácená v jádru jde ve scéně dál, po návratu ve skutečném čase zmizí', () => {
    const memory = new ActivityMemory();
    const e = expedition();
    const seen = memory.apply(village({ expeditions: [e] }), window(10).startMs, window);
    expect(seen.expeditions).toHaveLength(1);
    // o čtyři herní dny později výprava v jádru skončila – karavana ještě jde (600 m tam a zpět)
    const later = memory.apply(village({}), window(14).startMs, window);
    expect(later.expeditions?.map((x) => x.id)).toEqual([9]);
    const end = caravanEndMs(e, [TRAIL], window(10))!;
    expect(end).toBeGreaterThan(window(14).startMs);
    expect(memory.apply(village({}), end + 1, window).expeditions).toBeUndefined();
  });

  // dřív se na pár minut zdvojil koupený dobytek a lidé od souseda (v jádru už ve vsi, ve scéně
  // ještě s karavanou) – návrh Clauda 2. 11. 2026: do vsi přijdou, až karavana ve scéně dojde
  it('koupený dobytek a lidé od souseda jsou ve vsi, až karavana ve scéně dojde', () => {
    const memory = new ActivityMemory();
    const person = (id: number, age: number) => ({
      id,
      age,
      sex: 'male' as const,
      home: 1,
      role: 'farmer' as const,
    });
    const labor = (ids: [number, number][]) =>
      ({
        day: 10,
        month: 6,
        people: { children: 0, adults: 2, elders: 0 },
        shares: [],
        persons: ids.map(([id, age]) => person(id, age)),
      }) as unknown as SceneVillage['labor'];
    const pen = (cows: number, oxen: number) =>
      ({ id: 3, built: true, cows, oxen, trainees: 0 }) as unknown as NonNullable<
        SceneVillage['pens']
      >[number];
    const e = expedition({
      coming: [{ sex: 'female', age: 20 }],
      cattle: { out: { cows: 0, oxen: 0 }, back: { cows: 2, oxen: 1 } },
    });
    memory.apply(
      village({ expeditions: [e], labor: labor([[1, 30]]), pens: [pen(1, 0)] }),
      window(10).startMs,
      window,
    );
    // jádro: výprava je doma – žena od souseda (id 7) i koupené krávy a vůl jsou ve vsi, narodilo se
    // dítě (id 8, 0 let)
    const home = village({
      labor: labor([
        [1, 30],
        [7, 20],
        [8, 0],
      ]),
      pens: [pen(3, 1)],
      livestock: { sheep: 0, goat: 0, pig: 0, cow: 2 },
    });
    const walking = memory.apply(home, window(14).startMs, window);
    expect(walking.expeditions?.map((x) => x.id)).toEqual([9]);
    expect(walking.labor?.persons?.map((p) => p.id)).toEqual([1, 8]);
    expect(walking.pens?.[0]).toMatchObject({ cows: 1, oxen: 0 });
    expect(walking.livestock?.cow).toBe(0);
    // karavana ve scéně došla – všichni ve vsi
    const end = caravanEndMs(e, [TRAIL], window(10))!;
    const arrived = memory.apply(home, end + 1, window);
    expect(arrived.labor?.persons?.map((p) => p.id)).toEqual([1, 7, 8]);
    expect(arrived.pens?.[0]).toMatchObject({ cows: 3, oxen: 1 });
  });

  it('další jízda téže výpravy je další karavana – naráz jdou obě', () => {
    const memory = new ActivityMemory();
    memory.apply(village({ expeditions: [expedition()] }), window(10).startMs, window);
    const next = expedition({ startDay: 14, day: 14 });
    const both = memory.apply(village({ expeditions: [next] }), window(14).startMs, window);
    expect(both.expeditions?.map((x) => x.startDay)).toEqual([10, 14]);
  });
});

describe('výcviková jízda rodiny dojede, jak začala (activity-memory.ts)', () => {
  const slot = (k: number, s: number): number =>
    LIVESTOCK_EPOCH_MS + (k * LORD_CYCLE_S + LORD_CYCLE.ride + s) * 1000;
  const withLord = (lord: Partial<SceneLord>): SceneVillage =>
    village({
      labor: { lord: { home: 1, trainees: [], household: [], ...lord } },
    } as Partial<SceneVillage>);
  const RIDERS = [{ id: 10, horseId: 1, training: 40, hours: 2 }];

  it('jezdci a trasa (objížďka / k hranici) se uprostřed jízdy nemění, po ní ano', () => {
    const memory = new ActivityMemory();
    const first = memory.apply(withLord({ riders: RIDERS }), slot(5, 1), window);
    expect(first.labor?.lord?.riders).toEqual(RIDERS);
    // další herní den uprostřed jízdy: jezdec je pryč (jádro ho mezi jezdci nemá), den jízdy k hranici
    const mid = memory.apply(withLord({ borderTrailId: 3 }), slot(5, 90), window);
    expect(mid.labor?.lord?.riders).toEqual(RIDERS);
    expect(mid.labor?.lord?.borderTrailId).toBeUndefined();
    // po jízdě platí data dne
    const after = memory.apply(
      withLord({ borderTrailId: 3 }),
      slot(5, LORD_CYCLE.rideMax + 1),
      window,
    );
    expect(after.labor?.lord?.riders).toBeUndefined();
    expect(after.labor?.lord?.borderTrailId).toBe(3);
    // další jízda začne s tím, co data mají
    const next = memory.apply(withLord({ borderTrailId: 3 }), slot(6, 1), window);
    expect(next.labor?.lord?.borderTrailId).toBe(3);
  });
});
