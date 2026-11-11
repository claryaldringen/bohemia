// Venkovní práce podle světla (population.md – Skladba dne podle ročního období; Martin
// 9. 11. 2026): kolik dnešního člověkodne dá den venkovní práce vsi – plán (kapacita setí, výhled
// správce) i práce dne (`work()`) berou délku dne odsud. Jen deterministická matematika.

import { dateOfDayIndex, isLeapYear, monthLength } from '../../calendar';
import { DAYLIGHT_WORK } from '../rules';

const MONTHS = 12;
/** Délka měsíce v roce (nepřestupný – únor přestupného roku řeší `monthLength`). */
const COMMON_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const hoursOf = (month: number): number => DAYLIGHT_WORK.hours[(month + MONTHS - 1) % MONTHS]!;
const lengthOf = (month: number, leap: boolean): number =>
  month === 2 && leap ? 29 : COMMON_MONTH_DAYS[(month + MONTHS - 1) % MONTHS]!;

/**
 * Hodiny venkovní práce v den `dayOfMonth` měsíce `month` (1–12) roku s přestupným únorem `leap`:
 * lineárně mezi polovinami měsíců (polovina = (délka + 1) ÷ 2, DAYLIGHT_WORK.hours).
 */
function workHours(month: number, dayOfMonth: number, leap: boolean): number {
  const length = lengthOf(month, leap);
  const mid = (length + 1) / 2;
  const here = hoursOf(month);
  if (dayOfMonth >= mid) {
    const next = lengthOf(month + 1, leap);
    const t = (dayOfMonth - mid) / ((length + next) / 2);
    return here + (hoursOf(month + 1) - here) * t;
  }
  const prev = lengthOf(month - 1, leap);
  const t = ((prev - 1) / 2 + dayOfMonth) / ((prev + length) / 2);
  return hoursOf(month - 1) + (here - hoursOf(month - 1)) * t;
}

/** Hodiny venkovní práce dospělého v den `day` (index herního dne – DAYLIGHT_WORK). */
export function daylightHours(day: number): number {
  const date = dateOfDayIndex(day);
  return workHours(date.month, date.day, isLeapYear(date.year));
}

/**
 * Kolik dnešního člověkodne (10 h) dá den venkovní práce vsi (population.md – Skladba dne podle
 * ročního období): hodiny světla bez jídla a přestávek ÷ DAYLIGHT_WORK.referenceHours – zima ≈ 0,7,
 * žně ≈ 1,4. Násobí práci vsi venku po denním minimu, péči o koně a výpravách (`allocateDay` –
 * `daylight`) a kapacitu spřežení.
 */
export function daylightFactor(day: number): number {
  return daylightHours(day) / DAYLIGHT_WORK.referenceHours;
}

const monthSums = new Map<number, number>();

/**
 * Součet `daylightFactor` dnů `fromDay`–konec měsíce `month` roku `year` (celý měsíc
 * z mezipaměti) – „světlé dny“ okna pro plán (`windowDaylightLeft`).
 */
export function monthDaylight(year: number, month: number, fromDay = 1): number {
  const leap = isLeapYear(year);
  const length = monthLength(year, month);
  const key = month * 2 + (leap ? 1 : 0);
  if (fromDay <= 1) {
    const hit = monthSums.get(key);
    if (hit !== undefined) return hit;
  }
  let sum = 0;
  for (let d = Math.max(1, fromDay); d <= length; d++) sum += workHours(month, d, leap);
  sum /= DAYLIGHT_WORK.referenceHours;
  if (fromDay <= 1) monthSums.set(key, sum);
  return sum;
}
