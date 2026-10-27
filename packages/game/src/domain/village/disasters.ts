// Místní pohromy vsi – rámec (disasters.md – Místní pohromy – jedna ves). Kroupy, povodeň, požár
// a smršť přidají další úlohy; tady je zatím ochrana nové vsi.

import { LOCAL_DISASTERS } from './rules-disasters';

/** Průměrná délka roku kalendáře (přestupný každý čtvrtý rok – calendar.ts). */
const DAYS_PER_YEAR = 365.25;

/**
 * Ochrana nové vsi (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou
 * ochranu“): prvních 5 let od založení žádné kroupy, povodeň, požár ani smršť. Počasí kraje
 * platí naplno.
 */
export function inDisasterProtection(foundedDay: number, day: number): boolean {
  return day - foundedDay < LOCAL_DISASTERS.protectionYears * DAYS_PER_YEAR;
}
