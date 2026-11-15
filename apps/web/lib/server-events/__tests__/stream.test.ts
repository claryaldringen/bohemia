import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionScope } from '../routing';

vi.mock('server-only', () => ({}));

const { createHub } = await import('../hub');
const { MAX_QUEUED_BYTES, SESSION_RECHECK_MS, SSE_HEARTBEAT_MS, SSE_RETRY_MS, openEventStream } =
  await import('../stream');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const SCOPE: ConnectionScope = {
  playerId: 'p',
  villageId: 'v1',
  settlementId: 's1',
  cell: { x: 0, y: 0 },
  campaignId: null,
  scene: null,
};

const decoder = new TextDecoder();

type Hub = ReturnType<typeof createHub>;
type Sink = ReturnType<Hub['add']>;

type Rescope = () => Promise<ConnectionScope | 'forbidden'>;

/** Otevřený proud s rozbočovačem bez počítadel, počítaným tepem, session a přezkoušením rozsahu. */
function open(
  options: {
    scope?: ConnectionScope;
    sessionValid?: () => Promise<boolean>;
    rescope?: Rescope;
    hub?: Hub;
  } = {},
): {
  hub: Hub;
  sink: () => Sink | null;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  heartbeats: () => number;
  abort: () => void;
} {
  const scope = options.scope ?? SCOPE;
  const real = options.hub ?? createHub({ computers: {}, coalesceMs: 50, log: () => {} });
  let added: Sink | null = null;
  // spojení, které proud přidal, si test podrží – jako by ho rozbočovač vybral pro událost
  const hub: Hub = {
    ...real,
    add: (sink) => (added = real.add(sink)),
  };
  const controller = new AbortController();
  let heartbeats = 0;
  const stream = openEventStream({
    hub,
    scope,
    signal: controller.signal,
    onHeartbeat: async () => {
      heartbeats++;
    },
    sessionValid: options.sessionValid ?? (async () => true),
    // bez změny práv vrací týž rozsah
    rescope: options.rescope ?? (async () => ({ ...scope })),
  });
  return {
    hub,
    sink: () => added,
    reader: stream.getReader(),
    heartbeats: () => heartbeats,
    abort: () => controller.abort(),
  };
}

/** Dočte proud do konce; vrátí text. */
async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

/** Přečte aspoň `length` znaků (nebo do konce proudu). */
async function readText(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  length: number,
): Promise<string> {
  let text = '';
  while (text.length < length) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('proud událostí /api/events', () => {
  it('první bajty jsou retry: 3000 a pak event: sync; tep hned po připojení', async () => {
    const { reader, heartbeats, hub } = open();
    const expected = `retry: ${SSE_RETRY_MS}\n\nevent: sync\ndata: {"protocol":1}\n\n`;
    expect(SSE_RETRY_MS).toBe(3_000);
    expect(await readText(reader, expected.length)).toBe(expected);
    expect(hub.size()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeats()).toBe(1);
  });

  it('po 20 s přijde : ping a druhý tep', async () => {
    const { reader, heartbeats } = open();
    const start = `retry: 3000\n\nevent: sync\ndata: {"protocol":1}\n\n`;
    await readText(reader, start.length);
    expect(SSE_HEARTBEAT_MS).toBe(20_000);
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS - 1);
    expect(heartbeats()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await readText(reader, ': ping\n\n'.length)).toBe(': ping\n\n');
    expect(heartbeats()).toBe(2);
  });

  it('neplatná session po 5 min proud zavře a rozbočovač spojení zapomene', async () => {
    const sessionValid = vi.fn(async () => false);
    const { reader, hub } = open({ sessionValid });
    expect(SESSION_RECHECK_MS).toBe(300_000);
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS - 1);
    expect(sessionValid).not.toHaveBeenCalled();
    expect(hub.size()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sessionValid).toHaveBeenCalledTimes(1);
    expect(hub.size()).toBe(0);
    // dočte, co bylo ve frontě, a pak konec
    let done = false;
    for (let i = 0; i < 100 && !done; i++) done = (await reader.read()).done;
    expect(done).toBe(true);
  });

  it('platná session proud nechá a chyba kontroly ho nezavře', async () => {
    let calls = 0;
    const { hub } = open({
      sessionValid: async () => {
        calls++;
        if (calls === 1) throw new Error('databáze spí');
        return true;
      },
    });
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS * 2);
    expect(calls).toBe(2);
    expect(hub.size()).toBe(1);
  });

  it('abort uklidí – rozbočovač, časovače, žádný další tep', async () => {
    const { reader, hub, heartbeats, abort } = open();
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.size()).toBe(1);
    abort();
    expect(hub.size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS * 3);
    expect(heartbeats()).toBe(1);
    // zbytek fronty se dočte, pak konec
    let done = false;
    for (let i = 0; i < 100 && !done; i++) done = (await reader.read()).done;
    expect(done).toBe(true);
  });

  it('zrušení čtenářem uklidí jen jednou', async () => {
    const { reader, hub, abort } = open();
    await reader.cancel();
    expect(hub.size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    abort();
    expect(hub.size()).toBe(0);
  });

  it('fronta nad mez spojení zavře (pomalý prohlížeč)', async () => {
    const { reader, hub, sink } = open();
    expect(MAX_QUEUED_BYTES).toBe(1_048_576);
    // nikdo nečte – malé události se do fronty vejdou, velká už ne
    hub.dispatch({ k: 'x', p: 'p', progress: null });
    hub.resync();
    expect(hub.size()).toBe(1);
    sink()?.send('journeys', { views: ['x'.repeat(MAX_QUEUED_BYTES)] });
    expect(hub.size()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    // další události už nic nezapíšou ani nevyhodí
    sink()?.send('notices', {});
    await expect(reader.read()).rejects.toThrow();
  });

  it('přezkoušení po 5 min ověří i rozsah – cizí ves (sesazený správce) proud zavře', async () => {
    const rescope = vi.fn<Rescope>(async () => 'forbidden');
    const { reader, hub } = open({ rescope });
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS - 1);
    expect(rescope).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rescope).toHaveBeenCalledTimes(1);
    expect(hub.size()).toBe(0);
    expect(await readAll(reader)).toContain('event: sync');
  });

  it('užší rozsah (tažení skončilo) proud zavře, stejný rozsah ho nechá', async () => {
    const withCampaign: ConnectionScope = { ...SCOPE, campaignId: 'c1' };
    const narrower = open({
      scope: withCampaign,
      rescope: async () => ({ ...withCampaign, campaignId: null }),
    });
    const same = open({ scope: withCampaign });
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS);
    expect(narrower.hub.size()).toBe(0);
    expect(same.hub.size()).toBe(1);
    // chyba přezkoušení rozsahu (výpadek databáze) spojení nechá
    const failing = open({
      rescope: async () => {
        throw new Error('databáze spí');
      },
    });
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS);
    expect(failing.hub.size()).toBe(1);
  });

  it('neplatná session rozsah už neověřuje', async () => {
    const rescope = vi.fn<Rescope>(async () => ({ ...SCOPE }));
    const { hub } = open({ sessionValid: async () => false, rescope });
    await vi.advanceTimersByTimeAsync(SESSION_RECHECK_MS);
    expect(hub.size()).toBe(0);
    expect(rescope).not.toHaveBeenCalled();
  });

  it('páté spojení hráče: nejstarší proud dostane evicted a skončí', async () => {
    const hub = createHub({ computers: {}, coalesceMs: 50, log: () => {} });
    const streams = Array.from({ length: 5 }, () => open({ hub }));
    const text = await readAll(streams[0]!.reader);
    expect(text.endsWith('event: evicted\ndata: {}\n\n')).toBe(true);
    expect(hub.size()).toBe(4);
  });
});
