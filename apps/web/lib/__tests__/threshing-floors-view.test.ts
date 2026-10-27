import { describe, expect, it } from 'vitest';
import {
  advanceVillage,
  dayIndexOf,
  foundVillage,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '@bohemia/game';
import { STRAW_LEFT, threshingFloorStraw, threshingFloorsOf } from '../village-view-buildings';
import { selectionDetails } from '../selection-details';
import { buildVillageView, type SceneVillage, type VillageView } from '../village-view';
import { planVillagers } from '../scene/villager-plan';
import { createVillagerPose } from '../scene/villager-motion';

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

describe('výmlat na humně ve hře (simulace → pohled → postavy)', () => {
  it('hotové humno a snopy v srpnu: klasy na humně a mlatci s holí na něm', () => {
    const real = generateLandscape(5);
    const layer = obstaclesOf(real);
    const site = tileCenterWorld(real, real.villageSite.x, real.villageSite.y);
    const start = dayIndexOf({ year: 503, month: 4, day: 12 });
    let s = foundVillage({
      seed: 3,
      day: start,
      dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
      obstacles: layer,
    });
    const at = { x: site.x + 30, z: site.z + 5, rotation: 0 };
    s.threshingFloors = [{ id: 900, position: at, builtDay: start - 5 }];
    const aug = dayIndexOf({ year: 503, month: 8, day: 10 });
    while (s.lastDay < aug) s = advanceVillage(s, Math.min(aug, s.lastDay + 30), layer);
    s.sheaves = { grainKg: 3000, legumesKg: 0, work: { winter: 30 } };
    s = advanceVillage(s, aug + 1, layer);
    const scene = buildVillageView(
      { id: 'v', settlementId: 's', name: 'Libice', state: s, version: 1 },
      real,
      aug + 1,
    ).scene;
    expect(scene.threshingFloors?.[0]).toMatchObject({ built: true, threshing: true });
    const ground = { walkable: () => true, tree: () => null, treesIn: () => [] };
    const threshers = planVillagers(scene, ground, { seed: 3, herds: 0 })
      .filter((p) => p.key.startsWith('thresh:threshing-floor-900'))
      .map((p) => p.pose(20, [], createVillagerPose()));
    expect(threshers.length).toBeGreaterThanOrEqual(2);
    for (const pose of threshers) {
      expect(pose.clip).toBe('thresh');
      expect(Math.hypot(pose.x - at.x, pose.z - at.z)).toBeLessThan(6);
    }
  });
});
