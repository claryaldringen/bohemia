export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export interface GameDate extends CalendarDate {
  /** 1. leden = 1 */
  dayOfYear: number;
  season: Season;
}

export type WorldState =
  { status: 'not-started' } | { status: 'running'; date: GameDate } | { status: 'ended' };

/** Skutečný začátek a konec světa v ms od epochy. */
export interface WorldClock {
  readonly startMs: number;
  readonly endMs: number;
}

export const OFFICIAL_WORLD: WorldClock = {
  startMs: Date.parse('2027-01-01T00:00:00+01:00'),
  endMs: Date.parse('2028-01-01T00:00:00+01:00'),
};

const FIRST_YEAR = 500;
const END_YEAR = 1500;
// Juliánský kalendář: přestupný je každý rok dělitelný čtyřmi. Rok 500 je přestupný,
// takže každý čtyřletý cyklus od začátku světa začíná přestupným rokem.
const DAYS_IN_LEAP_YEAR = 366;
const DAYS_IN_COMMON_YEAR = 365;
const DAYS_IN_CYCLE = DAYS_IN_LEAP_YEAR + 3 * DAYS_IN_COMMON_YEAR;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0;
}

function daysBeforeYear(year: number): number {
  const leapYears = Math.floor((year - 1) / 4) - Math.floor((FIRST_YEAR - 1) / 4);
  return DAYS_IN_COMMON_YEAR * (year - FIRST_YEAR) + leapYears;
}

/** Počet herních dní mezi 1. 1. 500 a 1. 1. 1500. */
export const TOTAL_GAME_DAYS = daysBeforeYear(END_YEAR);

function monthLength(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1]!;
}

function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** Index herního dne (0 = 1. 1. 500) → herní datum. */
function dateFromDayIndex(dayIndex: number): GameDate {
  const cycle = Math.floor(dayIndex / DAYS_IN_CYCLE);
  let dayInYear = dayIndex % DAYS_IN_CYCLE;
  let yearInCycle = 0;
  if (dayInYear >= DAYS_IN_LEAP_YEAR) {
    dayInYear -= DAYS_IN_LEAP_YEAR;
    yearInCycle = 1 + Math.floor(dayInYear / DAYS_IN_COMMON_YEAR);
    dayInYear %= DAYS_IN_COMMON_YEAR;
  }
  const year = FIRST_YEAR + 4 * cycle + yearInCycle;

  let month = 1;
  let day = dayInYear + 1;
  while (day > monthLength(year, month)) {
    day -= monthLength(year, month);
    month++;
  }
  return { year, month, day, dayOfYear: dayInYear + 1, season: seasonOf(month) };
}

/** Herní den, ve kterém leží skutečný okamžik (předpokládá start <= now < end). */
function dayIndexAt(nowMs: number, world: WorldClock): number {
  // BigInt: uplynulé ms × 365 250 přesahuje přesnost Number (2^53).
  const elapsed = BigInt(Math.floor(nowMs - world.startMs));
  const duration = BigInt(world.endMs - world.startMs);
  return Number((elapsed * BigInt(TOTAL_GAME_DAYS)) / duration);
}

export function getWorldState(nowMs: number, world: WorldClock): WorldState {
  if (nowMs < world.startMs) return { status: 'not-started' };
  if (nowMs >= world.endMs) return { status: 'ended' };
  return { status: 'running', date: dateFromDayIndex(dayIndexAt(nowMs, world)) };
}

/** Herní datum → index herního dne (0 = 1. 1. 500). */
function dayIndexOf({ year, month, day }: CalendarDate): number {
  const valid =
    [year, month, day].every(Number.isInteger) &&
    year >= FIRST_YEAR &&
    year < END_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= monthLength(year, month);
  if (!valid) throw new RangeError(`Neplatné herní datum ${day}. ${month}. ${year}`);

  let dayIndex = daysBeforeYear(year) + day - 1;
  for (let m = 1; m < month; m++) dayIndex += monthLength(year, m);
  return dayIndex;
}

/** Skutečný okamžik (ms), kdy herní den začíná. */
export function realTimeOf(date: CalendarDate, world: WorldClock): number {
  const dayIndex = BigInt(dayIndexOf(date));
  const duration = BigInt(world.endMs - world.startMs);
  const totalDays = BigInt(TOTAL_GAME_DAYS);
  // Zaokrouhlení nahoru na první celou ms, která už do dne patří – dayIndexAt zaokrouhluje
  // dolů, takže oba převody se na hranicích dnů shodnou.
  return world.startMs + Number((dayIndex * duration + totalDays - 1n) / totalDays);
}

function parseInstant(name: string, value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`${name} není platný okamžik (ISO 8601): ${value}`);
  return ms;
}

/**
 * Svět podle proměnných prostředí. Bez nich ostrý svět, s oběma testovací svět
 * (např. od dneška nebo zrychlený). Prázdné hodnoty z .env se berou jako nenastavené.
 */
export function resolveWorldClock(env: { WORLD_START?: string; WORLD_END?: string }): WorldClock {
  const start = env.WORLD_START || undefined;
  const end = env.WORLD_END || undefined;
  if (start === undefined && end === undefined) return OFFICIAL_WORLD;
  if (start === undefined || end === undefined) {
    throw new Error('Testovací svět potřebuje WORLD_START i WORLD_END (ISO 8601).');
  }

  const startMs = parseInstant('WORLD_START', start);
  const endMs = parseInstant('WORLD_END', end);
  if (endMs <= startMs) throw new Error('WORLD_END musí být po začátku světa (WORLD_START).');
  // Kratší svět by měl herní dny kratší než 1 ms a převody by se na hranicích dnů rozešly.
  if (endMs - startMs < TOTAL_GAME_DAYS) {
    throw new Error(`Svět musí trvat aspoň ${TOTAL_GAME_DAYS} ms (≈ 6 minut).`);
  }
  return { startMs, endMs };
}
