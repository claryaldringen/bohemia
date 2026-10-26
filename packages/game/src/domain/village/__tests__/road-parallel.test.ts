import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundVillage } from '../actions';
import { axisDistance } from '../paths/roads-geometry';
import * as roadsTidy from '../paths/roads-tidy';
import { removeBraids, tidyRoads } from '../paths/roads-tidy';
import { joinedRoadsOf, updateRoads } from '../paths/roads';
import { withRoadsV2 } from '../paths/roads-v2';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, Road, RoadGrade, VillageRoads, VillageState } from '../types';
import { LANDSCAPE, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Souběžné pevné cesty (roads.md – Úseky a rozcestí; Martin: „Takovéto cesty by vůbec neměly
// existovat. Pokud už cesta vede tím směrem, lidé by měli použít tu, ne si prošlapat vlastní
// souběžnou.“). Krajina testu: louka 300 × 300 m, potok z ∈ (75, 90), les x < −90.

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y1 = NOV1(600);
const LAYER = obstaclesOf(LANDSCAPE);
const TERRAIN = pathTestTerrain();
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function road(
  id: number,
  points: [number, number][],
  bornDay = Y1 - 10 * 365,
  grade: RoadGrade = 'trodden',
): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay,
    grade,
    traffic: [4, 4],
    spots: [],
    ground: { wet: [], fords: [] },
  };
}

type P = { x: number; z: number };

/** Délka (m), po kterou úsek `a` vede do 12 m od `b` souběžně (po 2 m). */
function alongside(a: readonly P[], b: readonly P[]): number {
  let run = 0;
  let best = 0;
  for (let k = 1; k < a.length; k++) {
    const p = a[k - 1]!;
    const q = a[k]!;
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const n = Math.max(1, Math.ceil(len / 2));
    for (let i = 0; i < n; i++) {
      const x = p.x + ((q.x - p.x) * i) / n;
      const z = p.z + ((q.z - p.z) * i) / n;
      let close = false;
      for (let j = 1; j < b.length; j++) {
        const u = b[j - 1]!;
        const v = b[j]!;
        const dx = v.x - u.x;
        const dz = v.z - u.z;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - u.x) * dx + (z - u.z) * dz) / l2)) : 0;
        const d = Math.hypot(x - (u.x + dx * t), z - (u.z + dz * t));
        const cos = Math.abs((q.x - p.x) * dx + (q.z - p.z) * dz) / (len * Math.sqrt(l2) || 1);
        if (d <= 12 && cos >= 0.8) close = true;
      }
      run = close ? run + len / n : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}

describe('souběžné pevné cesty se sloučí', () => {
  it('souběžný kus mladší cesty zmizí, její konce se napojí ke starší', () => {
    const older = road(1, [
      [0, 0],
      [100, 0],
    ]);
    // mladší cesta odbočí, 100 m vede 8 m vedle starší a zase odbočí
    const younger = road(
      2,
      [
        [-20, 30],
        [0, 8],
        [100, 8],
        [120, 30],
      ],
      Y1 - 365,
    );
    const roads = joinedRoadsOf([older, younger], [], TERRAIN);
    for (const a of roads) {
      for (const b of roads) {
        if (a !== b) expect(alongside(a.points, b.points), `${a.id}×${b.id}`).toBeLessThan(25);
      }
    }
    // starší cesta zůstala celá (rozdělená v napojeních), zbytky mladší končí na ní
    const ends = roads.flatMap((r) => [r.points[0]!, r.points.at(-1)!]);
    expect(ends).toContainEqual({ x: -20, z: 30 });
    expect(ends).toContainEqual({ x: 120, z: 30 });
    const total = roads.reduce(
      (sum, r) =>
        sum +
        r.points
          .slice(1)
          .reduce((s, b, k) => s + Math.hypot(b.x - r.points[k]!.x, b.z - r.points[k]!.z), 0),
      0,
    );
    // 100 m starší + dva zbytky mladší (≈ 30 m) + spojky (≈ 8 m) – ne 100 m souběžně navíc
    expect(total).toBeLessThan(180);
  });

  it('copánek mezi stejnými uzly: slabší úsek zmizí, stromy u něj stojí dál, jabloně přejdou', () => {
    const s = foundVillage({
      seed: 5,
      day: Y1 - 400,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    s.lastDay = Y1;
    s.roads = {
      nextId: 50,
      roads: [
        road(1, [
          [0, -120],
          [100, -120],
        ]),
        {
          ...road(
            2,
            [
              [0, -120],
              [50, -102],
              [100, -120],
            ],
            Y1 - 365,
          ),
          spots: [{ id: 30, x: 50, z: -99 }],
        },
        // copánek daleko od sebe (40 m) – to už jsou dvě cesty
        road(
          3,
          [
            [0, -120],
            [50, -160],
            [100, -120],
          ],
          Y1 - 300,
        ),
      ],
      trees: [
        {
          id: ROAD_TREE_ID_BASE + 30,
          spot: 30,
          x: 50,
          z: -99,
          species: 'oak',
          rootedDay: Y1 - 3000,
          diesDay: Y1 + 30000,
        },
      ],
      labor: { from: Y1 - 30, days: 30, shares: [] },
      apples: [
        {
          id: ROAD_TREE_ID_BASE + 31,
          roadId: 2,
          x: 30,
          z: -106,
          distanceM: 120,
          plantedDay: Y1 - 900,
        },
      ],
    };
    const migrated = withRoadsV2(s, LANDSCAPE, LAYER);
    const ids = migrated.roads!.roads.map((r) => r.id).sort();
    expect(ids).not.toContain(2);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(migrated.roads!.trees.map((t) => t.id)).toEqual([ROAD_TREE_ID_BASE + 30]);
    expect(migrated.roads!.apples![0]!.roadId).toBe(1);
    expect(migrated.roads!.v2).toBe(true);
    expect(withRoadsV2(migrated, LANDSCAPE, LAYER)).toBe(migrated);
  }, 60_000);

  it('copánek s krátkým vzdáleným kusem (Vlkov): slabší zmizí, jabloně přejdou', () => {
    const roads = {
      nextId: 50,
      roads: [
        road(
          1,
          [
            [0, 0],
            [100, 0],
          ],
          Y1 - 365,
          'improved',
        ),
        road(2, [
          [0, 0],
          [40, 10],
          [45, 30],
          [55, 30],
          [60, 10],
          [100, 0],
        ]),
      ],
      trees: [],
      apples: [
        { id: ROAD_TREE_ID_BASE + 1, roadId: 2, x: 50, z: 34, distanceM: 50, plantedDay: Y1 - 900 },
      ],
    } as unknown as NonNullable<VillageState['roads']>;
    expect(removeBraids(roads, [])).toBe(true);
    expect(roads.roads.map((r) => r.id)).toEqual([1]);
    expect(roads.apples![0]!.roadId).toBe(1);
  });

  it('copánek s dlouhým vzdáleným kusem: zůstanou obě cesty', () => {
    const roads = {
      nextId: 50,
      roads: [
        road(
          1,
          [
            [0, 0],
            [100, 0],
          ],
          Y1 - 365,
          'improved',
        ),
        road(2, [
          [0, 0],
          [25, 30],
          [75, 30],
          [100, 0],
        ]),
      ],
      trees: [],
    } as unknown as NonNullable<VillageState['roads']>;
    expect(removeBraids(roads, [])).toBe(false);
    expect(roads.roads.map((r) => r.id)).toEqual([1, 2]);
  });

  it('upravená cesta je silnější než starší vyšlapaná – zůstane ona', () => {
    const roads = joinedRoadsOf(
      [
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(
          2,
          [
            [0, 6],
            [100, 6],
          ],
          Y1 - 365,
          'improved',
        ),
      ],
      [],
      TERRAIN,
    );
    expect(roads.map((r) => [r.id, r.grade])).toEqual([[2, 'improved']]);
  });
});

/** Ves čtyř obydlí kolem počátku – každá domácnost se čtyřmi dospělými (jako roads.test.ts). */
function village(day: number): VillageState {
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
  s.people = [1, 2, 3, 4].flatMap((d) =>
    [30, 28, 22, 20].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: day - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = day;
  return s;
}

describe('souběžné pevné cesty v roční kontrole', () => {
  it('výsledek nezávisí na kouscích dopočtu (i s JSON mezi kousky) přes 1. 11.', () => {
    const start = village(NOV1(601) - 12);
    updateRoads(start, Y1, LANDSCAPE, null);
    start.roads!.roads.push(
      road(500, [
        [-60, -120],
        [130, -120],
      ]),
      road(
        501,
        [
          [-40, -150],
          [-20, -128],
          [110, -128],
          [130, -150],
        ],
        Y1 - 365,
      ),
    );
    start.roads!.labor = { from: Y1, days: 365, shares: [] };
    const end = NOV1(601) + 9;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    const side = whole.roads!.roads.filter((r) => r.points.every((p) => p.z <= -110));
    for (const a of side) {
      for (const b of side) if (a !== b) expect(alongside(a.points, b.points)).toBeLessThan(25);
    }
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

describe('vozová cesta se napojí (paths.md – Síť, Martin 25. 10. 2026)', () => {
  const lane = (): Road =>
    road(1, [
      [0, 0],
      [200, 0],
    ]);
  const wagon = (): Road => ({
    ...road(
      2,
      [
        [100, 6.2],
        [100, 300],
      ],
      Y1 - 365,
      'wagon',
    ),
  });

  it('volný konec hotové vozové 6,2 m od cesty se napojí do rozcestí', () => {
    const out = joinedRoadsOf([lane(), wagon()], [], TERRAIN);
    const w = out.find((r) => r.grade === 'wagon')!;
    expect(w.points[0]!.z).toBeCloseTo(0, 5);
    expect(out.filter((r) => r.grade === 'trodden')).toHaveLength(2);
  });

  it('díra přes opuštěný kus se zacelí k živé cestě za ním, ne k opuštěnému', () => {
    const left = road(1, [
      [0, 0],
      [100, 0],
    ]);
    const gone: Road = {
      ...road(3, [
        [100, 0],
        [108, 0],
      ]),
      abandoned: true,
    };
    const right = road(4, [
      [108, 0],
      [200, 0],
    ]);
    const out = joinedRoadsOf([left, gone, right], [], TERRAIN);
    const live = out.filter((r) => !r.abandoned);
    expect(live.some((r) => axisDistance([r.points])(104, 0) < 0.01)).toBe(true);
  });

  it('rozestavěná vozová cesta (konec na ose zemních prací se stavbou) se neprodlouží', () => {
    const roads: VillageRoads = {
      nextId: 10,
      roads: [lane(), wagon()],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
      earthworks: [
        {
          id: 1,
          profile: [
            { x: 100, z: 300, y: 0 },
            { x: 100, z: 0, y: 0 },
          ],
          pieces: [{ toM: 300, manDays: 10, builtDay: null }],
          startedDay: Y1,
          constructionId: 7,
        },
      ],
    };
    tidyRoads(roads, [], [], {
      terrain: TERRAIN,
      blocked: () => false,
      layer: null,
      changes: { removed: [], stumps: [], saplings: [] },
      seed: 0,
      split: () => undefined,
    });
    expect(roads.roads.find((r) => r.grade === 'wagon')!.points[0]).toEqual({ x: 100, z: 6.2 });
  });
});

describe('zdvojená vozová cesta (paths.md – Zdvojená vozová cesta, Martin 26. 10. 2026)', () => {
  const wagon = (id: number, points: [number, number][], bornDay: number): Road =>
    road(id, points, bornDay, 'wagon');
  /** Spojí síť konce `a` a `b` (úseky sdílejí konce na cm)? */
  function connected(roads: readonly Road[], a: P, b: P): boolean {
    const key = (p: P): string => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
    const edges = roads.map((r) => [key(r.points[0]!), key(r.points.at(-1)!)] as const);
    const seen = new Set([key(a)]);
    for (let grow = true; grow;) {
      grow = false;
      for (const [u, v] of edges) {
        if (seen.has(u) !== seen.has(v)) {
          seen.add(u);
          seen.add(v);
          grow = true;
        }
      }
    }
    return seen.has(key(b));
  }

  it('vlásenka po ose dvou starších vozových (Vlkov 1054) se sloučí, spojení zůstane', () => {
    const a: P = { x: 0, z: 0 };
    const c: P = { x: 40, z: 40 };
    const roads = joinedRoadsOf(
      [
        wagon(
          1,
          [
            [0, 0],
            [0, 40],
          ],
          Y1 - 2000,
        ),
        wagon(
          2,
          [
            [0, 40],
            [40, 40],
          ],
          Y1 - 2000,
        ),
        // mladší vozová z A do C po ose obou – 4 m vedle, s obratem u B
        wagon(
          3,
          [
            [0, 0],
            [4, 5],
            [4, 35],
            [6, 36],
            [35, 36],
            [40, 40],
          ],
          Y1 - 365,
        ),
      ],
      [],
      TERRAIN,
    );
    expect(roads.every((r) => r.grade === 'wagon')).toBe(true);
    for (const x of roads) {
      for (const y of roads) {
        if (x !== y) expect(alongside(x.points, y.points), `${x.id}×${y.id}`).toBeLessThan(25);
      }
    }
    expect(connected(roads, a, c)).toBe(true);
    const total = roads.reduce(
      (sum, r) =>
        sum +
        r.points
          .slice(1)
          .reduce((s, q, k) => s + Math.hypot(q.x - r.points[k]!.x, q.z - r.points[k]!.z), 0),
      0,
    );
    expect(total).toBeLessThan(90);
  });

  it('souběžný kus mladší vozové zmizí, její konce se napojí; konec daleko od starší zůstane', () => {
    const roads = joinedRoadsOf(
      [
        wagon(
          1,
          [
            [0, 0],
            [100, 0],
          ],
          Y1 - 2000,
        ),
        // mladší vozová z (-20, 30) 100 m 8 m vedle starší a zpět do (120, 30)
        wagon(
          2,
          [
            [-20, 30],
            [0, 8],
            [100, 8],
            [120, 30],
          ],
          Y1 - 365,
        ),
      ],
      [],
      TERRAIN,
    );
    for (const x of roads) {
      for (const y of roads) {
        if (x !== y) expect(alongside(x.points, y.points), `${x.id}×${y.id}`).toBeLessThan(25);
      }
    }
    const ends = roads.flatMap((r) => [r.points[0]!, r.points.at(-1)!]);
    expect(ends).toContainEqual({ x: -20, z: 30 });
    expect(ends).toContainEqual({ x: 120, z: 30 });
    expect(connected(roads, { x: -20, z: 30 }, { x: 120, z: 30 })).toBe(true);
  });

  it('vozová, jejíž konec by souběžným kusem zmizel daleko od starší, zůstane celá', () => {
    // konec (0, 8) je 8 m od starší vozové – mohl by to být vjezd do humna
    const roads = joinedRoadsOf(
      [
        wagon(
          1,
          [
            [-50, 0],
            [150, 0],
          ],
          Y1 - 2000,
        ),
        wagon(
          2,
          [
            [0, 8],
            [90, 8],
            [120, 30],
          ],
          Y1 - 365,
        ),
      ],
      [{ x: 0, z: 8 }],
      TERRAIN,
    );
    expect(roads.flatMap((r) => [r.points[0]!, r.points.at(-1)!])).toContainEqual({ x: 0, z: 8 });
  });

  it('pěší cesta souběžná s vozovou se vyřízne dál, vozová pěší nikdy', () => {
    const roads = joinedRoadsOf(
      [
        road(
          1,
          [
            [0, 0],
            [100, 0],
          ],
          Y1 - 2000,
          'improved',
        ),
        wagon(
          2,
          [
            [-20, 30],
            [0, 8],
            [100, 8],
            [120, 30],
          ],
          Y1 - 365,
        ),
      ],
      [],
      TERRAIN,
    );
    const w = roads.filter((r) => r.grade === 'wagon');
    expect(w.reduce((s, r) => s + r.points.length, 0)).toBeGreaterThanOrEqual(4);
    expect(connected(w, { x: -20, z: 30 }, { x: 120, z: 30 })).toBe(true);
  });
});

describe('copánek přes křižovatku (paths.md – Copánek přes křižovatku)', () => {
  type Pt = [number, number];
  const at = (dz: number, pts: Pt[]): Pt[] => pts.map(([x, z]) => [x, z + dz]);
  /** Silnější větev z A (0, 0) do B (60, 0) přes `via` (upravené úseky, z uzlů ramena na sever). */
  function ring(via: Pt[], dz = 0, weakGrade: RoadGrade = 'trodden'): VillageRoads {
    const nodes: Pt[] = [[0, 0], ...via, [60, 0]];
    const strong = nodes
      .slice(1)
      .map((p, k) => road(k + 1, at(dz, [nodes[k]!, p]), Y1 - 2000, 'improved'));
    const arms = via.map((p, k) =>
      road(10 + k, at(dz, [p, [p[0], p[1] + 40]]), Y1 - 2000, 'improved'),
    );
    // slabší vyšlapaný úsek z A do B jižním obloukem (až 12 m od uzlů)
    const weak = road(
      20,
      at(dz, [
        [0, 0],
        [30, -12],
        [60, 0],
      ]),
      Y1 - 1000,
      weakGrade,
    );
    return {
      nextId: 50,
      roads: [...strong, ...arms, weak],
      trees: [],
      labor: { from: Y1, days: 365, shares: [] },
    } as unknown as VillageRoads;
  }
  const ids = (roads: VillageRoads): number[] => roads.roads.map((r) => r.id).sort((a, b) => a - b);

  it('copánek přes jeden mezilehlý uzel: slabší úsek zmizí', () => {
    const roads = ring([[30, 8]]);
    expect(removeBraids(roads, [], () => [])).toBe(true);
    expect(ids(roads)).toEqual([1, 2, 10]);
    // bez staveb vsi se copánek přes křižovatku nehledá
    expect(removeBraids(ring([[30, 8]]), [])).toBe(false);
  });

  it('copánek přes dva mezilehlé uzly: slabší úsek zmizí', () => {
    const roads = ring([
      [20, 6],
      [40, 6],
    ]);
    expect(removeBraids(roads, [], () => [])).toBe(true);
    expect(ids(roads)).toEqual([1, 2, 3, 10, 11]);
  });

  it('okruh kolem stavby zůstane (Martin 26. 10. 2026), prázdný okruh zmizí', () => {
    const one = ring([[30, 8]]);
    expect(removeBraids(one, [], () => [[{ x: 30, z: -3 }]])).toBe(false);
    expect(ids(one)).toEqual([1, 2, 10, 20]);
    expect(removeBraids(ring([[30, 8]]), [], () => [[{ x: 90, z: -3 }]])).toBe(true);
  });

  it('pozemky uvnitř okruhu se počítají: okruh kolem dílu pole zůstane (návrh Clauda)', () => {
    const { ringBuildingPoints } = roadsTidy;
    const village = {
      dwellings: [{ id: 1, type: 'pit', position: { x: 30, z: 0 }, built: true }],
      // pole s dílem, jehož střed leží mimo okruh, ale roh do něj zasahuje
      fields: [{ id: 1, parts: [{ cell: { x: 0, z: 0 }, x: 30, z: -14, size: 10 }] }],
    } as unknown as Parameters<typeof ringBuildingPoints>[0];
    const buildings = ringBuildingPoints(village);
    expect(buildings).toHaveLength(2);
    expect(removeBraids(ring([[30, 8]]), [], () => buildings)).toBe(false);
    // jen díl pole (střed mimo okruh, roh uvnitř) okruh také drží
    expect(removeBraids(ring([[30, 8]]), [], () => buildings.slice(1))).toBe(false);
  });

  it('jediný přístup ke stavbě uvnitř okruhu zůstane; dva měsíční kroky = jeden', () => {
    const gate = [{ x: 30, z: -12 }];
    const sole = ring([[30, 8]]);
    expect(
      removeBraids(
        sole,
        [],
        () => [],
        () => gate,
      ),
    ).toBe(false);
    expect(ids(sole)).toEqual([1, 2, 10, 20]);
    // vchod má cestu i jinde (silnější úsek do 3 m) – slabší úsek smí zmizet
    const served = ring([[30, 8]]);
    expect(
      removeBraids(
        served,
        [],
        () => [],
        () => [{ x: 30, z: 8 }],
      ),
    ).toBe(true);
    // bez vchodu u slabého úseku: první krok ho zruší, druhý už nic nemění (žádná oscilace)
    const twice = ring([[30, 8]]);
    expect(
      removeBraids(
        twice,
        [],
        () => [],
        () => [{ x: 30, z: 40 }],
      ),
    ).toBe(true);
    const after = ids(twice);
    expect(
      removeBraids(
        twice,
        [],
        () => [],
        () => [{ x: 30, z: 40 }],
      ),
    ).toBe(false);
    expect(ids(twice)).toEqual(after);
  });

  it('okruh delší než 150 m zůstane', () => {
    const roads = ring([[30, 8]]);
    const weak = roads.roads.find((r) => r.id === 20)!;
    weak.points = [
      { x: 0, z: 0 },
      { x: 10, z: -20 },
      { x: 50, z: -20 },
      { x: 60, z: 0 },
    ];
    // slabá větev ≈ 85 m + silnější ≈ 64 m – pod mezí; s dalším kličkováním nad ni
    expect(removeBraids(json(roads), [], () => [])).toBe(true);
    weak.points.splice(2, 0, { x: 30, z: -24 }, { x: 30, z: -16 });
    expect(removeBraids(roads, [], () => [])).toBe(false);
  });

  it('výsledek nezávisí na kouscích dopočtu přes 1. 11. (roční úklid)', () => {
    const start = village(NOV1(601) - 12);
    updateRoads(start, Y1, LANDSCAPE, null);
    // vše upravené – úsek bez provozu tak do roka nezaroste, zmizí jen copánek
    const extra = ring([[30, 8]], -110, 'improved').roads.map((r) => ({ ...r, id: r.id + 600 }));
    start.roads!.roads.push(...extra);
    start.roads!.nextId = Math.max(start.roads!.nextId, 700);
    start.roads!.labor = { from: Y1, days: 365, shares: [] };
    const end = NOV1(601) + 9;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    const live = whole.roads!.roads.filter((r) => !r.abandoned).map((r) => r.id);
    expect(live).not.toContain(620);
    expect(live).toContain(610);
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
