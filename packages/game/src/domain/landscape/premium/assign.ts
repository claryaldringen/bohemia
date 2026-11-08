import { PREMIUM_TYPES } from './catalog';
import type { PremiumType } from './types';

/**
 * Typ prémiové krajiny pro nového lidského hráče (premium-landscapes.md – Kdo dostane jakou
 * krajinu): nejméně zastoupený typ ve světě (`counts` – kolik hráčů má který typ; chybějící = 0),
 * aby typy byly zastoupené zhruba stejně často. Při shodě rozhodne seed (seed krajiny sídla) –
 * deterministicky, bez náhody zvenku. `allowed` omezí výběr na typy, které nabízí místo sídla
 * (world-skeleton.md – Hustota a stejné podmínky, `placeSeat`); na pořadí `allowed` nezáleží –
 * shodné typy jdou v pořadí katalogu. Bez `allowed` všechny typy.
 */
export function choosePremiumType(
  seed: number,
  counts: Partial<Record<PremiumType, number>>,
  allowed?: readonly PremiumType[],
): PremiumType {
  const pool = allowed ? PREMIUM_TYPES.filter((type) => allowed.includes(type)) : PREMIUM_TYPES;
  let least = Infinity;
  for (const type of pool) least = Math.min(least, counts[type] ?? 0);
  const tied = pool.filter((type) => (counts[type] ?? 0) === least);
  const chosen = tied[(seed >>> 0) % tied.length];
  if (chosen === undefined) throw new RangeError('Žádný povolený prémiový typ.');
  return chosen;
}
