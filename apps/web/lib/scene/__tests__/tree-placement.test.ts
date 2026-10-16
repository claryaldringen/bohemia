import { describe, it, expect } from 'vitest';
import { generateLandscape, surfaceAt } from '@bohemia/game';
import { forestDepth } from '../forest-depth';
import { tileAt } from '../tile-at';
import { treePlacements } from '../tree-placement';

const landscape = generateLandscape(5);

describe('treePlacements', () => {
  const placements = treePlacements(landscape);

  it('stromy stojí jen na lesních políčkách', () => {
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ);
      expect(tile).not.toBeNull();
      expect(surfaceAt(landscape, tile!.x, tile!.y)).toBe('forest');
    }
  });

  it('stromy stojí jen na okraji lesa (do 2 políček od kraje), vnitřek je bez stromů', () => {
    const depth = forestDepth(landscape);
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ)!;
      expect(depth[tile.y * 128 + tile.x]).toBeLessThanOrEqual(2);
    }
  });

  it('krajní řada lesa má 3–4 stromy na políčko, druhá řada 2', () => {
    const depth = forestDepth(landscape);
    const edge = [...depth].filter((d) => d === 1).length;
    const second = [...depth].filter((d) => d === 2).length;
    expect(placements.length).toBeGreaterThanOrEqual(3 * edge + 2 * second);
    expect(placements.length).toBeLessThanOrEqual(4 * edge + 2 * second);
  });

  it('rozmístění je deterministické', () => {
    expect(treePlacements(landscape)).toEqual(placements);
  });

  it('les je smíšený – zastoupené jsou listnáče i jehličnany', () => {
    const species = new Set(placements.map((t) => t.species));
    expect(species).toEqual(new Set(['deciduous-1', 'deciduous-2', 'conifer-1', 'conifer-2']));
  });
});
