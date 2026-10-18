import { describe, it, expect } from 'vitest';
import { generateLandscape, obstaclesOf, OBSTACLE_LOOKS, TREE_LOOKS } from '@bohemia/game';
import { IMPOSTOR_ATLAS } from '../impostor-atlas';
import { impostorLook, obstacleScenery } from '../obstacle-scenery';

const landscape = generateLandscape(5);
const layer = obstaclesOf(landscape);
const scenery = obstacleScenery(layer);

describe('obstacleScenery – vrstva překážek podle způsobu kreslení', () => {
  it('každá překážka se kreslí právě jednou a nese své id', () => {
    const ids = [
      ...scenery.trees.map((t) => t.id!),
      ...scenery.impostors.map((t) => t.id),
      ...scenery.decor.map((d) => d.id!),
    ];
    expect(ids).toHaveLength(layer.count);
    expect(new Set(ids).size).toBe(layer.count);
  });

  it('3D stromy mají modely stromů, dekorace modely keřů a kamenů, impostory buňky atlasu', () => {
    const trees = new Set<string>(TREE_LOOKS);
    for (const t of scenery.trees) expect(trees.has(t.model)).toBe(true);
    for (const d of scenery.decor) {
      expect(trees.has(d.model)).toBe(false);
      expect(OBSTACLE_LOOKS).toContain(d.model);
    }
    expect(new Set(scenery.impostors.map((p) => p.cell)).size).toBe(IMPOSTOR_ATLAS.cells.length);
  });

  it('podoba impostoru sedí s modelem stromu a je deterministická', () => {
    const look = impostorLook('oak-1', 123456);
    expect(IMPOSTOR_ATLAS.cells[look.cell]!.model).toBe('oak-1');
    expect(impostorLook('oak-1', 123456)).toEqual(look);
    expect(() => impostorLook('pine-1', 1)).toThrow();
  });
});
