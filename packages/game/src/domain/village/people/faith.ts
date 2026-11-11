// Víra a objev křesťanství (christianity.md) – čisté funkce.

import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import { FAITH } from '../rules/rules-faith';
import { THREE_FIELD_FROM_YEAR } from '../rules/rules-fields';
import type { Person, VillageFaith, VillageState } from '../types';

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

/** Seed rodu pro los víry (christianity.md – Objev; návrh Clauda): ze seedu světa a id rodu. */
export function houseFaithSeed(worldSeed: number, houseId: string): number {
  return deriveSeed(worldSeed, 'house:' + houseId);
}

/**
 * První rok losu objevu rodu založeného ve dni `foundedDay` (christianity.md – Objev): los roku Y
 * padá 1. 1. Y rodům, které tehdy žijí – rod založený během roku losuje poprvé příští 1. 1.
 * (návrh Clauda). Den před začátkem světa = rok 500.
 */
export function firstDiscoveryYear(foundedDay: number): number {
  const day = Math.max(0, foundedDay);
  const { year } = dateOfDayIndex(day);
  return day === dayIndexOf({ year, month: 1, day: 1 }) ? year : year + 1;
}

/**
 * Rok křtu NPC rodu, který zná křesťanství od roku `knownYear` (christianity.md – Křest rodu):
 * `knownYear` + 1–20 let, los ze seedu rodu (`houseFaithSeed`).
 */
export function npcBaptismYear(houseSeed: number, knownYear: number): number {
  const { min, max } = FAITH.npcBaptismYears;
  const roll = createRandom(deriveSeed(houseSeed, 'npc-baptism')).next();
  return knownYear + min + Math.floor(roll * (max - min + 1));
}

export function isChristian(p: Person): boolean {
  return p.faith === 'christian';
}

/**
 * Je rod, který ves řídí, pokřtěný (christianity.md – Křest rodu)? Rod hráče, kterému ves patří
 * (`faith.rodBaptizedDay`); ves, kterou řídí NPC rod (`nobles`), podle jeho křtu (`faith.nobles`) –
 * po konci NPC rodu zase podle rodu hráče.
 */
export function rodBaptized(state: Pick<VillageState, 'faith' | 'nobles'>): boolean {
  if (state.nobles) return state.faith?.nobles?.houseId === state.nobles.houseId;
  return state.faith?.rodBaptizedDay !== undefined;
}

/**
 * Ves přešla k jinému držiteli (odúmrť, postoupení – christianity.md – Vsi rodu): křest rodu hráče
 * se přepočte podle nového rodu – `baptizedDay` je den jeho křtu, null = nepokřtěný (příznak
 * zmizí). Zničená posvátná místa (`desecrated`) zůstávají – lid si je pamatuje – a křest NPC rodu,
 * který ves řídí (`nobles`), také. Beze změny vrací týž stav; jinak kopii (vstup nemění).
 */
export function withHolderFaith(state: VillageState, baptizedDay: number | null): VillageState {
  if ((state.faith?.rodBaptizedDay ?? null) === baptizedDay) return state;
  const rest: VillageFaith = { ...state.faith };
  delete rest.rodBaptizedDay;
  const faith: VillageFaith =
    baptizedDay === null ? rest : { ...rest, rodBaptizedDay: baptizedDay };
  if (Object.keys(faith).length > 0) return { ...state, faith };
  const next = { ...state };
  delete next.faith;
  return next;
}

/** Trojpolí smí od roku 1100 jen pokřtěný rod (christianity.md – Co křest rodu umožní). */
export function threeFieldAllowed(year: number, baptized: boolean): boolean {
  return baptized && year >= THREE_FIELD_FROM_YEAR;
}
