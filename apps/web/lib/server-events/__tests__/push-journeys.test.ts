import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionView, ExpeditionVisitor } from '@bohemia/game';
import type { ServerEventName } from '../protocol';
import type { ConnectionScope } from '../routing';

vi.mock('server-only', () => ({}));

const { createHub } = await import('../hub');
const { createJourneyComputers } = await import('../push-journeys');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const COALESCE_MS = 50;

const expedition = (tick: number): ExpeditionView =>
  ({ journeyId: 'j1', tick, parties: [] }) as unknown as ExpeditionView;
const visitor = (tick: number): ExpeditionVisitor =>
  ({ journeyId: 'j2', partyId: 0, tick, people: [] }) as unknown as ExpeditionVisitor;

function sink(scope: Partial<ConnectionScope>): {
  scope: ConnectionScope;
  send: (name: ServerEventName, data: unknown) => void;
  close: () => void;
  sent: { name: ServerEventName; data: unknown }[];
} {
  const sent: { name: ServerEventName; data: unknown }[] = [];
  return {
    scope: {
      playerId: 'p',
      villageId: null,
      settlementId: null,
      cell: null,
      campaignId: null,
      scene: null,
      ...scope,
    },
    send: (name, data) => sent.push({ name, data }),
    close: () => undefined,
    sent,
  };
}

describe('počítadla výprav', () => {
  it('journeys nese pohledy a klíč podle taktů, visitors ves a klíč jezdců', async () => {
    const computers = createJourneyComputers({
      views: async () => [expedition(4)],
      visitors: async () => [visitor(7)],
    });
    const journeys = await computers.journeys!({ what: 'journeys', playerId: 'p' });
    expect(journeys.name).toBe('journeys');
    expect(journeys.data).toEqual({ views: [expedition(4)] });
    expect(journeys.key).toBe('j1@4');
    const visitors = await computers.visitors!({
      what: 'visitors',
      playerId: 'p',
      villageId: 'v1',
    });
    expect(visitors.name).toBe('visitors');
    expect(visitors.data).toEqual({ villageId: 'v1', visitors: [visitor(7)] });
    expect(visitors.key.startsWith('v1')).toBe(true);
  });

  it('5 změn téže výpravy dá nejvýš 2 výpočty pohledů', async () => {
    const views = vi.fn(async (): Promise<ExpeditionView[]> => [expedition(1)]);
    const computers = createJourneyComputers({ views, visitors: async () => [] });
    const hub = createHub({ computers, coalesceMs: COALESCE_MS, log: () => undefined });
    hub.add(sink({}));
    for (let t = 1; t <= 5; t++) {
      hub.dispatch({ k: 'j', id: 'j1', t, p: 'p', c: [], big: false });
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(COALESCE_MS * 3);
    expect(views.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(views.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('stejný seznam jezdců podruhé nepřijde', async () => {
    const computers = createJourneyComputers({
      views: async () => [],
      visitors: async () => [visitor(3)],
    });
    const hub = createHub({ computers, coalesceMs: COALESCE_MS, log: () => undefined });
    const rider = sink({ villageId: 'v1', settlementId: 's1', cell: { x: 1, y: 1 } });
    hub.add(rider);
    const change = { k: 'j', id: 'j2', t: 1, p: 'cizi', c: [[1, 1]], big: false } as const;
    hub.dispatch({ ...change, c: [[1, 1]] });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    hub.dispatch({ ...change, t: 2, c: [[1, 1]] });
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(rider.sent.filter((s) => s.name === 'visitors')).toHaveLength(1);
  });
});
