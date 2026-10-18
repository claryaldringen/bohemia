import { describe, expect, it } from 'vitest';
import type { PathLine } from '../path-network';
import { PATH_TREE_YEARS, pathTreeGrowth, pathsideTrees } from '../path-trees';

/** Rovná pěšina podél osy x délky 200 m. */
const line = (strength: number, years: number): PathLine => ({
  points: [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 200, z: 0 },
  ],
  strength: [strength, strength, strength],
  years: [years, years, years],
  openStart: true,
  openEnd: true,
});

const everywhere = { nearField: () => true, canPlant: () => true };

describe('pathsideTrees – stromy podél starých pěšin přes pole', () => {
  it('řídce (12–20 m) po obou stranách, nikdy na pěšině, stejná síť = stejné stromy', () => {
    const trees = pathsideTrees([line(0.9, 60)], everywhere);
    expect(trees.length).toBeGreaterThan(6);
    expect(trees.length).toBeLessThan(18);
    for (const t of trees) {
      expect(Math.abs(t.z)).toBeGreaterThanOrEqual(2.2);
      expect(Math.abs(t.z)).toBeLessThan(4.5);
    }
    expect(trees.some((t) => t.z > 0)).toBe(true);
    expect(trees.some((t) => t.z < 0)).toBe(true);
    const xs = trees.map((t) => t.x).sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThan(8);
    expect(pathsideTrees([line(0.9, 60)], everywhere)).toEqual(trees);
  });

  it('jen u silné a dost staré pěšiny, jen na polích a kde smí stát', () => {
    expect(pathsideTrees([line(0.3, 60)], everywhere)).toEqual([]);
    expect(pathsideTrees([line(0.9, PATH_TREE_YEARS.from - 1)], everywhere)).toEqual([]);
    expect(pathsideTrees([line(0.9, 60)], { ...everywhere, nearField: () => false })).toEqual([]);
    const north = pathsideTrees([line(0.9, 60)], { ...everywhere, canPlant: (_x, z) => z > 0 });
    expect(north.length).toBeGreaterThan(0);
    expect(north.every((t) => t.z > 0)).toBe(true);
  });

  it('mladé stromy rostou s věkem pěšiny', () => {
    expect(pathTreeGrowth(PATH_TREE_YEARS.from - 1)).toBe(0);
    expect(pathTreeGrowth(PATH_TREE_YEARS.from)).toBeCloseTo(0.3);
    expect(pathTreeGrowth(PATH_TREE_YEARS.full)).toBe(1);
    const young = pathsideTrees([line(0.9, 8)], everywhere);
    const old = pathsideTrees([line(0.9, 60)], everywhere);
    expect(Math.max(...young.map((t) => t.scale))).toBeLessThan(
      Math.min(...old.map((t) => t.scale)),
    );
  });

  it('dvě souběžné pěšiny: strom nestojí na té druhé', () => {
    const other: PathLine = {
      ...line(0.9, 60),
      points: line(0.9, 60).points.map((p) => ({ x: p.x, z: 3 })),
    };
    const trees = pathsideTrees([line(0.9, 60), other], everywhere);
    for (const t of trees) {
      expect(Math.abs(t.z)).toBeGreaterThanOrEqual(2.2);
      expect(Math.abs(t.z - 3)).toBeGreaterThanOrEqual(2.2);
    }
  });
});
