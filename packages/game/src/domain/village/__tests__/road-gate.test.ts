import { describe, expect, it } from 'vitest';
import { accessDue, accessRoads } from '../paths/roads-access';
import { axisDistance } from '../paths/roads-geometry';
import type { SpotContext } from '../paths/roads-trees';
import { ROAD_GATE } from '../rules';
import type { Road, RoadGrade, StoredRoute, VillageRoads } from '../types';
import { pathTestTerrain } from './paths-fixtures';

// Cesta do branky (paths.md – Vchody; Martin 25. 10. 2026: „Jeden z největších problémů vidím
// tady u hřbitova“): cesta, která jde do 3 m od vchodu a nekončí v něm, se ohne přes bod před ním.

const CELL_M = 1.25;
const CONTEXT: SpotContext = {
  terrain: pathTestTerrain(),
  blocked: () => false,
  layer: null,
  changes: { removed: [], stumps: [], saplings: [] },
  seed: 0,
  split: () => undefined,
};
/** Pohřby na hřbitov 1 – trasa od jihu (z = −10) na sever do branky (50; 2,5). */
const ROUTE: StoredRoute = {
  from: 'dwelling:1',
  to: 'cemetery:1',
  purpose: 'visit',
  visit: 'cemetery:1',
  trips: 5,
  start: [40, -8],
  steps: 'SSSSS',
};

function roadsWith(grade: RoadGrade, points: [number, number][]): VillageRoads {
  const road: Road = {
    id: 1,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: 0,
    grade,
    traffic: [1],
    spots: [],
  };
  return { nextId: 2, roads: [road], trees: [], labor: { from: 0, days: 0, shares: [] } };
}

describe('cesta do branky (paths.md – Vchody)', () => {
  it('cesta 2,5 m od branky se ohne přes bod 1,5 m před ní, konce zůstanou; podruhé nic', () => {
    const roads = roadsWith('trodden', [
      [0, 0],
      [100, 0],
    ]);
    expect(accessDue(roads, [ROUTE], CELL_M)).toBe(true);
    expect(accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null)).toEqual([]);
    const road = roads.roads[0]!;
    expect(road.points[0]).toEqual({ x: 0, z: 0 });
    expect(road.points[road.points.length - 1]).toEqual({ x: 100, z: 0 });
    expect(axisDistance([road.points])(50, 2.5 - ROAD_GATE.frontM)).toBeLessThan(0.01);
    expect(accessDue(roads, [ROUTE], CELL_M)).toBe(false);
    const before = JSON.stringify(roads);
    accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null);
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('cesta, která v brance končí, a vozová cesta (zemní práce) se neohnou', () => {
    for (const [grade, points] of [
      [
        'trodden',
        [
          [0, 0],
          [50, 1],
        ],
      ],
      [
        'wagon',
        [
          [0, 0],
          [100, 0],
        ],
      ],
    ] as [RoadGrade, [number, number][]][]) {
      const roads = roadsWith(grade, points);
      const before = JSON.stringify(roads);
      expect(accessDue(roads, [ROUTE], CELL_M)).toBe(false);
      accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null);
      expect(JSON.stringify(roads)).toBe(before);
    }
  });
});
