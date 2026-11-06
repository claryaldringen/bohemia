import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, generateAcceptedLandscape } from '../../domain/landscape';
import { cellLandscapeSeed } from '../../domain/world';
import { emptyCellLandscape, emptyCellMarchGrid, settledCellLandscape } from '../cell-landscape';

// Krajina prázdného políčka pro tažení (war.md – Pohyb – mapu po mapě).

describe('krajina políčka světa', () => {
  it('prázdné políčko má tutéž krajinu, jakou by dostala nová ves', () => {
    const cell = { x: 2, y: -1 };
    const empty = emptyCellLandscape(7, cell);
    const village = generateAcceptedLandscape(cellLandscapeSeed(7, cell));
    expect(empty.seed).toBe(village.seed);
    expect(empty.landscape.heights).toEqual(village.landscape.heights);
    expect(empty.obstacles.count).toBeGreaterThan(0);
    const settled = settledCellLandscape(empty.seed, CURRENT_LAYER_VERSIONS);
    expect(settled.landscape.surface).toEqual(empty.landscape.surface);
  });

  it('mřížka pochodu prázdného políčka pokryje celou mapu', () => {
    const grid = emptyCellMarchGrid(7, { x: 0, y: 1 });
    expect(grid.width * grid.cellM).toBe(1920);
    expect(grid.pace.some((p) => p > 0)).toBe(true);
  });
});
