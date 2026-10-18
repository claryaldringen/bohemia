import { describe, expect, it } from 'vitest';
import type { VillageState } from '@bohemia/game';
import { sceneTrails, trailRoadWork } from '../trail-view';

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
    candidates: [],
    labor: { from: 0, days: 0, shares: [] },
  },
  trails: [
    {
      id: 7,
      direction: 's',
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
