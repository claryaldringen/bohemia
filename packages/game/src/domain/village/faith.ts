// Víra a objev křesťanství (christianity.md) – čisté funkce.

import { createRandom, deriveSeed } from '../landscape/random';
import { FAITH } from './rules-faith';
import { THREE_FIELD_FROM_YEAR } from './rules-fields';
import type { Person, VillageState } from './types';

/** Roční šance, že rod narazí na křesťanství (christianity.md – Objev); v roce 500 nulová. */
export function christianityChance(year: number): number {
  const { a, k, fromYear } = FAITH.discovery;
  if (year <= fromYear) return 0;
  return Math.min(1, a * (Math.exp(k * (year - fromYear)) - 1));
}

/**
 * První rok z intervalu <fromYear, toYear>, kdy rodu padl los objevu (rok po roku
 * `deriveSeed(seed, 'faith:' + rok)`), jinak null. Přehrání za víc let naráz dá totéž
 * co losování každý rok zvlášť.
 */
export function discoveryYear(seed: number, fromYear: number, toYear: number): number | null {
  for (let year = fromYear; year <= toYear; year++) {
    if (createRandom(deriveSeed(seed, 'faith:' + year)).next() < christianityChance(year)) {
      return year;
    }
  }
  return null;
}

export function isChristian(p: Person): boolean {
  return p.faith === 'christian';
}

/** Je rod pokřtěný (christianity.md – Křest rodu). */
export function rodBaptized(state: VillageState): boolean {
  return state.faith?.rodBaptizedDay !== undefined;
}

/** Trojpolí smí od roku 1100 jen pokřtěný rod (christianity.md – Co křest rodu umožní). */
export function threeFieldAllowed(year: number, baptized: boolean): boolean {
  return baptized && year >= THREE_FIELD_FROM_YEAR;
}
