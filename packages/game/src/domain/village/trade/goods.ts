// Zboží obchodu (trade.md – Sousedé; Martin 19. 10. 2026: „Nech jen společné suroviny, nezaváděj
// nové.“): jen to, co ves sama má – seznamy v pořadí panelu a druhy dobytka a koní. Smyšlení
// sousedé za krajem mapy skončili (markets.md – Pravidla 1); seznamy dál nesou výpravy na cestě,
// zásilky vazalů a platby (ohrada koní).
import type { CattleGood, HorseGood, TradeGood } from '../types';

/** Druhy dobytka v obchodu v pořadí panelu (trade.md – Dobytek ve třech druzích). */
export const CATTLE_GOODS: readonly CattleGood[] = ['cows', 'youngOxen', 'trainedOxen'];

/** Je zboží dobytek (krávy, mladí nebo vycvičení voli)? */
export function isCattleGood(good: string): good is CattleGood {
  return (CATTLE_GOODS as readonly string[]).includes(good);
}

/** Druhy koní v obchodu v pořadí panelu (horses.md – Nákup a prodej). */
export const HORSE_GOODS: readonly HorseGood[] = ['foals', 'mares', 'ridingHorses'];

/** Je zboží kůň (hříbě, klisna nebo jezdecký kůň)? */
export function isHorseGood(good: string): good is HorseGood {
  return (HORSE_GOODS as readonly string[]).includes(good);
}

/** Jde zboží po svých s honákem (dobytek a koně) – nese ho nikdo? */
export function isLivestockGood(good: string): good is CattleGood | HorseGood {
  return isCattleGood(good) || isHorseGood(good);
}

/** Zboží obchodu v pořadí panelu (obilí a jídlo, dobytek, koně a dřevo, výrobky řemesel). */
export const TRADE_GOODS: readonly TradeGood[] = [
  'grain',
  'legumes',
  'meat',
  'cheese',
  ...CATTLE_GOODS,
  ...HORSE_GOODS,
  'logs',
  'pottery',
  'ironBars',
  'charcoal',
  'stone',
  'honey',
  'hides',
  'furs',
  'wax',
];

/**
 * Kusové zboží v pořadí panelu – dobytek, koně, klády, kámen (m³), kůže a kožešiny (jednotky jako
 * `TRADE_GOOD_NAMES` ve webu: kusy a m³); ostatní zboží je v kg. Na trhu se prodává jen po celých
 * kusech, kg se dělí libovolně (markets.md – Rozhodnutí plánu 2, bod 4).
 */
export const PIECE_GOODS: readonly TradeGood[] = [
  ...CATTLE_GOODS,
  ...HORSE_GOODS,
  'logs',
  'stone',
  'hides',
  'furs',
];

/** Je zboží kusové (kusy nebo m³, ne kg)? */
export function isPieceGood(good: TradeGood): boolean {
  return PIECE_GOODS.includes(good);
}
