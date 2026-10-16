import { resolveWorldClock, type WorldClock } from '@bohemia/game';

/** Ostrý svět, nebo testovací svět z WORLD_START a WORLD_END. Volat při každém požadavku. */
export function currentWorld(): WorldClock {
  return resolveWorldClock({
    WORLD_START: process.env.WORLD_START,
    WORLD_END: process.env.WORLD_END,
  });
}
