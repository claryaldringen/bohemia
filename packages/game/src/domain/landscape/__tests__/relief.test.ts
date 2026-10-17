import { describe, it, expect } from 'vitest';
import { generateLandscape } from '../generate';
import { buildRelief } from '../relief';
import type { Landscape } from '../types';
import { tileCenterWorld } from '../world';

const base = generateLandscape(3);

/** Krajina se stejnou mřížkou a výškami z funkce souřadnic světa. */
function withHeights(height: (worldX: number, worldZ: number) => number): Landscape {
  const heights = new Float32Array(base.size * base.size);
  for (let y = 0; y < base.size; y++) {
    for (let x = 0; x < base.size; x++) {
      const { x: worldX, z: worldZ } = tileCenterWorld(base, x, y);
      heights[y * base.size + x] = height(worldX, worldZ);
    }
  }
  return { ...base, heights };
}

describe('buildRelief', () => {
  it('na rovnoměrném svahu měří jeho sklon a nulovou vypouklost', () => {
    const relief = buildRelief(withHeights((x, z) => 100 - 0.1 * x + 0.05 * z));
    for (const [x, z] of [
      [0, 0],
      [-300, 250],
      [410, -120],
    ] as const) {
      expect(relief.slopeAt(x, z)).toBeCloseTo(Math.hypot(0.1, 0.05), 3);
      expect(Math.abs(relief.convexityAt(x, z))).toBeLessThan(0.01);
    }
  });

  it('svah klesající ke slunci je osluněný, svah od slunce odvrácený', () => {
    // Slunce svítí z kladného X (směr světla −0,8; −0,6; −0,35).
    const towardSun = buildRelief(withHeights((x) => 50 - 0.1 * x));
    const awayFromSun = buildRelief(withHeights((x) => 50 + 0.1 * x));
    expect(towardSun.sunwardAt(100, 100)).toBeGreaterThan(0.08);
    expect(awayFromSun.sunwardAt(100, 100)).toBeLessThan(-0.08);
    const flat = buildRelief(withHeights(() => 10));
    expect(flat.sunwardAt(100, 100)).toBe(0);
  });

  it('vrchol kopce je vypouklý, dno sníženiny vyduté', () => {
    const hill = buildRelief(withHeights((x, z) => 40 - 0.08 * Math.hypot(x, z)));
    const bowl = buildRelief(withHeights((x, z) => 0.08 * Math.hypot(x, z)));
    expect(hill.convexityAt(0, 0)).toBeGreaterThan(0.5);
    expect(bowl.convexityAt(0, 0)).toBeLessThan(-0.5);
  });

  it('skutečná krajina má převážně mírné svahy', () => {
    const relief = buildRelief(base);
    const slopes: number[] = [];
    for (let y = 0; y < base.size; y += 3) {
      for (let x = 0; x < base.size; x += 3) {
        const { x: worldX, z: worldZ } = tileCenterWorld(base, x, y);
        slopes.push(relief.slopeAt(worldX, worldZ));
      }
    }
    slopes.sort((a, b) => a - b);
    expect(slopes[Math.floor(slopes.length / 2)]).toBeLessThan(0.1);
    expect(slopes[slopes.length - 1]).toBeGreaterThan(0.12);
  });

  it('skála vystupuje na prudkém svahu a na ostrém hřbetu, na mírném terénu ne', () => {
    expect(buildRelief(withHeights((x) => 0.2 * x)).rockinessAt(0, 0)).toBe(1);
    expect(buildRelief(withHeights((x) => 0.05 * x)).rockinessAt(0, 0)).toBe(0);
    // Hřbet podél osy Z přes střed políčka x = 7,5.
    const sharp = buildRelief(withHeights((x) => 60 - 0.2 * Math.abs(x - 7.5)));
    const gentle = buildRelief(withHeights((x) => 60 - 0.04 * Math.abs(x - 7.5)));
    expect(sharp.rockinessAt(7.5, 100)).toBe(1);
    expect(gentle.rockinessAt(7.5, 100)).toBe(0);
  });
});
