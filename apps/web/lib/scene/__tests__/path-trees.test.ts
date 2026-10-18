import { describe, expect, it } from 'vitest';
import { ROAD_TREE_ID_BASE } from '@bohemia/game';
import type { SceneRoadApple, SceneRoadTree } from '../../village-view';
import {
  OAK_SNAG_MODEL,
  ROAD_SHRUB_MODELS,
  ROAD_APPLE_MODELS,
  ROAD_SNAG_MODELS,
  ROAD_TREE_MODELS,
  STUMP_MODEL,
  isPathTreeModel,
  isRoadAppleModel,
  roadAppleInstance,
  roadApplesKey,
  roadTreesKey,
  roadsideInstance,
  roadsideModelUrl,
} from '../path-trees';

const tree = (extra: Partial<SceneRoadTree> = {}): SceneRoadTree => ({
  id: ROAD_TREE_ID_BASE + 12,
  x: 10,
  z: -4,
  species: 'elm',
  stage: 'tree',
  growth: 1,
  ...extra,
});

describe('roadsideInstance – model a velikost stromu u cesty podle stáří', () => {
  it('keř z dekorací, roste do plné velikosti keře', () => {
    const small = roadsideInstance(tree({ stage: 'shrub', growth: 0 }));
    const big = roadsideInstance(tree({ stage: 'shrub', growth: 1 }));
    expect(ROAD_SHRUB_MODELS).toContain(small.model);
    expect(big.model).toBe(small.model);
    expect(big.scale).toBeGreaterThan(small.scale * 2);
    expect(roadsideModelUrl(small.model)).toBe(`/models/decor/${small.model}.glb`);
  });

  it('strom podle druhu, od 30 % do plné velikosti', () => {
    const young = roadsideInstance(tree({ growth: 0.3 }));
    const full = roadsideInstance(tree({ growth: 1 }));
    expect(ROAD_TREE_MODELS.elm).toContain(young.model as never);
    expect(young.model).toBe(full.model);
    expect(young.scale / full.scale).toBeCloseTo(0.3, 9);
    expect(full.scale).toBeGreaterThan(0.85);
    expect(full.scale).toBeLessThan(1.15);
    expect(isPathTreeModel(full.model)).toBe(true);
    expect(roadsideModelUrl(full.model)).toBe(`/models/trees/${full.model}.glb`);
    const oak = roadsideInstance(tree({ species: 'oak' }));
    expect(ROAD_TREE_MODELS.oak).toContain(oak.model as never);
  });

  it('souš (dub má vlastní) a pařez', () => {
    expect(roadsideInstance(tree({ species: 'oak', stage: 'snag' })).model).toBe(OAK_SNAG_MODEL);
    expect(ROAD_SNAG_MODELS).toContain(
      roadsideInstance(tree({ species: 'poplar', stage: 'snag' })).model,
    );
    const stump = roadsideInstance(tree({ stage: 'stump' }));
    expect(stump.model).toBe(STUMP_MODEL);
    expect(isPathTreeModel(stump.model)).toBe(false);
  });

  it('stojí na místě z dat a natočení i model drží id stromu', () => {
    const a = roadsideInstance(tree());
    expect({ x: a.x, z: a.z }).toEqual({ x: 10, z: -4 });
    expect(roadsideInstance(tree())).toEqual(a);
    const other = Array.from({ length: 12 }, (_, k) =>
      roadsideInstance(tree({ id: ROAD_TREE_ID_BASE + 100 + k })),
    );
    expect(new Set(other.map((t) => t.rotationY.toFixed(3))).size).toBeGreaterThan(8);
  });

  it('klíč se mění jen se změnou stadia nebo velikosti', () => {
    expect(roadTreesKey([tree()])).toBe(roadTreesKey([tree({ x: 99 })]));
    expect(roadTreesKey([tree()])).not.toBe(roadTreesKey([tree({ growth: 0.95 })]));
    expect(roadTreesKey(undefined)).toBe('');
  });
});

describe('roadAppleInstance – jabloně podél cesty ze sadu', () => {
  const apple = (extra: Partial<SceneRoadApple> = {}): SceneRoadApple => ({
    id: ROAD_TREE_ID_BASE + 40,
    roadId: 2,
    x: 5,
    z: 3,
    stage: 'tree',
    growth: 1,
    fruit: false,
    ...extra,
  });

  it('čekající na výsadbu model nemá (stojí tam kolík vytyčení)', () => {
    expect(roadAppleInstance(apple({ stage: 'planting', growth: 0 }))).toBeNull();
  });

  it('strom ze sadu – stejná varianta s plody i bez, velikost podle stáří', () => {
    const bare = roadAppleInstance(apple())!;
    const fruit = roadAppleInstance(apple({ fruit: true }))!;
    expect(ROAD_APPLE_MODELS).toContain(bare.model);
    expect(isRoadAppleModel(bare.model)).toBe(true);
    expect(bare.model).toMatch(/^apple-\d$/);
    expect(fruit.model).toBe(bare.model.replace('apple-', 'apple-fruit-'));
    expect(roadsideModelUrl(bare.model)).toBe(`/models/trees/${bare.model}.glb`);
    const young = roadAppleInstance(apple({ growth: 0.3 }))!;
    expect(young.scale).toBeCloseTo(bare.scale * 0.3, 9);
    expect(young.rotationY).toBe(bare.rotationY);
  });

  it('souš jako u stromů u cest; klíč se mění se stadiem a plody', () => {
    const snag = roadAppleInstance(apple({ stage: 'snag' }))!;
    expect(ROAD_SNAG_MODELS).toContain(snag.model);
    expect(roadApplesKey([apple()])).not.toBe(roadApplesKey([apple({ fruit: true })]));
    expect(roadApplesKey([apple()])).toBe(roadApplesKey([apple()]));
  });
});
