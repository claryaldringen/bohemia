// Nadzemní domy a dvorec od roku 800 (docs/design/log-house.md – Dům, Dům s vypletenými stěnami
// od roku 750, Dvorec od roku 800). Od 1. 1. 750 jde stavět vypletený dům (`vypleteny`), od 1. 1.
// 800 roubený srub (`srub`) a dvorec postavený nebo přestavěný od té doby je nadzemní srub
// (`dvorec-srub`). Čisté funkce bez I/O.
import { dateOfDayIndex } from '../../calendar';
import { DWELLING_QUALITY, LOG_HOUSE, WATTLE_HOUSE } from '../rules';
import type { DwellingType } from '../types';

/** Důvod u kurzoru, proč nadzemní dům ještě nejde (log-house.md – Dům: „Od roku 800“). */
export const LOG_HOUSE_YEAR = `Od roku ${LOG_HOUSE.fromYear}`;
/** Důvod u kurzoru, proč vypletený dům ještě nejde (log-house.md – Dům s vypletenými stěnami). */
export const WATTLE_HOUSE_YEAR = `Od roku ${WATTLE_HOUSE.fromYear}`;

/** Nadzemní dům, který staví hráč a správce – vypletený nebo roubený (srub). */
export type HouseType = 'vypleteny' | 'srub';
/** Nadzemní domy od nejlepšího (`DWELLING_QUALITY`) – v tomto pořadí se osídlují. */
export const HOUSE_TYPES_BEST_FIRST: readonly HouseType[] = (
  ['vypleteny', 'srub'] as HouseType[]
).sort((a, b) => DWELLING_QUALITY[b] - DWELLING_QUALITY[a]);

/** Je typ obydlí nadzemním domem (vypletený nebo srub)? Dvorec ne – to je dvorec. */
export function isHouseType(type: DwellingType): type is HouseType {
  return type === 'vypleteny' || type === 'srub';
}

/** Je den `day` v roce nadzemních domů (od 1. 1. `LOG_HOUSE.fromYear`)? */
function logHouseYear(day: number): boolean {
  return dateOfDayIndex(day).year >= LOG_HOUSE.fromYear;
}

/**
 * Důvod, proč obydlí `type` v den `day` ještě nejde stavět – vypletený dům do 31. 12. 749
 * (`WATTLE_HOUSE_YEAR`), srub do 31. 12. 799 (`LOG_HOUSE_YEAR`), jinak null. Ostatní obydlí
 * kdykoli.
 */
export function dwellingYearReason(type: DwellingType, day: number): string | null {
  if (type === 'vypleteny') {
    return dateOfDayIndex(day).year >= WATTLE_HOUSE.fromYear ? null : WATTLE_HOUSE_YEAR;
  }
  if (type !== 'srub') return null;
  return logHouseYear(day) ? null : LOG_HOUSE_YEAR;
}

/**
 * Nejlepší nadzemní dům, který jde v den `day` stavět (správce – log-house.md – Správce): od roku
 * 800 srub, od 750 vypletený dům, dřív žádný (null).
 */
export function bestHouseTypeOn(day: number): HouseType | null {
  return HOUSE_TYPES_BEST_FIRST.find((t) => dwellingYearReason(t, day) === null) ?? null;
}

/** Je typ obydlí dvorcem vojvody – `dvorec` (do roku 800), nebo `dvorec-srub` (od roku 800)? */
export function isManorType(type: DwellingType): type is 'dvorec' | 'dvorec-srub' {
  return type === 'dvorec' || type === 'dvorec-srub';
}

/**
 * Typ dvorce postaveného nebo přestavěného v den `day` (log-house.md – Dvorec od roku 800):
 * od 1. 1. 800 nadzemní srub, dřív `dvorec`.
 */
export function manorTypeOn(day: number): 'dvorec' | 'dvorec-srub' {
  return logHouseYear(day) ? 'dvorec-srub' : 'dvorec';
}
