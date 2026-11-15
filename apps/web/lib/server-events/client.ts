import {
  SERVER_EVENTS_PROTOCOL,
  eventsUrl,
  type EventScope,
  type ServerEventName,
  type ServerEvents,
} from './protocol';

// Klient událostí ze serveru v prohlížeči (docs/code/server-events.md – Klient; plán 2026-11-15 –
// Rozhodnutí 6, 7 a 9): jedno spojení SSE na panel, jen ve viditelném panelu. Bez Reactu – hooky
// a `ServerEventsProvider` ho jen obalí; `EventSource`, viditelnost a hodiny dostane zvenku.

/** Pojistka: dokud spojení není otevřené, po tolika ms (a pak znovu) jedno kolo obnov. */
export const FALLBACK_MS = 30_000;
/** Odklady nového připojení po trvalé chybě (401, 403, restart serveru); poslední se opakuje. */
export const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
/** Výměna rozsahu počká, až se změny jednoho vykreslení (hooky rozsahu) sejdou. */
export const SCOPE_DEBOUNCE_MS = 100;

/** `EventSource.readyState` CLOSED – prohlížeč se sám znovu nepřipojí (jinak to zkouší sám). */
const CLOSED = 2;

/** Co klient z `EventSource` potřebuje (testy podstrčí falešný zdroj). */
export interface EventSourceLike {
  readyState: number;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(name: string, fn: (e: { data: string }) => void): void;
  close(): void;
}

/** Prohlížeč zvenku – `ServerEventsProvider` dá skutečný, testy falešný. */
export interface ServerEventsDeps {
  open(url: string): EventSourceLike;
  visible(): boolean;
  onVisibilityChange(fn: () => void): () => void;
  reload(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
}

/** Spojení: otevřené, připojuje se (i čekání na nový pokus), vypnuté (skrytý panel, stop). */
export type ServerEventsStatus = 'open' | 'connecting' | 'off';

/** Co z klienta potřebují hooky (`use-server-events.ts`; testy – `server-events-test-utils.tsx`). */
export type ServerEventsChannel = Pick<ServerEventsClient, 'on' | 'onResync' | 'setScope'>;

/** Všechny události protokolu – úplnost hlídá typ (chybějící nebo navíc = chyba překladu). */
const EVENT_NAMES = Object.keys({
  sync: true,
  village: true,
  notices: true,
  alarm: true,
  journeys: true,
  visitors: true,
  campaign: true,
  war: true,
  skip: true,
  evicted: true,
} satisfies Record<ServerEventName, true>) as ServerEventName[];

interface Connection {
  source: EventSourceLike;
  url: string;
  /** Spojení už poslalo `sync` – další `sync` téhož spojení = server mohl přijít o událost. */
  synced: boolean;
}

type Listener = (data: never) => void;

export class ServerEventsClient {
  private readonly deps: ServerEventsDeps;
  private scope: EventScope = { villageId: null, campaignId: null, scene: null };
  private readonly listeners = new Map<ServerEventName, Set<Listener>>();
  private readonly resyncs = new Set<() => void>();
  private started = false;
  /** Panel je vidět – jen tehdy smí existovat spojení i časovače. */
  private shown = false;
  private unwatch: (() => void) | null = null;
  /** Spojení, které doručuje (po svém `sync`). */
  private active: Connection | null = null;
  /** Nové spojení (výměna rozsahu, další pokus), které ještě nemá `sync`. */
  private pending: Connection | null = null;
  /** `active` doručuje (od `sync` do chyby). */
  private open = false;
  /**
   * Od posledního dočtení mohla událost uniknout (start, výpadek, skrytý panel) – další `sync`
   * zavolá obnovy. Výměna rozsahu mezeru nedělá: staré spojení doručuje, dokud nové nenaběhne.
   */
  private gap = true;
  /** Kolikátý pokus o nové připojení po trvalé chybě (odklad z `RECONNECT_MS`). */
  private attempts = 0;
  /** Spojení vyhodil novější panel – znovu až po kole pojistky nebo po návratu do panelu. */
  private evicted = false;
  private count = 0;
  private reconnectTimer: unknown = null;
  private fallbackTimer: unknown = null;
  private scopeTimer: unknown = null;

  constructor(deps: ServerEventsDeps) {
    this.deps = deps;
  }

  /** Začne: sleduje viditelnost panelu, ve viditelném hned otevře spojení. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unwatch = this.deps.onVisibilityChange(() => this.onVisibility());
    this.shown = this.deps.visible();
    if (this.shown) this.connect();
  }

  /** Skončí: zavře spojení a zruší časovače; `start()` pak začne znovu. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.unwatch?.();
    this.unwatch = null;
    this.disconnect();
  }

  /**
   * Změní rozsah (hooky – ves, tažení, cizí mapa). Nové spojení se otevře po `SCOPE_DEBOUNCE_MS`;
   * staré doručuje, dokud nové nepošle `sync`. Bez spojení (skrytý panel, čekání na další pokus)
   * se jen zapamatuje – další připojení ho použije.
   */
  setScope(part: Partial<EventScope>): void {
    this.scope = { ...this.scope, ...part };
    if (this.active === null && this.pending === null) return;
    this.clearScopeTimer();
    this.scopeTimer = this.deps.setTimer(() => {
      this.scopeTimer = null;
      this.applyScope();
    }, SCOPE_DEBOUNCE_MS);
  }

  /** Posluchač události `name`; vrátí odhlášení. */
  on<K extends ServerEventName>(name: K, fn: (data: ServerEvents[K]) => void): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    this.listeners.set(name, set);
    const listener = fn as Listener;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Obnova všeho, co panel ukazuje (`sync` s mezerou, kolo pojistky); vrátí odhlášení. */
  onResync(fn: () => void): () => void {
    this.resyncs.add(fn);
    return () => {
      this.resyncs.delete(fn);
    };
  }

  status(): ServerEventsStatus {
    if (!this.started || !this.shown) return 'off';
    return this.open ? 'open' : 'connecting';
  }

  /** Kolik událostí (i `sync`) spojení doručila – e2e háček `serverEvents`. */
  received(): number {
    return this.count;
  }

  /** Výpadek sítě (e2e háček `dropServerEvents`): zavře spojení a připojí se znovu s odklady. */
  drop(): void {
    if (!this.started || !this.shown) return;
    this.close(this.active);
    this.close(this.pending);
    this.active = null;
    this.pending = null;
    this.clearScopeTimer();
    this.lose();
    this.scheduleReconnect();
  }

  private onVisibility(): void {
    if (!this.started) return;
    const shown = this.deps.visible();
    if (shown === this.shown) return;
    this.shown = shown;
    if (shown) this.connect();
    else this.disconnect();
  }

  /** Otevře spojení se současným rozsahem a pustí pojistku (do `sync` se nic nedoručuje). */
  private connect(): void {
    this.evicted = false;
    this.openPending();
    this.ensureFallback();
  }

  /** Zavře obě spojení a zruší všechny časovače (skrytý panel, stop, nové načtení stránky). */
  private disconnect(): void {
    this.close(this.active);
    this.close(this.pending);
    this.active = null;
    this.pending = null;
    this.open = false;
    this.gap = true;
    this.evicted = false;
    this.attempts = 0;
    this.clearReconnectTimer();
    this.clearFallbackTimer();
    this.clearScopeTimer();
  }

  private openPending(): void {
    this.close(this.pending);
    const url = eventsUrl(this.scope);
    const source = this.deps.open(url);
    const conn: Connection = { source, url, synced: false };
    this.pending = conn;
    source.onerror = () => this.onError(conn);
    for (const name of EVENT_NAMES) {
      source.addEventListener(name, (event) => this.onEvent(conn, name, event.data));
    }
  }

  private close(conn: Connection | null): void {
    if (conn === null) return;
    conn.source.onerror = null;
    conn.source.close();
  }

  /** Rozsah po výměně: stejná adresa jako spojení, které už je (nebo se otevírá) – nic. */
  private applyScope(): void {
    const url = eventsUrl(this.scope);
    if (this.pending !== null) {
      if (this.pending.url === url) return;
      if (this.active?.url === url) {
        // návrat na rozsah, který doručuje staré spojení – nové není potřeba
        this.close(this.pending);
        this.pending = null;
        return;
      }
      this.openPending();
      return;
    }
    if (this.active !== null && this.active.url !== url) this.openPending();
  }

  private onEvent(conn: Connection, name: ServerEventName, raw: string): void {
    if (conn !== this.active && conn !== this.pending) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    this.count += 1;
    if (name === 'sync') {
      if (!this.onSync(conn, data as ServerEvents['sync'])) return;
    } else if (name === 'evicted') this.onEvicted(conn);
    for (const fn of [...(this.listeners.get(name) ?? [])]) {
      this.safely(() => (fn as (value: unknown) => void)(data));
    }
  }

  /** `sync`: spojení doručuje; s mezerou (nebo opakovaný) zavolá obnovy. False – nové načtení. */
  private onSync(conn: Connection, data: ServerEvents['sync']): boolean {
    if (data.protocol !== SERVER_EVENTS_PROTOCOL) {
      // starý kód v prohlížeči po nasazení – načíst stránku znovu (Rozhodnutí 9)
      this.stop();
      this.deps.reload();
      return false;
    }
    const repeated = conn.synced;
    conn.synced = true;
    if (conn === this.pending) {
      // výměna rozsahu nebo nové připojení: staré spojení se zavře až teď – mezera nevznikne
      this.close(this.active);
      this.active = conn;
      this.pending = null;
    }
    this.open = true;
    this.attempts = 0;
    this.clearReconnectTimer();
    this.clearFallbackTimer();
    // opakovaný `sync` téhož spojení: server obnovil LISTEN a mohl o událost přijít
    if (this.gap || repeated) {
      this.gap = false;
      this.resync();
    }
    return true;
  }

  private onError(conn: Connection): void {
    if (conn !== this.active && conn !== this.pending) return;
    if (conn.source.readyState !== CLOSED) {
      // prohlížeč se připojuje sám (`retry` ze serveru) – do jeho `sync` mohla událost uniknout
      if (conn === this.active) this.lose();
      return;
    }
    this.close(conn);
    if (conn === this.active) {
      this.active = null;
      this.lose();
    } else this.pending = null;
    // nové spojení čeká na `sync` – převezme ho samo
    if (this.pending === null) this.scheduleReconnect();
  }

  /**
   * Novější panel téhož hráče spojení vyhodil (nad `MAX_CONNECTIONS_PER_PLAYER`). Připojit se
   * hned by vyhodilo další panel – zůstane pojistka a nové spojení až po jejím kole (30 s) nebo
   * po návratu do panelu.
   */
  private onEvicted(conn: Connection): void {
    this.close(conn);
    if (conn === this.active) {
      this.active = null;
      this.lose();
    } else if (conn === this.pending) this.pending = null;
    if (this.active === null && this.pending === null) {
      this.evicted = true;
      this.clearReconnectTimer();
    }
  }

  /** Spojení přestalo doručovat – mezera a pojistka. */
  private lose(): void {
    this.open = false;
    this.gap = true;
    this.ensureFallback();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.evicted) return;
    const ms = RECONNECT_MS[Math.min(this.attempts, RECONNECT_MS.length - 1)] ?? FALLBACK_MS;
    this.attempts += 1;
    this.reconnectTimer = this.deps.setTimer(() => {
      this.reconnectTimer = null;
      this.openPending();
    }, ms);
  }

  private ensureFallback(): void {
    if (this.fallbackTimer !== null || this.open) return;
    this.fallbackTimer = this.deps.setTimer(() => this.fallbackRound(), FALLBACK_MS);
  }

  /** Kolo pojistky: obnovy všeho; po `evicted` i nové spojení. Další kolo za 30 s. */
  private fallbackRound(): void {
    this.fallbackTimer = null;
    if (this.open) return;
    this.resync();
    if (this.evicted && this.active === null && this.pending === null) {
      this.evicted = false;
      this.openPending();
    }
    this.ensureFallback();
  }

  private resync(): void {
    for (const fn of [...this.resyncs]) this.safely(fn);
  }

  /** Chyba jednoho posluchače nesmí zastavit ostatní ani stav spojení. */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      console.error('Obsluha události ze serveru selhala.', error);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    this.deps.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer === null) return;
    this.deps.clearTimer(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private clearScopeTimer(): void {
    if (this.scopeTimer === null) return;
    this.deps.clearTimer(this.scopeTimer);
    this.scopeTimer = null;
  }
}
