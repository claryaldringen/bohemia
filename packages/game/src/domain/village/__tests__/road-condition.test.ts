import { describe, expect, it } from 'vitest';
import { cutDeadRoads, abandonBlockedStretches } from '../paths/roads-overgrow';
import {
  NO_ROAD_TRAFFIC,
  type RoadTraffic,
  roadFullCondition,
  roadPieces,
  settleRoadCondition,
  trafficOnRoads,
  withRoadCondition,
  withRoadConditionOf,
} from '../paths/road-condition';
import { routeCells } from '../paths/routes';
import { roadChains } from '../paths/road-chains';
import { trafficAt, trafficField } from '../paths/wear';
import { ROAD_DECAY } from '../rules';
import type {
  Construction,
  Road,
  RoadApple,
  RoadPoint,
  VillageRoads,
  VillageState,
  StoredRoute,
} from '../types';

const YEAR = 365.25;
const NO_TRAFFIC: RoadTraffic = NO_ROAD_TRAFFIC;

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
    labor: { from: 0, days: 0, shares: [] },
  };
}

/** Provoz po cestě `trips` (setiny cest za den) podél osy x = `x`, z ∈ [0, lengthM]. */
function trafficAlong(x: number, trips: number, lengthM = 100): RoadTraffic {
  return (px, pz) => (Math.abs(px - x) <= 1 && pz >= 0 && pz <= lengthM ? trips : 0);
}

/** Po `days` dnech v krocích po 30 dnech (měsíčně): kolik dnů přežije cesta `road`. */
function survivesDays(grade: Road['grade'], field: RoadTraffic = NO_TRAFFIC): number {
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

  it('úsek hotové stezky pod stavbou se opustí, stezka vede po zbytcích ve svém směru; stezka ve stavbě ne', () => {
    // stezka jde od severu (úsek 2, z 100–140) na jih po úseku 1 – proti jeho ose (z 0 → 100)
    const north: Road = {
      ...road(2, 'improved'),
      points: [
        { x: 0, z: 140 },
        { x: 0, z: 100 },
      ],
    };
    const roads = roadsOf(road(1, 'improved'), north);
    const trail = {
      pieces: [
        { roadId: 2, grade: 'improved', manDays: 5 },
        { roadId: 1, grade: 'improved', manDays: 9 },
      ],
    };
    const trails = [trail] as unknown as VillageState['trails'];
    const works = [{ roadIds: [1] }] as unknown as Construction[];
    expect(abandonBlockedStretches(roads, works, trails, under(40, 60))).toBe(false);
    expect(abandonBlockedStretches(roads, [], trails, under(40, 60))).toBe(true);
    const south = roads.roads.find((r) => r.id === 1)!;
    expect(south.points[south.points.length - 1]!.z).toBeLessThan(40);
    const rest = roads.roads.find((r) => !r.abandoned && r.id !== 1 && r.id !== 2)!;
    expect(rest.points[0]!.z).toBeGreaterThan(60);
    expect(trail.pieces).toEqual([
      { roadId: 2, grade: 'improved', manDays: 5 },
      { roadId: rest.id, grade: 'improved', manDays: 9 },
      { roadId: 1, grade: 'improved', manDays: 0 },
    ]);
    // celý úsek pod stavbou ze stezky vypadne
    const whole = roadsOf(road(1, 'improved', 0, 60));
    const only = [{ pieces: [{ roadId: 1, grade: 'improved', manDays: 3 }] }];
    abandonBlockedStretches(whole, [], only as unknown as VillageState['trails'], under(-5, 70));
    expect(only[0]!.pieces).toEqual([]);
  });

  it('stezka ve směru osy: zbytky za sebou v pořadí osy, celý úsek pod stavbou ji o úsek připraví', () => {
    const south: Road = {
      ...road(2, 'improved'),
      points: [
        { x: 0, z: -40 },
        { x: 0, z: 0 },
      ],
    };
    const roads = roadsOf(south, road(1, 'improved'));
    const trail = {
      pieces: [
        { roadId: 2, grade: 'improved', manDays: 1 },
        { roadId: 1, grade: 'improved', manDays: 9 },
      ],
    };
    const trails = [trail] as unknown as VillageState['trails'];
    abandonBlockedStretches(roads, [], trails, under(40, 60));
    const rest = roads.roads.find((r) => !r.abandoned && r.id !== 1 && r.id !== 2)!;
    expect(trail.pieces.map((p) => p.roadId)).toEqual([2, 1, rest.id]);
    // úsek 2 leží celý pod stavbou – stezka o něj přijde
    abandonBlockedStretches(roads, [], trails, under(-50, 5));
    expect(roads.roads.find((r) => r.id === 2)!.abandoned).toBe(true);
    expect(trail.pieces.map((p) => p.roadId)).not.toContain(2);
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

describe('zánik kusů – zbytky, jabloně, volné konce', () => {
  /** Cesta 200 m, kusy podle `c` (stav kusu po kusu v pořadí od začátku osy). */
  function withPieces(r: Road, c: (k: number) => number): Road {
    r.condition = roadPieces(r.points).map((p, k) => ({ x: p.x, z: p.z, c: c(k) }));
    return r;
  }

  it('opuštěný úsek s nestejným stavem kusů zůstane opuštěný – zbytky neoživnou', () => {
    const r = withPieces(road(1, 'trodden', 0, 200), (k) => (k === 4 ? 0 : 30));
    r.abandoned = true;
    const roads = roadsOf(r);
    cutDeadRoads(roads, [], undefined, 10);
    expect(roads.roads.length).toBeGreaterThanOrEqual(2);
    expect(roads.roads.every((x) => x.abandoned === true)).toBe(true);
    expect(roadChains(roads.roads)).toHaveLength(0);
  });

  it('zarostlý kus uprostřed: zbytky mají volné konce u řezu, stromy stojí dál u zbytku', () => {
    const r = withPieces(road(1, 'trodden', 0, 200), (k) => (k === 4 ? 0 : 30));
    r.spots = [
      { id: 1, x: 3, z: 10 },
      { id: 2, x: 3, z: 190 },
      { id: 3, x: 3, z: 112 },
    ];
    const roads = roadsOf(r);
    const events = cutDeadRoads(roads, [], undefined, 10);
    expect(events.map((e) => e.kind)).toEqual(['road-overgrown']);
    expect(roads.roads).toHaveLength(2);
    const [first, second] = roads.roads as [Road, Road];
    expect(first.id).toBe(1);
    expect(first.openEnds).toEqual([false, true]);
    expect(second.openEnds).toEqual([true, false]);
    expect(roads.cutEnds).toHaveLength(2);
    // strom na zaniklém kuse zmizel z míst, ostatní zůstaly u svých zbytků
    expect(first.spots.map((s) => s.id)).toEqual([1]);
    expect(second.spots.map((s) => s.id)).toEqual([2]);
  });

  it('jabloně jdou ke zbytku, po zaniklé cestě se přepojí na nejbližší jinou nebo zaniknou', () => {
    const apple = (id: number, roadId: number, x: number, z: number): RoadApple => ({
      id,
      roadId,
      x,
      z,
      distanceM: 50,
      plantedDay: 0,
    });
    // cesta 1 se rozřízne, jabloň u druhého zbytku přejde na jeho nové id
    const cut = withPieces(road(1, 'trodden', 0, 200), (k) => (k === 4 ? 0 : 30));
    const a = roadsOf(cut);
    a.apples = [apple(1, 1, 4, 20), apple(2, 1, 4, 180)];
    cutDeadRoads(a, [], undefined, 10);
    const ids = a.roads.map((x) => x.id);
    expect(a.apples.map((x) => x.roadId)).toEqual([ids[0], ids[1]]);
    // celá cesta zanikne: jabloň u sousední cesty se přepojí, osamělá zanikne
    const dying = withPieces(road(1, 'trodden', 0, 100), () => 0);
    const b = roadsOf(dying, road(2, 'trodden', 20, 100));
    b.apples = [apple(1, 1, 4, 20), apple(2, 1, -500, 20)];
    cutDeadRoads(b, [], undefined, 10);
    expect(b.roads.map((x) => x.id)).toEqual([2]);
    expect(b.apples).toEqual([expect.objectContaining({ id: 1, roadId: 2 })]);
  });

  it('opuštěná cesta končící u vchodu se nedrží a zmizí', () => {
    const r = road(1, 'trodden', 0, 60);
    r.abandoned = true;
    const roads = roadsOf(r);
    const entrance = [{ x: 0, z: 0 }];
    let day = 0;
    for (; day < 6 * YEAR && roads.roads.length > 0; day += 30) {
      settleRoadCondition(roads, [], undefined, NO_TRAFFIC, entrance, day, day + 30);
      cutDeadRoads(roads, [], undefined, day + 30);
    }
    expect(roads.roads).toHaveLength(0);
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

describe('provoz po cestě (paths.md – Zarůstání, Martin 25. 10. 2026)', () => {
  const CELL_M = 1.25;
  /** Trasa na sever od buňky (i, 0) o `n` buněk – kód kroků 0,1 (směr 2) po dvou. */
  const north = (i: number, n: number, trips: number): StoredRoute => ({
    from: 'a',
    to: 'b',
    purpose: 'water',
    trips,
    start: [i, 0],
    steps: 'S'.repeat(n / 2),
  });

  it('trasa po cestě nese provoz, trasa 5 m vedle ne (provozní pole vyšlapanosti ano)', () => {
    const along = north(0, 80, 300);
    expect(routeCells(along).slice(0, 3)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(trafficOnRoads([along], CELL_M)(0.4, 50)).toBe(300);
    const beside = north(4, 80, 300);
    expect(trafficOnRoads([beside], CELL_M)(0, 50)).toBe(0);
    // vyšlapanost má toleranci (pravidlo 3) – pole tras sem 5 m vedle dosáhne
    expect(trafficAt(trafficField({ key: 'x', list: [beside] }, CELL_M), 0, 50)).toBeGreaterThan(0);
    // dvě trasy po cestě se sčítají, každá jednou
    expect(trafficOnRoads([along, north(1, 80, 50)], CELL_M)(0.6, 50)).toBe(350);
  });

  it('souběžná cesta 5 m vedle trasy zaroste podle druhu', () => {
    const traffic = trafficOnRoads([north(4, 160, 300)], CELL_M);
    const days = survivesDays('trodden', traffic);
    expect(Math.abs(days - ROAD_DECAY.trodden.years * YEAR)).toBeLessThanOrEqual(30);
  });

  it('opuštěný úsek provoz nedostane – i s trasou po ose bledne a zmizí podle druhu', () => {
    const roads = roadsOf({ ...road(1, 'improved'), abandoned: true });
    const traffic = trafficAlong(0, 1000, 100);
    let day = 0;
    for (; day < 40 * YEAR && roads.roads.length > 0; day += 30) {
      settleRoadCondition(roads, [], undefined, traffic, [], day, day + 30);
      cutDeadRoads(roads, [], undefined, day + 30);
    }
    expect(Math.abs(day - ROAD_DECAY.improved.years * YEAR)).toBeLessThanOrEqual(30);
  });

  it('opuštěný kus pod hotovou stavbou zmizí do roka, vozová taky', () => {
    for (const grade of ['trodden', 'wagon'] as const) {
      const roads = roadsOf(road(1, grade, 0, 200));
      const blocked = (_x: number, z: number): boolean => z >= 70 && z <= 110;
      let day = 0;
      for (; day < 2 * YEAR; day += 30) {
        abandonBlockedStretches(roads, [], undefined, blocked);
        settleRoadCondition(roads, [], undefined, trafficAlong(0, 1000, 200), [], day, day + 30);
        cutDeadRoads(roads, [], undefined, day + 30);
        if (!roads.roads.some((r) => r.abandoned)) break;
      }
      expect(day).toBeLessThan(YEAR);
      // živé zbytky po stranách zůstanou
      expect(roads.roads.length).toBe(2);
    }
  });
});
