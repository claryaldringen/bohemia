// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionVisitor } from '@bohemia/game';
import { useJourneyVisitors } from '../use-journey-visitors';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Jezdci na mapě vsi (journey.md – Scéna vsi): jeden dotaz při zapnutí, změně vsi a `sync`, dál je
// nese událost `visitors`; událost jiné vsi se zahodí, stejný klíč se nepřekreslí.

let host: HTMLDivElement;
let root: Root;
let seen: ExpeditionVisitor[] = [];
let renders = 0;
let events: FakeServerEvents;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  seen = [];
  renders = 0;
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({
  villageId,
  enabled = true,
}: {
  villageId: string | null;
  enabled?: boolean;
}): null {
  seen = useJourneyVisitors(villageId, enabled);
  renders++;
  return null;
}
const render = (villageId: string | null, enabled = true): void =>
  act(() => root.render(events.wrap(<Probe villageId={villageId} enabled={enabled} />)));

const visitor: ExpeditionVisitor = {
  journeyId: 'j2',
  partyId: 0,
  own: false,
  villageId: null,
  leaderName: 'Vratislav',
  houseName: 'Lučané',
  tick: 10,
  groups: [{ id: 0, pos: { x: 1, z: 2 }, goal: null }],
  people: [
    { personId: 1, group: 0, lord: true, mounted: true, led: false, female: false, child: false },
  ],
};
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;
const flush = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
};

describe('useJourneyVisitors', () => {
  it('bez událostí jeden dotaz', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ visitors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render('v1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/journey?visitors=v1');
  });

  it('událost téže vsi nastaví jezdce, stejný klíč nepřekreslí', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ visitors: [] })));
    render('v1');
    await flush();
    act(() => events.emit('visitors', { villageId: 'v1', visitors: [visitor] }));
    expect(seen).toEqual([visitor]);
    const before = renders;
    act(() => events.emit('visitors', { villageId: 'v1', visitors: [{ ...visitor }] }));
    expect(renders).toBe(before);
  });

  it('událost jiné vsi se zahodí', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ visitors: [] })));
    render('v1');
    await flush();
    act(() => events.emit('visitors', { villageId: 'v2', visitors: [visitor] }));
    expect(seen).toEqual([]);
  });

  it('prázdný seznam po neprázdném vrátí []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ visitors: [] })));
    render('v1');
    await flush();
    act(() => events.emit('visitors', { villageId: 'v1', visitors: [visitor] }));
    expect(seen).toEqual([visitor]);
    act(() => events.emit('visitors', { villageId: 'v1', visitors: [] }));
    expect(seen).toEqual([]);
  });

  it('výpadek sítě a chyba serveru nechají poslední jezdce; sync se zeptá znovu', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ visitors: [visitor] }))
      .mockRejectedValueOnce(new Error('síť'))
      .mockResolvedValueOnce(ok({ error: 'Nejste přihlášen.' }));
    vi.stubGlobal('fetch', fetchMock);
    render('v1');
    await flush();
    expect(seen).toEqual([visitor]);
    await act(async () => {
      events.resync();
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      events.resync();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([visitor]);
  });

  it('enabled=false – událost jezdce ukáže, dotaz se neposílá; přepnutí enabled seznam nesmaže', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ visitors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render('v1', false);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => events.emit('visitors', { villageId: 'v1', visitors: [visitor] }));
    expect(seen).toEqual([visitor]);
    render('v1', true);
    expect(seen).toEqual([visitor]);
  });

  it('bez vsi se neptá', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ visitors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });
});
