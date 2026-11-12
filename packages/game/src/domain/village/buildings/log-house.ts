// Nadzemní dům a dvorec od roku 800 (docs/design/log-house.md – Dům, Dvorec od roku 800).
// Od 1. 1. 800 jde stavět nadzemní srubový dům (`srub`) a dvorec postavený nebo přestavěný od té
// doby je nadzemní srub (`dvorec-srub`). Čisté funkce bez I/O.
import { dateOfDayIndex } from '../../calendar';
import { LOG_HOUSE } from '../rules';
import type { DwellingType } from '../types';

/** Důvod u kurzoru, proč nadzemní dům ještě nejde (log-house.md – Dům: „Od roku 800“). */
export const LOG_HOUSE_YEAR = `Od roku ${LOG_HOUSE.fromYear}`;

/** Je den `day` v roce nadzemních domů (od 1. 1. `LOG_HOUSE.fromYear`)? */
function logHouseYear(day: number): boolean {
  return dateOfDayIndex(day).year >= LOG_HOUSE.fromYear;
}

/**
 * Důvod, proč obydlí `type` v den `day` ještě nejde stavět – nadzemní dům do 31. 12. 799
 * (`LOG_HOUSE_YEAR`), jinak null. Ostatní obydlí kdykoli.
 */
export function dwellingYearReason(type: DwellingType, day: number): string | null {
  if (type !== 'srub') return null;
  return logHouseYear(day) ? null : LOG_HOUSE_YEAR;
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
