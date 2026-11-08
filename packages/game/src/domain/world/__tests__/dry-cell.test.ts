import { describe, expect, it } from 'vitest';
import { cellDistance } from '../placement';
import { dryCellNear, nearestCellAround } from '../dry-cell';
import { WORLD } from '../rules-world';
import { createSkeletonCache, isDry, skeletonSlice } from '../skeleton';

// Ves syna jen na suché mapě (world-skeleton.md – Otevřené otázky 3).

const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`;

describe('nearestCellAround', () => {
  const from = { x: 0, y: 0 };
  const north = { x: 0, y: 1 };

  it('vhodné políčko ve směru zůstane', () => {
    expect(nearestCellAround(from, north, () => true)).toEqual(north);
  });

  it('jinak soused výchozí mapy nejblíž směru, pak dál od ní', () => {
    const order: string[] = [];
    nearestCellAround(from, north, (c) => {
      order.push(key(c));
      return false;
    });
    // prstenec 1 kolem (0, 1): sousedé (0, 0) blíž směru (NE, NW), pak bokem (E, W), pak dál
    expect(order.slice(0, 8)).toEqual(['0,1', '1,1', '-1,1', '1,0', '-1,0', '0,2', '1,2', '-1,2']);
    expect(order).not.toContain('0,0');
    expect(nearestCellAround(from, north, (c) => c.x === -1 && c.y === 0)).toEqual({
      x: -1,
      y: 0,
    });
  });

  it('úhlopříčný směr: nejdřív sousedé obou map', () => {
    const order: string[] = [];
    nearestCellAround(from, { x: 1, y: 1 }, (c) => {
      order.push(key(c));
      return false;
    });
    expect(order.slice(0, 3)).toEqual(['1,1', '1,0', '0,1']);
  });

  it('v dosahu nic – null; dosah je `sonDryRings` prstenců', () => {
    let farthest = 0;
    const found = nearestCellAround(from, north, (c) => {
      farthest = Math.max(farthest, cellDistance(c, north));
      return false;
    });
    expect(found).toBeNull();
    expect(farthest).toBe(WORLD.sonDryRings);
  });
});

describe('dryCellNear', () => {
  // seed světa 1: okolí (−4, −2) až (−2, −4) má řeky (kostra světa – world.md)
  const SEED = 1;

  it('políčko s kostrou nahradí nejbližší suché vedle výchozí mapy', () => {
    const cache = createSkeletonCache(SEED);
    let checked = 0;
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const target = { x, y };
        if (isDry(skeletonSlice(SEED, target, cache))) continue;
        const from = { x: x + 1, y };
        const cell = dryCellNear(SEED, from, target, () => true, cache);
        expect(cell).not.toBeNull();
        expect(isDry(skeletonSlice(SEED, cell!, cache))).toBe(true);
        expect(cell).not.toEqual(from);
        expect(cellDistance(cell!, target)).toBeLessThanOrEqual(WORLD.sonDryRings);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('suché políčko zůstane; odmítnuté políčko (cizí mapa) se přeskočí', () => {
    const dry = { x: 0, y: 0 };
    expect(isDry(skeletonSlice(SEED, dry))).toBe(true);
    expect(dryCellNear(SEED, { x: 1, y: 0 }, dry)).toEqual(dry);
    const other = dryCellNear(SEED, { x: 1, y: 0 }, dry, (c) => !(c.x === 0 && c.y === 0));
    expect(other).not.toEqual(dry);
    expect(isDry(skeletonSlice(SEED, other!))).toBe(true);
  });

  it('mezipaměť jiného seedu světa odmítne', () => {
    expect(() =>
      dryCellNear(SEED, { x: 0, y: 0 }, { x: 0, y: 1 }, () => true, createSkeletonCache(2)),
    ).toThrow(RangeError);
  });
});
