import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { type GridWindow } from '../paths/network-grid';
import { type RoadAnchor, type RoadAnchors, roadAnchors } from '../paths/road-anchors';
import { roadsMonth } from '../paths/roads';
import { emptyRoads, formRoadsFromWear } from '../paths/roads-form';
import { type SpotContext } from '../paths/roads-trees';
import { encodeRoute } from '../paths/routes';
import { trailTerrain } from '../paths/terrain';
import { encodeWear, wearCellAt } from '../paths/wear';
import { WEAR } from '../rules-roads';
import type { Road, RoadPoint, StoredRoute, VillageRoads } from '../types';
import { village } from './abandonment-fixtures';
import { LANDSCAPE } from './paths-fixtures';

// Vznik cest z vyšlapanosti (paths.md – Vyšlapanost a vznik cesty, Síť – kotvy, Stavba přes
// cestu): měsíční kontrola vezme horké kusy čar tras mimo pevné cesty a prodlouží je po čáře ke
// kotvě nebo k pevné cestě – jinak nic.

const DAY = dayIndexOf({ year: 601, month: 3, day: 1 });
const HOT = 120_000;
const WARM = 60_000;

function context(): SpotContext {
  return {
    terrain: trailTerrain(LANDSCAPE, null),
    blocked: () => false,
    layer: null,
    changes: { removed: [], stumps: [], saplings: [] },
    seed: 7,
    split: () => {},
  };
}

/** Body lomené čáry po ≈ 1 m. */
function dense(points: readonly RoadPoint[]): RoadPoint[] {
  const out: RoadPoint[] = [];
  points.slice(1).forEach((b, k) => {
    const a = points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let i = 0; i < n; i++) {
      out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
    }
  });
  out.push(points[points.length - 1]!);
  return out;
}

/** Vyšlapanost `value` na políčkách bodů čáry, kde platí `where` (nejvyšší vyhrává). */
function heat(
  wear: Map<number, number>,
  line: readonly RoadPoint[],
  value: number,
  where: (p: RoadPoint) => boolean = () => true,
): void {
  for (const p of dense(line)) {
    if (!where(p)) continue;
    const key = wearCellAt(p.x, p.z);
    wear.set(key, Math.max(wear.get(key) ?? 0, value));
  }
}

function anchorsAt(points: [RoadPoint, RoadAnchor['kind']][]): RoadAnchors {
  return {
    points: points.map(([p, kind]) => ({
      x: p.x,
      z: p.z,
      kind,
      reachM: kind === 'entrance' ? 3 : 7.5,
    })),
    halfM: 1000,
  };
}

const road = (id: number, points: RoadPoint[]): Road => ({
  id,
  points,
  bornDay: DAY - 3000,
  grade: 'trodden',
  traffic: [3],
  spots: [],
});

const endsOf = (roads: VillageRoads): string[] =>
  roads.roads.flatMap((r) => [r.points[0]!, r.points.at(-1)!]).map((p) => `${p.x},${p.z}`);

// čára od brány (3,75; 0) k cíli (3,75; 60) uprostřed políček vyšlapanosti
const LINE: RoadPoint[] = [
  { x: 3.75, z: 0 },
  { x: 3.75, z: 60 },
];

describe('formRoadsFromWear – cesta jen od kotvy ke kotvě', () => {
  it('horký kus uprostřed louky bez kotvy cestu nezaloží', () => {
    const roads = emptyRoads(DAY);
    const wear = new Map<number, number>();
    heat(wear, LINE, WARM, (p) => p.z > 15 && p.z < 45);
    heat(wear, LINE, HOT, (p) => p.z > 22 && p.z < 38);
    const anchors = anchorsAt([
      [LINE[0]!, 'entrance'],
      [LINE[1]!, 'goal'],
    ]);
    expect(formRoadsFromWear(roads, [LINE], wear, anchors, DAY, context())).toEqual([]);
    expect(roads.roads).toEqual([]);
  });

  it('prodloužení po vyšlapané čáře dojde do brány domu i k cíli', () => {
    const roads = emptyRoads(DAY);
    const wear = new Map<number, number>();
    heat(wear, LINE, WARM);
    heat(wear, LINE, HOT, (p) => p.z > 22 && p.z < 38);
    const anchors = anchorsAt([
      [LINE[0]!, 'entrance'],
      [LINE[1]!, 'goal'],
    ]);
    const formed = formRoadsFromWear(roads, [LINE], wear, anchors, DAY, context());
    expect(formed).toHaveLength(1);
    const r = formed[0]!;
    expect(r.points[0]).toEqual({ x: 3.75, z: 0 });
    expect(r.points.at(-1)).toEqual({ x: 3.75, z: 60 });
    expect(r.bornDay).toBe(DAY);
    expect(r.grade).toBe('trodden');
  });

  it('cíl bez vchodu stačí do 7,5 m, vchod jen do 3 m', () => {
    // vyšlapáno jen do z < 52,5 (políčko 6) – poslední bod z 52, k cíli v z = 59 zbývá 7 m
    const line: RoadPoint[] = [LINE[0]!, { x: 3.75, z: 59 }];
    const wear = new Map<number, number>();
    heat(wear, line, WARM, (p) => p.z < 52.5);
    heat(wear, line, HOT, (p) => p.z > 22 && p.z < 38);
    const goal = emptyRoads(DAY);
    const toGoal = anchorsAt([
      [line[0]!, 'entrance'],
      [line[1]!, 'goal'],
    ]);
    const formed = formRoadsFromWear(goal, [line], wear, toGoal, DAY, context());
    expect(formed).toHaveLength(1);
    expect(59 - formed[0]!.points.at(-1)!.z).toBeLessThanOrEqual(7.5);
    const entrance = emptyRoads(DAY);
    const toGate = anchorsAt([
      [line[0]!, 'entrance'],
      [line[1]!, 'entrance'],
    ]);
    expect(formRoadsFromWear(entrance, [line], wear, toGate, DAY, context())).toEqual([]);
  });

  it('nová cesta navazuje na pevnou cestu rozdělením', () => {
    const roads = emptyRoads(DAY);
    roads.nextId = 10;
    roads.roads.push(
      road(1, [
        { x: -41.25, z: 33.75 },
        { x: 48.75, z: 33.75 },
      ]),
    );
    // od brány na sever k cestě a po ní na východ k cíli
    const line: RoadPoint[] = [
      { x: 3.75, z: 0 },
      { x: 3.75, z: 33.75 },
      { x: 33.75, z: 33.75 },
    ];
    const wear = new Map<number, number>();
    heat(wear, line, HOT);
    const anchors = anchorsAt([
      [line[0]!, 'entrance'],
      [line[2]!, 'goal'],
    ]);
    const formed = formRoadsFromWear(roads, [line], wear, anchors, DAY, context());
    expect(formed).toHaveLength(1);
    const r = formed[0]!;
    expect(r.points[0]).toEqual({ x: 3.75, z: 0 });
    // stará cesta se v rozcestí rozdělila – konec nové cesty je i koncem obou jejích úseků
    expect(roads.roads).toHaveLength(3);
    const join = r.points.at(-1)!;
    expect(join.z).toBeCloseTo(33.75, 1);
    expect(endsOf(roads).filter((e) => e === `${join.x},${join.z}`)).toHaveLength(3);
  });

  it('krátký kus od cesty ke kotvě (pod MIN_ROAD_M) cestu nevytvoří ani ji nerozdělí', () => {
    const roads = emptyRoads(DAY);
    roads.nextId = 10;
    roads.roads.push(
      road(1, [
        { x: 0, z: -20 },
        { x: 0, z: 110 },
      ]),
    );
    const before = structuredClone(roads.roads);
    // od cesty 12 m na východ k cíli – s připojením jen 12 m
    const line: RoadPoint[] = [
      { x: 0, z: 40 },
      { x: 12, z: 40 },
    ];
    const wear = new Map<number, number>();
    heat(wear, line, HOT);
    const anchors = anchorsAt([[line[1]!, 'goal']]);
    expect(formRoadsFromWear(roads, [line], wear, anchors, DAY, context())).toEqual([]);
    expect(roads.roads).toEqual(before);
    expect(roads.nextId).toBe(10);
  });

  it('stavba přes cestu: vyšlapaná objížďka se napojí na zbytky staré cesty po obou stranách', () => {
    // stará cesta k vodě vede rovně; pozemek (x −8…8, z 46…62) ji přehradil a trasa ho obchází
    const roads = emptyRoads(DAY);
    roads.nextId = 10;
    roads.roads.push(
      road(1, [
        { x: 0, z: -20 },
        { x: 0, z: 110 },
      ]),
    );
    const line: RoadPoint[] = [
      { x: 0, z: -20 },
      { x: 0, z: 38 },
      { x: 10, z: 46 },
      { x: 10, z: 62 },
      { x: 0, z: 70 },
      { x: 0, z: 110 },
    ];
    const wear = new Map<number, number>();
    heat(wear, line, HOT);
    const anchors = anchorsAt([
      [line[0]!, 'entrance'],
      [line[5]!, 'goal'],
    ]);
    const formed = formRoadsFromWear(roads, [line], wear, anchors, DAY, context());
    expect(formed).toHaveLength(1);
    const r = formed[0]!;
    expect(Math.max(...r.points.map((p) => p.x))).toBeGreaterThan(9);
    // dva rozcestí na zbytcích staré cesty – mimo pozemek, každé sdílí tři konce úseků
    expect(roads.roads).toHaveLength(4);
    for (const end of [r.points[0]!, r.points.at(-1)!]) {
      expect(end.x).toBeCloseTo(0, 1);
      expect(end.z < 46 || end.z > 62, `${end.z}`).toBe(true);
      expect(endsOf(roads).filter((e) => e === `${end.x},${end.z}`)).toHaveLength(3);
    }
  });

  it('nová cesta za koncem souběžné cesty se k ní připojí – díra nevznikne', () => {
    // trasa jde ≈ 4 m vedle upravené cesty (po ní), za jejím koncem vznikne nová cesta – začíná
    // v konci staré (Vlkov 766 – cesta ke hřbitovu)
    const roads = emptyRoads(DAY);
    roads.nextId = 10;
    roads.roads.push({
      ...road(1, [
        { x: 7.75, z: 12 },
        { x: 7.75, z: 40 },
      ]),
      grade: 'improved',
    });
    const line: RoadPoint[] = [
      { x: 3.75, z: 0 },
      { x: 3.75, z: 70 },
    ];
    const wear = new Map<number, number>();
    heat(wear, line, HOT);
    const anchors = anchorsAt([
      [line[0]!, 'entrance'],
      [line[1]!, 'goal'],
    ]);
    const formed = formRoadsFromWear(roads, [line], wear, anchors, DAY, context());
    const north = formed.find((r) => r.points.some((p) => p.z > 60));
    expect(north).toBeDefined();
    const south =
      north!.points[0]!.z < north!.points.at(-1)!.z ? north!.points[0]! : north!.points.at(-1)!;
    expect(south).toEqual({ x: 7.75, z: 40 });
  });
});

// mřížka tras jako u vsi (buňka světa = index okna + origin / cellM)
const CELL = 3.75;
const WINDOW: GridWindow = { width: 200, height: 200, originX: -375, originZ: -375, cellM: CELL };

/** Trasa pro vodu od brány (x = 1 buňka, z = 1) na sever k potoku (z ∈ (75, 90)). */
function waterRoute(trips: number): StoredRoute {
  const cells: number[] = [];
  for (let z = 1; z <= 19; z++) cells.push((z + 100) * WINDOW.width + (1 + 100));
  return { from: 'd:1', to: 'water', purpose: 'water', trips, ...encodeRoute(cells, WINDOW) };
}

describe('roadsMonth – měsíční vznik cest z vyšlapanosti', () => {
  it('ves s vodou 10 cest denně: cesta k břehu za ≈ 4 měsíce, od brány na břeh', () => {
    const start = dayIndexOf({ year: 601, month: 4, day: 1 });
    const s = village(start - 1);
    s.roads = emptyRoads(start);
    s.roads.wear = { day: start, cells: '', labor: [] };
    const route = waterRoute(1000);
    s.routes = { day: start, key: 'test-water-10', list: [route] };
    let formedIn = 0;
    for (let m = 1; m <= 7 && formedIn === 0; m++) {
      const day = dayIndexOf({ year: 601, month: 4 + m, day: 1 });
      const chronicle = s.chronicle.length;
      roadsMonth(s, day, LANDSCAPE, null);
      if (s.roads.roads.length > 0) {
        formedIn = m;
        expect(s.chronicle.slice(chronicle).map((e) => e.kind)).toContain('road-formed');
      }
      // jiné dny než 1. v měsíci nic
      roadsMonth(s, day + 1, LANDSCAPE, null);
    }
    expect(formedIn).toBeGreaterThanOrEqual(3);
    expect(formedIn).toBeLessThanOrEqual(5);
    expect(s.roads.roads).toHaveLength(1);
    const r = s.roads.roads[0]!;
    const zs = [r.points[0]!.z, r.points.at(-1)!.z].sort((a, b) => a - b);
    // od brány (z 3,75) na břeh (konec trasy z 71,25, cíl do 7,5 m)
    expect(zs[0]!).toBeLessThanOrEqual(3.75 + 3);
    expect(zs[1]!).toBeGreaterThanOrEqual(71.25 - 7.5);
  });

  it('pod prahem (pod 1 cestou denně) nevznikne nic ani za rok', () => {
    const start = dayIndexOf({ year: 601, month: 1, day: 1 });
    const s = village(start - 1);
    s.roads = emptyRoads(start);
    s.roads.wear = { day: start, cells: '', labor: [] };
    s.routes = { day: start, key: 'test-water-09', list: [waterRoute(90)] };
    for (let m = 2; m <= 12; m++)
      roadsMonth(s, dayIndexOf({ year: 601, month: m, day: 1 }), LANDSCAPE, null);
    expect(s.roads.roads).toEqual([]);
  });

  it('vyšlapaná trasa 8 m vedle upravené cesty: souběžný kus úklid sloučí se silnější', () => {
    const start = dayIndexOf({ year: 601, month: 4, day: 1 });
    const s = village(start - 1);
    s.roads = emptyRoads(start);
    s.roads.nextId = 10;
    s.roads.roads.push({
      ...road(1, [
        { x: 11.75, z: 12 },
        { x: 11.75, z: 64 },
      ]),
      grade: 'improved',
    });
    const route = waterRoute(1000);
    const hot = new Map<number, number>();
    heat(
      hot,
      [
        { x: 3.75, z: 3.75 },
        { x: 3.75, z: 71.25 },
      ],
      HOT,
    );
    s.roads.wear = { day: start, cells: encodeWear(hot), labor: [] };
    s.routes = { day: start, key: 'test-water-beside', list: [route] };
    roadsMonth(s, dayIndexOf({ year: 601, month: 5, day: 1 }), LANDSCAPE, null);
    expect(s.roads.roads.some((r) => r.id === 1 && r.grade === 'improved')).toBe(true);
    // trasa mimo cestu (uměle – síť by ji na cestu stáhla): souběžný kus úklid vyřízne
    const trodden = s.roads.roads.filter((r) => r.grade === 'trodden');
    for (const r of trodden) {
      const beside = dense(r.points).filter(
        (p) => p.z > 24 && p.z < 52 && Math.abs(p.x - 3.75) < 2,
      );
      expect(beside, `cesta ${r.id}`).toEqual([]);
    }
    // do kroniky jen cesty, které po úklidu zůstaly
    const kept = new Set(s.roads.roads.map((r) => r.id));
    for (const e of s.chronicle.filter((e) => e.kind === 'road-formed')) {
      expect(kept.has((e as { roadId: number }).roadId)).toBe(true);
    }
  });

  it('objížďka, kterou úklid smaže, nemění sousední cestu ani nextId (12 měsíců)', () => {
    // stará cesta k vodě po x 3,75; trasa ji kus obchází 7,5 m vedle (pozemek přes cestu) –
    // objížďka souběžná se starší cestou zmizí úklidem, takže se nesmí ani založit (rozdělení
    // staré cesty, nová id, místa na stromy)
    const start = dayIndexOf({ year: 601, month: 4, day: 1 });
    const s = village(start - 1);
    s.roads = emptyRoads(start);
    s.roads.nextId = 50;
    const spots = [24, 27, 30, 45, 48, 51].map((z, k) => ({ id: 40 + k, x: 7.25, z }));
    s.roads.roads.push({
      ...road(1, [
        { x: 3.75, z: 3.75 },
        { x: 3.75, z: 71.25 },
      ]),
      spots,
    });
    const cells: [number, number][] = [
      ...[1, 2, 3, 4, 5, 6].map((z): [number, number] => [1, z]),
      [2, 7],
      [3, 8],
      ...[9, 10, 11, 12, 13, 14, 15].map((z): [number, number] => [3, z]),
      [2, 16],
      [1, 17],
      [1, 18],
      [1, 19],
    ];
    const route: StoredRoute = {
      from: 'd:1',
      to: 'water',
      purpose: 'water',
      trips: 1000,
      ...encodeRoute(
        cells.map(([x, z]) => (z + 100) * WINDOW.width + (x + 100)),
        WINDOW,
      ),
    };
    const hot = new Map<number, number>();
    heat(
      hot,
      cells.map(([x, z]) => ({ x: x * CELL, z: z * CELL })),
      HOT,
    );
    s.roads.wear = { day: start, cells: encodeWear(hot), labor: [] };
    s.routes = { day: start, key: 'test-water-detour', list: [route] };
    const before = structuredClone(s.roads.roads);
    for (let m = 5; m <= 16; m++) {
      roadsMonth(
        s,
        dayIndexOf({ year: 601 + Math.floor((m - 1) / 12), month: ((m - 1) % 12) + 1, day: 1 }),
        LANDSCAPE,
        null,
      );
      expect(s.roads.nextId, `měsíc ${m}`).toBe(50);
    }
    expect(s.roads.roads).toEqual(before);
    expect(s.chronicle.some((e) => e.kind === 'road-formed')).toBe(false);
  });

  it('kotvy z tras: brána domu je vchod, voda cíl', () => {
    const anchors = roadAnchors([waterRoute(1000)], LANDSCAPE);
    expect(anchors.points.map((a) => a.kind).sort()).toEqual(['entrance', 'goal']);
    const gate = anchors.points.find((a) => a.kind === 'entrance')!;
    expect(gate).toMatchObject({ x: 3.75, z: 3.75, reachM: 3 });
    expect(anchors.points.find((a) => a.kind === 'goal')!.reachM).toBe(7.5);
    expect(WEAR.extendFrom).toBeLessThan(WEAR.roadAt);
  });
});
