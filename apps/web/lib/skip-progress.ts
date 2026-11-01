import type { ComputeProgress } from '@bohemia/game';

// Průběh přeskoku času hráčů (vývojový režim – accounts.md, Průběh přeskoku): přeskok ho hlásí
// (`onProgress` use-casu `skipTime`) a Route Handler `/api/dev/skip-progress` ho čte – server
// action to být nemůže, Next řadí server actions jednoho klienta za sebe a dotaz by čekal za
// běžícím přeskokem. Jen paměť procesu – po konci přeskoku se záznam smaže.

/** Odpověď `/api/dev/skip-progress`: průběh běžícího přeskoku, nebo null (žádný neběží). */
export interface SkipProgressResponse {
  progress: ComputeProgress | null;
}

const STORE = Symbol.for('bohemia.skip-progress');
const globals = globalThis as unknown as Record<symbol, Map<string, ComputeProgress> | undefined>;

/** Průběhy podle hráče; v `globalThis`, aby je sdílely i samostatně sbalené moduly Next.js. */
function store(): Map<string, ComputeProgress> {
  let map = globals[STORE];
  if (!map) {
    map = new Map();
    globals[STORE] = map;
  }
  return map;
}

/** Zapíše průběh přeskoku hráče (kopii – hlášení se nesmí měnit zpětně). */
export function reportSkipProgress(playerId: string, progress: ComputeProgress): void {
  store().set(playerId, { doneDays: progress.doneDays, totalDays: progress.totalDays });
}

/** Přeskok hráče skončil – průběh zmizí. */
export function clearSkipProgress(playerId: string): void {
  store().delete(playerId);
}

/** Průběh běžícího přeskoku hráče, nebo null (žádný neběží). */
export function skipProgressOf(playerId: string): ComputeProgress | null {
  return store().get(playerId) ?? null;
}
