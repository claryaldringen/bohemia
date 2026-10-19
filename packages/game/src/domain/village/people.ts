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

/**
 * Pracovní síla vsi (pole a stavby) za den (population.md – Práce): dospělý 1; starší 0 – kryjí jen
 * denní minimum své domácnosti (`adultDailyMin` v labor.ts); dítě 0 – výrostci 7–13 let pasou
 * (herding.ts).
 */
export function laborPerDay(person: Person, day: number): number {
  return ageGroup(person, day) === 'adult' ? LABOR_PER_DAY.adult : 0;
}

/** Potřeba jídla na den v kg podle věkové skupiny. */
export function foodNeedPerDay(person: Person, day: number): number {
  return FOOD_NEED_KG_PER_YEAR[ageGroup(person, day)] / FOOD_DAYS_PER_YEAR;
}

/**
 * Dospělý 14–44 let – pracuje plně, počítá se do čtyř dospělých pro nové obydlí a drží
 * domácnost pohromadě (population.md).
 */
export function isAdult(person: Person, day: number): boolean {
  return ageGroup(person, day) === 'adult';
}

/** Může mít děti: 16–44 let (population.md – Růst populace; porody od 16, ne od dospělosti). */
export function isFertile(person: Person, day: number): boolean {
  const age = ageYears(person.bornDay, day);
  return age >= AGE.fertile && age < AGE.elder;
}

/** Žena, která může rodit: 16–44 let (kinship.md – Pohlaví). */
export function canBear(person: Person, day: number): boolean {
  return person.sex === 'female' && isFertile(person, day);
}

/** Muž, který může zplodit dítě: od 16 let bez horní meze (kinship.md – Pohlaví). */
export function canFather(person: Person, day: number): boolean {
  return person.sex === 'male' && ageYears(person.bornDay, day) >= AGE.fertile;
}

/**
 * Drží člověk domácnost pohromadě? Muž nebo žena 16–44 let (kinship.md – Domácnosti: dům bez
 * dospělého muže i ženy od 16 let – jen děti, nebo jen starší – se rozpadne).
 */
export function holdsHousehold(person: Person, day: number): boolean {
  return isFertile(person, day);
}

/**
 * Dojde k rozpadu domácnosti? Nikdo 16–44 let – jen děti, nebo jen starší (kinship.md –
 * Domácnosti; population.md – Rozpad domácnosti). Jediný člověk 16–44 se nerozpadá – je svobodný
 * a vezme se (Martin, 18. 10. 2026 – nejstarší dítě smí odejít samo).
 */
export function householdBreaksUp(members: readonly Person[], day: number): boolean {
  return members.length > 0 && !members.some((p) => holdsHousehold(p, day));
}

/** Obyvatelé obydlí seřazení podle id. */
export function occupants(state: VillageState, dwellingId: number): Person[] {
  return state.people.filter((p) => p.dwellingId === dwellingId).sort((a, b) => a.id - b.id);
}
