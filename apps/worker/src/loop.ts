import type { PlayerStep, WorldClock, WorldStep } from '@bohemia/game';
import type { Logger } from './log';
import { SkipTable, nextWakeMs } from './wake';

export interface LoopOptions {
  stepDays: number;
  limit: number;
  idleMs: number;
  pauseMs: number;
}

/** Vstupy smyčky, které se v testech nahrazují (hodiny, spánek, krok světa). */
export interface LoopDeps {
  /** Hodiny světa při každém kole (`currentWorld`) – testovací světy se mění přes env. */
  world: () => WorldClock;
  /** Den světa v okamžiku `nowMs`; `null`, když svět neběží. */
  worldDay: (nowMs: number, world: WorldClock) => number | null;
  /** `advanceWorldStep` s připojenými porty. */
  step: (input: {
    worldDay: number;
    stepDays: number;
    limit: number;
    skip: ReadonlySet<string>;
  }) => Promise<WorldStep>;
  now: () => number;
  /** Spánek, který signál ukončení přeruší. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  log: Logger;
}

export interface Totals {
  rounds: number;
  players: number;
  villages: number;
  days: number;
  ms: number;
  failures: number;
}

const SUMMARY_MS = 60_000;

function describe(player: PlayerStep): string {
  const base = `hráč ${player.playerId}: ${player.outcome}, ${player.villages} vsí, ${player.days} dní, ${Math.round(player.ms)} ms`;
  return player.outcome === 'failed' ? `${base}, ves ${player.error?.villageId ?? '-'}` : base;
}

/**
 * Hlavní smyčka workeru: kolo `advanceWorldStep` → pauza, nebo (nic pozadu) spánek do dalšího
 * herního dne. Chyba kola ani jednoho hráče smyčku nezastaví; `signal` ji ukončí po dokončení
 * rozpočítané dávky. Žádná herní logika – jen plánování.
 */
export async function runLoop(
  deps: LoopDeps,
  options: LoopOptions,
  signal: AbortSignal,
): Promise<Totals> {
  const skips = new SkipTable();
  const empty = (): Totals => ({ rounds: 0, players: 0, villages: 0, days: 0, ms: 0, failures: 0 });
  const total = empty();
  let window = empty();
  let summaryAt = deps.now() + SUMMARY_MS;

  const flush = (force: boolean): void => {
    if (!force && deps.now() < summaryAt) return;
    if (window.players > 0 || force) {
      deps.log.info(
        `${window.players} hráčů, ${window.villages} vsí, ${window.days} dní, ` +
          `výpočet ${(window.ms / 1000).toFixed(1).replace('.', ',')} s, chyb ${window.failures}`,
      );
    }
    window = empty();
    summaryAt = deps.now() + SUMMARY_MS;
  };

  while (!signal.aborted) {
    const nowMs = deps.now();
    const world = deps.world();
    const worldDay = deps.worldDay(nowMs, world);
    let idle = true;
    if (worldDay !== null) {
      try {
        const step = await deps.step({
          worldDay,
          stepDays: options.stepDays,
          limit: options.limit,
          skip: skips.active(nowMs),
        });
        idle = step.idle;
        total.rounds++;
        window.rounds++;
        for (const player of step.players) {
          const at = deps.now();
          if (player.outcome === 'busy') skips.busy(player.playerId, at);
          else if (player.outcome === 'failed') {
            skips.failed(player.playerId, at);
            total.failures++;
            window.failures++;
            deps.log.warn(
              `chyba u hráče ${player.playerId} (ves ${player.error?.villageId ?? '-'}): ` +
                String(
                  player.error?.cause instanceof Error
                    ? player.error.cause.message
                    : player.error?.cause,
                ),
            );
          } else skips.done(player.playerId);
          deps.log.debug(describe(player));
          for (const t of [total, window]) {
            t.players++;
            t.ms += player.ms;
          }
        }
        for (const t of [total, window]) {
          t.villages += step.villages;
          t.days += step.days;
        }
      } catch (error) {
        total.failures++;
        window.failures++;
        deps.log.warn(`kolo selhalo: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    flush(false);
    if (signal.aborted) break;
    const wait = idle ? nextWakeMs(deps.now(), worldDay, world, options.idleMs) : options.pauseMs;
    if (idle) deps.log.debug(`nic pozadu, spím ${wait} ms`);
    await deps.sleep(wait, signal);
  }
  flush(true);
  return total;
}

/** Spánek, který `signal` předčasně ukončí. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}
