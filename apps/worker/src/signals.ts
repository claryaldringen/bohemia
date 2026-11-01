// Ukončení workeru signálem (plán workeru – 4. Spuštění lokálně): první SIGINT / SIGTERM = dokončit
// rozpočítanou dávku a skončit, další = konec hned. Jedno Ctrl + C ale v terminálu přijde víckrát:
// dostane ho celá skupina procesů (turbo, npm, `tsx watch` i worker) a `tsx` ho workeru ještě
// přepošle. Opakování v krátké chvíli proto patří témuž stisku a čisté ukončení neruší.

import type { Logger } from './log';

/** Signál do takové doby po prvním je týž stisk Ctrl + C (ms). */
export const REPEATED_SIGNAL_MS = 1000;

export interface SignalDeps {
  now: () => number;
  log: Pick<Logger, 'info' | 'warn'>;
  /** Dokončit dávku a skončit. */
  stop: () => void;
  /** Konec hned (zámek padne se spojením, neuložená dávka se zahodí). */
  exitNow: () => void;
}

/** Obsluha signálu: první zastaví smyčku, opakovaný po `REPEATED_SIGNAL_MS` ukončí proces hned. */
export function signalHandler(deps: SignalDeps): (name: string) => void {
  let first: number | null = null;
  return (name) => {
    const at = deps.now();
    if (first === null) {
      first = at;
      deps.log.info(`${name} – dokončuji dávku a končím`);
      deps.stop();
      return;
    }
    if (at - first < REPEATED_SIGNAL_MS) return;
    deps.log.warn(`${name} podruhé – končím hned`);
    deps.exitNow();
  };
}
