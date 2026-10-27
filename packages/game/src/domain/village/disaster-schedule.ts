// Ochrana nové vsi a rozpis místních pohrom roku (disasters.md – Kraj a ochrana nové vsi, Místní
// pohromy – jedna ves). Samostatný soubor bez závislostí na pohromách – čtou ho požár, kroupy
// i rámec `localDisastersDay` (disasters.ts ho dál vyváží).

import { dayIndexOf } from '../calendar';
import { createRandom, deriveSeed } from '../landscape/random';
import { HAIL, LOCAL_DISASTERS } from './rules-disasters';
import type { HailPlan, LocalYearSchedule } from './types-disasters';

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

/** Rozpisy už spočtené (seed vsi a rok) – čistá funkce, paměť jen šetří los. */
const schedules = new Map<string, Readonly<LocalYearSchedule>>();
const SCHEDULE_MEMO_LIMIT = 4096;

/**
 * Rozpis místních pohrom roku `year` ze seedu vsi (disasters.md – Místní pohromy – jedna ves):
 * kroupy ze `'hail:' + year` – šance 6 %, jeden den června až srpna, směr pruhu a posun jeho středu
 * v okolí vsi. Dvě vsi téže mapy mají jiný seed, tedy jiné kroupy. Nezávisí na stavu vsi ani na
 * ochraně nové vsi (tu řeší rámec) – výsledek je jen ke čtení.
 */
export function yearSchedule(seed: number, year: number): Readonly<LocalYearSchedule> {
  const key = `${seed}:${year}`;
  const known = schedules.get(key);
  if (known) return known;
  const random = createRandom(deriveSeed(seed, 'hail:' + year));
  let hail: HailPlan | null = null;
  if (random.next() < HAIL.chancePerYear) {
    const from = dayIndexOf({ year, ...HAIL.window.from });
    const to = dayIndexOf({ year, ...HAIL.window.to });
    const day = Math.min(to, from + Math.floor(random.next() * (to - from + 1)));
    const angle = random.next() * Math.PI;
    const offsetM = (2 * random.next() - 1) * HAIL.offsetM;
    hail = { day, angle, offsetM };
  }
  const schedule = { hail };
  if (schedules.size >= SCHEDULE_MEMO_LIMIT) schedules.clear();
  schedules.set(key, schedule);
  return schedule;
}
