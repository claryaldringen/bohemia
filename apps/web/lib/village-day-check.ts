import { TOTAL_GAME_DAYS, dateOfDayIndex, realTimeOf, type WorldClock } from '@bohemia/game';

// Den bez workeru (docs/code/server-events.md – Den bez workeru; plán 2026-11-15 – Rozhodnutí 8):
// ves se dopočítává po herních dnech a nový den oznámí uložení vsi workerem (událost `village`).
// Když do `DAY_CHECK_GRACE_MS` po začátku dalšího herního dne pohled nového dne nepřijde
// (`npm run dev:web`, e2e projekt `chromium`, přetížený worker), prohlížeč se jednou zeptá sám.
// Čistý modul – smí do prohlížeče.

/** Kolik ms po začátku dalšího herního dne se zeptat, když událost nepřišla. */
export const DAY_CHECK_GRACE_MS = 10_000;

/**
 * Za kolik ms se zeptat na ves, která je v pohledu ve dni `dayIndex` (hodiny hráče `clock` – svět
 * posunutý o jeho posun času): začátek dne `dayIndex + 1` + `DAY_CHECK_GRACE_MS`, nejméně 0. Bez
 * pohledu a poslední den světa null – další den nepřijde.
 */
export function nextDayCheckMs(
  dayIndex: number | null,
  clock: WorldClock,
  nowMs: number,
): number | null {
  if (dayIndex === null) return null;
  const next = dayIndex + 1;
  if (next >= TOTAL_GAME_DAYS) return null;
  const at = realTimeOf(dateOfDayIndex(next), clock) + DAY_CHECK_GRACE_MS;
  return Math.max(0, at - nowMs);
}
