import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundVillage } from '../actions';
import { mergeRoadChains, updateRoads, withMergedRoads } from '../paths/roads';
import { finishRoadUpgrade } from '../road-upgrades';
import { advanceVillage } from '../simulate';
import type {
  Construction,
  Dwelling,
  Person,
  Road,
  RoadGrade,
  VillageRoads,
  VillageState,
} from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';
import vlkov from './vlkov-roads.json';

// Slučování úseků pevných cest v uzlu bez odbočky (roads.md – Úseky a rozcestí; Martin: „úsek
// mezi dvěma rozcestími je v pohodě, ale ve hře jsou evidentně falešná rozcestí“).

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
const Y1 = NOV1(600);
const LAYER = obstaclesOf(LANDSCAPE);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Úsek z bodů [x, z]. */
function road(
  id: number,
  points: [number, number][],
  extra: Partial<Road> = {},
  grade: RoadGrade = 'trodden',
): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: Y1 - 10 * 365,
    grade,
    traffic: [4, 4],
    spots: [],
    ground: { wet: [], fords: [] },
    ...extra,
  };
}

function roadsOf(list: Road[], extra: Partial<VillageRoads> = {}): VillageRoads {
  return {
    nextId: 100,
    roads: list,
    trees: [],
    candidates: [],
    labor: { from: Y1, days: 0, shares: [] },
    ...extra,
  };
}

/** Konce úseků podle počtu úseků v uzlu (stupeň uzlu → počet uzlů). */
function degrees(roads: readonly Road[]): Record<number, number> {
  const count = new Map<string, number>();
  for (const r of roads) {
    for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
      const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  const out: Record<number, number> = {};
  for (const n of count.values()) out[n] = (out[n] ?? 0) + 1;
  return out;
}

describe('slučování úseků v uzlu bez odbočky', () => {
  it('dva navazující úseky různého stáří se spojí – id a den vzniku staršího', () => {
    const older = road(
      3,
      [
        [0, 0],
        [40, 0],
      ],
      { bornDay: Y1 - 20 * 365, traffic: [2, 2, 2], spots: [{ id: 50, x: 20, z: 3 }] },
    );
    const newer = road(
      9,
      [
        [40, 0],
        [40, 60],
      ],
      { bornDay: Y1 - 365, traffic: [5], spots: [{ id: 51, x: 43, z: 30 }] },
    );
    const roads = roadsOf([newer, older]);
    expect(mergeRoadChains(roads, [])).toBe(true);
    expect(roads.roads).toHaveLength(1);
    const merged = roads.roads[0]!;
    expect(merged.id).toBe(3);
    expect(merged.bornDay).toBe(Y1 - 20 * 365);
    expect(merged.points).toEqual([
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      { x: 40, z: 60 },
    ]);
    expect(merged.spots.map((s) => s.id)).toEqual([50, 51]);
    // provoz po letech od nejnovějšího, nejnovější vážený délkou (40 m a 60 m)
    expect(merged.traffic).toEqual([2, 2, 3.8]);
    // podruhé nic
    expect(mergeRoadChains(roads, [])).toBe(false);
  });

  it('obrácený úsek se natočí – mokřina a brody na ose sedí', () => {
    const a = road(
      1,
      [
        [0, 0],
        [30, 0],
      ],
      { ground: { wet: [[20, 30]], fords: [5] } },
    );
    // druhý úsek začíná na vzdáleném konci a končí v uzlu (30, 0)
    const b = road(
      2,
      [
        [80, 0],
        [30, 0],
      ],
      { ground: { wet: [[46, 50]], fords: [10] } },
    );
    const roads = roadsOf([a, b]);
    mergeRoadChains(roads, []);
    const merged = roads.roads[0]!;
    expect(merged.points.map((p) => p.x)).toEqual([0, 30, 80]);
    // mokřina b u uzlu (46–50 od jejího začátku = 0–4 m za uzlem) navazuje na mokřinu a
    expect(merged.ground).toEqual({ wet: [[20, 34]], fords: [5, 70] });
  });

  it('různý stupeň zůstane rozdělený (hranice vylepšení), stejně tak skutečné rozcestí', () => {
    const roads = roadsOf([
      road(1, [
        [0, 0],
        [30, 0],
      ]),
      road(
        2,
        [
          [30, 0],
          [60, 0],
        ],
        {},
        'improved',
      ),
      road(3, [
        [60, 0],
        [90, 0],
      ]),
      road(4, [
        [60, 0],
        [60, 40],
      ]),
    ]);
    expect(mergeRoadChains(roads, [])).toBe(false);
    expect(roads.roads).toHaveLength(4);
  });

  it('vylepšuje-li se jen jeden úsek, zůstanou rozdělené; po dokončení se stejným stupněm spojí', () => {
    const s = foundVillage({
      seed: 5,
      day: Y1 - 400,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    s.roads = roadsOf([
      road(
        1,
        [
          [0, 0],
          [30, 0],
        ],
        {},
        'improved',
      ),
      road(2, [
        [30, 0],
        [70, 0],
      ]),
    ]);
    const upgrade: Construction = {
      id: 77,
      kind: 'road',
      startedDay: Y1,
      cost: 6,
      done: 6,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      roadIds: [2],
      roadGrade: 'improved',
    };
    s.constructions = [upgrade];
    expect(mergeRoadChains(s.roads, s.constructions)).toBe(false);
    // dokončení: úsek 2 je upravený jako 1, stavba zmizí – spojí se
    finishRoadUpgrade(s, upgrade);
    s.constructions = [];
    expect(mergeRoadChains(s.roads, s.constructions)).toBe(true);
    expect(s.roads.roads.map((r) => [r.id, r.grade])).toEqual([[1, 'improved']]);
  });

  it('společné vylepšení a výsadba jabloní přejdou na spojený úsek, jabloně taky', () => {
    const roads = roadsOf(
      [
        road(4, [
          [0, 0],
          [30, 0],
        ]),
        road(5, [
          [30, 0],
          [60, 0],
        ]),
      ],
      {
        apples: [
          {
            id: 1_000_001,
            roadId: 5,
            x: 45,
            z: 3,
            distanceM: 40,
            plantedDay: null,
            constructionId: 9,
          },
        ],
      },
    );
    const base = {
      startedDay: Y1,
      cost: 6,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
    };
    const constructions: Construction[] = [
      { ...base, id: 8, kind: 'road', roadIds: [4, 5], roadGrade: 'improved' },
      { ...base, id: 9, kind: 'road-apples', roadIds: [5] },
    ];
    expect(mergeRoadChains(roads, constructions)).toBe(true);
    expect(roads.roads.map((r) => r.id)).toEqual([4]);
    expect(constructions.map((c) => c.roadIds)).toEqual([[4], [4]]);
    expect(roads.apples![0]!.roadId).toBe(4);
  });

  it('starší ves se při načtení převede jednou – pak týž objekt', () => {
    const s = foundVillage({
      seed: 5,
      day: Y1 - 400,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    s.roads = roadsOf([
      road(1, [
        [0, 0],
        [30, 0],
      ]),
      road(2, [
        [30, 0],
        [70, 0],
      ]),
    ]);
    const migrated = withMergedRoads(s);
    expect(migrated).not.toBe(s);
    expect(s.roads.roads).toHaveLength(2);
    expect(migrated.roads!.roads).toHaveLength(1);
    expect(withMergedRoads(migrated)).toBe(migrated);
  });

  it('Vlkov: falešná rozcestí zmizí, zůstanou jen hranice stupňů a skutečná rozcestí', () => {
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
    const before = json(roads.roads);
    expect(before).toHaveLength(23);
    expect(degrees(before)[2]).toBe(13);
    mergeRoadChains(roads, []);
    const after = roads.roads;
    // uzly se dvěma úseky zůstanou jen tam, kde se mění stupeň cesty
    const ends = new Map<string, Road[]>();
    for (const r of after) {
      for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
        const key = `${p.x},${p.z}`;
        ends.set(key, [...(ends.get(key) ?? []), r]);
      }
    }
    for (const list of ends.values()) {
      if (list.length === 2 && list[0] !== list[1]) {
        expect(list[0]!.grade).not.toBe(list[1]!.grade);
      }
    }
    expect(after.length).toBeLessThan(before.length);
    expect(after.length).toBe(VLKOV_AFTER);
    // osa celkem stejně dlouhá – nic se neztratilo ani nezdvojilo
    const length = (list: readonly Road[]): number =>
      list.reduce(
        (sum, r) =>
          sum +
          r.points
            .slice(1)
            .reduce((s, b, k) => s + Math.hypot(b.x - r.points[k]!.x, b.z - r.points[k]!.z), 0),
        0,
      );
    expect(length(after)).toBeCloseTo(length(before), 6);
  });
});

/** Kolik úseků Vlkova zbude po sloučení (23 před). */
const VLKOV_AFTER = 11;

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

/**
 * Stranou vsi (z = −120) upravená cesta rozdělená v x = 0 odbočkou k jihu – odbočka je
 * vyšlapaná a bez provozu, po pěti letech zaroste.
 */
function withBranch(s: VillageState): void {
  updateRoads(s, Y1, LANDSCAPE, null);
  s.roads!.roads.push(
    road(
      500,
      [
        [-60, -120],
        [0, -120],
      ],
      { bornDay: Y1 - 20 * 365 },
      'improved',
    ),
    road(
      501,
      [
        [0, -120],
        [130, -120],
      ],
      { bornDay: Y1 - 20 * 365 },
      'improved',
    ),
    road(
      502,
      [
        [0, -120],
        [0, -200],
      ],
      { bornDay: Y1 - 8 * 365, traffic: [0, 0, 0, 0] },
    ),
  );
}

describe('slučování v roční kontrole', () => {
  it('po zarostnutí odbočky se úsek sloučí', () => {
    const s = village(Y1 - 30);
    withBranch(s);
    const events = updateRoads(s, NOV1(601), LANDSCAPE, null);
    expect(events).toContainEqual({ day: NOV1(601), kind: 'road-overgrown', roadId: 502 });
    const side = s.roads!.roads.filter((r) => r.points.every((p) => p.z === -120));
    expect(side.map((r) => r.id)).toEqual([500]);
    expect(side[0]!.points.map((p) => p.x)).toEqual([-60, 0, 130]);
  }, 60_000);

  it('výsledek nezávisí na kouscích dopočtu (i s JSON mezi kousky) přes 1. 11.', () => {
    const start = village(NOV1(601) - 12);
    withBranch(start);
    start.roads!.labor = { from: Y1, days: 365, shares: [] };
    const end = NOV1(601) + 9;
    const whole = advanceVillage(start, end, LAYER, LANDSCAPE);
    expect(whole.roads!.roads.some((r) => r.id === 501 || r.id === 502)).toBe(false);
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
