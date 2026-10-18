import { describe, expect, it } from 'vitest';
import { ROAD_TREE_ID_BASE } from '@bohemia/game';
import type { SceneRoadTree } from '../../village-view';
import {
  OAK_SNAG_MODEL,
  ROAD_SHRUB_MODELS,
  ROAD_SNAG_MODELS,
  ROAD_TREE_MODELS,
  STUMP_MODEL,
  isPathTreeModel,
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
