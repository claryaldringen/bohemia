import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbChange } from '@bohemia/db';
import type { Computers } from '../hub';
import type { ServerEventName } from '../protocol';
import type { ComputeTask, ConnectionScope } from '../routing';

vi.mock('server-only', () => ({}));

const { MAX_CONNECTIONS_PER_PLAYER, createHub } = await import('../hub');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const COALESCE_MS = 50;

function scope(over: Partial<ConnectionScope> & { playerId: string }): ConnectionScope {
  return {
    villageId: null,
    settlementId: null,
    cell: null,
    campaignId: null,
    scene: null,
    ...over,
  };
}

/** Spojení, které si zapisuje, co dostalo. */
function recorder(s: ConnectionScope): {
  scope: ConnectionScope;
  send: (name: ServerEventName, data: unknown) => void;
  close: () => void;
  sent: { name: ServerEventName; data: unknown }[];
  closed: () => number;
} {
  const sent: { name: ServerEventName; data: unknown }[] = [];
  let closed = 0;
  return {
    scope: s,
    send: (name, data) => sent.push({ name, data }),
    close: () => {
      closed++;
    },
    sent,
    closed: () => closed,
  };
}

function hubWith(computers: Computers = {}): {
  hub: ReturnType<typeof createHub>;
  log: ReturnType<typeof vi.fn<(line: string) => void>>;
} {
  const log = vi.fn<(line: string) => void>();
  return { hub: createHub({ computers, coalesceMs: COALESCE_MS, log }), log };
}

const journeyChange: DbChange = { k: 'j', id: 'j-1', t: 1, p: 'p', c: [], big: false };

describe('rozbočovač událostí', () => {
  it('dispatch pošle signály správným spojením', () => {
    const { hub } = hubWith();
    const own = recorder(scope({ playerId: 'p', villageId: 'v1', settlementId: 's1' }));
    const steward = recorder(scope({ playerId: 'q', villageId: 'v1', settlementId: 's1' }));
    const stranger = recorder(scope({ playerId: 'r', villageId: 'v9', settlementId: 's9' }));
    for (const sink of [own, steward, stranger]) hub.add(sink);
    hub.dispatch({ k: 'v', id: 'v1', ver: 4, p: 'p' });
    hub.dispatch({ k: 'n', p: 'r' });
    expect(own.sent).toEqual([{ name: 'village', data: { villageId: 'v1', version: 4 } }]);
    expect(steward.sent).toEqual([{ name: 'village', data: { villageId: 'v1', version: 4 } }]);
    expect(stranger.sent).toEqual([{ name: 'notices', data: {} }]);
  });

  it('výsledek výpočtu se stejným klíčem podruhé nejde, změněný jde', async () => {
    let key = 'takt-1';
    const journeys = vi.fn(async (task: ComputeTask) => ({
      name: 'journeys' as const,
      data: { views: [task.playerId] },
      key,
    }));
    const { hub } = hubWith({ journeys });
    const first = recorder(scope({ playerId: 'p' }));
    const second = recorder(scope({ playerId: 'p' }));
    const other = recorder(scope({ playerId: 'q' }));
    for (const sink of [first, second, other]) hub.add(sink);

    hub.dispatch(journeyChange);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(journeys).toHaveBeenCalledTimes(1);
    expect(first.sent).toEqual([{ name: 'journeys', data: { views: ['p'] } }]);
    expect(second.sent).toEqual([{ name: 'journeys', data: { views: ['p'] } }]);
    expect(other.sent).toEqual([]);

    hub.dispatch(journeyChange);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(journeys).toHaveBeenCalledTimes(2);
    expect(first.sent).toHaveLength(1);

    key = 'takt-2';
    hub.dispatch(journeyChange);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(first.sent).toHaveLength(2);
    expect(second.sent).toHaveLength(2);
  });

  it('paměť klíčů hráče se smaže s jeho posledním spojením – první výsledek jde vždy', async () => {
    const journeys = async (): Promise<{ name: 'journeys'; data: unknown; key: string }> => ({
      name: 'journeys',
      data: { views: [] },
      key: 'stejný',
    });
    const { hub } = hubWith({ journeys });
    const before = hub.add(recorder(scope({ playerId: 'p' })));
    hub.dispatch(journeyChange);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    hub.remove(before.id);
    expect(hub.size()).toBe(0);

    const after = recorder(scope({ playerId: 'p' }));
    hub.add(after);
    hub.dispatch(journeyChange);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(after.sent).toEqual([{ name: 'journeys', data: { views: [] } }]);
  });

  it('páté spojení hráče zavře nejstarší', () => {
    const { hub } = hubWith();
    const own = Array.from({ length: MAX_CONNECTIONS_PER_PLAYER + 1 }, () =>
      recorder(scope({ playerId: 'p' })),
    );
    const other = recorder(scope({ playerId: 'q' }));
    hub.add(other);
    const added = own.map((sink) => hub.add(sink));
    expect(MAX_CONNECTIONS_PER_PLAYER).toBe(4);
    expect(own[0]!.closed()).toBe(1);
    expect(own.slice(1).every((sink) => sink.closed() === 0)).toBe(true);
    expect(other.closed()).toBe(0);
    expect(hub.size()).toBe(MAX_CONNECTIONS_PER_PLAYER + 1);
    // zavřené spojení už nic nedostane, odebrání podruhé nevadí
    hub.dispatch({ k: 'n', p: 'p' });
    expect(own[0]!.sent).toEqual([]);
    expect(own[1]!.sent).toEqual([{ name: 'notices', data: {} }]);
    hub.remove(added[0]!.id);
    expect(hub.size()).toBe(MAX_CONNECTIONS_PER_PLAYER + 1);
  });

  it('resync pošle sync všem spojením', () => {
    const { hub } = hubWith();
    const sinks = [recorder(scope({ playerId: 'p' })), recorder(scope({ playerId: 'q' }))];
    for (const sink of sinks) hub.add(sink);
    hub.resync();
    for (const sink of sinks) expect(sink.sent).toEqual([{ name: 'sync', data: { protocol: 1 } }]);
  });

  it('úloha bez počítadla se přeskočí; chyba výpočtu jde do logu s [events] nejvýš jednou za minutu', async () => {
    const campaign = vi.fn(async (): Promise<never> => {
      throw new Error('databáze spí');
    });
    const { hub, log } = hubWith({ campaign });
    hub.add(recorder(scope({ playerId: 'p', campaignId: 'c1' })));
    // výprava (journeys) počítadlo nemá – nic se nestane
    hub.dispatch(journeyChange);
    const change: DbChange = { k: 'c', id: 'c1', t: 1, c: [], a: [], big: false };
    hub.dispatch(change);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(campaign).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\[events\] .*databáze spí/);

    hub.dispatch(change);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(campaign).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    hub.dispatch(change);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
