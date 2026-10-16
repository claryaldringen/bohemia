import { describe, it, expect } from 'vitest';
import { generateTerrain } from '../terrain';
import { LANDSCAPE_SIZE } from '../types';
import { maxNeighbourStepM, reliefM, waterTouchesOppositeEdges } from './landscape-checks';

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1);

describe('generateTerrain', () => {
  it('stejný seed → shodné výšky, voda i místo pro vesnici', () => {
    expect(generateTerrain(1234, 1)).toEqual(generateTerrain(1234, 1));
  });

  it('jiný seed → jiné výšky', () => {
    expect(generateTerrain(1, 1).heights).not.toEqual(generateTerrain(2, 1).heights);
  });

  it('má rozměr 128 × 128', () => {
    const terrain = generateTerrain(5, 1);
    expect(terrain.size).toBe(LANDSCAPE_SIZE);
    expect(terrain.heights).toHaveLength(128 * 128);
    expect(terrain.water).toHaveLength(128 * 128);
  });

  it('nejnižší políčko má výšku 0', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(Math.min(...generateTerrain(seed, 1).heights)).toBe(0);
    }
  });

  it('převýšení je mezi 10 a 40 m', () => {
    for (const seed of SEEDS) {
      const relief = reliefM(generateTerrain(seed, 1).heights);
      expect(relief, `seed ${seed}`).toBeGreaterThanOrEqual(10);
      expect(relief, `seed ${seed}`).toBeLessThanOrEqual(40);
    }
  });

  it('potok spojuje protilehlé okraje', () => {
    for (const seed of SEEDS) {
      const { water, size } = generateTerrain(seed, 1);
      expect(waterTouchesOppositeEdges(water, size), `seed ${seed}`).toBe(true);
    }
  });

  it('žádné útesy: sousední políčka se liší nejvýš o 3 m', () => {
    for (const seed of SEEDS) {
      const { heights, size } = generateTerrain(seed, 1);
      let worst = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++)
          worst = Math.max(worst, maxNeighbourStepM(heights, size, x, y));
      }
      expect(worst, `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });
});
