import { describe, expect, it } from 'vitest';
import { cutDeadRoads, abandonBlockedStretches } from '../paths/roads-overgrow';
import {
  roadFullCondition,
  roadPieces,
  settleRoadCondition,
  withRoadCondition,
  withRoadConditionOf,
} from '../paths/road-condition';
import { roadChains } from '../paths/road-chains';
import { type TrafficField, wearCellAt } from '../paths/wear';
import { ROAD_DECAY } from '../rules';
import type { Construction, Road, RoadPoint, VillageRoads, VillageState } from '../types';

const YEAR = 365.25;
const NO_TRAFFIC: TrafficField = { cells: new Map(), walk: new Map(), targets: new Map() };

function road(id: number, grade: Road['grade'] = 'trodden', x = 0, lengthM = 100): Road {
  return {
    id,
    points: [
      { x, z: 0 },
      { x, z: lengthM },
    ],
    bornDay: 0,
    grade,
    traffic: [0],
    spots: [],
  };
}

function roadsOf(...list: Road[]): VillageRoads {
  return {
    nextId: 100,
    roads: list,
    trees: [],
    candidates: [],
    labor: { from: 0, days: 0, shares: [] },
  };
}

/** Provozní pole s `trips` (setiny cest za den) podél osy x = `x`, z ∈ [0, lengthM]. */
function trafficAlong(x: number, trips: number, lengthM = 100): TrafficField {
  const walk = new Map<number, number>();
  for (let z = 0; z <= lengthM; z++) walk.set(wearCellAt(x, z), trips);
  return { cells: new Map(), walk, targets: new Map() };
}

/** Po `days` dnech v krocích po 30 dnech (měsíčně): kolik dnů přežije cesta `road`. */
function survivesDays(grade: Road['grade'], field: TrafficField = NO_TRAFFIC): number {
  const roads = roadsOf(road(1, grade));
  let day = 0;
  for (; day < 40 * YEAR; day += 30) {
    settleRoadCondition(roads, [], undefined, field, [], day, day + 30);
    cutDeadRoads(roads, [], undefined, day + 30);
    if (roads.roads.length === 0) return day + 30;
  }
  return Infinity;
}

describe('zarůstání podle druhů (paths.md – Zarůstání)', () => {
  it('bez provozu zmizí vyšlapaná za 5 let, upravená za 15, vozová za 30 (± měsíc)', () => {
    for (const [grade, kind] of [
      ['trodden', ROAD_DECAY.trodden],
      ['improved', ROAD_DECAY.improved],
      ['causeway', ROAD_DECAY.improved],
      ['wagon', ROAD_DECAY.wagon],
    ] as const) {
      const days = survivesDays(grade);
      expect(Math.abs(days - kind.years * YEAR)).toBeLessThanOrEqual(30);
    }
  });

  it('na udržovacím prahu drží, nad ním se stav vrací, pod ním klesá', () => {
    const roads = roadsOf(road(1));
    const piece = (): number =>
      roads.roads[0]!.condition?.[0]?.c ?? roadFullCondition(roads.roads[0]!);
    settleRoadCondition(roads, [], undefined, NO_TRAFFIC, [], 0, 365);
    const lowered = piece();
    expect(lowered).toBeLessThan(roadFullCondition(roads.roads[0]!));
    // přesně udržovací provoz (setiny cest za den): stav stojí
    settleRoadCondition(
      roads,
      [],
      undefined,
      trafficAlong(0, ROAD_DECAY.trodden.keep),
      [],
      365,
      730,
    );
    expect(piece()).toBe(lowered);
    // vrácený provoz cestu oživí až na plný stav
    settleRoadCondition(
      roads,
      [],
      undefined,
      trafficAlong(0, 3 * ROAD_DECAY.trodden.keep),
      [],
      730,
      2000,
    );
    expect(roads.roads[0]!.condition).toBeUndefined();
  });

  it('zemská stezka, cesta ve vylepšení a cesta k vchodu nezarůstají', () => {
    const roads = roadsOf(
      road(1),
      road(2, 'trodden', 10),
      road(3, 'trodden', 20),
      road(4, 'trodden', 30),
    );
    const trails = [{ pieces: [{ roadId: 1 }] }] as unknown as VillageState['trails'];
    const works = [{ roadIds: [2] }] as unknown as Construction[];
    // cesta 3 končí u vchodu (kotva z tras), cesta 4 nikde
    settleRoadCondition(roads, works, trails, NO_TRAFFIC, [{ x: 20, z: 100 }], 0, 3 * YEAR);
    const state = (id: number): Road => roads.roads.find((r) => r.id === id)!;
    expect(state(1).condition).toBeUndefined();
    expect(state(2).condition).toBeUndefined();
    expect(state(3).condition).toBeUndefined();
    expect(state(4).condition).toBeDefined();
  });

  it('po kusech: provoz u jednoho konce drží jen ten kus, tichý konec se oddělí a zbytek žije se starým id', () => {
    const roads = roadsOf(road(1, 'trodden', 0, 200));
    roads.roads[0]!.spots = [{ id: 1, x: 3, z: 20 }];
    const field = trafficAlong(0, 300, 100);
    let day = 0;
    for (; day < 8 * YEAR; day += 30) {
      settleRoadCondition(roads, [], undefined, field, [], day, day + 30);
      cutDeadRoads(roads, [], undefined, day + 30);
    }
    expect(roads.roads).toHaveLength(1);
    const kept = roads.roads[0]!;
    expect(kept.id).toBe(1);
    expect(kept.points[0]!.z).toBe(0);
    expect(kept.points[kept.points.length - 1]!.z).toBeLessThan(120);
    expect(kept.spots).toEqual([{ id: 1, x: 3, z: 20 }]);
    expect(roads.cutEnds).toBeDefined();
  });

  it('dopočet po 1, 7 a 30 dnech dá totéž co najednou (bit po bitu)', () => {
    const run = (step: number): VillageRoads => {
      const roads = roadsOf(road(1, 'trodden', 0, 150));
      const field = trafficAlong(0, 40, 60);
      for (let d = 0; d < 360; d += step) {
        settleRoadCondition(roads, [], undefined, field, [], d, Math.min(360, d + step));
      }
      return JSON.parse(JSON.stringify(roads)) as VillageRoads;
    };
    expect(run(7)).toEqual(run(360));
    expect(run(1)).toEqual(run(360));
    expect(run(30)).toEqual(run(360));
  });
});

describe('opuštěný kus pod stavbou (paths.md – Stavba přes cestu)', () => {
  const under =
    (a: number, b: number) =>
    (_x: number, z: number): boolean =>
      z >= a && z <= b;

  it('kus pod stavbou je opuštěný, zbytky po stranách žijí se starým id a místy na stromy', () => {
    const roads = roadsOf(road(1, 'trodden', 0, 200));
    roads.roads[0]!.spots = [
      { id: 1, x: 3, z: 20 },
      { id: 2, x: 3, z: 90 },
      { id: 3, x: 3, z: 170 },
    ];
    expect(abandonBlockedStretches(roads, [], undefined, under(70, 110))).toBe(true);
    const abandoned = roads.roads.filter((r) => r.abandoned);
    const alive = roads.roads.filter((r) => !r.abandoned);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]!.points[0]!.z).toBeGreaterThanOrEqual(68);
    expect(alive.map((r) => r.id)).toContain(1);
    expect(alive).toHaveLength(2);
    expect(alive.flatMap((r) => r.spots.map((s) => s.id)).sort()).toEqual([1, 3]);
    // opuštěný kus není v řetězech a druhé spuštění už nic nemění
    expect(
      roadChains(roads.roads)
        .flat()
        .map((l) => l.road.id),
    ).not.toContain(abandoned[0]!.id);
    const before = JSON.stringify(roads);
    expect(abandonBlockedStretches(roads, [], undefined, under(70, 110))).toBe(false);
    expect(JSON.stringify(roads)).toBe(before);
  });

  it('celá cesta pod stavbou zůstane jedním opuštěným úsekem se starým id', () => {
    const roads = roadsOf(road(1, 'trodden', 0, 60));
    abandonBlockedStretches(roads, [], undefined, under(-5, 70));
    expect(roads.roads).toHaveLength(1);
    expect(roads.roads[0]).toMatchObject({ id: 1, abandoned: true });
  });

  it('opuštěný kus bledne a zmizí podle druhu', () => {
    const roads = roadsOf(road(1, 'trodden', 0, 60));
    abandonBlockedStretches(roads, [], undefined, under(-5, 70));
    let day = 0;
    for (; day < 6 * YEAR && roads.roads.length > 0; day += 30) {
      settleRoadCondition(roads, [], undefined, NO_TRAFFIC, [], day, day + 30);
      cutDeadRoads(roads, [], undefined, day + 30);
    }
    expect(roads.roads).toHaveLength(0);
    expect(day).toBeLessThanOrEqual(5 * YEAR + 60);
  });
});

describe('stav cest staré vsi (withRoadCondition)', () => {
  const stateOf = (roads: VillageRoads): VillageState => ({ roads }) as unknown as VillageState;

  it('kus s provozem nad prahem je plný, tichý začne zarůstat; jednou a idempotentně, nic nezmizí hned', () => {
    const busy: Road = { ...road(1), traffic: [2, 2, 2, 2, 2] };
    const quiet: Road = { ...road(2, 'trodden', 10), traffic: [2, 0, 0, 0, 0] };
    const lazy: Road = { ...road(3, 'wagon', 20), traffic: [0, 0, 0, 0, 0] };
    const state = stateOf(roadsOf(busy, quiet, lazy));
    const once = withRoadCondition(state);
    expect(once.roads!.conditionSeeded).toBe(true);
    const by = (id: number): Road => once.roads!.roads.find((r) => r.id === id)!;
    expect(by(1).condition).toBeUndefined();
    const q = by(2).condition!;
    expect(q.length).toBeGreaterThan(0);
    expect(q[0]!.c).toBeGreaterThan(0);
    expect(q[0]!.c).toBeLessThan(roadFullCondition(by(2)));
    // vozová: 5 tichých let z 30 – plný × 25/30
    expect(by(3).condition![0]!.c).toBe(Math.round((roadFullCondition(by(3)) * 25) / 30));
    expect(withRoadCondition(once)).toBe(once);
    // vstupní stav se nezměnil
    expect(state.roads!.conditionSeeded).toBeUndefined();
    expect(withRoadConditionOf(roadsOf(busy))).toBe(false);
  });

  it('kusy z roadPieces mají střed na ose', () => {
    const pieces = roadPieces([
      { x: 0, z: 0 },
      { x: 0, z: 100 },
    ] as RoadPoint[]);
    expect(pieces).toHaveLength(4);
    expect(pieces[0]!.z).toBeCloseTo(12.5, 1);
  });
});
