import { describe, expect, it } from 'vitest';
import {
  crossesField,
  fieldRing,
  loopRoute,
  RIDE_GROUP,
  RIDE_PACE,
  rideDistance,
  rideGroups,
  rideSpot,
  trailRoute,
  WINTER_RING_M,
  RING_MARGIN_M,
  type RideRoute,
  type RideSpot,
} from '../rider-route';
import { squareCorners } from '../villager-plan-geometry';
import type { Point, Square } from '../villager-plan-types';

// ves kolem počátku: dvorec v [0, 0], pole na sever, východ a jih, jedno natočené
const FIELDS: Square[] = [
  { x: 0, z: 40, size: 20 },
  { x: 20, z: 40, size: 20 },
  { x: 45, z: 0, size: 20, rotation: Math.PI / 6 },
  { x: 0, z: -45, size: 20 },
];
const HITCH: Point = { x: 3, z: 6 };
const HOMES: Point[] = [
  { x: 0, z: 0 },
  { x: 12, z: -8 },
];
const corners = (fields: readonly Square[]): Point[] =>
  fields.flatMap((f) => squareCorners(f).map(([x, z]) => ({ x, z })));
const summerRing = (): Point[] => fieldRing(FIELDS, [...corners(FIELDS), ...HOMES]);
const spot = (): RideSpot => ({ x: 0, z: 0, headingX: 0, headingZ: 1, pace: 0 });
const along = (route: RideRoute, step = 0.5): Point[] => {
  const out: Point[] = [];
  for (let s = 0; s < route.length; s += step) {
    const p = rideSpot(route, s, spot());
    out.push({ x: p.x, z: p.z });
  }
  return out;
};

describe('objížďka polí (horses.md – Kdy a kam se jezdí)', () => {
  it('okruh vede kolem všech polí, nikdy přes osetý čtverec', () => {
    const ring = summerRing();
    expect(ring.length).toBeGreaterThanOrEqual(3);
    expect(crossesField(ring, FIELDS, true)).toBe(false);
    // všechna pole uvnitř okruhu – dál než okraj od obalu
    for (const f of FIELDS) {
      const d = Math.min(...ring.map((p) => Math.hypot(p.x - f.x, p.z - f.z)));
      expect(d).toBeGreaterThan(f.size / 2 + RING_MARGIN_M * 0.9);
    }
  });

  it('v zimě kratší okruh kolem vsi – pole, která by protnul, obejde', () => {
    const summer = loopRoute(HITCH, summerRing(), FIELDS)!;
    const winterRing = fieldRing(FIELDS, HOMES, WINTER_RING_M);
    const winter = loopRoute(HITCH, winterRing, FIELDS)!;
    expect(winter.length).toBeLessThan(summer.length);
    expect(crossesField(along(winter), FIELDS)).toBe(false);
  });

  it('vyjede od kůlu u brány a vrátí se k němu – výjezd nevede přes pole', () => {
    // pole přímo mezi kůlem a nejbližším vrcholem okruhu – výjezd vede jinudy
    const blocked: Square[] = [...FIELDS, { x: 3, z: 22, size: 12 }];
    const ring = fieldRing(blocked, [...corners(blocked), ...HOMES]);
    const route = loopRoute(HITCH, ring, blocked)!;
    expect(route).not.toBeNull();
    expect(route.points[0]).toEqual(HITCH);
    expect(route.points[route.points.length - 1]).toEqual(HITCH);
    expect(crossesField(along(route), blocked)).toBe(false);
  });

  it('tempo krok 1,5 m/s a kus klusem 3 m/s; poloha je čistá funkce času', () => {
    const route = loopRoute(HITCH, summerRing(), FIELDS)!;
    expect(new Set(route.pace)).toEqual(new Set([RIDE_PACE.walk, RIDE_PACE.trot]));
    const t = 1234.5;
    const a = rideSpot(route, rideDistance(route, t), spot());
    const b = rideSpot(route, rideDistance(route, t), spot());
    expect(a).toEqual(b);
    // spojitě – za 0,1 s nejvýš klusem
    for (let k = 0; k < 200; k++) {
      const s0 = rideDistance(route, k * 7.3);
      const s1 = rideDistance(route, k * 7.3 + 0.1);
      const d = (s1 - s0 + route.length) % route.length;
      expect(d).toBeLessThanOrEqual(RIDE_PACE.trot * 0.1 + 1e-6);
    }
    // po celé době jízdy znovu od kůlu
    expect(rideDistance(route, route.period * 3)).toBeCloseTo(0, 6);
  });
});

describe('jízda k hranici a doprovod (horses.md – Kdy a kam se jezdí)', () => {
  const TRAIL: Point[] = [
    { x: 6, z: 2 },
    { x: 80, z: 10 },
    { x: 200, z: 15 },
  ];

  it('po stezce ke kraji mapy a zpět ke kůlu', () => {
    const route = trailRoute(HITCH, TRAIL, FIELDS)!;
    const far = Math.max(...along(route, 2).map((p) => p.x));
    expect(far).toBeCloseTo(200, 0);
    expect(route.points[route.points.length - 1]).toEqual(HITCH);
  });

  it('bez stezky žádná jízda k hranici', () => {
    expect(trailRoute(HITCH, [], FIELDS)).toBeNull();
  });
});

describe('skupiny jezdců', () => {
  it('jezdí pohromadě po nejvýš 4', () => {
    const groups = rideGroups([1, 2, 3, 4, 5, 6]);
    expect(groups.every((g) => g.length <= RIDE_GROUP)).toBe(true);
    expect(groups.flat()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rideGroups([1, 2])).toEqual([[1, 2]]);
  });
});
