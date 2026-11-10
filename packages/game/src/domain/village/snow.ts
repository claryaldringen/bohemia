// Sníh podle dne v roce (population.md – Skladba dne podle ročního období; vzhled scény –
// docs/code/scene.md, Roční období): jeden výpočet pro scénu (`seasonLook` v apps/web) i simulaci
// (když leží sníh, voda se nenosí – `dayChores`). Jen deterministická matematika.

import { dateOfDayIndex, isLeapYear } from '../calendar';
import { smoothstep } from '../landscape/det-math';
import { DAY_CHORES } from './rules';
import type { WinterWeather } from './types-disasters';

/**
 * Klíčové body ročního průběhu: [den v roce, hodnota]. Mezi body se hodnota mění hladce
 * (smoothstep), za posledním bodem pokračuje k prvnímu dalšího roku.
 */
export type SeasonTrack = readonly (readonly [day: number, value: number])[];

/** Délka roku stop (nepřestupný – 366. den přestupného roku navazuje na 1. 1.). */
export const SEASON_YEAR_DAYS = 365;

// Dny v roce (nepřestupném): 1. 3. = 60, 1. 4. = 91, 1. 6. = 152, 1. 9. = 244, 1. 12. = 335.

/** Sníh napadne koncem listopadu (souvislý od 10. 12.), taje od 20. 2. do poloviny března. */
export const SNOW_TRACK: SeasonTrack = [
  [51, 1],
  [72, 0],
  [324, 0],
  [344, 1],
];
/** Holomráz: od 1. 2. za 5 dní sníh zmizí a zem pokryje jinovatka, v březnu povolí. */
export const FROST_TRACK: SeasonTrack = [
  [32, 0],
  [37, 1],
  [62, 1],
  [82, 0],
];
/**
 * Dlouhá zima: o kolik dní se jaro opozdí – od 1. 3. za 6 dní se vrátí sníh (zpoždění 3 týdny),
 * sníh leží do dubna, listí a tráva jdou o 3 týdny později; do poloviny července se rok srovná
 * (zpoždění ubývá pomaleji než den – vzhled nejde zpátky).
 */
export const LONG_WINTER_DELAY_TRACK: SeasonTrack = [
  [60, 0],
  [66, 21],
  [140, 21],
  [200, 0],
];

/** Den v roce do rozsahu [1, 366) – den 366 přestupného roku navazuje na 1. 1. */
export function wrapDayOfYear(day: number): number {
  return ((((day - 1) % SEASON_YEAR_DAYS) + SEASON_YEAR_DAYS) % SEASON_YEAR_DAYS) + 1;
}

/** Hodnota stopy v den `d` (1–366): hladký přechod mezi sousedními body, přes konec roku dokola. */
export function seasonTrack(points: SeasonTrack, d: number): number {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [fromDay, from] = points[i]!;
    const [toDayRaw, to] = points[(i + 1) % n]!;
    const toDay = i + 1 < n ? toDayRaw : toDayRaw + SEASON_YEAR_DAYS;
    // den v úseku – úsek přes konec roku zachytí i dny na začátku dalšího roku
    const day = d < fromDay ? d + SEASON_YEAR_DAYS : d;
    if (day >= fromDay && day < toDay) {
      return from + (to - from) * smoothstep(fromDay, toDay, day);
    }
  }
  return points[0]![1];
}

/**
 * Sníh 0–1 v den roku `dayOfYear` (1–366) se zimou roku `winter` – přesně jako scéna
 * (`seasonLook`): dlouhá zima opozdí den vzhledu (`LONG_WINTER_DELAY_TRACK`), holomráz sníh
 * nahradí jinovatkou (sníh × (1 − mráz)).
 */
export function snowCover(dayOfYear: number, winter: WinterWeather = 'normal'): number {
  const d = wrapDayOfYear(dayOfYear);
  const delay = winter === 'long' ? seasonTrack(LONG_WINTER_DELAY_TRACK, d) : 0;
  const snow = seasonTrack(SNOW_TRACK, delay > 0 ? wrapDayOfYear(d - delay) : d);
  const frost = winter === 'blackFrost' ? seasonTrack(FROST_TRACK, d) : 0;
  return snow * (1 - frost);
}

/**
 * Leží v den `day` (index herního dne) sníh (population.md – Skladba dne podle ročního období)?
 * Sníh scény aspoň DAY_CHORES.snowLies.
 */
export function snowLies(day: number, winter: WinterWeather = 'normal'): boolean {
  return snowCover(dateOfDayIndex(day).dayOfYear, winter) >= DAY_CHORES.snowLies;
}

/** Leží sníh v den roku 1–366 (index) – po zimách, spočítané při prvním dotazu (`snowLies`). */
const SNOW_DAYS = new Map<WinterWeather, readonly boolean[]>();

function snowDays(winter: WinterWeather): readonly boolean[] {
  let days = SNOW_DAYS.get(winter);
  if (!days) {
    days = Array.from(
      { length: SEASON_YEAR_DAYS + 2 },
      (_, d) => d >= 1 && snowCover(d, winter) >= DAY_CHORES.snowLies,
    );
    SNOW_DAYS.set(winter, days);
  }
  return days;
}

/**
 * Kolik z `days` dní od dne `day` (index herního dne, včetně) leží sníh se zimou `winter` – týž sníh
 * jako `snowLies` (diet.md – Zima bez sena: krávy, ovce a kozy se krmí jen ve sněhu).
 */
export function snowDaysAhead(day: number, days: number, winter: WinterWeather = 'normal'): number {
  const table = snowDays(winter);
  const date = dateOfDayIndex(day);
  let dayOfYear = date.dayOfYear;
  let year = date.year;
  let count = 0;
  for (let i = 0; i < days; i++) {
    if (table[dayOfYear]) count++;
    dayOfYear++;
    if (dayOfYear > (isLeapYear(year) ? 366 : 365)) {
      dayOfYear = 1;
      year++;
    }
  }
  return count;
}

/** Dní nepřestupného roku, kdy se zimou `winter` leží sníh. */
export function snowDaysOfYear(winter: WinterWeather = 'normal'): number {
  const table = snowDays(winter);
  let count = 0;
  for (let d = 1; d <= SEASON_YEAR_DAYS; d++) if (table[d]) count++;
  return count;
}
