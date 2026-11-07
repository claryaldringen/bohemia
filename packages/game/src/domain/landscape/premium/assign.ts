import { PREMIUM_TYPES } from './catalog';
import type { PremiumType } from './types';

/**
 * Typ prémiové krajiny pro nového lidského hráče (premium-landscapes.md – Kdo dostane jakou
 * krajinu): nejméně zastoupený typ ve světě (`counts` – kolik hráčů má který typ; chybějící = 0),
 * aby typy byly zastoupené zhruba stejně často. Při shodě rozhodne seed (seed krajiny sídla) –
 * deterministicky, bez náhody zvenku. Typy kostry světa (řeka, brod, průsmyk, soutok) zatím
 * mohou kamkoli – do vzniku kostry mají jen místní vstup a výstup (premium-landscapes.md –
 * Kostra světa).
 */
export function choosePremiumType(
  seed: number,
  counts: Partial<Record<PremiumType, number>>,
): PremiumType {
  let least = Infinity;
  for (const type of PREMIUM_TYPES) least = Math.min(least, counts[type] ?? 0);
  const tied = PREMIUM_TYPES.filter((type) => (counts[type] ?? 0) === least);
  const chosen = tied[(seed >>> 0) % tied.length];
  if (chosen === undefined) throw new RangeError('Katalog prémiových typů je prázdný.');
  return chosen;
}
