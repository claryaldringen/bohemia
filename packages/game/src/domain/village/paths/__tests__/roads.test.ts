import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundField, foundVillage, startNewDwelling } from '../../core/actions';
import { cellObstacles, obstacleChangesAt, obstacleStatus } from '../../core/obstacles';
import { computePathNetwork, pastureHerds, type PathVillage } from '../network';
import { addRoadLabor, plantingBlocker, roadTreeSpots, updateRoads } from '../roads';
import { encodeWear, wearKey } from '../wear';
import { pastureLivestock, pathVillageOf } from '../village';
import {
  checkDwellingPlacement,
  checkPlotPlacement,
  fieldPartsFromCells,
  placementVillageOf,
  villageDwellingPositions,
} from '../../placement/placement';
import {
  ROAD_TREE_ID_BASE,
  roadTreeGrowth,
  roadTreeLook,
  roadTreeObstacleKind,
} from '../../roads/road-trees';
import { ROAD_TREES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type {
  Dwelling,
  LaborDay,
  Person,
  Road,
  RoadTree,
  TileCell,
  VillageRoads,
  VillageState,
} from '../../types';
import { LANDSCAPE, house, part, pathTestTerrain } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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
  it('roční kontrola 1. 11. cesty pěších nezakládá – vznikají měsíčně z vyšlapanosti', () => {
    // dřív: úsek nad prahem dva roky po sobě (kandidáti); teď `roadsMonth` (road-form-wear.test)
    const s = village();
    expect(updateRoads(s, Y1, LANDSCAPE, null)).toEqual([]);
    expect(updateRoads(s, NOV1(601), LANDSCAPE, null)).toEqual([]);
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

describe('práce za rok cest (addRoadLabor)', () => {
  it('seč přirozených luk se sčítá jako jedno místo se všemi políčky (oxen.md – Seno)', () => {
    const roads: VillageRoads = {
      nextId: 1,
      roads: [],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    };
    const day = (d: number, cells: TileCell[], manDays: number): LaborDay => ({
      day: d,
      shares: [{ activity: 'mow', target: { kind: 'meadow', cells }, manDays }],
    });
    addRoadLabor(
      roads,
      day(
        1,
        [
          { x: 5, y: 2 },
          { x: 4, y: 2 },
        ],
        3,
      ),
      1,
    );
    addRoadLabor(
      roads,
      day(
        2,
        [
          { x: 4, y: 2 },
          { x: 3, y: 1 },
        ],
        2,
      ),
      2,
    );
    expect(roads.labor.days).toBe(2);
    expect(roads.labor.shares).toEqual([
      {
        target: {
          kind: 'meadow',
          cells: [
            { x: 3, y: 1 },
            { x: 4, y: 2 },
            { x: 5, y: 2 },
          ],
        },
        manDays: 5,
      },
    ]);
  });
});

describe('pevné cesty v simulaci', () => {
  it('staré vsi bez pevných cest se načtou a začnou sčítat práci', () => {
    const old = json(village(Y1 - 5));
    delete old.roads;
    expect(obstacleChangesAt(old, old.lastDay)).not.toHaveProperty('added');
    const s = advanceVillage(old, Y1 + 3, LAYER, LANDSCAPE);
    expect(s.roads).toBeDefined();
    expect(s.roads!.roads).toEqual([]);
    // roční kontrola cesty nezakládá ani nesbírá kandidáty, práce se sčítá od 1. 11.
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
    // vyšlapáno mezi vsí a vodou – 1. 11. (i 1. den v měsíci) vzniknou cesty z vyšlapanosti
    const hot = new Map<number, number>();
    for (let i = -4; i <= 3; i++) for (let j = -4; j <= 10; j++) hot.set(wearKey(i, j), 120_000);
    start.roads!.wear = { day: start.lastDay + 1, cells: encodeWear(hot), labor: [] };
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

describe('pevné cesty a pěšiny s ohradami, pastvou, domy na polích a zbytky jam', () => {
  const terrain = pathTestTerrain();
  const base: PathVillage = {
    dwellings: [house(1, 0, 0), house(2, 14, 4), house(3, -13, 5)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 4, adults: 8, elders: 2 }, shares: [] },
  };
  /** Body os pěšin uvnitř čtverce (bez okraje `margin`). */
  const inside = (v: PathVillage, x: number, z: number, margin: number): number =>
    computePathNetwork({ village: v, terrain })
      .lines.flatMap((l) => dense(l.points))
      .filter((p) => Math.abs(p.x - x) < 7.5 - margin && Math.abs(p.z - z) < 7.5 - margin).length;

  it('ohrada je překážka (plot) i cíl – pěšina vede k ní, ne skrz', () => {
    // čtverec ohrady (8, 11) přímo mezi domy a vodou
    const pen = { ...part(-22.5, 22.5, 'meadow'), id: 70, built: true };
    const through = inside(base, -22.5, 22.5, 2);
    const fenced = inside({ ...base, pens: [pen] }, -22.5, 22.5, 2);
    expect(fenced).toBeLessThanOrEqual(through);
    expect(fenced).toBe(0);
    // k ohradě se chodí (krmení dobytka) – pěšina končí u ní
    const far = { ...part(52.5, -67.5, 'meadow'), id: 71, built: true };
    const net = computePathNetwork({ village: { ...base, pens: [far] }, terrain });
    const near = net.lines
      .flatMap((l) => dense(l.points))
      .some((p) => Math.abs(p.x - 52.5) < 9 && Math.abs(p.z + 67.5) < 9);
    expect(near).toBe(true);
  });

  it('stáda se pasou na úhoru – pasáci k němu vyšlapou pěšinu', () => {
    const fallow = [part(97.5, -52.5, 'young-fallow'), part(112.5, -52.5, 'young-fallow')];
    const v: PathVillage = { ...base, fields: [{ id: 5, parts: fallow }] };
    const toFallow = (village: PathVillage): number =>
      computePathNetwork({ village, terrain }).traffic.raw.reduce((a, b) => a + b, 0);
    expect(pastureHerds({ sheep: 30, goat: 8, cow: 7, pig: 12 })).toBe(4);
    expect(pastureHerds(undefined)).toBe(0);
    const without = toFallow(v);
    const withHerds = toFallow({ ...v, livestock: { sheep: 30, goat: 8, cow: 7, pig: 12 } });
    expect(withHerds).toBeGreaterThan(without * 1.2);
  });

  it('stáda ze stavu vsi jako ve scéně – v zimě krávy v hotové ohradě', () => {
    const s = village();
    s.livestock = {
      herds: { sheep: 20.4, goat: 4, pig: 6, cow: 5.6 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    const summer = dayIndexOf({ year: 600, month: 6, day: 1 });
    const winter = dayIndexOf({ year: 601, month: 1, day: 10 });
    expect(pastureLivestock(s, winter)).toEqual({ sheep: 20, goat: 4, pig: 6, cow: 6 });
    s.pens = [
      {
        id: 80,
        cell: { x: 4, y: 4 },
        x: -82.5,
        z: -82.5,
        builtDay: summer,
        team: null,
        training: null,
      },
    ];
    expect(pastureLivestock(s, winter).cow).toBe(0);
    expect(pastureLivestock(s, summer).cow).toBe(6);
    const v = pathVillageOf(s, summer, LANDSCAPE);
    expect(v.pens).toEqual([
      { id: 80, cell: { x: 4, y: 4 }, x: -82.5, z: -82.5, size: 15, built: true },
    ]);
    expect(v.livestock).toEqual({ sheep: 20, goat: 4, pig: 6, cow: 6 });
  });

  it('strom u cesty nevyroste u ohrady, u zbytku jámy ani na jeho pozemku', () => {
    const s = village();
    const free = plantingBlocker(s, LANDSCAPE);
    // (−82,5; −82,5) ohrada, (60, −60) zbytek jámy s pozemkem (12, 5)
    expect(free(-82.5, -82.5)).toBe(false);
    expect(free(60, -60)).toBe(false);
    expect(free(37.5, -67.5)).toBe(false);
    s.pens = [
      {
        id: 80,
        cell: { x: 4, y: 4 },
        x: -82.5,
        z: -82.5,
        builtDay: null,
        team: null,
        training: null,
      },
    ];
    s.ruins = [
      {
        id: 9,
        type: 'polozemnice',
        position: { x: 60, z: -60, rotation: 0 },
        plot: { cell: { x: 12, y: 5 }, variant: 'center' },
        day: s.lastDay - 100,
      },
    ];
    const blocked = plantingBlocker(s, LANDSCAPE);
    expect(blocked(-82.5, -82.5)).toBe(true);
    expect(blocked(60, -60)).toBe(true);
    expect(blocked(37.5, -67.5)).toBe(true);
    expect(blocked(-37.5, -112.5)).toBe(false);
  });

  it('dům na poli: strom u cesty na zakládaném dílu odklidí stavba obydlí (kláda)', () => {
    const s = village();
    for (const d of s.dwellings) d.builtDay = s.lastDay - 2 * 365;
    // plná domácnost – mladý pár se může oddělit do nového obydlí
    s.people.push(
      ...[0, 1, 2, 3].map((k) => ({
        id: 90 + k,
        bornDay: s.lastDay - (19 + k) * 365,
        dwellingId: 1,
      })),
    );
    const day = s.lastDay;
    const tree: RoadTree = {
      id: ROAD_TREE_ID_BASE + 77,
      spot: 9999,
      x: -7.5,
      z: -97.5,
      species: 'oak',
      rootedDay: day - 50 * 365,
      diesDay: day + 200 * 365,
    };
    s.roads = {
      nextId: 1,
      roads: [],
      trees: [tree],
      labor: { from: day, days: 0, shares: [] },
    };
    const cells = [7, 8, 9, 10, 11].map((x) => ({ x, y: 3 }));
    const fieldVillage = placementVillageOf(s, day);
    const preview = fieldPartsFromCells(
      LANDSCAPE,
      fieldVillage,
      cells,
      villageDwellingPositions(fieldVillage),
      LAYER,
    );
    const withField = foundField(s, day, { parts: preview.parts });
    const pending = withField.parts.find((p) => p.cell?.x === 9)!;
    expect(pending.obstacles).toEqual([tree.id]);
    const plot = { cell: { x: 9, y: 3 }, variant: 'center' as const };
    const check = checkPlotPlacement(
      LANDSCAPE,
      placementVillageOf(withField, day),
      'polozemnice',
      plot,
      LAYER,
    );
    expect(check.ok).toBe(true);
    expect(check.takenLand.map((t) => t.cell)).toEqual([plot.cell]);
    const built = startNewDwelling(
      withField,
      day,
      'polozemnice',
      check.position!,
      check.obstacleCost,
      check.obstacleIds,
      { plot, takenLand: check.takenLand, clearedTrees: check.clearedTrees },
    );
    expect(built.parts.some((p) => p.cell?.x === 9 && p.cell.y === 3)).toBe(false);
    expect(built.clearedObstacles!.map((c) => c.id)).toContain(tree.id);
    expect(obstacleChangesAt(built, day).added ?? []).toEqual([]);
    expect(built.woodLogs ?? 0).toBeGreaterThanOrEqual(1);
  });
});
