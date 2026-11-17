import { describe, expect, it } from 'vitest';
import type { VillageState } from '@bohemia/game';
import {
  axesKey,
  sceneTrailContinuations,
  sceneTrailEdgePieces,
  sceneTrails,
  trailRoadWork,
} from '../trail-view';

// Zemská stezka ve scéně (trade.md): osa z úseků od dvorce ke kraji a průběh po úsecích.

const road = (
  id: number,
  points: [number, number][],
): NonNullable<VillageState['roads']>['roads'][number] => ({
  id,
  points: points.map(([x, z]) => ({ x, z })),
  bornDay: 0,
  grade: 'trodden',
  traffic: [],
  spots: [],
});

const state = {
  manorId: 1,
  dwellings: [
    {
      id: 1,
      type: 'zemnice',
      builtDay: 0,
      condition: 1,
      position: { x: 0, z: 0, rotation: Math.PI },
    },
  ],
  constructions: [
    {
      id: 9,
      kind: 'road',
      startedDay: 0,
      cost: 30,
      done: 15,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      roadIds: [2, 3],
      roadGrade: 'improved',
      trail: 7,
    },
  ],
  roads: {
    nextId: 4,
    // druhý úsek je uložený obráceně – osa stezky ho otočí, aby navazoval
    roads: [
      road(2, [
        [0, -5],
        [0, -100],
      ]),
      road(3, [
        [0, -200],
        [0, -100],
      ]),
    ],
    trees: [],
    labor: { from: 0, days: 0, shares: [] },
  },
  trails: [
    {
      id: 7,
      direction: 'S',
      pieces: [
        { roadId: 2, grade: 'improved', manDays: 10 },
        { roadId: 3, grade: 'improved', manDays: 20 },
      ],
      lengthM: 195,
      startedDay: 0,
      builtDay: null,
    },
  ],
} as unknown as VillageState;

describe('zemská stezka ve scéně', () => {
  it('osa od dvorce ke kraji – úseky navazují', () => {
    const [trail] = sceneTrails(state);
    expect(trail!.points).toEqual([
      { x: 0, z: -5 },
      { x: 0, z: -100 },
      { x: 0, z: -200 },
    ]);
    expect(trail!.built).toBe(false);
  });

  it('hotový úsek bez stavby, úsek u čela práce s průběhem', () => {
    const work = trailRoadWork(state);
    expect(work.has(2)).toBe(false);
    expect(work.get(3)).toEqual({ grade: 'improved', progress: 0.25 });
  });
});

describe('pokračování stezky sousední vsi ve scéně', () => {
  it('osy jsou upravené cesty s průsekem a zápornými id', () => {
    const a = [
      { x: 0, z: 960 },
      { x: 10, z: 1000 },
    ];
    const b = [
      { x: -50, z: 960 },
      { x: -60, z: 1000 },
    ];
    expect(sceneTrailContinuations([a, b])).toEqual([
      { id: -1, points: a, grade: 'improved', swath: true },
      { id: -2, points: b, grade: 'improved', swath: true },
    ]);
    expect(sceneTrailContinuations([])).toEqual([]);
  });
});

describe('sceneTrailEdgePieces', () => {
  // hotová stezka E končí 25 m před krajem – kus ke kraji jen po dni dostavění (jako `marchGrid`)
  const state = {
    trails: [
      {
        id: 1,
        direction: 'E',
        pieces: [{ roadId: 1, grade: 'improved', manDays: 1 }],
        lengthM: 935,
        startedDay: 0,
        builtDay: 3,
      },
    ],
    roads: {
      nextId: 2,
      roads: [
        {
          id: 1,
          points: [
            { x: 0, z: 120 },
            { x: 935, z: 120 },
          ],
          bornDay: 0,
          grade: 'improved',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    },
  } as unknown as VillageState;

  it('konec osy → bod okraje, až den po dostavění', () => {
    expect(sceneTrailEdgePieces(state, 4)).toEqual([
      [
        { x: 935, z: 120 },
        { x: 960, z: 120 },
      ],
    ]);
    expect(sceneTrailEdgePieces(state, 3)).toEqual([]);
  });
});

describe('axesKey', () => {
  it('z obsahu os, ne z počtu', () => {
    const a = [[{ x: 1, z: 2 }]];
    expect(axesKey(a)).toBe(axesKey([[{ x: 1, z: 2 }]]));
    expect(axesKey(a)).not.toBe(axesKey([[{ x: 1, z: 3 }]]));
    expect(axesKey(null)).toBe('');
  });
});
