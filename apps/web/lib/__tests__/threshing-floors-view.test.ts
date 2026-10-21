import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage } from '@bohemia/game';
import { threshingFloorsOf } from '../village-view-buildings';
import { selectionDetails } from '../selection-details';
import type { SceneVillage, VillageView } from '../village-view';

// Humna v pohledu na ves a ve výběru (production-chains.md – Humno).

const DAY = dayIndexOf({ year: 602, month: 8, day: 10 });

describe('humna v pohledu na ves', () => {
  it('ves bez humna – bez údaje; hotové humno nese snopy a dnešní mlácení', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    expect(threshingFloorsOf(s, [])).toEqual({});
    s.threshingFloors = [{ id: 7, position: { x: 30, z: 5, rotation: 0 }, builtDay: DAY - 5 }];
    s.sheaves = { grainKg: 3000.4, legumesKg: 200 };
    s.labor = {
      day: DAY,
      shares: [{ activity: 'thresh', manDays: 4, target: { kind: 'threshing-floor', id: 7 } }],
    } as never;
    const [floor] = threshingFloorsOf(s, []).threshingFloors!;
    expect(floor).toEqual({
      id: 7,
      built: true,
      progress: 1,
      sheavesKg: 3200,
      threshingToday: true,
    });
    s.labor = { day: DAY, shares: [] } as never;
    expect(threshingFloorsOf(s, []).threshingFloors![0]!.threshingToday).toBe(false);
  });

  it('výběr humna – panel ho dostane jen když je i ve scéně', () => {
    const floor = { id: 7, built: true, progress: 1, sheavesKg: 10, threshingToday: false };
    const view = { threshingFloors: [floor] } as unknown as VillageView;
    const scene = {
      dwellings: [],
      fields: [],
      threshingFloors: [{ id: 7, position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 }],
    } as unknown as SceneVillage;
    expect(selectionDetails(view, scene, { kind: 'threshing-floor', id: 7 })).toEqual({
      kind: 'threshing-floor',
      ...floor,
    });
    expect(selectionDetails(view, scene, { kind: 'threshing-floor', id: 8 })).toBeNull();
  });
});
