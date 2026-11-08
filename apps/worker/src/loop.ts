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
    shouldStop: () => boolean;
    /** Okamžik kola – vsi nečinných hráčů spí (worker.md – Uspání nečinných). */
    now: Date;
  }) => Promise<WorldStep>;
  /** Úlohy světa (kredity nástupnictví…) – smyčka je pouští nejvýš jednou za `WORLD_TASKS_MS`. */
  worldTasks?: (input: { now: Date; today: number }) => Promise<void>;
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
/**
 * Spánek bez práce, když tažení drží vsi (plán 2026-11-03 – Úloha 6.7): jeden takt tažení – mez
 * vsi povyroste, jakmile tažení uloží bod na konci dne, a worker ji má hned dopočítat.
 */
export const HELD_WAKE_MS = 250;
/** Nejkratší odstup úloh světa (podle hodin z `LoopDeps.now`). */
export const WORLD_TASKS_MS = 60_000;

/** Chyba do logu i se stackem (příčina se hledá podle něj). */
function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

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
  let tasksAt = deps.now();

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
    let held = false;
    if (worldDay !== null && deps.worldTasks && nowMs >= tasksAt) {
      tasksAt = nowMs + WORLD_TASKS_MS;
      try {
        await deps.worldTasks({ now: new Date(nowMs), today: worldDay });
      } catch (error) {
        total.failures++;
        window.failures++;
        deps.log.warn(`úlohy světa selhaly: ${errorText(error)}`);
      }
    }
    if (worldDay !== null) {
      try {
        const step = await deps.step({
          worldDay,
          stepDays: options.stepDays,
          limit: options.limit,
          skip: skips.active(nowMs),
          shouldStop: () => signal.aborted,
          now: new Date(nowMs),
        });
        idle = step.idle;
        held = step.held > 0;
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
                errorText(player.error?.cause),
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
        deps.log.warn(`kolo selhalo: ${errorText(error)}`);
      }
    }
    flush(false);
    if (signal.aborted) break;
    // vsi u tažení: mez bariéry roste s taktem tažení, ne s herním dnem – spí se jen krátce
    const wake = (): number => nextWakeMs(deps.now(), worldDay, world, options.idleMs);
    const wait = idle ? (held ? Math.min(HELD_WAKE_MS, wake()) : wake()) : options.pauseMs;
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
