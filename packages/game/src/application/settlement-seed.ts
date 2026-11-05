import { cellLandscapeSeed } from '../domain/world';
import type { WorldCell } from './settlements';

/** Rezerva pod stropem sloupce `landscape_seed` (int32) pro další pokusy `generateAcceptedLandscape`. */
const ATTEMPT_HEADROOM = 1024;

/**
 * Základ seedu krajiny nové mapy na políčku světa: `cellLandscapeSeed` zúžený do rozsahu, který
 * uloží sloupec `landscape_seed` (celé číslo se znaménkem, 0 … 2^31 − 1) i s rezervou na další
 * pokusy hledání přijaté krajiny. Určuje ho jen seed světa a políčko, takže je deterministický.
 */
export function settlementSeedOf(worldSeed: number, cell: WorldCell): number {
  return cellLandscapeSeed(worldSeed, cell) % (2 ** 31 - ATTEMPT_HEADROOM);
}
