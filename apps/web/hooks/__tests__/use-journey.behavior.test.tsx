// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpeditionView } from '@/lib/journey-view';
import { useExpeditions, type ExpeditionsHandle } from '../use-journey';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Výpravy z událostí serveru (server-events.md – Výpravy): jeden dotaz při zapnutí, na `sync`
// a `refresh`, jinak stav nese událost `journeys`; bez `running` se událost zahodí.

let host: HTMLDivElement;
let root: Root;
let events: FakeServerEvents;
let handle: ExpeditionsHandle;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({ running, onEnded }: { running: boolean; onEnded: () => void }): null {
  handle = useExpeditions(running, onEnded);
  return null;
}

const render = (running: boolean, onEnded: () => void = () => undefined): void =>
  act(() => root.render(events.wrap(<Probe running={running} onEnded={onEnded} />)));

const party = (id: number, groups: number[]): unknown => ({
  id,
  groups: groups.map((g) => ({ id: g, cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } })),
});
const expedition = (tick: number, parties: unknown[]): ExpeditionView =>
  ({ journeyId: 'j', tick, parties }) as unknown as ExpeditionView;
const views = [expedition(1, [party(0, [0, 1])])];
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;
const emit = (data: ExpeditionView[]): void => act(() => events.emit('journeys', { views: data }));

describe('useExpeditions', () => {
  it('za 60 s bez událostí jen dotaz při zapnutí', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ views }));
    vi.stubGlobal('fetch', fetchMock);
    render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/journey');
    expect(handle.latest).toEqual(views);
  });

  it('výpadek sítě při dotazu nevyhodí výjimku a událost pak stav doplní', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('síť')));
    render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(handle.latest).toEqual([]);
    emit(views);
    expect(handle.latest).toEqual(views);
  });

  it('journeys s novým taktem posune latest, stejný takt ne', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ views })));
    render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const next = [expedition(2, [party(0, [0, 1])])];
    emit(next);
    expect(handle.latest).toBe(next);
    emit([expedition(2, [party(0, [0, 1])])]);
    expect(handle.latest).toBe(next);
  });

  it('zmizelý hlouček zavolá onPartyEnded jednou, události dál platí', async () => {
    const onEnded = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ views })));
    render(true, onEnded);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    emit([expedition(2, [party(0, [0])])]);
    expect(onEnded).toHaveBeenCalledTimes(1);
    emit([expedition(3, [party(0, [0])])]);
    expect(onEnded).toHaveBeenCalledTimes(1);
    emit([]);
    expect(onEnded).toHaveBeenCalledTimes(2);
    expect(handle.latest).toEqual([]);
  });

  it('running: false událost ignoruje a nic nedotazuje', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ views }));
    vi.stubGlobal('fetch', fetchMock);
    render(false);
    emit(views);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handle.latest).toEqual([]);
  });

  it('sync (mezera) s running zavolá dotaz, bez running ne; refresh se ptá hned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ views }));
    vi.stubGlobal('fetch', fetchMock);
    render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      events.resync();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      handle.refresh();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    render(false);
    await act(async () => {
      events.resync();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
