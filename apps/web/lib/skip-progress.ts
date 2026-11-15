import type { ComputeProgress } from '@bohemia/game';
import type { DbChange } from '@bohemia/db';

// Průběh přeskoku času hráčů (vývojový režim – accounts.md, Průběh přeskoku): přeskok ho hlásí
// (`onProgress` use-casu `skipTime`) a Route Handler `/api/dev/skip-progress` ho čte – server
// action to být nemůže, Next řadí server actions jednoho klienta za sebe a dotaz by čekal za
// běžícím přeskokem. Jen paměť procesu – po konci přeskoku se záznam smaže. Prohlížeč průběh dostává
// i jako událost `skip` (server-events.md – Přeskok času): hlášení se oznamují nejvýš jednou za
// `SKIP_ANNOUNCE_MS` na hráče, konec (null) vždy.

/** Nejmenší odstup oznámení průběhu jednoho hráče (ms). */
export const SKIP_ANNOUNCE_MS = 250;

/** Oznámí změnu ostatním (`notifyChange`); chyba se do přeskoku nepropíše. */
export type SkipAnnounce = (change: DbChange) => Promise<void>;

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

const LAST = Symbol.for('bohemia.skip-progress-announced');
const lastGlobals = globalThis as unknown as Record<symbol, Map<string, number> | undefined>;

/** Kdy se průběh hráče naposledy oznámil. */
function lastAnnounced(): Map<string, number> {
  return (lastGlobals[LAST] ??= new Map());
}

function announce(send: SkipAnnounce | undefined, playerId: string, change: DbChange): void {
  if (send === undefined) return;
  void send(change).catch((error: unknown) =>
    console.warn(`Oznámení průběhu přeskoku ${playerId} selhalo:`, error),
  );
}

/** Zapíše průběh přeskoku hráče (kopii – hlášení se nesmí měnit zpětně) a oznámí ho. */
export function reportSkipProgress(
  playerId: string,
  progress: ComputeProgress,
  send?: SkipAnnounce,
): void {
  const copy = { doneDays: progress.doneDays, totalDays: progress.totalDays };
  store().set(playerId, copy);
  const now = Date.now();
  const last = lastAnnounced().get(playerId);
  if (last !== undefined && now - last < SKIP_ANNOUNCE_MS) return;
  lastAnnounced().set(playerId, now);
  announce(send, playerId, { k: 'x', p: playerId, progress: copy });
}

/** Přeskok hráče skončil – průběh zmizí a konec se oznámí vždy. */
export function clearSkipProgress(playerId: string, send?: SkipAnnounce): void {
  store().delete(playerId);
  lastAnnounced().delete(playerId);
  announce(send, playerId, { k: 'x', p: playerId, progress: null });
}

/** Průběh běžícího přeskoku hráče, nebo null (žádný neběží). */
export function skipProgressOf(playerId: string): ComputeProgress | null {
  return store().get(playerId) ?? null;
}
