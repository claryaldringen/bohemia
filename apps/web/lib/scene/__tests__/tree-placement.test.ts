import { describe, it, expect } from 'vitest';
import { generateLandscape, surfaceAt, SURFACE_CODES } from '@bohemia/game';
import { tileAt } from '../tile-at';
import { treePlacements } from '../tree-placement';

const landscape = generateLandscape(5);
const forestCells = landscape.surface.filter((s) => s === SURFACE_CODES.forest).length;

describe('treePlacements', () => {
  const placements = treePlacements(landscape);

  it('stromy stojí jen na lesních políčkách', () => {
    for (const tree of placements) {
      const tile = tileAt(landscape, tree.worldX, tree.worldZ);
      expect(tile).not.toBeNull();
      expect(surfaceAt(landscape, tile!.x, tile!.y)).toBe('forest');
    }
  });

  it('na lesní políčko připadají 2–3 stromy', () => {
    expect(placements.length).toBeGreaterThanOrEqual(2 * forestCells);
    expect(placements.length).toBeLessThanOrEqual(3 * forestCells);
  });

  it('rozmístění je deterministické', () => {
    expect(treePlacements(landscape)).toEqual(placements);
  });

  it('les je smíšený – zastoupené jsou listnáče i jehličnany', () => {
    const species = new Set(placements.map((t) => t.species));
    expect(species).toEqual(new Set(['deciduous-1', 'deciduous-2', 'conifer-1', 'conifer-2']));
  });
});
