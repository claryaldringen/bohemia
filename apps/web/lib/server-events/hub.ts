import 'server-only';
import { databaseUrl, listenChanges, type DbChange } from '@bohemia/db';
import { createCoalescer } from './coalesce';
import { SERVER_EVENTS_PROTOCOL, type ServerEventName } from './protocol';
import { serverComputers } from './pushers';
import {
  computeKey,
  routeChange,
  scopeWantsTask,
  type ComputeTask,
  type ConnectionScope,
} from './routing';

// Rozbočovač událostí ze serveru (docs/code/server-events.md – Rozbočovač; plán 2026-11-15): drží
// otevřená spojení SSE procesu webu, změny z LISTEN rozešle podle rozsahu spojení (`routeChange`).
// Signály jdou hned, stav (výpravy, tažení, válka) se počítá jednou na hráče a předmět přes
// slučovač a spojení ho dostane jen při změně klíče proti tomu, co mu bylo naposled posláno.

/**
 * Nejvýš spojení na hráče – další nejstaršímu pošle `evicted` a zavře ho (Rozhodnutí 6, limit 6
 * spojení HTTP/1.1).
 */
export const MAX_CONNECTIONS_PER_PLAYER = 4;
/** Čekání slučovače před výpočtem (Rozhodnutí 5). */
export const COALESCE_MS = 50;
/** Stejná chyba se do logu píše nejvýš jednou za tuto dobu. */
export const ERROR_LOG_INTERVAL_MS = 60_000;

/** Jedno otevřené spojení. `send` ani `close` nesmí vyhodit (spojení samo uklidí). */
export interface Sink {
  id: number;
  scope: ConnectionScope;
  send(name: ServerEventName, data: unknown): void;
  close(): void;
}

/** Výsledek výpočtu: událost, náklad a klíč (takt, seznam jezdců…) – stejný klíč se znovu neposílá. */
export interface ComputeResult {
  name: 'journeys' | 'visitors' | 'campaign' | 'war';
  data: unknown;
  key: string;
}

/** Počítadla stavu podle druhu úlohy; úloha bez počítadla se přeskočí (Úlohy 4 a 5 doplní). */
export type Computers = Partial<
  Record<ComputeTask['what'], (task: ComputeTask) => Promise<ComputeResult>>
>;

export interface Hub {
  /** Přidá spojení; páté spojení hráče pošle nejstaršímu `evicted` a zavře ho. */
  add(sink: Omit<Sink, 'id'>): Sink;
  /** Odebere spojení (opakované odebrání nevadí). */
  remove(id: number): void;
  /** Rozešle změnu z databáze. */
  dispatch(change: DbChange): void;
  /**
   * Po obnově LISTEN – `sync` všem spojením (mezitím mohla nějaká změna uniknout); paměť klíčů se
   * smaže, další výsledek výpočtu jde znovu.
   */
  resync(): void;
  /** Počet otevřených spojení. */
  size(): number;
}

/** Log s předponou `[events]`, stejný řádek nejvýš jednou za `ERROR_LOG_INTERVAL_MS`. */
export function errorLog(log: (line: string) => void): (what: string, error: unknown) => void {
  const logged = new Map<string, number>();
  return (what, error) => {
    const message = error instanceof Error ? error.message : String(error);
    const line = `[events] ${what}: ${message}`;
    const now = Date.now();
    for (const [old, at] of logged) {
      if (now - at >= ERROR_LOG_INTERVAL_MS) logged.delete(old);
    }
    if (logged.has(line)) return;
    logged.set(line, now);
    log(line);
  };
}

export function createHub(deps: {
  computers: Computers;
  coalesceMs: number;
  log(line: string): void;
}): Hub {
  const sinks = new Map<number, Sink>();
  /** Spojení hráče od nejstaršího. */
  const byPlayer = new Map<string, Set<number>>();
  /**
   * Naposled poslaný klíč výsledku podle spojení a `computeKey` – po spojení, ne po hráči: nové
   * spojení (návrat na ves, výměna rozsahu) dostane první výsledek, i když hráč mezitím zůstal
   * připojený jinde (revize Úlohy 2).
   */
  const sentKeys = new Map<number, Map<string, string>>();
  const fail = errorLog(deps.log);
  const coalescer = createCoalescer({
    delayMs: deps.coalesceMs,
    onError: (error, key) => fail(`výpočet ${key.split(':')[0] ?? key}`, error),
  });
  let lastId = 0;

  const send = (sink: Sink, name: ServerEventName, data: unknown): void => {
    try {
      sink.send(name, data);
    } catch (error) {
      fail('odeslání', error);
    }
  };

  const remove = (id: number): void => {
    const sink = sinks.get(id);
    if (!sink) return;
    sinks.delete(id);
    sentKeys.delete(id);
    const own = byPlayer.get(sink.scope.playerId);
    own?.delete(id);
    if (own && own.size === 0) byPlayer.delete(sink.scope.playerId);
  };

  /**
   * Výsledek jde spojením hráče se shodným předmětem – každému, jehož vlastní naposled poslaný
   * klíč se liší (první výsledek spojení jde vždy).
   */
  const deliver = (task: ComputeTask, result: ComputeResult): void => {
    const id = computeKey(task);
    for (const sink of [...sinks.values()]) {
      if (!scopeWantsTask(sink.scope, task)) continue;
      const memory = sentKeys.get(sink.id) ?? new Map<string, string>();
      if (memory.get(id) === result.key) continue;
      memory.set(id, result.key);
      sentKeys.set(sink.id, memory);
      send(sink, result.name, result.data);
    }
  };

  return {
    add(input): Sink {
      const sink: Sink = {
        id: ++lastId,
        scope: input.scope,
        send: (name, data) => input.send(name, data),
        close: () => input.close(),
      };
      sinks.set(sink.id, sink);
      const own = byPlayer.get(sink.scope.playerId) ?? new Set<number>();
      byPlayer.set(sink.scope.playerId, own);
      own.add(sink.id);
      if (own.size > MAX_CONNECTIONS_PER_PLAYER) {
        const [oldestId] = own;
        const oldest = oldestId === undefined ? undefined : sinks.get(oldestId);
        if (oldest) {
          remove(oldest.id);
          // napřed `evicted` – zavřený EventSource by se po `retry` připojil sám a vyhodil další
          // panel, s 5+ panely dokola; prohlížeč místo toho přejde na pojistku (revize Úlohy 2)
          send(oldest, 'evicted', {});
          try {
            oldest.close();
          } catch (error) {
            fail('zavření', error);
          }
        }
      }
      return sink;
    },
    remove,
    dispatch(change): void {
      const { signals, computes } = routeChange(change, sinks.values());
      for (const { sinkId, name, data } of signals) {
        const sink = sinks.get(sinkId);
        if (sink) send(sink, name, data);
      }
      for (const task of computes) {
        const computer = deps.computers[task.what];
        if (!computer) continue;
        coalescer.run(computeKey(task), async () => deliver(task, await computer(task)));
      }
    },
    resync(): void {
      // prohlížeč po `sync` dočte vše přes routes – další výsledek výpočtu jde znovu všem
      sentKeys.clear();
      for (const sink of sinks.values()) send(sink, 'sync', { protocol: SERVER_EVENTS_PROTOCOL });
    },
    size: () => sinks.size,
  };
}

const HUB = Symbol.for('bohemia.server-events');
const globals = globalThis as unknown as Record<symbol, Hub | undefined>;

/**
 * Rozbočovač procesu webu (Rozhodnutí 11): jedináček v `globalThis` – přežije HMR i samostatně
 * sbalené moduly Next.js (změna jeho kódu v dev chce restart `npm run dev`). Při prvním volání
 * spustí jediné LISTEN spojení procesu (`listenChanges`); po jeho obnově pošle `sync` všem.
 */
export function serverEventsHub(): Hub {
  const existing = globals[HUB];
  if (existing) return existing;
  // napřed adresa – chyba nastavení nesmí v globalThis nechat rozbočovač bez posluchače
  const url = databaseUrl(process.env);
  const log = (line: string): void => console.warn(line);
  const hub = createHub({ computers: serverComputers(), coalesceMs: COALESCE_MS, log });
  globals[HUB] = hub;
  const fail = errorLog(log);
  const listener = listenChanges(url, {
    onChange: hub.dispatch,
    onReconnect: hub.resync,
    onError: (error) => fail('posluchač', error),
  });
  // spojení otevřená dřív, než první LISTEN naběhl, dostanou `sync` znovu – jinak by změna
  // zapsaná mezi jejich dočtením a začátkem LISTEN neprošla (návrh Clauda)
  void listener.ready.then(() => hub.resync());
  return hub;
}
