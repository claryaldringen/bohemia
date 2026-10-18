import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { cellObstacles, obstacleChangesAt, obstacleStatus } from '../obstacles';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { roadTreeSpots, updateRoads } from '../paths/roads';
import {
  checkDwellingPlacement,
  fieldPartsFromCells,
  placementVillageOf,
  villageDwellingPositions,
} from '../placement';
import {
  ROAD_TREE_ID_BASE,
  roadTreeGrowth,
  roadTreeLook,
  roadTreeObstacleKind,
} from '../road-trees';
import { ROADS, ROAD_TREES } from '../rules';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, Road, RoadTree, VillageState } from '../types';
import { LANDSCAPE, house, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y1 = NOV1(600);
const LAYER = obstaclesOf(LANDSCAPE);

/**
 * Ves čtyř obydlí kolem počátku (louka; potok z ∈ (75, 90), les x < −90) – každá domácnost
 * se čtyřmi dospělými. Pro vodu se chodí silně (≈ 6–8 cest za den po společné pěšině).
 */
function village(day = Y1 - 30): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 30 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
  const adult = (id: number, dwellingId: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId,
  });
  s.people = [1, 2, 3, 4].flatMap((d) => [
    adult(d * 10, d, 30),
    adult(d * 10 + 1, d, 28),
    adult(d * 10 + 2, d, 22),
    adult(d * 10 + 3, d, 20),
  ]);
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = day;
  return s;
}

/** Ručně položená stará cesta stranou vsi (bez provozu) s místy na stromy. */
function sideRoad(id: number, bornDay: number, grade: Road['grade'] = 'trodden'): Road {
  const points = [
    { x: -60, z: -120 },
    { x: 130, z: -120 },
  ];
  const spots = roadTreeSpots(points, 5, () => true).map((p, k) => ({ id: 1000 + k, ...p }));
  return { id, points, bornDay, grade, traffic: [], spots };
}

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Body lomené čáry po ≈ 1 m (i mezi vrcholy). */
function dense(points: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  return points.slice(1).flatMap((b, k) => {
    const a = points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    return Array.from({ length: n }, (_, i) => ({
      x: a.x + ((b.x - a.x) * i) / n,
      z: a.z + ((b.z - a.z) * i) / n,
    }));
  });
}

describe('stromy u cest – stadium podle dne', () => {
  const tree: Pick<RoadTree, 'rootedDay' | 'diesDay'> = {
    rootedDay: 1000,
    diesDay: 1000 + Math.round(80 * YEAR),
  };
  const at = (years: number): number => tree.rootedDay + Math.round(years * YEAR);

  it('keř do 8 let, pak strom od 30 % do plné velikosti ve 40 letech', () => {
    expect(roadTreeLook(tree, tree.rootedDay - 1)).toBeNull();
    expect(roadTreeLook(tree, at(1))!.stage).toBe('shrub');
    expect(roadTreeLook(tree, at(7.9))!.stage).toBe('shrub');
    const young = roadTreeLook(tree, at(8.01))!;
    expect(young.stage).toBe('tree');
    expect(young.growth).toBeCloseTo(ROAD_TREES.youngScale, 2);
    expect(roadTreeLook(tree, at(24))!.growth).toBeCloseTo(0.65, 2);
    expect(roadTreeLook(tree, at(40))!.growth).toBe(1);
    expect(roadTreeGrowth(70)).toBe(1);
  });

  it('po smrti souš 10 let, pak pařez 10 let a místo je volné', () => {
    expect(roadTreeLook(tree, at(80))!.stage).toBe('snag');
    expect(roadTreeLook(tree, at(89.9))!.stage).toBe('snag');
    expect(roadTreeLook(tree, at(90.1))!.stage).toBe('stump');
    expect(roadTreeLook(tree, at(99.9))!.stage).toBe('stump');
    expect(roadTreeLook(tree, at(100.1))).toBeNull();
  });

  it('jako překážka: keř, mladý stromek, dospělý strom (kláda), souš, pařez', () => {
    expect(roadTreeObstacleKind(tree, at(3))).toBe('shrub');
    expect(roadTreeObstacleKind(tree, at(12))).toBe('youngTree');
    expect(roadTreeObstacleKind(tree, at(30))).toBe('tree');
    expect(roadTreeObstacleKind(tree, at(85))).toBe('snag');
    expect(roadTreeObstacleKind(tree, at(95))).toBe('stump');
    expect(roadTreeObstacleKind(tree, at(101))).toBeNull();
  });
});

describe('místa na stromy u cesty', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 200, z: 0 },
  ];

  it('po 12–20 m střídavě po stranách 2,5–4 m od osy, aspoň 8 m od sebe, deterministicky', () => {
    const spots = roadTreeSpots(points, 7, () => true);
    expect(spots.length).toBeGreaterThan(8);
    expect(spots.length).toBeLessThan(17);
    for (const s of spots) {
      expect(Math.abs(s.z)).toBeGreaterThanOrEqual(ROAD_TREES.offsetM.from - 1e-9);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(ROAD_TREES.offsetM.to + 1e-9);
    }
    expect(spots.some((s) => s.z > 0) && spots.some((s) => s.z < 0)).toBe(true);
    for (const a of spots) {
      for (const b of spots) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(8);
      }
    }
    expect(roadTreeSpots(points, 7, () => true)).toEqual(spots);
  });

  it('kde strom nesmí stát, zkusí druhou stranu, jinak nic', () => {
    const north = roadTreeSpots(points, 7, (_x, z) => z > 0);
    expect(north.length).toBeGreaterThan(5);
    expect(north.every((s) => s.z > 0)).toBe(true);
    expect(roadTreeSpots(points, 7, () => false)).toEqual([]);
  });
});

describe('pevné cesty – roční kontrola (updateRoads)', () => {
  it('vznikne až po dvou letech nad prahem a pak se nepohne, i když se práce mění', () => {
    const s = village();
    const first = updateRoads(s, Y1, LANDSCAPE, null);
    expect(first).toEqual([]);
    expect(s.roads!.roads).toEqual([]);
    expect(s.roads!.candidates.length).toBeGreaterThan(0);

    const second = updateRoads(s, NOV1(601), LANDSCAPE, null);
    expect(second.some((e) => e.kind === 'road-formed')).toBe(true);
    const roads = json(s.roads!.roads);
    expect(roads.length).toBeGreaterThan(0);
    for (const r of roads) {
      expect(r.bornDay).toBe(NOV1(601));
      expect(r.grade).toBe('trodden');
      expect(r.traffic[0]).toBeGreaterThanOrEqual(ROADS.tripsPerDay * ROADS.overgrowShare);
    }

    // jiná práce (pole na druhé straně vsi) a nové obydlí – pevné cesty zůstanou, kde byly
    s.roads!.labor.shares = [{ target: { kind: 'field', id: 99 }, manDays: 5000 }];
    s.roads!.labor.days = 365;
    s.dwellings.push({ ...s.dwellings[0]!, id: 5, position: { x: -40, z: -60, rotation: 1 } });
    updateRoads(s, NOV1(602), LANDSCAPE, null);
    updateRoads(s, NOV1(603), LANDSCAPE, null);
    const all = s.roads!.roads.flatMap((r) => r.points);
    for (const r of roads) {
      // body osy zůstanou (napojená cesta úsek jen rozdělí – přibude bod rozcestí)
      for (const p of r.points) expect(all).toContainEqual(p);
      expect(s.roads!.roads.find((x) => x.id === r.id)?.bornDay).toBe(r.bornDay);
    }
  });

  it('bez loňského úseku nad prahem nevznikne nic', () => {
    const s = village();
    updateRoads(s, Y1, LANDSCAPE, null);
    s.roads!.candidates = [];
    updateRoads(s, NOV1(601), LANDSCAPE, null);
    expect(s.roads!.roads).toEqual([]);
  });

  it('pěšiny dne se k pevné cestě stahují (sleva v síti)', () => {
    const terrain = pathTestTerrain();
    // obydlí v počátku, k vodě (z ≈ 75) se jde rovně; pevná cesta vede k vodě obloukem stranou
    const road = [
      { x: 0, z: 6 },
      { x: 12, z: 25 },
      { x: 14, z: 50 },
      { x: 6, z: 72 },
    ];
    const v: PathVillage = {
      dwellings: [house(1, 0, 0), house(2, 3, -14), house(3, -10, -10)],
      fields: [],
      labor: { day: 4000, month: 6, people: { children: 2, adults: 10, elders: 1 }, shares: [] },
    };
    const off = (roads: PathVillage['roads']): number => {
      const net = computePathNetwork({ village: { ...v, ...(roads ? { roads } : {}) }, terrain });
      const pts = net.lines.flatMap((l) => dense(l.points)).filter((p) => p.z > 20 && p.z < 60);
      expect(pts.length).toBeGreaterThan(0);
      // průměrná vzdálenost bodů pěšin od osy cesty (k nejbližšímu bodu osy po ≈ 1 m)
      const axis = dense(road);
      const d = pts.map((p) => Math.min(...axis.map((q) => Math.hypot(p.x - q.x, p.z - q.z))));
      return d.reduce((a, b) => a + b, 0) / d.length;
    };
    expect(off([{ points: road }])).toBeLessThan(off(undefined) * 0.5);
  });

  it('vyšlapaná cesta bez provozu zaroste po pěti letech, upravená ne; stromy stojí dál', () => {
    const s = village();
    updateRoads(s, Y1, LANDSCAPE, null);
    s.roads!.roads.push(sideRoad(500, Y1 - 20 * 365), {
      ...sideRoad(501, Y1 - 20 * 365, 'improved'),
      points: [
        { x: -60, z: -135 },
        { x: 130, z: -135 },
      ],
      spots: [],
    });
    const tree: RoadTree = {
      id: ROAD_TREE_ID_BASE + 900,
      spot: 1000,
      x: s.roads!.roads.find((r) => r.id === 500)!.spots[0]!.x,
      z: s.roads!.roads.find((r) => r.id === 500)!.spots[0]!.z,
      species: 'oak',
      rootedDay: Y1 - 30 * 365,
      diesDay: Y1 + 300 * 365,
    };
    s.roads!.trees.push(tree);
    for (let k = 1; k <= 4; k++) {
      updateRoads(s, NOV1(600 + k), LANDSCAPE, null);
      expect(s.roads!.roads.some((r) => r.id === 500)).toBe(true);
    }
    const events = updateRoads(s, NOV1(605), LANDSCAPE, null);
    expect(events).toContainEqual({ day: NOV1(605), kind: 'road-overgrown', roadId: 500 });
    expect(s.roads!.roads.some((r) => r.id === 500)).toBe(false);
    expect(s.roads!.roads.some((r) => r.id === 501)).toBe(true);
    expect(s.roads!.trees).toContainEqual(tree);
  });

  it('strom se uchytí na místě u cesty starší 5 let a stojí tam do smrti', () => {
    const s = village();
    updateRoads(s, Y1, LANDSCAPE, null);
    // upravená cesta nezaroste – místa zůstanou celou dobu
    s.roads!.roads.push(sideRoad(500, Y1 - 3 * 365, 'improved'));
    const spots = s.roads!.roads.find((r) => r.id === 500)!.spots;
    updateRoads(s, NOV1(601), LANDSCAPE, null);
    // cesta mladší pěti let – nic
    expect(s.roads!.trees).toEqual([]);
    const seen = new Map<number, RoadTree>();
    for (let k = 2; k <= 40; k++) {
      if (k === 20) {
        // nová stavba a jiná práce mimo místa stromů nic nepohnou
        s.dwellings.push({ ...s.dwellings[0]!, id: 6, position: { x: -50, z: 40, rotation: 0 } });
        s.roads!.labor.shares = [{ target: { kind: 'field', id: 99 }, manDays: 3000 }];
      }
      updateRoads(s, NOV1(600 + k), LANDSCAPE, null);
      for (const t of s.roads!.trees.filter((x) => spots.some((p) => p.id === x.spot))) {
        const before = seen.get(t.id);
        if (before) expect(t).toEqual(before);
        else seen.set(t.id, json(t));
        const spot = spots.find((p) => p.id === t.spot)!;
        expect({ x: t.x, z: t.z }).toEqual({ x: spot.x, z: spot.z });
      }
    }
    // za 35 let s 10 % ročně se uchytí skoro na všech místech, na každém nejvýš jeden strom
    expect(seen.size).toBeGreaterThan(spots.length * 0.7);
    expect(new Set(s.roads!.trees.map((t) => t.spot)).size).toBe(s.roads!.trees.length);
    // místa vedlejší cesty se nezměnila
    expect(s.roads!.roads.find((r) => r.id === 500)!.spots).toEqual(spots);
    for (const t of seen.values()) {
      expect(t.id).toBeGreaterThanOrEqual(ROAD_TREE_ID_BASE);
      const life = (t.diesDay - t.rootedDay) / YEAR;
      const span = ROAD_TREES.lifeYears[t.species];
      expect(life).toBeGreaterThanOrEqual(span.from - 0.01);
      expect(life).toBeLessThanOrEqual(span.to + 0.01);
    }
  });

  it('pařez zmizí a na místě se může uchytit nový strom', () => {
    const s = village();
    updateRoads(s, Y1, LANDSCAPE, null);
    const road = sideRoad(500, Y1 - 50 * 365, 'improved');
    s.roads!.roads.push(road);
    const spot = road.spots[0]!;
    s.roads!.trees.push({
      id: ROAD_TREE_ID_BASE + 1,
      spot: spot.id,
      x: spot.x,
      z: spot.z,
      species: 'poplar',
      rootedDay: Y1 - 100 * 365,
      diesDay: Y1 - 21 * 365,
    });
    updateRoads(s, NOV1(601), LANDSCAPE, null);
    expect(s.roads!.trees.some((t) => t.id === ROAD_TREE_ID_BASE + 1)).toBe(false);
  });
});

describe('strom u cesty jako překážka stavby', () => {
  /** Pole 5 čtverců (nejmenší výměra 0,1 ha) na řádku 3 – strom stojí ve čtverci (9, 3). */
  const FIELD_CELLS = [7, 8, 9, 10, 11].map((x) => ({ x, y: 3 }));

  /** Ves s dospělým stromem u cesty ve středu políčka (9, 3) – (−7,5; −97,5). */
  function withTree(): { s: VillageState; tree: RoadTree; day: number } {
    const s = village();
    // nová obydlí – žádná přestavba si nevezme klády z hromady
    for (const d of s.dwellings) d.builtDay = s.lastDay - 2 * 365;
    const tree: RoadTree = {
      id: ROAD_TREE_ID_BASE + 77,
      spot: 9999,
      x: -7.5,
      z: -97.5,
      species: 'oak',
      rootedDay: Y1 - 50 * 365,
      diesDay: Y1 + 200 * 365,
    };
    s.roads = {
      nextId: 1,
      roads: [],
      trees: [tree],
      candidates: [],
      labor: { from: s.lastDay, days: 0, shares: [] },
    };
    return { s, tree, day: s.lastDay };
  }

  it('cena u kurzoru (pole, obydlí) ho počítá jako strom vrstvy – odstraní se a dá kládu', () => {
    const { s, tree, day } = withTree();
    const changes = obstacleChangesAt(s, day);
    expect(changes.added).toEqual([{ id: tree.id, x: tree.x, z: tree.z, kind: 'tree' }]);
    const tally = cellObstacles(LAYER, obstacleStatus(changes), { x: 9, y: 3 });
    expect(tally.ids).toEqual([tree.id]);
    expect(tally.treeIds).toEqual([tree.id]);

    const village = placementVillageOf(s, day);
    const field = fieldPartsFromCells(
      LANDSCAPE,
      village,
      FIELD_CELLS,
      villageDwellingPositions(village),
      LAYER,
    );
    expect(field.check.ok).toBe(true);
    const part = field.parts.find((p) => p.cell?.x === 9)!;
    expect(part.obstacleIds).toEqual([tree.id]);
    expect(part.trees).toBe(1);
    expect(field.clearedTrees).toBe(1);

    const dwelling = checkDwellingPlacement(
      LANDSCAPE,
      village,
      'zemnice',
      { x: -7.5, z: -95, rotation: 0 },
      LAYER,
    );
    expect(dwelling.ok).toBe(true);
    expect(dwelling.obstacleIds).toContain(tree.id);
    expect(dwelling.clearedTrees).toBe(1);
  });

  it('založené pole strom odstraní (kláda na hromadu) a místo už nikdo nesází', () => {
    const { s, tree, day } = withTree();
    const village = placementVillageOf(s, day);
    const preview = fieldPartsFromCells(
      LANDSCAPE,
      village,
      FIELD_CELLS,
      villageDwellingPositions(village),
      LAYER,
    );
    const founded = foundField(s, day, { parts: preview.parts });
    const later = advanceVillage(founded, day + 25, LAYER, LANDSCAPE);
    const part = later.parts.find((p) => p.cell?.x === 9 && p.cell.y === 3)!;
    expect(part.state).not.toBe('founding');
    expect(later.clearedObstacles!.map((c) => c.id)).toContain(tree.id);
    expect(obstacleChangesAt(later, later.lastDay).added ?? []).toEqual([]);
    // kláda na hromadě (jiné stromy na poli nejsou, nic jiného se nestaví, hnije jen trochu)
    expect(s.woodLogs ?? 0).toBe(0);
    expect(later.woodLogs).toBeGreaterThan(0.99);
    expect(later.woodLogs).toBeLessThan(1.01);
    // 1. 11. zmizí i ze záznamu stromů
    const next = advanceVillage(later, Y1 + 2, LAYER, LANDSCAPE);
    expect(next.roads!.trees.some((t) => t.id === tree.id)).toBe(false);
  }, 60_000);
});

describe('pevné cesty v simulaci', () => {
  it('staré vsi bez pevných cest se načtou a začnou sčítat práci', () => {
    const old = json(village(Y1 - 5));
    delete old.roads;
    expect(obstacleChangesAt(old, old.lastDay)).not.toHaveProperty('added');
    const s = advanceVillage(old, Y1 + 3, LAYER, LANDSCAPE);
    expect(s.roads).toBeDefined();
    expect(s.roads!.roads).toEqual([]);
    // první roční kontrola jen zapamatuje úseky nad prahem, práce se sčítá od 1. 11.
    expect(s.roads!.candidates.length).toBeGreaterThan(0);
    expect(s.roads!.labor.from).toBe(Y1);
    expect(s.roads!.labor.days).toBe(4);
    // bez krajiny (kalibrace) se pevné cesty nepočítají
    expect(advanceVillage(old, Y1 + 3, null).roads).toBeUndefined();
  }, 60_000);

  it('výsledek nezávisí na kouscích dopočtu (i s JSON mezi kousky) přes 1. 11.', () => {
    const start = village(NOV1(601) - 12);
    updateRoads(start, Y1, LANDSCAPE, null);
    start.roads!.roads.push(sideRoad(500, Y1 - 10 * 365, 'improved'));
    // starý strom, který mezitím doslouží (pařez zmizí) – místo se uvolní
    const spot = start.roads!.roads.at(-1)!.spots[0]!;
    start.roads!.trees.push({
      id: ROAD_TREE_ID_BASE + 3,
      spot: spot.id,
      x: spot.x,
      z: spot.z,
      species: 'elm',
      rootedDay: Y1 - 150 * 365,
      diesDay: Y1 - 20 * 365 + 100,
    });
    // a mladý strom na dalším místě, který roste dál
    const other = start.roads!.roads.at(-1)!.spots[1]!;
    start.roads!.trees.push({
      id: ROAD_TREE_ID_BASE + 4,
      spot: other.id,
      x: other.x,
      z: other.z,
      species: 'oak',
      rootedDay: Y1 - 5 * 365,
      diesDay: Y1 + 300 * 365,
    });
    start.roads!.labor = { from: Y1, days: 365, shares: [] };
    const end = NOV1(601) + 9;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    expect(whole.roads!.roads.length).toBeGreaterThan(1);
    expect(whole.roads!.trees.some((t) => t.id === ROAD_TREE_ID_BASE + 3)).toBe(false);
    expect(whole.roads!.trees.some((t) => t.id === ROAD_TREE_ID_BASE + 4)).toBe(true);
    const steps = [1, 3, 5, 2, 7];
    let chunked = json(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          LAYER,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(json(whole));
  }, 60_000);
});
