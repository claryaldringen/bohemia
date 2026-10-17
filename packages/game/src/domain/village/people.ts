import { AGE, FOOD_NEED_KG_PER_YEAR, LABOR_PER_DAY } from './rules';
import type { Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25; // věk se počítá v celých letech po 365,25 dne
const FOOD_DAYS_PER_YEAR = 365; // roční potřeba jídla se dělí 365 dny

/** Věk v celých letech v daný herní den. */
export function ageYears(bornDay: number, day: number): number {
  return Math.floor((day - bornDay) / DAYS_PER_YEAR);
}

/** Věková skupina: dítě 0–13, dospělý 14–44, starší 45+. */
export function ageGroup(person: Person, day: number): 'child' | 'adult' | 'elder' {
  const age = ageYears(person.bornDay, day);
  if (age < AGE.adult) return 'child';
  if (age < AGE.elder) return 'adult';
  return 'elder';
}

/** Pracovní síla za den: dítě do 7 let 0, starší dítě 0,3, dospělý 1, starší 0,5. */
export function laborPerDay(person: Person, day: number): number {
  const group = ageGroup(person, day);
  if (group === 'adult') return LABOR_PER_DAY.adult;
  if (group === 'elder') return LABOR_PER_DAY.elder;
  return ageYears(person.bornDay, day) >= AGE.olderChild ? LABOR_PER_DAY.olderChild : 0;
}

/** Potřeba jídla na den v kg podle věkové skupiny. */
export function foodNeedPerDay(person: Person, day: number): number {
  return FOOD_NEED_KG_PER_YEAR[ageGroup(person, day)] / FOOD_DAYS_PER_YEAR;
}

/** Plodný dospělý (14–44 let). */
export function isFertileAdult(person: Person, day: number): boolean {
  return ageGroup(person, day) === 'adult';
}

/** Obyvatelé obydlí seřazení podle id. */
export function occupants(state: VillageState, dwellingId: number): Person[] {
  return state.people.filter((p) => p.dwellingId === dwellingId).sort((a, b) => a.id - b.id);
}
