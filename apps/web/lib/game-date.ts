import {
  TOTAL_GAME_DAYS,
  dateOfDayIndex,
  dayIndexOf,
  getWorldState,
  realTimeOf,
  type CalendarDate,
  type WorldClock,
  type WorldState,
} from '@bohemia/game';

const MONTHS_GENITIVE = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
] as const;

/** Měsíc ve 2. pádě – „října“ (1–12). */
export function monthGenitive(month: number): string {
  return MONTHS_GENITIVE[(month - 1 + 12) % 12]!;
}

// Datum skládáme ručně z číselných částí – hotový výstup Intl se mezi Node a prohlížeči liší
// (běžné vs. nezlomitelné mezery) a text se renderuje na serveru i v prohlížeči.
const pragueParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatWorldStart(startMs: number): string {
  const parts = Object.fromEntries(
    pragueParts.formatToParts(startMs).map((part) => [part.type, part.value]),
  );
  const date = `${Number(parts.day)}. ${Number(parts.month)}. ${parts.year}`;
  const isMidnight = parts.hour === '00' && parts.minute === '00';
  return isMidnight ? date : `${date}, ${parts.hour}:${parts.minute}`;
}

/** Herní datum jako „12. dubna 503“. */
export function formatGameDate({ day, month, year }: CalendarDate): string {
  return `${day}. ${MONTHS_GENITIVE[month - 1]} ${year}`;
}

export function formatWorldState(state: WorldState, world: WorldClock): string {
  switch (state.status) {
    case 'not-started':
      return `Svět začne ${formatWorldStart(world.startMs)}`;
    case 'ended':
      return 'Rok 1500 – svět skončil';
    case 'running': {
      return formatGameDate(state.date);
    }
  }
}

/**
 * Obnova data v liště: nejdřív po sekundě (zrychlené testovací světy mají den za zlomek
 * sekundy), nejdéle po 5 minutách (svět, který ještě nezačal, má start za měsíce – časovač by
 * přetekl); herní den ostrého světa (≈ 86 s) se vejde.
 */
export const DATE_REFRESH_MS = { min: 1000, max: 5 * 60_000 } as const;

/** Kdy se datum v liště změní – začátek dalšího herního dne, start světa; po konci null. */
export function nextDateChangeMs(nowMs: number, world: WorldClock): number | null {
  const state = getWorldState(nowMs, world);
  if (state.status === 'not-started') return world.startMs;
  if (state.status === 'ended') return null;
  const next = dayIndexOf(state.date) + 1;
  return next >= TOTAL_GAME_DAYS ? world.endMs : realTimeOf(dateOfDayIndex(next), world);
}

/**
 * Za kolik ms obnovit datum v liště: až začne další herní den (ostrý svět ≈ 86 s – místo
 * překreslení lišty každou sekundu), v mezích DATE_REFRESH_MS; po konci světa null.
 */
export function dateRefreshDelay(nowMs: number, world: WorldClock): number | null {
  const next = nextDateChangeMs(nowMs, world);
  if (next === null) return null;
  return Math.min(DATE_REFRESH_MS.max, Math.max(DATE_REFRESH_MS.min, next - nowMs + 1));
}

/**
 * Úhel ručičky ciferníku denní doby ve stupních po směru hodin od svislice nahoře (Martin
 * 14. 11. 2026; ciferník na 24 hodin je návrh Clauda): poledne nahoře (0°), 18:00 vpravo (90°),
 * půlnoc dole (180°), 6:00 vlevo (270°). Jedna otáčka za herní den.
 */
export function clockHandAngle(hour: number): number {
  const turn = ((((hour - 12) / 24) % 1) + 1) % 1;
  return turn * 360;
}

/** Denní doba slovy pro popisek ciferníku (hodina 0–24). */
export function dayPartLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 'Noc';
  if (h < 9) return 'Ráno';
  if (h < 11) return 'Dopoledne';
  if (h < 13) return 'Poledne';
  if (h < 17) return 'Odpoledne';
  if (h < 21) return 'Večer';
  return 'Noc';
}
