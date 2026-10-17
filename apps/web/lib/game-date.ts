import type { CalendarDate, Season, WorldClock, WorldState } from '@bohemia/game';

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

const SEASON_NAMES: Record<Season, string> = {
  spring: 'jaro',
  summer: 'léto',
  autumn: 'podzim',
  winter: 'zima',
};

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
      return `${formatGameDate(state.date)} · ${SEASON_NAMES[state.date.season]}`;
    }
  }
}
