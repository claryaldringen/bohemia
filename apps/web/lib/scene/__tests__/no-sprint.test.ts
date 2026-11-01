// Lidé ve scéně nesprintují (villagers.md – Činnosti od začátku do konce; Martin 1. 11. 2026:
// „Občas ve hře vidím nějakého vesničana, jak brutálně sprintuje“): kování, lov rodu, karavany
// a svoz úrody jdou přirozenou chůzí – rychlost nejvýš ≈ 1,3× chůze a klip chůze nejvýš ≈ 1,3× –
// ve skutečném čase přes tolik herních dní, kolik trvají.
import { describe, expect, it } from 'vitest';
import type { SceneExpedition, SceneVillage } from '../../village-view';
import { ActivityMemory, caravanEndMs } from '../activity-memory';
import { CART_SPEED_M_S, shuttleAt, shuttleRoute } from '../cart-layout';
import { caravanHead, caravanSpeed, caravanTimeline } from '../caravan';
import { HUNT_PACE, huntRoute } from '../rider-route';
import { HUNT_REAL_S, huntSpan } from '../riders';
import { shoeingSchedule } from '../shoeing-plan';
import { walkSpeed } from '../villager-motion';

const DAY_MS = 86_400;
const window = (day: number): { startMs: number; endMs: number } => ({
  startMs: day * DAY_MS,
  endMs: (day + 1) * DAY_MS,
});
const LENGTHS = [100, 300, 600, 1000];
const BRISK = 1.3;

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

  it('pěší lovci jdou k lesu chůzí, jezdci nejvýš klusem', () => {
    const foot = walkSpeed('man', 'walk-spear', 1.2);
    for (const m of LENGTHS) {
      const way = [
        { x: 0, z: 0 },
        { x: m, z: 0 },
      ];
      const walking = huntRoute(way, null, true, HUNT_REAL_S / 2)!;
      expect(Math.max(...walking.pace) / foot, `${m} m`).toBeLessThanOrEqual(BRISK);
      const riding = huntRoute(way, null, false, HUNT_REAL_S / 2)!;
      expect(Math.max(...riding.pace), `${m} m`).toBeLessThanOrEqual(HUNT_PACE.ride.max);
    }
    // lov za šera dne lovu, deset minut skutečného času
    const [from, to] = huntSpan(window(5))!;
    expect(from).toBeGreaterThan(window(5).startMs);
    expect(to - from).toBe(HUNT_REAL_S * 1000);
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

describe('scéna dohraje karavanu a lov, které data už nemají (activity-memory.ts)', () => {
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

  it('další jízda téže výpravy je další karavana – naráz jdou obě', () => {
    const memory = new ActivityMemory();
    memory.apply(village({ expeditions: [expedition()] }), window(10).startMs, window);
    const next = expedition({ startDay: 14, day: 14 });
    const both = memory.apply(village({ expeditions: [next] }), window(14).startMs, window);
    expect(both.expeditions?.map((x) => x.startDay)).toEqual([10, 14]);
  });

  it('lov běží, dokud se lovci nevrátí; nový lov jiného dne až po návratu', () => {
    const memory = new ActivityMemory();
    const wild = (hunt?: { day: number }): SceneVillage['wildlife'] =>
      ({
        shown: { stags: 0, hinds: 0, calves: 0, boars: 0 },
        month: 11,
        crowFlocks: 0,
        fishShare: 0,
        ...(hunt ? { hunt: { ...hunt, target: 'game', riders: [], foot: [1, 2], kills: 0 } } : {}),
      }) as SceneVillage['wildlife'];
    const hunt = memory.apply(village({ wildlife: wild({ day: 20 }) }), window(20).startMs, window);
    expect(hunt.wildlife?.hunt?.day).toBe(20);
    const [, end] = huntSpan(window(20))!;
    // druhý den jádro lov nemá, scéna ho dohrává
    expect(
      memory.apply(village({ wildlife: wild() }), window(21).startMs, window).wildlife?.hunt?.day,
    ).toBe(20);
    // lov navíc za tři dny – lovci jsou ještě v lese, nový lov se neukáže
    const extra = memory.apply(village({ wildlife: wild({ day: 23 }) }), end - 1000, window);
    expect(extra.wildlife?.hunt?.day).toBe(20);
    // po návratu nic
    expect(
      memory.apply(village({ wildlife: wild() }), end + 1, window).wildlife?.hunt,
    ).toBeUndefined();
  });
});
