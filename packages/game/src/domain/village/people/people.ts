import { AGE, FOOD_NEED_KG_PER_YEAR, LABOR_PER_DAY } from '../rules';
import type { Guest, Person, VillageState } from '../types';

const DAYS_PER_YEAR = 365.25; // věk se počítá v celých letech po 365,25 dne
const FOOD_DAYS_PER_YEAR = 365; // roční potřeba jídla se dělí 365 dny

/** Věk v celých letech v daný herní den. */
export function ageYears(bornDay: number, day: number): number {
  return Math.floor((day - bornDay) / DAYS_PER_YEAR);
}

/** Věková skupina: dítě 0–13, dospělý 14–44, starší 45+. */
export function ageGroup(person: Person, day: number): 'child' | 'adult' | 'elder' {
  return ageGroupOf(person.bornDay, day);
}

/** Věková skupina podle dne narození (host – `Guest.bornDay`). */
export function ageGroupOf(bornDay: number, day: number): 'child' | 'adult' | 'elder' {
  const age = ageYears(bornDay, day);
  if (age < AGE.adult) return 'child';
  if (age < AGE.elder) return 'adult';
  return 'elder';
}

/**
 * Pracovní síla vsi (pole a stavby) za den (population.md – Práce): dospělý 1; starší 0 – kryjí jen
 * denní minimum své domácnosti (`adultDailyMin` v labor.ts); dítě 0 – výrostci 7–13 let pasou
 * (herding.ts); zraněný na lovu 0; kdo je pryč na čas (`isAway` – robota…), doma nepracuje.
 */
export function laborPerDay(person: Person, day: number): number {
  if (isInjured(person, day) || isAway(person, day)) return 0;
  return ageGroup(person, day) === 'adult' ? LABOR_PER_DAY.adult : 0;
}

/**
 * Je člověk dnes zraněný na lovu (wildlife.md – Nebezpečí pro lidi), nebo raněný ve válce (war.md
 * – Ztráty)? Nepracuje, necvičí, neloví ani nebojuje.
 */
export function isInjured(
  person: Pick<Person, 'injuredUntilDay' | 'woundedUntil'>,
  day: number,
): boolean {
  return (person.injuredUntilDay ?? 0) > day || (person.woundedUntil ?? 0) > day;
}

/**
 * Je člověk dnes pryč na čas (plán 2026-11-03 – rozhodnutí 11: robota, služba, tažení, zajetí,
 * ochrana)? Do dne `untilDay` (bez něj, dokud nepřítomnost neukončí jiná mechanika).
 */
export function isAway(person: Pick<Person, 'away'>, day: number): boolean {
  const away = person.away;
  return away !== undefined && (away.untilDay === undefined || day < away.untilDay);
}

/**
 * Je člověk ukrytý v lese na mapě vsi (war.md – Varování, poslové a útěk do hradiště): uprchlík
 * (`away` druhu `refuge`) bez hradiště. Je pryč – nepracuje –, ale jí doma (`refugeFoodDay`).
 */
export function hidesInForest(person: Pick<Person, 'away'>): boolean {
  return person.away?.kind === 'refuge' && person.away.hostVillageId === undefined;
}

/**
 * Potřeba jídla na den v kg podle věkové skupiny; kdo je pryč na čas, jí jinde (0) – kromě
 * uprchlíků ukrytých v lese (`hidesInForest`) a mužů na výjezdu (lord-control.md – Výjezd neveze
 * zásoby), ti jedí ze zásob vsi.
 */
export function foodNeedPerDay(person: Person, day: number): number {
  if (isAway(person, day) && !hidesInForest(person) && person.away?.kind !== 'journey') return 0;
  return FOOD_NEED_KG_PER_YEAR[ageGroup(person, day)] / FOOD_DAYS_PER_YEAR;
}

/** Potřeba jídla hosta na den v kg (jí ze zásob hostitele): podle věku, bez `bornDay` dospělý. */
export function guestFoodNeed(guest: Pick<Guest, 'bornDay'>, day: number): number {
  const group = guest.bornDay === undefined ? 'adult' : ageGroupOf(guest.bornDay, day);
  return FOOD_NEED_KG_PER_YEAR[group] / FOOD_DAYS_PER_YEAR;
}

/**
 * Potřeba jídla hostů na den v kg – dospělí jako dospělí vsi (jedí ze zásob hostitele); host se
 * dnem narození (uprchlík – `Guest.bornDay`) podle věku. Hosté bez něj se počítají jako dřív
 * (počet × dospělý), ať výsledek zůstane bit po bitu.
 */
export function guestFoodNeedPerDay(state: Pick<VillageState, 'guests'>, day: number): number {
  let adults = 0;
  let aged = 0;
  for (const g of state.guests ?? []) {
    if (g.untilDay <= day) continue;
    if (g.bornDay === undefined) adults++;
    else aged += guestFoodNeed(g, day);
  }
  return (adults * FOOD_NEED_KG_PER_YEAR.adult) / FOOD_DAYS_PER_YEAR + aged;
}

/**
 * Práce hostů na den (čd) – dospělý 1 (`LABOR_PER_DAY.adult`); zajatci nepracují, host se dnem
 * narození jen jako dospělý 14–44 let (dítě a starší uprchlík ne – jako `laborPerDay`).
 */
export function guestLaborToday(state: Pick<VillageState, 'guests'>, day: number): number {
  let n = 0;
  for (const g of state.guests ?? []) {
    if (g.untilDay <= day || g.kind === 'captive') continue;
    if (g.bornDay === undefined || ageGroupOf(g.bornDay, day) === 'adult') n++;
  }
  return n * LABOR_PER_DAY.adult;
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
