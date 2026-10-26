import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage } from '@bohemia/game';
import { STRAW_LEFT, threshingFloorStraw, threshingFloorsOf } from '../village-view-buildings';
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

describe('stoh slámy na humně (threshingFloorStraw)', () => {
  const day = (year: number, month: number, d: number): number =>
    dayIndexOf({ year, month, day: d });

  it('roste při výmlatu v srpnu a září, přes zimu ubývá na zbytek', () => {
    const built = day(600, 3, 1);
    expect(threshingFloorStraw(null, day(602, 8, 10))).toBe(0);
    expect(threshingFloorStraw(built, day(600, 4, 1))).toBe(0);
    const aug = threshingFloorStraw(built, day(600, 8, 15));
    const sep = threshingFloorStraw(built, day(600, 9, 25));
    expect(aug).toBeGreaterThan(0);
    expect(sep).toBeGreaterThan(aug);
    expect(threshingFloorStraw(built, day(600, 10, 2))).toBe(1);
    const spring = threshingFloorStraw(built, day(601, 4, 1));
    expect(spring).toBeLessThan(1);
    expect(threshingFloorStraw(built, day(601, 7, 31))).toBeCloseTo(STRAW_LEFT, 1);
    // příští žeň začíná od zbytku
    expect(threshingFloorStraw(built, day(601, 8, 1))).toBeGreaterThanOrEqual(STRAW_LEFT);
  });

  it('humno postavené po výmlatu má stoh až od příští žně', () => {
    const built = day(600, 11, 1);
    expect(threshingFloorStraw(built, day(601, 2, 1))).toBe(0);
    const next = threshingFloorStraw(built, day(601, 8, 5));
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(STRAW_LEFT);
  });
});
