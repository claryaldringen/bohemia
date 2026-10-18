import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import type { VillageRoads, VillageState } from '../types';

describe('cloneState', () => {
  it('zkopíruje vnořené objekty a pole jako structuredClone', () => {
    const state = {
      day: 3,
      hungry: false,
      plan: null,
      missing: undefined,
      parts: [{ id: 1, cell: { x: 2, y: 3 }, obstacles: [4, 5], crop: 'winter' }],
      ratio: -0,
      nan: Number.NaN,
    };
    const copy = cloneState(state);
    expect(copy).toEqual(structuredClone(state));
    expect(Object.keys(copy)).toEqual(Object.keys(state));
    expect(Object.is(copy.ratio, -0)).toBe(true);
    copy.parts[0]!.cell.x = 99;
    copy.parts[0]!.obstacles.push(6);
    expect(state.parts[0]!.cell.x).toBe(2);
    expect(state.parts[0]!.obstacles).toEqual([4, 5]);
  });

  it('ostatní typy (Map, Date) kopíruje přes structuredClone', () => {
    const state = { byId: new Map([[1, { a: 1 }]]), when: new Date(0) };
    const copy = cloneState(state);
    expect(copy.byId).not.toBe(state.byId);
    expect(copy.byId.get(1)).toEqual({ a: 1 });
    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.when.getTime()).toBe(0);
  });

  it('pevné cesty, stromy u nich a roční součty práce (roads.md) kopíruje celé', () => {
    const roads: VillageRoads = {
      nextId: 9,
      roads: [
        {
          id: 1,
          points: [
            { x: 0.5, z: 1.25 },
            { x: 40, z: -3 },
          ],
          bornDay: 1200,
          grade: 'trodden',
          traffic: [4.1, 3.9],
          spots: [{ id: 2, x: 10, z: 3 }],
        },
      ],
      trees: [
        {
          id: ROAD_TREE_ID_BASE + 3,
          spot: 2,
          x: 10,
          z: 3,
          species: 'oak',
          rootedDay: 1500,
          diesDay: 90000,
        },
      ],
      candidates: [[{ x: 1, z: 2 }]],
      labor: {
        from: 1600,
        days: 12,
        shares: [
          { target: { kind: 'field', id: 4 }, manDays: 7.5 },
          { target: { kind: 'trees', ids: [11, 12] }, manDays: 1 },
        ],
      },
    };
    const state = { lastDay: 1611, roads } as Pick<VillageState, 'lastDay' | 'roads'>;
    const before = structuredClone(state);
    const copy = cloneState(state);
    expect(copy).toEqual(before);
    // nic se nesdílí – další kousek dopočtu nesmí měnit uložený stav
    copy.roads!.roads[0]!.points[0]!.x = 99;
    copy.roads!.roads[0]!.traffic.push(1);
    copy.roads!.roads[0]!.spots.pop();
    copy.roads!.trees[0]!.diesDay = 1;
    copy.roads!.candidates[0]!.push({ x: 5, z: 5 });
    copy.roads!.labor.shares[0]!.manDays += 1;
    const ids = copy.roads!.labor.shares[1]!.target;
    if (ids.kind === 'trees') ids.ids.push(13);
    expect(state).toEqual(before);
    expect(copy).not.toEqual(before);
  });
});
