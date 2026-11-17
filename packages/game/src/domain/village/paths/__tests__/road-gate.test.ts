import { describe, expect, it } from 'vitest';
import { accessDue, accessRoads, gateGuardOf, type GateGuard } from '../roads-access';
import { axisDistance } from '../roads-geometry';
import type { SpotContext } from '../roads-trees';
import { ROAD_GATE } from '../../rules';
import type { Road, RoadGrade, StoredRoute, VillageRoads } from '../../types';
import { PATH_FORD, PATH_WATER } from '../terrain';
import { pathTestTerrain } from '../../__tests__/paths-fixtures';

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

  it('zamčený úsek (vylepšení, zemská stezka) se neohne', () => {
    const roads = roadsWith('improved', [
      [0, 0],
      [100, 0],
    ]);
    const guard: GateGuard = {
      fixed: new Set([1]),
      blocked: () => false,
      building: () => false,
      fences: () => [],
    };
    const before = JSON.stringify(roads);
    expect(accessDue(roads, [ROUTE], CELL_M, () => true, guard)).toBe(false);
    accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null, () => true, guard);
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('osa ohybu ani bod před brankou nevedou přes plot, stavbu ani vodu – pak se neohne', () => {
    // roh plotu mezi starou osou (z = 0) a bodem před brankou (50; 1)
    const fence = (x: number, z: number): boolean => x >= 47.6 && x <= 48.4 && z >= 0.3 && z <= 2;
    // voda v buňce bodu před brankou (brod by nevadil)
    const terrain = pathTestTerrain();
    const flags = terrain.flags.slice();
    const cell = (x: number, z: number): number =>
      Math.round((z - terrain.originZ) / terrain.cellM) * terrain.width +
      Math.round((x - terrain.originX) / terrain.cellM);
    flags[cell(50, 2.5 - ROAD_GATE.frontM)] = PATH_WATER;
    const wet = { ...terrain, flags };
    const ford = { ...terrain, flags: flags.map((f) => (f ? PATH_WATER | PATH_FORD : f)) };
    const cases: [GateGuard, boolean][] = [
      [
        gateGuardOf(
          new Set(),
          () => fence,
          () => terrain,
        ),
        false,
      ],
      [
        gateGuardOf(
          new Set(),
          () => null,
          () => wet,
        ),
        false,
      ],
      [
        gateGuardOf(
          new Set(),
          () => null,
          () => ford,
        ),
        true,
      ],
    ];
    for (const [guard, bends] of cases) {
      const roads = roadsWith('trodden', [
        [0, 0],
        [100, 0],
      ]);
      const before = JSON.stringify(roads);
      expect(accessDue(roads, [ROUTE], CELL_M, () => true, guard)).toBe(bends);
      accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null, () => true, guard);
      expect(JSON.stringify(roads) !== before).toBe(bends);
    }
  });
});

describe('cesta k vchodu uvnitř plochy staveb (D89 – Vlkov, ohrada u tesaře)', () => {
  // stará cesta jižně od vchodu (z = −14), vchod trasy v (50; 2,5)
  const roadSouth = (): VillageRoads =>
    roadsWith('trodden', [
      [0, -14],
      [100, -14],
    ]);
  const inside = (x: number, z: number): boolean => x >= 38 && x <= 62 && z >= -9 && z <= 3;
  const guardOf = (building: (x: number, z: number) => boolean): GateGuard => ({
    fixed: new Set(),
    blocked: building,
    building,
    fences: () => [],
  });

  it('bez překážky cesta k vchodu vznikne', () => {
    const roads = roadSouth();
    const guard = guardOf(() => false);
    expect(accessDue(roads, [ROUTE], CELL_M, () => true, guard)).toBe(true);
    expect(accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null, () => true, guard)).toHaveLength(
      1,
    );
  });

  it('cesta s kusem ≥ 5 m v ploše staveb nevznikne a nic se neuklízí dokola', () => {
    const roads = roadSouth();
    const guard = guardOf(inside);
    const before = JSON.stringify(roads);
    expect(accessDue(roads, [ROUTE], CELL_M, () => true, guard)).toBe(false);
    expect(accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null, () => true, guard)).toEqual([]);
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('vchod venku, ale napojení na pevnou cestu uvnitř plochy staveb (Vlkov): nevznikne', () => {
    // body osy od vchodu leží venku, plocha je jen u pevné cesty, na kterou se osa napojí
    const roads = roadsWith('trodden', [
      [0, -14],
      [100, -14],
    ]);
    const onlyJoin = (x: number, z: number): boolean => x >= 38 && x <= 62 && z >= -20 && z <= -7;
    const guard = guardOf(onlyJoin);
    const free = guardOf(() => false);
    // bez překážky vznikne; s plochou jen u napojení ne
    expect(accessDue(roads, [ROUTE], CELL_M, () => true, free)).toBe(true);
    expect(accessDue(roads, [ROUTE], CELL_M, () => true, guard)).toBe(false);
    expect(accessRoads(roads, [ROUTE], CELL_M, 0, CONTEXT, null, () => true, guard)).toEqual([]);
  });
});
