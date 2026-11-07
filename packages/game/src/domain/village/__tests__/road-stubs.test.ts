import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { type GridWindow } from '../paths/network-grid';
import { nearAnchor, roadAnchors } from '../paths/road-anchors';
import { roadPieces } from '../paths/road-condition';
import { roadChainEnds, roadEndsNetwork } from '../paths/road-ends';
import { TIDY_RUNS, roadsMonth } from '../paths/roads';
import { accessDue } from '../paths/roads-access';
import { emptyRoads, endKey, mergeRoadChains } from '../paths/roads-form';
import { nearestOnRoads, roadLengthM } from '../paths/roads-geometry';
import { splitLoops, trimStubs } from '../paths/roads-stubs';
import { mergeParallelRoads, removeBraids } from '../paths/roads-tidy';
import { type SpotContext } from '../paths/roads-trees';
import { encodeRoute } from '../paths/routes';
import { EDGE_MARGIN_M, pathCellM, trailTerrain } from '../paths/terrain';
import { ROAD_STUB } from '../rules';
import type { Road, RoadGrade, RoadPoint, StoredRoute, VillageRoads, VillageState } from '../types';
import { village } from './abandonment-fixtures';
import { LANDSCAPE } from './paths-fixtures';
import vlkov from './vlkov-roads.json';

// Úklid sítě – pahýly, okruhy a cesty k vchodům (paths.md – Síť – kotvy, pahýly a úklid; Vchody;
// Martin, #6: „Pahýly bez cíle nevznikají …“, „ke každé stavbě, kam se chodí, vede cesta až k jejímu
// vchodu, i když se tam chodí málo, třeba k hřbitovu jen na pohřby.“).

const CELL = 3.75;
const WINDOW: GridWindow = { width: 200, height: 200, originX: -375, originZ: -375, cellM: CELL };
const START = dayIndexOf({ year: 601, month: 4, day: 1 });
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function road(id: number, points: [number, number][], grade: RoadGrade = 'trodden'): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: START - 1000 + id,
    grade,
    traffic: [3],
    spots: [],
    ground: { wet: [], fords: [] },
  };
}

function roadsOf(list: Road[]): VillageRoads {
  return { ...emptyRoads(START), nextId: 100, roads: list };
}

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

/** Kotva do 3 m od některého bodu. */
const anchorsAt =
  (points: readonly [number, number][]) =>
  (p: RoadPoint): boolean =>
    points.some(([x, z]) => Math.hypot(p.x - x, p.z - z) <= 3);

/** Volné konce živých úseků mimo kotvu a mimo jinou cestu. */
function looseEnds(
  roads: readonly Road[],
  isAnchor: (p: RoadPoint) => boolean,
  only: (r: Road) => boolean = () => true,
): RoadPoint[] {
  const living = roads.filter((r) => !r.abandoned);
  const count = new Map<string, number>();
  for (const r of living) {
    for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
      count.set(endKey(p), (count.get(endKey(p)) ?? 0) + 1);
    }
  }
  return living.filter(only).flatMap((r) =>
    [r.points[0]!, r.points[r.points.length - 1]!].filter((p) => {
      if (count.get(endKey(p)) !== 1 || isAnchor(p)) return false;
      const hit = nearestOnRoads(
        living.filter((o) => o !== r),
        p.x,
        p.z,
      );
      return !hit || hit.distance > 4;
    }),
  );
}

describe('pahýly a okruhy', () => {
  it('pahýl 10 m u uzlu zmizí a dvě zbylé cesty se spojí', () => {
    const roads = roadsOf([
      road(1, [
        [0, 0],
        [100, 0],
      ]),
      road(2, [
        [100, 0],
        [200, 0],
      ]),
      road(3, [
        [100, 0],
        [100, 10],
      ]),
    ]);
    const isAnchor = anchorsAt([
      [0, 0],
      [200, 0],
    ]);
    expect(trimStubs(roads, [], { isAnchor, lines: [] })).toBe(true);
    mergeRoadChains(roads, []);
    expect(roads.roads.map((r) => r.id)).toEqual([1]);
    expect(roadLengthM(roads.roads[0]!)).toBeCloseTo(200, 5);
    expect(looseEnds(roads.roads, isAnchor)).toEqual([]);
    expect(roads.nextId).toBe(100);
  });

  it('vyšlapaný pahýl 50 m bez kotvy zmizí, upravený zůstane (zarůstá pomaleji)', () => {
    const list = (grade: RoadGrade): Road[] => [
      road(1, [
        [0, 0],
        [100, 0],
      ]),
      road(2, [
        [100, 0],
        [200, 0],
      ]),
      road(
        3,
        [
          [100, 0],
          [100, 50],
        ],
        grade,
      ),
    ];
    // trasa jde po pahýlu jen do z = 30 a pak odbočí k poli; konec pahýlu není kotva
    const line = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 30 },
      { x: 140, z: 30 },
    ];
    const isAnchor = anchorsAt([
      [0, 0],
      [200, 0],
      [140, 30],
    ]);
    const trodden = roadsOf(list('trodden'));
    expect(trimStubs(trodden, [], { isAnchor, lines: [line] })).toBe(true);
    expect(trodden.roads.some((r) => r.id === 3)).toBe(false);
    // druhý průchod nic nemění
    const before = json(trodden);
    expect(trimStubs(trodden, [], { isAnchor, lines: [line] })).toBe(false);
    expect(trodden).toEqual(before);
    const improved = roadsOf(list('improved'));
    expect(trimStubs(improved, [], { isAnchor, lines: [line] })).toBe(false);
    expect(improved.roads.some((r) => r.id === 3)).toBe(true);
  });

  it('zbytek upravené a vozové cesty pod 30 m bez kotvy zmizí, delší zůstane (Vlkov – 25 m)', () => {
    const net = (grade: RoadGrade, length: number): VillageRoads =>
      roadsOf([
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(2, [
          [100, 0],
          [200, 0],
        ]),
        road(
          3,
          [
            [100, 0],
            [100, length],
          ],
          grade,
        ),
      ]);
    const isAnchor = anchorsAt([
      [0, 0],
      [200, 0],
    ]);
    const stub = { isAnchor, lines: [] };
    expect(ROAD_STUB.remnantM).toBe(30);
    for (const grade of ['improved', 'wagon'] as const) {
      const short = net(grade, 25);
      expect(trimStubs(short, [], stub)).toBe(true);
      expect(short.roads.map((r) => r.id)).toEqual([1, 2]);
      // uzel u zmizelého zbytku se spojí – zbude jedna cesta od kotvy ke kotvě
      mergeRoadChains(short, []);
      expect(short.roads).toHaveLength(1);
      const long = net(grade, 35);
      expect(trimStubs(long, [], stub)).toBe(false);
      expect(long.roads.some((r) => r.id === 3)).toBe(true);
    }
  });

  describe('zbytek vozové cesty – hranice a výjimky', () => {
    const base = (length: number, endX = 100): VillageRoads =>
      roadsOf([
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(2, [
          [100, 0],
          [200, 0],
        ]),
        road(
          3,
          [
            [100, 0],
            [endX, length],
          ],
          'wagon',
        ),
      ]);
    const isAnchor = anchorsAt([
      [0, 0],
      [200, 0],
    ]);
    const stub = { isAnchor, lines: [] };

    it('hranice 30 m: 29,9 m zmizí, 30 m zůstane', () => {
      const under = base(ROAD_STUB.remnantM - 0.1);
      expect(trimStubs(under, [], stub)).toBe(true);
      expect(under.roads.some((r) => r.id === 3)).toBe(false);
      const exact = base(ROAD_STUB.remnantM);
      expect(trimStubs(exact, [], stub)).toBe(false);
      expect(exact.roads.some((r) => r.id === 3)).toBe(true);
    });

    it('konec u kotvy nebo na jiné cestě zbytek nedělá pahýlem', () => {
      const atAnchor = roadsOf([
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(
          2,
          [
            [100, 0],
            [100, 20],
          ],
          'wagon',
        ),
      ]);
      expect(
        trimStubs(atAnchor, [], {
          isAnchor: anchorsAt([
            [0, 0],
            [100, 20],
          ]),
          lines: [],
        }),
      ).toBe(false);
      // krátký zbytek, jehož volný konec leží u jiné cesty (díra, kterou zacelí joinRoadGaps)
      const onRoad = base(0);
      onRoad.roads[2]!.points = [
        { x: 100, z: 0 },
        { x: 110, z: 1 },
      ];
      expect(trimStubs(onRoad, [], stub)).toBe(false);
    });

    it('hranice END_SNAP_M (4 m): konec do 3,9 m od jiné cesty zbytek nechá, od 4,1 m ho uklidí', () => {
      const near = base(3.9);
      expect(trimStubs(near, [], stub)).toBe(false);
      expect(near.roads.some((r) => r.id === 3)).toBe(true);
      const far = base(4.1);
      expect(trimStubs(far, [], stub)).toBe(true);
      expect(far.roads.some((r) => r.id === 3)).toBe(false);
    });

    it('hotový úsek rozestavěné vozové cesty (stavba bez roadIds) úklid nesmaže', () => {
      const net = base(25);
      net.earthworks = [
        {
          id: 1,
          profile: [
            { x: 100, z: 0, y: 0 },
            { x: 100, z: 25, y: 0 },
            { x: 100, z: 120, y: 0 },
          ],
          pieces: [
            { toM: 25, manDays: 1, builtDay: START },
            { toM: 120, manDays: 4, builtDay: null },
          ],
          startedDay: START,
          constructionId: 9,
        },
      ];
      expect(trimStubs(net, [], stub)).toBe(false);
      expect(net.roads.some((r) => r.id === 3)).toBe(true);
      // dostavěná (bez constructionId) už je jen zbytek kratší než mez
      delete net.earthworks[0]!.constructionId;
      expect(trimStubs(net, [], stub)).toBe(true);
    });

    it('úsek ve stavbě upravené cesty (roadIds) úklid nesmaže', () => {
      const net = base(25);
      const work = [
        { id: 9, kind: 'road', roadIds: [3] } as unknown as Parameters<typeof trimStubs>[1][number],
      ];
      expect(trimStubs(net, work, stub)).toBe(false);
      expect(trimStubs(net, [], stub)).toBe(true);
    });
  });

  it('malý okruh přes jeden uzel se rozdělí a zmizí jako copánek a pahýl', () => {
    const roads = roadsOf([
      road(1, [
        [0, 0],
        [100, 0],
      ]),
      road(2, [
        [100, 0],
        [200, 0],
      ]),
      road(3, [
        [100, 0],
        [106, 8],
        [100, 14],
        [94, 8],
        [100, 0],
      ]),
    ]);
    const isAnchor = anchorsAt([
      [0, 0],
      [200, 0],
    ]);
    expect(splitLoops(roads, [], context())).toBe(true);
    removeBraids(roads, []);
    trimStubs(roads, [], { isAnchor, lines: [] });
    mergeRoadChains(roads, []);
    expect(roads.roads.map((r) => r.id)).toEqual([1]);
    expect(looseEnds(roads.roads, isAnchor)).toEqual([]);
  });

  it('souběžná vyšlapaná vedle vozové zmizí (vozová silnější)', () => {
    const roads = roadsOf([
      road(
        1,
        [
          [0, 0],
          [200, 0],
        ],
        'wagon',
      ),
      road(2, [
        [0, 5],
        [200, 5],
      ]),
    ]);
    roads.roads[1]!.bornDay = START - 5000;
    mergeParallelRoads(roads, []);
    expect(roads.roads.map((r) => r.id)).toEqual([1]);
  });

  it('Vlkov (fixtura): krátké pahýly zmizí, vyšlapaná cesta po úklidu končí jen u kotvy', () => {
    const roads = roadsOf(
      vlkov.roads.map((r): Road => ({
        id: r.id,
        points: r.points.map(([x, z]) => ({ x: x!, z: z! })),
        bornDay: r.bornDay,
        grade: r.grade as RoadGrade,
        traffic: r.traffic,
        spots: r.spots.map(([id, x, z]) => ({ id: id!, x: x!, z: z! })),
        ground: { wet: r.ground.wet as [number, number][], fords: r.ground.fords },
      })),
    );
    mergeRoadChains(roads, []);
    // kotvy: volné konce úseků aspoň 30 m (vchody, cíle) – krátké volné konce jsou pahýly
    const long = roads.roads.filter((r) => roadLengthM(r) >= 30);
    const free = looseEnds(long, () => false).map((p): [number, number] => [p.x, p.z]);
    const isAnchor = anchorsAt(free);
    const stubs = roads.roads.filter((r) => roadLengthM(r) < 30 && looseEnds([r], isAnchor).length);
    expect(stubs.length).toBeGreaterThan(0);
    trimStubs(roads, [], { isAnchor, lines: [] });
    mergeRoadChains(roads, []);
    // vyšlapané cesty končí jen u kotev; upravené (postavil je hráč) zůstanou a zarůstají
    expect(looseEnds(roads.roads, isAnchor, (r) => r.grade === 'trodden')).toEqual([]);
    expect(
      roads.roads.filter((r) => r.grade !== 'trodden').every((r) => roadLengthM(r) >= 15),
    ).toBe(true);
    // kotvené konce zůstaly – úklid nesmazal skutečné cesty
    for (const [x, z] of free) {
      expect(
        roads.roads.some((r) =>
          [r.points[0]!, r.points[r.points.length - 1]!].some(
            (p) => Math.hypot(p.x - x, p.z - z) < 0.01,
          ),
        ),
      ).toBe(true);
    }
    expect(roads.nextId).toBe(100);
  });
});

/** Trasa z buněk okna (x, z v buňkách). */
function route(
  from: string,
  to: string,
  purpose: StoredRoute['purpose'],
  cells: [number, number][],
): StoredRoute {
  return {
    from,
    to,
    purpose,
    trips: 1000,
    ...(purpose === 'visit' ? { visit: to } : {}),
    ...encodeRoute(
      cells.map(([x, z]) => (z + 100) * WINDOW.width + (x + 100)),
      WINDOW,
    ),
  };
}

const span = (a: number, b: number): number[] =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => (a <= b ? a + k : a - k));

/**
 * Ves se starou cestou od brány domu (0, 7,5) k vodě (60, 71,25) a hřbitovem, jehož branka
 * (90, 37,5) leží 30 m od ní – trasa návštěv jde po cestě a pak k brance.
 */
function cemeteryVillage(): VillageState {
  const s = village(START - 1);
  s.roads = emptyRoads(START);
  s.roads.nextId = 10;
  s.roads.roads.push(
    road(1, [
      [0, 7.5],
      [0, 11.25],
      [60, 11.25],
      [60, 71.25],
    ]),
  );
  const toWater: [number, number][] = [
    [0, 2],
    ...span(0, 15).map((x): [number, number] => [x, 3]),
    ...span(3, 19).map((z): [number, number] => [16, z]),
  ];
  const toCemetery: [number, number][] = [
    [0, 2],
    ...span(0, 15).map((x): [number, number] => [x, 3]),
    ...span(3, 10).map((z): [number, number] => [16, z]),
    ...span(17, 24).map((x): [number, number] => [x, 10]),
  ];
  s.routes = {
    day: START,
    key: 'test-cemetery',
    list: [
      route('d:1', 'water', 'water', toWater),
      route('d:1', 'cemetery:1', 'visit', toCemetery),
    ],
  };
  return s;
}

const monthDay = (m: number): number =>
  dayIndexOf({ year: 601 + Math.floor((3 + m) / 12), month: 1 + ((3 + m) % 12), day: 1 });

describe('cesty k vchodům', () => {
  it('hřbitov s návštěvami dostane cestu do branky; bez změny tras úklid nic nedělá a nextId neroste', () => {
    const s = cemeteryVillage();
    const runs = TIDY_RUNS.count;
    roadsMonth(s, monthDay(1), LANDSCAPE, null);
    expect(TIDY_RUNS.count).toBe(runs + 1);
    const living = s.roads!.roads.filter((r) => !r.abandoned);
    const gate = { x: 90, z: 37.5 };
    const access = living.find((r) =>
      [r.points[0]!, r.points[r.points.length - 1]!].some(
        (p) => Math.hypot(p.x - gate.x, p.z - gate.z) <= 3,
      ),
    );
    expect(access).toBeDefined();
    // cesta k brance se napojí na starou cestu rozcestím (stará se rozdělí) – křižovatka Y
    expect(living.length).toBe(3);
    expect(s.roads!.junctions?.map((j) => [j.shape, j.arms.length])).toEqual([['y', 3]]);
    expect(s.chronicle.some((e) => e.kind === 'road-formed' && e.roadId === access!.id)).toBe(true);
    const isAnchor = anchorsAt([
      [0, 7.5],
      [60, 71.25],
      [90, 37.5],
    ]);
    expect(looseEnds(s.roads!.roads, isAnchor)).toEqual([]);
    // vchod má cestu: `accessDue` není trvale pravdivé (jinak by úklid běžel každý měsíc)
    expect(accessDue(s.roads!, s.routes!.list, pathCellM(LANDSCAPE))).toBe(false);
    // 12 měsíců bez změny tras: úklid neběží, id, osy a místa na stromy beze změny
    const snapshot = json(
      s.roads!.roads.map((r) => ({ id: r.id, spots: r.spots, points: r.points })),
    );
    const nextId = s.roads!.nextId;
    const junctions = json(s.roads!.junctions);
    for (let m = 2; m <= 13; m++) roadsMonth(s, monthDay(m), LANDSCAPE, null);
    expect(TIDY_RUNS.count).toBe(runs + 1);
    expect(s.roads!.junctions).toEqual(junctions);
    expect(s.roads!.nextId).toBe(nextId);
    expect(
      json(s.roads!.roads.map((r) => ({ id: r.id, spots: r.spots, points: r.points }))),
    ).toEqual(snapshot);
  }, 60_000);
});

describe('křižovatka se zarůstající cestou (Vlkov, Martin 1. 11. 2026)', () => {
  // Vlkov: tři vozové cesty končily v jednom bodě bez křižovatky – po jedné už nikdo nejezdil
  // (provoz pod udržovacím prahem), ramenem nebyla, ale zarůstala roky; cesty se ani nespojily.
  // Pravidlo 11: „Žádná cesta nemůže existovat jen tak sama v prostoru, vždycky musí spojovat dvě
  // místa – kombinaci budov a křižovatek.“
  it('rameno bez provozu drží křižovatku, dokud cesta nezaroste; pak se zbylé cesty spojí', () => {
    const s = cemeteryVillage();
    roadsMonth(s, monthDay(1), LANDSCAPE, null);
    expect(s.roads!.junctions?.map((j) => [j.shape, j.arms.length])).toEqual([['y', 3]]);
    const water = { x: 60, z: 71.25 };
    const toWater = s.roads!.roads.find((r) =>
      [r.points[0]!, r.points[r.points.length - 1]!].some(
        (p) => Math.hypot(p.x - water.x, p.z - water.z) <= 3,
      ),
    )!;
    expect(s.roads!.junctions![0]!.arms).toContain(toWater.id);
    // k vodě se skoro nechodí (0,1 cesty za den – pod udržovacím prahem vyšlapané cesty)
    s.routes = {
      ...s.routes!,
      key: 'test-cemetery-quiet',
      list: s.routes!.list.map((r) => (r.purpose === 'water' ? { ...r, trips: 10 } : r)),
    };
    roadsMonth(s, monthDay(2), LANDSCAPE, null);
    expect(s.roads!.roads.some((r) => r.id === toWater.id)).toBe(true);
    expect(s.roads!.junctions?.map((j) => [j.shape, j.arms.length])).toEqual([['y', 3]]);
    expect(s.roads!.junctions![0]!.arms).toContain(toWater.id);
    // žádná cesta nekončí na jiné cestě bez křižovatky (road-ends.ts, kind 'road')
    const net = roadEndsNetwork(s, LANDSCAPE);
    for (const r of s.roads!.roads.filter((x) => !x.abandoned)) {
      expect(roadChainEnds(net, r.id)!.map((e) => e.kind)).not.toContain('road');
    }
    // cesta k vodě zarostla (kusy na nule) – zmizí, křižovatka zanikne a zbylé dvě se spojí
    const dying = s.roads!.roads.find((r) => r.id === toWater.id)!;
    dying.condition = roadPieces(dying.points).map((p) => ({ x: p.x, z: p.z, c: 0 }));
    roadsMonth(s, monthDay(3), LANDSCAPE, null);
    expect(s.roads!.roads.some((r) => r.id === toWater.id)).toBe(false);
    expect(s.roads!.junctions).toBeUndefined();
    expect(s.roads!.roads.filter((r) => !r.abandoned)).toHaveLength(1);
  }, 60_000);
});

describe('kraj mapy jako kotva', () => {
  it('cesta k okraji terénu pěšin (EDGE_MARGIN_M) končí u kotvy, uprostřed mapy ne', () => {
    const anchors = roadAnchors([], LANDSCAPE);
    const edge = anchors.halfM - EDGE_MARGIN_M;
    expect(nearAnchor(anchors, edge, 0)).toBe(true);
    expect(nearAnchor(anchors, 0, -(edge - 5))).toBe(true);
    expect(nearAnchor(anchors, edge - 40, 0)).toBe(false);
  });
});
