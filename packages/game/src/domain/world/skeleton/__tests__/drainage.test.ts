import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import {
  createSkeletonCache,
  drainTarget,
  riverWidthM,
  SKELETON,
  SKELETON_SALT,
  skeletonBase,
  upstreamSize,
  cellUnit,
} from '..';

const SEED = 7;

/** 1000 políček rozházených po okně ±500 map (deterministicky). */
function sampleCells(count: number): { x: number; y: number }[] {
  const random = createRandom(SEED);
  return Array.from({ length: count }, () => ({
    x: Math.floor(random.next() * 1000) - 500,
    y: Math.floor(random.next() * 1000) - 500,
  }));
}

describe('drainTarget', () => {
  it('vede na jih, nebo v řádku k nižšímu číslu klidu – sled 500 kroků se nevrátí', () => {
    const base = skeletonBase(SEED);
    const calm = (c: { x: number; y: number }) => cellUnit(base, SKELETON_SALT.calm, c.x, c.y);
    for (const start of sampleCells(1000)) {
      const visited = new Set<string>([`${start.x},${start.y}`]);
      let cell = start;
      for (let step = 0; step < 500; step++) {
        const next = drainTarget(SEED, cell);
        const south = next.x === cell.x && next.y === cell.y - 1;
        const lateral = next.y === cell.y && Math.abs(next.x - cell.x) === 1;
        expect(south || (lateral && calm(next) < calm(cell))).toBe(true);
        const key = `${next.x},${next.y}`;
        expect(visited.has(key)).toBe(false);
        visited.add(key);
        cell = next;
      }
    }
  });

  it('bokem odtéká zhruba čtvrtina políček', () => {
    const cells = sampleCells(1000);
    const lateral = cells.filter((c) => drainTarget(SEED, c).y === c.y).length;
    expect(lateral / cells.length).toBeGreaterThan(0.18);
    expect(lateral / cells.length).toBeLessThan(0.32);
  });
});

describe('upstreamSize', () => {
  it('nejvýš upstreamCap a po proudu neklesá', () => {
    const cache = createSkeletonCache(SEED);
    for (const cell of sampleCells(300)) {
      let size = upstreamSize(SEED, cell, cache);
      let current = cell;
      for (let step = 0; step < 40; step++) {
        expect(size).toBeGreaterThanOrEqual(1);
        expect(size).toBeLessThanOrEqual(SKELETON.river.upstreamCap);
        current = drainTarget(SEED, current);
        const below = upstreamSize(SEED, current, cache);
        expect(below).toBeGreaterThanOrEqual(Math.min(size + 1, SKELETON.river.upstreamCap));
        size = below;
      }
    }
  });

  it('bez mezipaměti stejně jako s ní', () => {
    const cache = createSkeletonCache(SEED);
    for (const cell of sampleCells(200)) {
      expect(upstreamSize(SEED, cell)).toBe(upstreamSize(SEED, cell, cache));
    }
  });
});

describe('riverWidthM', () => {
  it('šířka podle povodí, pod 500 bez řeky', () => {
    expect(riverWidthM(1)).toBeNull();
    expect(riverWidthM(499)).toBeNull();
    expect(riverWidthM(500)).toBe(25);
    expect(riverWidthM(849)).toBe(25);
    expect(riverWidthM(850)).toBe(30);
    expect(riverWidthM(1600)).toBe(35);
    expect(riverWidthM(3799)).toBe(35);
    expect(riverWidthM(3800)).toBe(40);
    expect(riverWidthM(11999)).toBe(40);
    expect(riverWidthM(12000)).toBe(45);
  });
});
