import { deriveSeed } from '../landscape/random';
import type { GridCell } from '../village/world-grid';

/** Seed krajiny políčka mřížky světa – odvozený z hlavního seedu světa a souřadnic. */
export function cellLandscapeSeed(worldSeed: number, cell: GridCell): number {
  return deriveSeed(worldSeed, `cell:${cell.x},${cell.y}`);
}
