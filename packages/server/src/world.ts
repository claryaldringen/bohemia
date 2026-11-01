import {
  dayIndexOf,
  getWorldState,
  resolveWorldClock,
  type WorldClock,
  type WorldState,
} from '@bohemia/game';

/** Ostrý svět, nebo testovací svět z WORLD_START a WORLD_END. Volat při každém požadavku. */
export function currentWorld(): WorldClock {
  return resolveWorldClock({
    WORLD_START: process.env.WORLD_START,
    WORLD_END: process.env.WORLD_END,
  });
}

/** Dnešní herní den (index dne) světa; když svět neběží, jeho stav (text chyby skládá vstupní bod). */
export type WorldDay = { ok: true; day: number } | { ok: false; state: WorldState };

export function worldDayOf(nowMs: number, world: WorldClock): WorldDay {
  const state = getWorldState(nowMs, world);
  if (state.status !== 'running') return { ok: false, state };
  return { ok: true, day: dayIndexOf(state.date) };
}
