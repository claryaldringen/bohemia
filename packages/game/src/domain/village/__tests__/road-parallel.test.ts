import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundVillage } from '../actions';
import { removeBraids } from '../paths/roads-tidy';
import { joinedRoadsOf, updateRoads, withJoinedRoads } from '../paths/roads';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, Road, RoadGrade, VillageState } from '../types';
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
      candidates: [],
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
    const migrated = withJoinedRoads(s, LANDSCAPE, LAYER);
    const ids = migrated.roads!.roads.map((r) => r.id).sort();
    expect(ids).not.toContain(2);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(migrated.roads!.trees.map((t) => t.id)).toEqual([ROAD_TREE_ID_BASE + 30]);
    expect(migrated.roads!.apples![0]!.roadId).toBe(1);
    expect(migrated.roads!.parallelsChecked).toBe(true);
    expect(withJoinedRoads(migrated, LANDSCAPE, LAYER)).toBe(migrated);
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
      candidates: [],
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
      candidates: [],
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
