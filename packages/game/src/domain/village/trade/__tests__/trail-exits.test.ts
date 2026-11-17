import { describe, expect, it } from 'vitest';
import { trailExitsOf } from '../trail-exits';
import type { Direction8, Road, RoadPoint, Trail, VillageState } from '../../types';

// Výstupy hotových zemských stezek na kraj mapy (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13): konec osy, strana mapy a bod okraje.

const road = (id: number, points: RoadPoint[]): Road => ({
  id,
  points,
  bornDay: 0,
  grade: 'improved',
  traffic: [],
  spots: [],
});

/** Stezka ve směru `direction` po úsecích `pieces` (id cest) nad cestami `roads`. */
function trailState(
  direction: Direction8,
  roads: Road[],
  builtDay: number | null = 5,
  pieces: number[] = roads.map((r) => r.id),
): Pick<VillageState, 'trails' | 'roads'> {
  const trail: Trail = {
    id: 1,
    direction,
    pieces: pieces.map((roadId) => ({ roadId, grade: 'improved', manDays: 1 })),
    lengthM: 900,
    startedDay: 1,
    builtDay,
  };
  return {
    trails: [trail],
    roads: { nextId: 10, roads, trees: [], labor: { from: 0, days: 0, shares: [] } },
  };
}

/** Stezka ve směru `direction`, jejíž poslední úsek končí v `end`. */
const endingAt = (direction: Direction8, end: RoadPoint): Pick<VillageState, 'trails' | 'roads'> =>
  trailState(direction, [road(1, [{ x: 0, z: 0 }, end])]);

describe('výstupy stezek na kraj mapy (`trailExitsOf`)', () => {
  it('stezka N – konec posledního úseku a kolmý průmět na severní stranu', () => {
    const first = road(1, [
      { x: 0, z: 0 },
      { x: 100, z: 800 },
    ]);
    const last = road(2, [
      { x: 100, z: 800 },
      { x: 120, z: 935 },
    ]);
    const expected = [
      { direction: 'N', end: { x: 120, z: 935 }, edge: { x: 120, z: 960 }, builtDay: 5 },
    ];
    expect(trailExitsOf(trailState('N', [first, last]))).toEqual(expected);
    // úsek s obráceným pořadím bodů – konec ve směru stezky je týž
    const reversed = { ...last, points: [...last.points].reverse() };
    expect(trailExitsOf(trailState('N', [first, reversed]))).toEqual(expected);
  });

  it('stezka ve stavbě výstup nemá; zmizelá cesta posledního úseku – konec dá předchozí úsek v pásu', () => {
    const first = road(1, [
      { x: 0, z: 0 },
      { x: 100, z: 800 },
    ]);
    expect(trailExitsOf(trailState('N', [first], null))).toEqual([]);
    // předchozí úsek mimo pás konce – rozbitá stezka, žádný výstup
    expect(trailExitsOf(trailState('N', [first], 5, [1, 2]))).toEqual([]);
    // předchozí úsek v pásu – výstup
    const inBand = road(3, [
      { x: 0, z: 0 },
      { x: 100, z: 935 },
    ]);
    expect(trailExitsOf(trailState('N', [inBand], 5, [3, 2]))).toEqual([
      { direction: 'N', end: { x: 100, z: 935 }, edge: { x: 100, z: 960 }, builtDay: 5 },
    ]);
    // ves bez stezek a bez cest
    expect(trailExitsOf({})).toEqual([]);
  });

  it('konec osy je nejdále položený ze všech úseků, i když jsou mimo pořadí', () => {
    const far = road(1, [
      { x: 0, z: 800 },
      { x: 10, z: 940 },
    ]);
    const near = road(2, [
      { x: 0, z: 0 },
      { x: 0, z: 800 },
    ]);
    expect(trailExitsOf(trailState('N', [far, near]))).toEqual([
      { direction: 'N', end: { x: 10, z: 940 }, edge: { x: 10, z: 960 }, builtDay: 5 },
    ]);
  });

  it('úhlopříčná stezka – strana s menší mezerou, i s koncem u rohu (svět je čtyřsousedný)', () => {
    expect(trailExitsOf(endingAt('NE', { x: 300, z: 940 }))[0]).toMatchObject({
      direction: 'N',
      edge: { x: 300, z: 960 },
    });
    expect(trailExitsOf(endingAt('NE', { x: 950, z: 700 }))[0]).toMatchObject({
      direction: 'E',
      edge: { x: 960, z: 700 },
    });
    // obě mezery do 30 m – dřív výstup rohem na úhlopříčnou mapu, kam se nejde; teď menší mezera
    expect(trailExitsOf(endingAt('NE', { x: 945, z: 942 }))).toEqual([
      { direction: 'E', end: { x: 945, z: 942 }, edge: { x: 960, z: 942 }, builtDay: 5 },
    ]);
    expect(trailExitsOf(endingAt('SW', { x: -941, z: -950 }))[0]).toMatchObject({
      direction: 'S',
      edge: { x: -941, z: -960 },
    });
    // stejné mezery – pevné pořadí stran (N, E, S, W): NE → N, SE → E, SW → S, NW → N
    const tie = (direction: Direction8, x: number, z: number): Direction8 | undefined =>
      trailExitsOf(endingAt(direction, { x, z }))[0]?.direction;
    expect(tie('NE', 945, 945)).toBe('N');
    expect(tie('SE', 945, -945)).toBe('E');
    expect(tie('SW', -945, -945)).toBe('S');
    expect(tie('NW', -945, 945)).toBe('N');
    expect(trailExitsOf(endingAt('NW', { x: -945, z: 945 }))[0]?.edge).toEqual({ x: -945, z: 960 });
  });

  it('rozbitá stezka S s mezerou 80 m – bez výstupu; do pásu (30 m + 1 m) výstup je', () => {
    expect(trailExitsOf(endingAt('S', { x: -50, z: -880 }))).toEqual([]);
    expect(trailExitsOf(endingAt('S', { x: -50, z: -930 }))).toHaveLength(1);
    expect(trailExitsOf(endingAt('S', { x: -50, z: -929 }))).toHaveLength(1);
    expect(trailExitsOf(endingAt('S', { x: -50, z: -928 }))).toEqual([]);
  });
});
