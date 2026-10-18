import { describe, it, expect } from 'vitest';
import { computeFertility } from '../fertility';
import { alluvialness, heightAboveStream } from '../floodplain';
import { distanceToMask, maxStep } from '../grid';
import { generateTerrain } from '../terrain';
import { SURFACE_CODES } from '../types';
import { generateVegetation } from '../vegetation';

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 5);

describe('heightAboveStream', () => {
  it('voda má 0, políčko nad potokem výšku nad dnem nejbližší vody', () => {
    const size = 5;
    const water = new Uint8Array(size * size);
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      water[y * size] = 1;
      for (let x = 0; x < size; x++) heights[y * size + x] = x === 0 ? 2 : 2 + x * 0.5;
    }
    const above = heightAboveStream(water, heights, size);
    expect(above[0]).toBe(0);
    expect(above[2 * size + 4]).toBeCloseTo(2, 5);
  });
});

describe('computeFertility – verze 2', () => {
  const cases = SEEDS.map((seed) => {
    const terrain = generateTerrain(seed, 1);
    const surface = generateVegetation(seed, terrain, 2);
    return {
      seed,
      terrain,
      surface,
      v1: computeFertility(seed, terrain, surface, 1),
      v2: computeFertility(seed, terrain, surface, 2),
    };
  });

  it('je 0–100 a voda má 0', () => {
    for (const { seed, surface, v2 } of cases) {
      for (let i = 0; i < v2.length; i++) {
        expect(v2[i]!, `seed ${seed}`).toBeLessThanOrEqual(100);
        if (surface[i] === SURFACE_CODES.water) expect(v2[i], `seed ${seed}`).toBe(0);
      }
    }
  });

  it('niva a roviny u vody jsou úrodnější než ve verzi 1, podmáčený břeh zůstane slabý', () => {
    for (const { seed, terrain, v1, v2 } of cases) {
      const { size, water, heights } = terrain;
      const distance = distanceToMask(water, size);
      const above = heightAboveStream(water, heights, size);
      let alluvialGain = 0;
      let alluvialCount = 0;
      let wetMax = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          if (water[i]) continue;
          if (distance[i]! <= 1.5) wetMax = Math.max(wetMax, v2[i]!);
          else if (
            distance[i]! > 2.5 &&
            alluvialness(distance[i]!, above[i]!) > 0.8 &&
            maxStep(heights, size, x, y) < 0.6
          ) {
            alluvialGain += v2[i]! - v1[i]!;
            alluvialCount++;
          }
        }
      }
      if (alluvialCount > 0)
        expect(alluvialGain / alluvialCount, `seed ${seed}`).toBeGreaterThan(3);
      expect(wetMax, `seed ${seed}`).toBeLessThan(60);
    }
  }, 30_000);

  it('neznámá verze vyhodí RangeError', () => {
    const { terrain, surface } = cases[0]!;
    expect(() => computeFertility(1, terrain, surface, 3 as 2)).toThrow(RangeError);
  });
});
