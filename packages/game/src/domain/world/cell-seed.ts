import { deriveSeed } from '../landscape/random';
import type { GridCell } from '../village/world-grid';

/** Rezerva pod stropem sloupce `landscape_seed` (int32) pro další pokusy `generateAcceptedLandscape`. */
const ATTEMPT_HEADROOM = 1024;

/**
 * Seed krajiny políčka mřížky světa – odvozený z hlavního seedu světa a souřadnic, zúžený do
 * rozsahu, který uloží sloupec `landscape_seed` (0 … 2^31 − 1), i s rezervou na další pokusy
 * hledání přijaté krajiny. Jediný zdroj seedu políčka – ves i prázdná mapa (tažení) z něj mají
 * stejnou krajinu.
 */
export function cellLandscapeSeed(worldSeed: number, cell: GridCell): number {
  return deriveSeed(worldSeed, `cell:${cell.x},${cell.y}`) % (2 ** 31 - ATTEMPT_HEADROOM);
}
