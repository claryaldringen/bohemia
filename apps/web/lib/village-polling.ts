import { TOTAL_GAME_DAYS, dateOfDayIndex, realTimeOf, type WorldClock } from '@bohemia/game';

// Kdy se klient znovu zeptá na ves: ves se dopočítává po herních dnech, takže nový pohled má
// smysl až na začátku dalšího herního dne hráče (ostrý svět ≈ 86 s). Akce hráče vracejí čerstvou
// ves samy; dotaz jen dohání, co se mezitím stalo samo (a co změnil jiný panel). Čistý modul –
// smí do prohlížeče.

/** Nejdřív za kolik ms se ptát znovu (zrychlené světy, hodiny prohlížeče napřed). */
export const POLL_MIN_MS = 5_000;
/** Nejpozději za kolik ms se ptát znovu (pomalé testovací světy, změny z jiného panelu). */
export const POLL_MAX_MS = 86_000;
/** Kolik ms po začátku herního dne se ptát – server už má nový den jistě i s malým rozdílem hodin. */
export const POLL_AFTER_DAY_START_MS = 1_000;

/**
 * Za kolik ms se zeptat na ves, která je v pohledu ve dni `dayIndex` (hodiny hráče `clock` – svět
 * posunutý o jeho posun času): začátek dalšího herního dne + 1 s, nejdřív za POLL_MIN_MS,
 * nejpozději za POLL_MAX_MS. Bez pohledu (chyba) za POLL_MIN_MS; poslední den světa POLL_MAX_MS.
 */
export function nextPollDelayMs(dayIndex: number | null, clock: WorldClock, nowMs: number): number {
  if (dayIndex === null) return POLL_MIN_MS;
  const next = dayIndex + 1;
  if (next >= TOTAL_GAME_DAYS) return POLL_MAX_MS;
  const at = realTimeOf(dateOfDayIndex(next), clock) + POLL_AFTER_DAY_START_MS;
  return Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, at - nowMs));
}
