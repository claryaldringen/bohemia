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

/**
 * Výchozí seed světa pro vývoj a testy. Ostrý svět nastaví `WORLD_SEED` – po spuštění se nesmí
 * změnit (krajina každého políčka se z něj odvozuje a uložená sídla nesou svůj seed).
 */
export const DEFAULT_WORLD_SEED = 500_001;

/** Seed světa z `WORLD_SEED` (celé číslo 0 … 2^31 − 1); bez něj výchozí vývojový. */
export function worldSeed(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WORLD_SEED?.trim();
  if (!raw) return DEFAULT_WORLD_SEED;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** 31) {
    throw new Error('WORLD_SEED: čekám celé číslo 0 … 2147483647.');
  }
  return value;
}
