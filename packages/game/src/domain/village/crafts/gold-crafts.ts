// Dílny zlata (plán 6, issue #13; gold.md – Pravidla 2, 4, 5): rýžovník, šperkař a mincíř.
import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { goldPlacers } from '../core/premium-effects';
import { MINT, PANNING } from '../rules/rules-gold';
import type { Craft } from '../types/types-crafts';
import type { VillageState } from '../types';

/** Dílny zlata – správce je nestaví a nepočítá s nimi (Rozhodnutí plánu 6, bod 10). */
export const GOLD_CRAFTS: readonly Craft[] = ['panner', 'jeweller', 'minter'];

/** Rýžovník nejde postavit na krajině bez zlatonosného náplavu (gold.md – Pravidla 1). */
export const PANNER_NO_PLACER = 'Bez zlatonosného náplavu';
/** Všechny náplavy krajiny jsou vyrýžované (gold.md – Pravidla 3). */
export const PANNER_PLACERS_EMPTY = 'Náplavy jsou vyrýžované';
/** Mincovna až od 1. 1. `MINT.fromYear` (gold.md – Pravidla 5). */
export const MINT_YEAR = `Od roku ${MINT.fromYear}`;

/** Zbývá na náplavu `index` (g) – `PANNING.placerG` − `goldPanned[index]`, nejméně 0. */
export function placerLeftG(state: Pick<VillageState, 'goldPanned'>, index: number): number {
  return Math.max(0, PANNING.placerG - (state.goldPanned?.[index] ?? 0));
}

/** Důvod, proč dílnu nejde postavit (gold.md – Pravidla 1 a 3), jinak null; ostatní řemesla null. */
export function workshopBlocked(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  craft: Craft,
): string | null {
  if (craft === 'panner') {
    const placers = goldPlacers(landscape);
    if (placers.length === 0) return PANNER_NO_PLACER;
    return placers.every((_, index) => placerLeftG(state, index) <= 0)
      ? PANNER_PLACERS_EMPTY
      : null;
  }
  if (craft === 'minter') return dateOfDayIndex(day).year >= MINT.fromYear ? null : MINT_YEAR;
  return null;
}
