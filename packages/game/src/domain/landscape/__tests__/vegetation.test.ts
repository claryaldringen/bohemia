import { describe, it, expect } from 'vitest';
import { generateTerrain } from '../terrain';
import { SURFACE_CODES } from '../types';
import { generateVegetation } from '../vegetation';
import { componentSizes, share } from './landscape-checks';

const SEEDS = Array.from({ length: 100 }, (_, i) => i * 104729 + 3);
const { water, forest, meadow } = SURFACE_CODES;

describe('generateVegetation', () => {
  it('podíl lesa je 55–70 %', () => {
    for (const seed of SEEDS) {
      const terrain = generateTerrain(seed, 1);
      const forestShare = share(generateVegetation(seed + 1, terrain, 1), forest);
      expect(forestShare, `seed ${seed}`).toBeGreaterThanOrEqual(0.55);
      expect(forestShare, `seed ${seed}`).toBeLessThanOrEqual(0.7);
    }
  });

  it('voda z terénu zůstane vodou a jinde voda není', () => {
    const terrain = generateTerrain(11, 1);
    const surface = generateVegetation(12, terrain, 1);
    for (let i = 0; i < surface.length; i++) {
      expect(surface[i] === water).toBe(terrain.water[i] === 1);
    }
  });

  it('místo pro vesnici je louka', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const terrain = generateTerrain(seed, 1);
      const { x, y } = terrain.villageSite;
      expect(generateVegetation(seed, terrain, 1)[y * terrain.size + x], `seed ${seed}`).toBe(
        meadow,
      );
    }
  });

  it('les netvoří osamělá políčka (žádný lesní ostrůvek pod 4 políčka)', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const terrain = generateTerrain(seed, 1);
      const surface = generateVegetation(seed, terrain, 1);
      const forestMask = surface.map((v) => (v === forest ? 1 : 0));
      expect(
        Math.min(...componentSizes(forestMask, terrain.size)),
        `seed ${seed}`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('změna seedu vegetace nezmění terén', () => {
    const terrain = generateTerrain(21, 1);
    const before = structuredClone(terrain);
    const a = generateVegetation(1, terrain, 1);
    const b = generateVegetation(2, terrain, 1);
    expect(terrain).toEqual(before);
    expect(a).not.toEqual(b);
  });
});
