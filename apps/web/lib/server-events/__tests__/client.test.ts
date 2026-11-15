import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_MS,
  RECONNECT_MS,
  SCOPE_DEBOUNCE_MS,
  ServerEventsClient,
  type EventSourceLike,
} from '../client';

// Klient událostí ze serveru (server-events.md – Klient; plán 2026-11-15 – Rozhodnutí 6, 7 a 9):
// falešný EventSource, hodiny a viditelnost panelu. Spojení jen ve viditelném panelu, obnovy po
// `sync` s mezerou, odklady po trvalé chybě, pojistka po 30 s, výměna rozsahu bez mezery, jiná
// verze protokolu = nové načtení stránky, po `evicted` bez odkladů.

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

class FakeSource implements EventSourceLike {
  readyState = CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly handlers = new Map<string, ((e: { data: string }) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(name: string, fn: (e: { data: string }) => void): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }

  close(): void {
    this.closed = true;
    this.readyState = CLOSED;
  }

  emit(name: string, data: unknown): void {
    for (const fn of this.handlers.get(name) ?? []) fn({ data: JSON.stringify(data) });
  }

  /** Server odpověděl a poslal `sync` (jako `openEventStream`). */
  sync(protocol = 1): void {
    this.readyState = OPEN;
    this.onopen?.();
    this.emit('sync', { protocol });
  }

  /** Trvalá chyba (401, 403, restart serveru) – prohlížeč se sám nepřipojí. */
  fail(): void {
    this.readyState = CLOSED;
    this.onerror?.();
  }

  /** Přerušené spojení – prohlížeč se připojuje sám (`retry` ze serveru). */
  blip(): void {
    this.readyState = CONNECTING;
    this.onerror?.();
  }
}

interface Harness {
  client: ServerEventsClient;
  sources: FakeSource[];
  last: () => FakeSource;
  resyncs: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  setVisible: (visible: boolean) => void;
}

function harness({ visible = true }: { visible?: boolean } = {}): Harness {
  const sources: FakeSource[] = [];
  let shown = visible;
  const watchers = new Set<() => void>();
  const reload = vi.fn();
  const client = new ServerEventsClient({
    open: (url) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source;
    },
    visible: () => shown,
    onVisibilityChange: (fn) => {
      watchers.add(fn);
      return () => watchers.delete(fn);
    },
    reload,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  });
  const resyncs = vi.fn();
  client.onResync(resyncs);
  return {
    client,
    sources,
    last: () => {
      const source = sources.at(-1);
      if (!source) throw new Error('žádné spojení');
      return source;
    },
    resyncs,
    reload,
    setVisible: (value) => {
      shown = value;
      for (const fn of [...watchers]) fn();
    },
  };
}

const V1 = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServerEventsClient', () => {
  it('spojení s rozsahem jen ve viditelném panelu; skrytý panel ho zavře a nenechá časovač', () => {
    const h = harness();
    h.client.setScope({ villageId: V1 });
    expect(h.client.status()).toBe('off');
    h.client.start();
    expect(h.sources.map((s) => s.url)).toEqual([`/api/events?village=${V1}`]);
    expect(h.client.status()).toBe('connecting');
    h.last().sync();
    expect(h.client.status()).toBe('open');

    h.setVisible(false);
    expect(h.sources[0]?.closed).toBe(true);
    expect(h.client.status()).toBe('off');
    expect(vi.getTimerCount()).toBe(0);
    // ani výměna rozsahu ve skrytém panelu nic nezaloží
    h.client.setScope({ campaignId: C1 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5 * FALLBACK_MS);
    expect(h.sources).toHaveLength(1);
    expect(h.resyncs).toHaveBeenCalledTimes(1);

    // návrat do panelu: hned nové spojení se současným rozsahem, jeho `sync` = mezera → obnovy
    h.setVisible(true);
    expect(h.sources).toHaveLength(2);
    expect(h.last().url).toBe(`/api/events?village=${V1}&campaign=${C1}`);
    h.last().sync();
    expect(h.resyncs).toHaveBeenCalledTimes(2);
  });

  it('skrytý panel při startu nic neotevře a nenechá časovač', () => {
    const h = harness({ visible: false });
    h.client.start();
    expect(h.sources).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.client.status()).toBe('off');
  });

  it('první `sync` po připojení zavolá obnovy, události doručí posluchačům', () => {
    const h = harness();
    const village = vi.fn();
    const off = h.client.on('village', village);
    h.client.start();
    h.last().sync();
    expect(h.resyncs).toHaveBeenCalledTimes(1);
    h.last().emit('village', { villageId: V1, version: 8 });
    expect(village).toHaveBeenCalledWith({ villageId: V1, version: 8 });
    expect(h.client.received()).toBe(2);
    off();
    h.last().emit('village', { villageId: V1, version: 9 });
    expect(village).toHaveBeenCalledTimes(1);
  });

  it('opakovaný `sync` otevřeného spojení (obnova LISTEN) zavolá obnovy znovu', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.last().emit('sync', { protocol: 1 });
    expect(h.resyncs).toHaveBeenCalledTimes(2);
  });

  it('`sync` s jinou verzí protokolu zavolá reload a spojení zavře', () => {
    const h = harness();
    h.client.start();
    h.last().sync(2);
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.resyncs).not.toHaveBeenCalled();
    expect(h.last().closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('po trvalé chybě se připojí znovu s odklady 1 s, 2 s a 5 s; po `sync` zase od 1 s', () => {
    const h = harness();
    h.client.start();
    h.last().fail();
    expect(h.client.status()).toBe('connecting');
    vi.advanceTimersByTime(RECONNECT_MS[0] - 1);
    expect(h.sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(h.sources).toHaveLength(2);
    expect(RECONNECT_MS[0]).toBe(1_000);

    h.last().fail();
    vi.advanceTimersByTime(1_999);
    expect(h.sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(h.sources).toHaveLength(3);

    h.last().fail();
    vi.advanceTimersByTime(4_999);
    expect(h.sources).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(h.sources).toHaveLength(4);

    h.last().sync();
    h.last().fail();
    vi.advanceTimersByTime(1_000);
    expect(h.sources).toHaveLength(5);
    expect(RECONNECT_MS).toEqual([1_000, 2_000, 5_000, 10_000, 30_000]);
  });

  it('dokud spojení není otevřené, obnovy po 30 s a po 60 s; po otevření už ne', () => {
    const h = harness();
    h.client.start();
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(h.resyncs).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.resyncs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FALLBACK_MS);
    expect(h.resyncs).toHaveBeenCalledTimes(2);
    // spojení se otevřelo – jeho `sync` dočte vše (mezera), pak pojistka mlčí
    h.last().sync();
    expect(h.resyncs).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(10 * FALLBACK_MS);
    expect(h.resyncs).toHaveBeenCalledTimes(3);
    expect(FALLBACK_MS).toBe(30_000);
  });

  it('přerušené spojení: pojistka běží, `sync` po obnovení prohlížečem zavolá obnovy', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.last().blip();
    expect(h.client.status()).toBe('connecting');
    vi.advanceTimersByTime(FALLBACK_MS);
    expect(h.resyncs).toHaveBeenCalledTimes(2);
    // prohlížeč se připojil sám – nový zdroj se nezakládá
    h.last().sync();
    expect(h.sources).toHaveLength(1);
    expect(h.resyncs).toHaveBeenCalledTimes(3);
    expect(h.client.status()).toBe('open');
  });

  it('výměna rozsahu: nový zdroj až po 100 ms, starý se zavře po `sync` nového bez obnov', () => {
    const h = harness();
    const village = vi.fn();
    h.client.on('village', village);
    h.client.setScope({ villageId: V1 });
    h.client.start();
    h.last().sync();
    expect(h.resyncs).toHaveBeenCalledTimes(1);

    h.client.setScope({ campaignId: C1 });
    vi.advanceTimersByTime(SCOPE_DEBOUNCE_MS - 1);
    expect(h.sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(h.sources).toHaveLength(2);
    const [old, fresh] = h.sources as [FakeSource, FakeSource];
    expect(fresh.url).toBe(`/api/events?village=${V1}&campaign=${C1}`);
    // starý doručuje, dokud nový nenaběhne
    expect(old.closed).toBe(false);
    expect(h.client.status()).toBe('open');
    old.emit('village', { villageId: V1, version: 3 });
    expect(village).toHaveBeenCalledTimes(1);

    fresh.sync();
    expect(old.closed).toBe(true);
    expect(h.resyncs).toHaveBeenCalledTimes(1);
    expect(h.client.status()).toBe('open');
    vi.advanceTimersByTime(10 * FALLBACK_MS);
    expect(h.resyncs).toHaveBeenCalledTimes(1);
  });

  it('výměny rozsahu do 100 ms se sloučí; návrat na stejný rozsah nic neotevře', () => {
    const h = harness();
    h.client.setScope({ villageId: V1 });
    h.client.start();
    h.last().sync();
    // hook rozsahu při změně napřed vrátí svůj klíč na null a pak nastaví nový
    h.client.setScope({ villageId: null });
    h.client.setScope({ villageId: V1 });
    vi.advanceTimersByTime(SCOPE_DEBOUNCE_MS);
    expect(h.sources).toHaveLength(1);

    h.client.setScope({ campaignId: C1 });
    vi.advanceTimersByTime(50);
    h.client.setScope({ campaignId: null });
    h.client.setScope({ villageId: null });
    vi.advanceTimersByTime(SCOPE_DEBOUNCE_MS);
    expect(h.sources.map((s) => s.url)).toEqual([`/api/events?village=${V1}`, '/api/events']);
  });

  it('chyba starého spojení během výměny = mezera: `sync` nového zavolá obnovy', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.client.setScope({ villageId: V1 });
    vi.advanceTimersByTime(SCOPE_DEBOUNCE_MS);
    const [old, fresh] = h.sources as [FakeSource, FakeSource];
    old.fail();
    // nový zdroj už běží – žádné další připojení s odklady
    vi.advanceTimersByTime(RECONNECT_MS[0]);
    expect(h.sources).toHaveLength(2);
    fresh.sync();
    expect(h.resyncs).toHaveBeenCalledTimes(2);
  });

  it('drop(): spojení zavře, stav connecting, za 1 s nové spojení a jeho `sync` dočte vše', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.client.drop();
    expect(h.sources[0]?.closed).toBe(true);
    expect(h.client.status()).toBe('connecting');
    vi.advanceTimersByTime(RECONNECT_MS[0]);
    expect(h.sources).toHaveLength(2);
    h.last().sync();
    expect(h.client.status()).toBe('open');
    expect(h.resyncs).toHaveBeenCalledTimes(2);
  });

  it('`evicted`: bez odkladů 1–30 s, po jednom kole pojistky (30 s) obnovy a nové spojení', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.last().emit('evicted', {});
    expect(h.sources[0]?.closed).toBe(true);
    expect(h.client.status()).toBe('connecting');
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(h.sources).toHaveLength(1);
    expect(h.resyncs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(h.resyncs).toHaveBeenCalledTimes(2);
    expect(h.sources).toHaveLength(2);
    h.last().sync();
    expect(h.client.status()).toBe('open');
  });

  it('`evicted`: nové spojení hned při dalším návratu do panelu', () => {
    const h = harness();
    h.client.start();
    h.last().sync();
    h.last().emit('evicted', {});
    vi.advanceTimersByTime(FALLBACK_MS / 2);
    h.setVisible(false);
    expect(vi.getTimerCount()).toBe(0);
    h.setVisible(true);
    expect(h.sources).toHaveLength(2);
    expect(h.client.status()).toBe('connecting');
  });

  it('stop() zavře spojení i časovače; start() pak začne znovu (StrictMode)', () => {
    const h = harness();
    h.client.start();
    h.client.setScope({ villageId: V1 });
    h.client.stop();
    expect(h.sources[0]?.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.client.status()).toBe('off');
    h.client.start();
    expect(h.sources).toHaveLength(2);
    expect(h.last().url).toBe(`/api/events?village=${V1}`);
  });
});
