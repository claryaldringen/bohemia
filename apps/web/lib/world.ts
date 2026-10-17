import { dayIndexOf, getWorldState, resolveWorldClock, type WorldClock } from '@bohemia/game';
import { formatWorldState } from './game-date';

/** Ostrý svět, nebo testovací svět z WORLD_START a WORLD_END. Volat při každém požadavku. */
export function currentWorld(): WorldClock {
  return resolveWorldClock({
    WORLD_START: process.env.WORLD_START,
    WORLD_END: process.env.WORLD_END,
  });
}

/** Dnešní herní den (index dne); když svět neběží (ještě nezačal / skončil), chyba pro hráče. */
export function gameDayIndex(
  nowMs: number,
  world: WorldClock,
): { ok: true; day: number } | { ok: false; error: string } {
  const state = getWorldState(nowMs, world);
  if (state.status !== 'running') return { ok: false, error: `${formatWorldState(state, world)}.` };
  return { ok: true, day: dayIndexOf(state.date) };
}
