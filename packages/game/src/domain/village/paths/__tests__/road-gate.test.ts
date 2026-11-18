import { describe, expect, it } from 'vitest';
import { accessDue, accessRoads, gateGuardOf, type GateGuard } from '../roads-access';
import { axisDistance } from '../roads-geometry';
import type { RoadAnchors } from '../road-anchors';
import { formRoad, formWearRuns, joinTarget, wearRoadDue } from '../roads-form';
import { abandonBlockedStretches, BLOCK_MIN_RUN_M, blockedRun } from '../roads-overgrow';
import { wearCellAt } from '../wear';
import type { SpotContext } from '../roads-trees';
import { ROAD_GATE } from '../../rules';
import type { Road, RoadGrade, RoadPoint, StoredRoute, VillageRoads } from '../../types';
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

describe('cesta z vyšlapanosti s napojením do plochy staveb (D93 – Vlkov, rozcestí u sadu)', () => {
  // jako ve Vlkově: vozová cesta 1 začíná 1 m uvnitř pozemku (x 13–21, z −9…2) a hned z něj vede
  // na západ; vyšlapaná čára jde 2,25 m jižně od pozemku k cíli (7,5; −11,25). Nejbližší bod
  // cesty 1 (roh 12,5; −6,65) je 3,5 m od jejího začátku (do END_SNAP_M) – napojení by se
  // přichytilo do začátku v pozemku a vedlo jím ≥ 5 m: příští měsíc by se cesta opustila
  // (`abandonBlockedStretches`) a hned by vznikla znovu
  const START: RoadPoint = { x: 14, z: -3.5 };
  const CORNER: RoadPoint = { x: 12.5, z: -6.65 };
  const LINE: RoadPoint[] = [
    { x: 26.25, z: -11.25 },
    { x: 7.5, z: -11.25 },
  ];
  const plot = (x: number, z: number): boolean => x >= 13 && x <= 21 && z >= -9 && z <= 2;
  const roadsOf = (): VillageRoads => {
    const roads = roadsWith('wagon', [
      [START.x, START.z],
      [CORNER.x, CORNER.z],
      [4, -6.65],
    ]);
    roads.nextId = 50;
    return roads;
  };
  const wear = new Map<number, number>();
  for (let x = 7.5; x <= 26.25; x += 0.5) wear.set(wearCellAt(x, -11.25), 120_000);
  const anchors: RoadAnchors = {
    points: [
      { x: 26.25, z: -11.25, kind: 'entrance', reachM: 3 },
      { x: 7.5, z: -11.25, kind: 'goal', reachM: 7.5 },
    ],
    halfM: 1000,
  };
  const form = (roads: VillageRoads, building: ((x: number, z: number) => boolean) | null) =>
    formWearRuns(roads, [LINE], wear, anchors, 0, CONTEXT, null, new Set(), building);

  it('bez plochy staveb se napojí do začátku cesty jako dřív', () => {
    const roads = roadsOf();
    const formed = form(roads, null);
    expect(formed).toHaveLength(1);
    expect(formed[0]!.road.points.at(-1)).toEqual(START);
  });

  it('napojení obejde pozemek: do nejbližšího bodu cesty, příští měsíc se neopustí', () => {
    const roads = roadsOf();
    expect(wearRoadDue(roads, [LINE], wear, anchors, new Set(), undefined, plot)).toBe(true);
    const formed = form(roads, plot);
    expect(formed).toHaveLength(1);
    const fresh = formed[0]!.road;
    expect(fresh.points.at(-1)).toEqual(CORNER);
    expect(blockedRun(fresh.points, plot)).toBeLessThan(BLOCK_MIN_RUN_M);
    // cesta 1 se v rohu rozdělila (rozcestí); kontrola kusů pod stavbou novou cestu nechá
    expect(roads.roads).toHaveLength(3);
    abandonBlockedStretches(roads, [], undefined, plot);
    expect(roads.roads.find((r) => r.id === fresh.id)?.abandoned).toBeUndefined();
  });

  it('i nejbližší bod cesty je v pozemku: cesta nevznikne a vznik se nehlásí (A)', () => {
    // pozemek sahá k čáře (z od −11) a přes roh – každé napojení jím vede ≥ 5 m
    const deep = (x: number, z: number): boolean => x >= 9 && x <= 21 && z >= -11 && z <= 2;
    const roads = roadsOf();
    const before = JSON.stringify(roads);
    expect(wearRoadDue(roads, [LINE], wear, anchors, new Set(), undefined, deep)).toBe(false);
    expect(form(roads, deep)).toEqual([]);
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('jiní uživatelé napojení (cesty k vchodům, stezky, úklid) beze změny – bez plochy přichytí', () => {
    const from: RoadPoint = { x: 16.25, z: -11.25 };
    // bez plochy staveb i s plochou, která napojení nepřekáží, do začátku cesty (hit null)
    expect(joinTarget(roadsOf(), from, 10)).toEqual({ point: START, hit: null });
    expect(joinTarget(roadsOf(), from, 10, () => false)).toEqual({ point: START, hit: null });
    // s pozemkem v cestě do nejbližšího bodu osy – cesta se tam rozdělí
    const around = joinTarget(roadsOf(), from, 10, plot);
    expect(around?.point).toEqual(CORNER);
    expect(around?.hit).not.toBeNull();
    // `formRoad` bez plochy (cesty k vchodům, zemské stezky, přestavba) se napojí jako dřív
    const roads = roadsOf();
    const made = formRoad(roads, [LINE[0]!, from], false, 10, 0, () => 0, CONTEXT);
    expect(made?.points.at(-1)).toEqual(START);
  });

  it('B i u křižovatky: přichycení do uzlu v pozemku nahradí bod osy (`junctionSnap`)', () => {
    // uzel (0; 0) se třemi rameny leží v pozemku; nejbližší bod osy (5; 0) je dál než END_SNAP_M,
    // ale blíž než rozestup křižovatky (≈ 7 m) – bez plochy se napojení přichytí do uzlu
    const arm = (id: number, x: number, z: number): Road => ({
      id,
      points: [
        { x: 0, z: 0 },
        { x, z },
      ],
      bornDay: 0,
      grade: 'trodden',
      traffic: [1],
      spots: [],
    });
    const roads: VillageRoads = {
      nextId: 10,
      roads: [arm(1, 30, 0), arm(2, 0, 30), arm(3, -30, 0)],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    };
    const yard = (x: number, z: number): boolean => x >= -4 && x <= 4 && z >= -5 && z <= 4;
    const from: RoadPoint = { x: 5, z: -6 };
    expect(joinTarget(roads, from, 10)).toEqual({ point: { x: 0, z: 0 }, hit: null });
    const around = joinTarget(roads, from, 10, yard);
    expect(around?.point).toEqual({ x: 5, z: 0 });
    expect(around?.hit?.road).toBe(0);
  });

  it('bod osy blíž než JOIN_AROUND_MIN_M od přichycení: přichycení zůstane', () => {
    // úzký pás u začátku cesty: napojení do začátku jím vede ≥ 5 m, do bodu osy vůbec
    const roads = roadsWith('trodden', [
      [0, 0],
      [10, 0],
    ]);
    const strip =
      (limit: number) =>
      (x: number, z: number): boolean =>
        x < limit && z > -5.5;
    // bod osy 0,5 m od začátku – rozdělení by dalo kousek cesty bez délky
    expect(joinTarget(roads, { x: 0.5, z: -6 }, 10, strip(0.45))).toEqual({
      point: { x: 0, z: 0 },
      hit: null,
    });
    // 1,5 m od začátku – napojení pás obejde
    expect(joinTarget(roads, { x: 1.5, z: -6 }, 10, strip(1.45))?.point).toEqual({ x: 1.5, z: 0 });
  });
});
