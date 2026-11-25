import { describe, expect, it } from 'vitest';
import type { SkeletonSlice } from '../../landscape/skeleton/types';
import type { GridCell } from '../../village/people/world-grid';
import { cellDistance } from '../placement';
import { nearestCellAround, sonCellNear } from '../dry-cell';
import { WORLD } from '../rules-world';
import { createSkeletonCache, isDry, skeletonSlice } from '../skeleton';

// Ves syna na suché mapě nebo na stezce bez řeky (world-skeleton.md – Otevřené otázky 3;
// markets.md – Rozhodnutí plánu 4, bod 11 – Martin 22. 11. 2026: „ok“).

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

describe('sonCellNear', () => {
  // seed světa 1 (world.md – Kostra světa): řeka (8, −5) vedle stezky (7, −5) a (7, −6), řeka se
  // stezkou (7, −4), křižovatka (9, 13) a konec stezky (−10, 26)
  const SEED = 1;
  const cache = createSkeletonCache(SEED);
  const sliceAt = (cell: GridCell): SkeletonSlice | null => skeletonSlice(SEED, cell, cache);
  const rivers = (cell: GridCell): number => sliceAt(cell)?.rivers.length ?? 0;
  /** Políčkem vede stezka a žádná řeka – pomocník testu, nezávislý na `isTrailOnly`. */
  const onTrail = (cell: GridCell): boolean => {
    const slice = sliceAt(cell);
    return slice !== null && slice.trails.length > 0 && slice.rivers.length === 0;
  };

  it('políčko s řekou nahradí nejbližší bez řeky – stezka má přednost před vzdálenějším suchým', () => {
    const from = { x: 8, y: -6 };
    const target = { x: 8, y: -5 };
    expect(isDry(sliceAt(from))).toBe(true);
    expect(rivers(target)).toBeGreaterThan(0);
    expect(onTrail({ x: 7, y: -5 })).toBe(true);
    expect(onTrail({ x: 7, y: -6 })).toBe(true);
    expect(sonCellNear(SEED, from, target)).toEqual({ x: 7, y: -5 });
    // stezka, kterou `allowed` odmítne (cizí mapa) – další stezka vedle, bez stezek až suché políčko
    expect(sonCellNear(SEED, from, target, (c) => key(c) !== '7,-5')).toEqual({ x: 7, y: -6 });
    const dry = sonCellNear(SEED, from, target, (c) => !onTrail(c));
    expect(dry).toEqual({ x: 9, y: -4 });
    expect(isDry(sliceAt(dry!))).toBe(true);
  });

  it('políčko se stezkou zůstane – průchod, křižovatka i konec stezky', () => {
    const cells = [
      { x: 7, y: -1 },
      { x: 9, y: 13 },
      { x: -10, y: 26 },
    ];
    expect(cells.map((c) => sliceAt(c)?.trails.length)).toEqual([2, 4, 1]);
    for (const cell of cells) {
      expect(rivers(cell)).toBe(0);
      expect(sonCellNear(SEED, { x: cell.x + 1, y: cell.y }, cell, () => true, cache)).toEqual(
        cell,
      );
    }
  });

  it('řeka se stezkou nezůstane', () => {
    const target = { x: 7, y: -4 };
    expect(sliceAt(target)?.trails.length).toBe(2);
    expect(rivers(target)).toBeGreaterThan(0);
    expect(sonCellNear(SEED, { x: 8, y: -3 }, target)).toEqual({ x: 7, y: -3 });
  });

  it('pořadí prstenců beze změny: první bez řeky v pořadí `nearestCellAround`', () => {
    let trails = 0;
    let dry = 0;
    for (let y = -14; y <= 14; y++) {
      for (let x = -14; x <= 14; x++) {
        const target = { x, y };
        if (rivers(target) === 0) continue;
        for (const from of [
          { x: x + 1, y },
          { x: x - 1, y: y - 1 },
        ]) {
          const cell = sonCellNear(SEED, from, target, () => true, cache);
          expect(cell).toEqual(nearestCellAround(from, target, (c) => rivers(c) === 0));
          expect(cell).not.toBeNull();
          expect(rivers(cell!)).toBe(0);
          expect(cell).not.toEqual(from);
          expect(cellDistance(cell!, target)).toBeLessThanOrEqual(WORLD.sonDryRings);
          if (onTrail(cell!)) trails++;
          else dry++;
        }
      }
    }
    // obojí se v okně opravdu vyskytne
    expect(trails).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(trails);
  });

  it('suché políčko zůstane; odmítnuté políčko (cizí mapa) se přeskočí', () => {
    const dry = { x: 0, y: 0 };
    expect(isDry(skeletonSlice(SEED, dry))).toBe(true);
    expect(sonCellNear(SEED, { x: 1, y: 0 }, dry)).toEqual(dry);
    const other = sonCellNear(SEED, { x: 1, y: 0 }, dry, (c) => !(c.x === 0 && c.y === 0));
    expect(other).not.toEqual(dry);
    expect(isDry(skeletonSlice(SEED, other!))).toBe(true);
  });

  it('v dosahu nic – null', () => {
    expect(sonCellNear(SEED, { x: 8, y: -6 }, { x: 8, y: -5 }, () => false, cache)).toBeNull();
  });

  it('mezipaměť jiného seedu světa odmítne', () => {
    expect(() =>
      sonCellNear(SEED, { x: 0, y: 0 }, { x: 0, y: 1 }, () => true, createSkeletonCache(2)),
    ).toThrow(RangeError);
  });
});
