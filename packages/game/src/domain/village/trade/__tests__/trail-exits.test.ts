import { describe, expect, it } from 'vitest';
import { trailExitsOf } from '../trail-exits';
import type { Direction8, Road, RoadPoint, Trail, VillageState } from '../../types';

// Výstupy hotových zemských stezek na kraj mapy (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13): konec osy, strana nebo roh mapy a bod okraje.

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

  it('stezka ve stavbě výstup nemá; zmizelá cesta posledního úseku – konec dá předchozí úsek', () => {
    const first = road(1, [
      { x: 0, z: 0 },
      { x: 100, z: 800 },
    ]);
    expect(trailExitsOf(trailState('N', [first], null))).toEqual([]);
    expect(trailExitsOf(trailState('N', [first], 5, [1, 2]))).toEqual([
      { direction: 'N', end: { x: 100, z: 800 }, edge: { x: 100, z: 960 }, builtDay: 5 },
    ]);
    // ves bez stezek a bez cest
    expect(trailExitsOf({})).toEqual([]);
  });

  it('úhlopříčná stezka – strana s menší mezerou, roh jen do 30 m od obou stran', () => {
    expect(trailExitsOf(endingAt('NE', { x: 300, z: 940 }))[0]).toMatchObject({
      direction: 'N',
      edge: { x: 300, z: 960 },
    });
    expect(trailExitsOf(endingAt('NE', { x: 945, z: 942 }))[0]).toMatchObject({
      direction: 'NE',
      edge: { x: 960, z: 960 },
    });
    expect(trailExitsOf(endingAt('NE', { x: 950, z: 700 }))[0]).toMatchObject({
      direction: 'E',
      edge: { x: 960, z: 700 },
    });
  });

  it('stezka S s mezerou 80 m – jižní strana kolmým průmětem', () => {
    expect(trailExitsOf(endingAt('S', { x: -50, z: -880 }))).toEqual([
      { direction: 'S', end: { x: -50, z: -880 }, edge: { x: -50, z: -960 }, builtDay: 5 },
    ]);
  });
});
