import { describe, expect, it } from 'vitest';
import { addTrailRoads } from '../roads-trails';
import { emptyRoads, mergeRoadChains, splitRoad, hitAlongRoad } from '../roads-form';
import { roadLengthM } from '../roads-geometry';
import { type SpotContext } from '../roads-trees';
import { trailTerrain } from '../terrain';
import type { Road, RoadJunction, RoadPoint, VillageState } from '../../types';
import { village } from '../../__tests__/abandonment-fixtures';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';

// Zemská stezka jako spojitá řada úseků a ramena křižovatek (trade.md – Zemská stezka; D86).

const DAY = 200_000;

function road(id: number, points: [number, number][], extra: Partial<Road> = {}): Road {
  return {
    id,
    points: points.map(([x, z]) => ({ x, z })),
    bornDay: DAY - 1000 + id,
    grade: 'trodden',
    traffic: [3],
    spots: [],
    ground: { wet: [], fords: [] },
    ...extra,
  };
}

function stateWith(roads: Road[], junctions?: RoadJunction[]): VillageState {
  const state = village();
  state.roads = { ...emptyRoads(DAY), nextId: 100, roads, ...(junctions ? { junctions } : {}) };
  return state;
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

const line = (x0: number, z0: number, x1: number, z1: number): RoadPoint[] => {
  const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 2);
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    z: z0 + ((z1 - z0) * i) / n,
  }));
};

const end = (r: Road, atStart: boolean): RoadPoint =>
  atStart ? r.points[0]! : r.points[r.points.length - 1]!;
const near = (a: RoadPoint, b: RoadPoint): boolean => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;

/** Úseky za sebou na sebe navazují koncem na konec (bez mezery). */
function chained(state: VillageState, ids: number[]): boolean {
  const list = ids.map((id) => state.roads!.roads.find((r) => r.id === id)!);
  let at: RoadPoint | null = null;
  for (const r of list) {
    const a = end(r, true);
    const b = end(r, false);
    if (at === null) {
      at = near(at ?? a, a) ? b : a;
      continue;
    }
    if (near(at, a)) at = b;
    else if (near(at, b)) at = a;
    else return false;
  }
  return true;
}

describe('addTrailRoads – spojitá řada úseků', () => {
  it('podél opuštěné cesty vznikne vlastní úsek stezky', () => {
    const state = stateWith([
      road(
        1,
        [
          [0, 0],
          [0, 100],
        ],
        { abandoned: true },
      ),
    ]);
    const ids = addTrailRoads(
      state,
      line(0, 0, 0, 100),
      DAY,
      LANDSCAPE,
      null,
      trailTerrain(LANDSCAPE, null),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(1);
    const length = ids.reduce(
      (sum, id) => sum + roadLengthM(state.roads!.roads.find((r) => r.id === id)!),
      0,
    );
    expect(length).toBeGreaterThan(95);
    expect(chained(state, ids)).toBe(true);
  });

  it('trasa jdoucí jen kus po existující cestě – řada bez mezery, cesta rozdělená v místě odbočení', () => {
    // dlouhá cesta A po ose x; trasa jde po ní do x = 60, pak odbočí po cestě B (celé po z)
    const state = stateWith([
      road(1, [
        [0, 0],
        [150, 0],
      ]),
      road(2, [
        [60, 0],
        [60, 80],
      ]),
    ]);
    const route = [...line(0, 0, 60, 0), ...line(60, 0, 60, 80).slice(1)];
    const ids = addTrailRoads(state, route, DAY, LANDSCAPE, null, trailTerrain(LANDSCAPE, null));
    const roads = state.roads!.roads;
    expect(roads.length).toBe(3);
    expect(ids.length).toBe(2);
    expect(ids).toContain(2);
    const first = roads.find((r) => r.id === ids[0])!;
    expect(Math.abs(roadLengthM(first) - 60)).toBeLessThan(0.1);
    expect(chained(state, ids)).toBe(true);
    // zbytek cesty A (x 60–150) do stezky nepatří
    const rest = roads.find((r) => !ids.includes(r.id))!;
    expect(Math.abs(roadLengthM(rest) - 90)).toBeLessThan(0.1);
  });

  it('trasa přes cestu napříč jí řadu nepřeruší', () => {
    const state = stateWith([
      road(1, [
        [-50, 40],
        [50, 40],
      ]),
    ]);
    const ids = addTrailRoads(
      state,
      line(0, 0, 0, 100),
      DAY,
      LANDSCAPE,
      null,
      trailTerrain(LANDSCAPE, null),
    );
    expect(chained(state, ids)).toBe(true);
    const length = ids.reduce(
      (sum, id) => sum + roadLengthM(state.roads!.roads.find((r) => r.id === id)!),
      0,
    );
    expect(Math.abs(length - 100)).toBeLessThan(12);
  });
});

describe('addTrailRoads – obejití zakázaného úseku', () => {
  it('úsek s posvátným stromem řada obejde po objížďce, je-li kudy', () => {
    const state = stateWith([
      road(1, [
        [0, 0],
        [0, 100],
      ]),
      road(2, [
        [0, 0],
        [30, 50],
      ]),
      road(3, [
        [30, 50],
        [0, 100],
      ]),
    ]);
    const ids = addTrailRoads(
      state,
      line(0, 0, 0, 100),
      DAY,
      LANDSCAPE,
      null,
      trailTerrain(LANDSCAPE, null),
      (r) => r.id === 1,
    );
    expect(ids).toEqual([2, 3]);
  });
});

describe('ramena křižovatek po dělení a slučování', () => {
  const junction = (x: number, z: number, arms: (number | null)[]): RoadJunction => ({
    id: 50,
    x,
    z,
    shape: 'y',
    rotation: 0,
    arms,
    landmark: { kind: 'stone', x, z, turn: 0, look: 1 },
    bornDay: DAY,
  });

  it('splitRoad přepíše rameno u zadního konce na druhou část', () => {
    const roads = stateWith(
      [
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(2, [
          [100, 0],
          [100, 50],
        ]),
        road(3, [
          [100, 0],
          [150, 0],
        ]),
      ],
      [junction(100, 0, [1, 2, 3])],
    ).roads!;
    const rest = splitRoad(roads, hitAlongRoad(roads, roads.roads[0]!, 40), context());
    expect(rest.x).toBe(40);
    const second = roads.roads.find((r) => r.id === 100)!;
    expect(roads.junctions![0]!.arms).toEqual([100, 2, 3]);
    expect(near(end(second, false), { x: 100, z: 0 })).toBe(true);
  });

  it('splitRoad nechá rameno u předního konce', () => {
    const roads = stateWith(
      [
        road(1, [
          [0, 0],
          [100, 0],
        ]),
        road(2, [
          [0, 0],
          [0, 50],
        ]),
        road(3, [
          [0, 0],
          [0, -50],
        ]),
      ],
      [junction(0, 0, [1, 2, 3])],
    ).roads!;
    splitRoad(roads, hitAlongRoad(roads, roads.roads[0]!, 40), context());
    expect(roads.junctions![0]!.arms).toEqual([1, 2, 3]);
  });

  it('slučování úseků přepíše rameno zmizelého úseku na ponechaný', () => {
    // 1 a 2 se spojí v (50, 0); druhý konec úseku 2 leží v křižovatce
    const state = stateWith(
      [
        road(1, [
          [0, 0],
          [50, 0],
        ]),
        road(2, [
          [50, 0],
          [100, 0],
        ]),
        road(3, [
          [100, 0],
          [100, 50],
        ]),
        road(4, [
          [100, 0],
          [150, 0],
        ]),
      ],
      [junction(100, 0, [2, 3, 4])],
    );
    expect(mergeRoadChains(state.roads!, state.constructions, state.trails)).toBe(true);
    const arms = state.roads!.junctions![0]!.arms;
    const ids = new Set(state.roads!.roads.map((r) => r.id));
    for (const id of arms) expect(ids.has(id!)).toBe(true);
    expect(arms).toContain(1);
    expect(arms).not.toContain(2);
  });
});
