// Dílny zlata (plán 6, issue #13; gold.md – Pravidla 2, 4, 5): rýžovník, šperkař a mincíř.
import type { Craft } from '../types/types-crafts';

/** Dílny zlata – správce je nestaví a nepočítá s nimi (Rozhodnutí plánu 6, bod 10). */
export const GOLD_CRAFTS: readonly Craft[] = ['panner', 'jeweller', 'minter'];
