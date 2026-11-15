// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarSceneView } from '@bohemia/game';
import { useWarScene } from '../use-war-scene';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Válka ve scéně z událostí serveru (web-ui.md – Válka ve scéně; server-events.md – Válka): jeden
// dotaz při zapnutí, změně klíče a `sync`, dál stav nese událost `war` téhož klíče – i při
// vypnutém dotazu; jiný klíč se zahodí, stejný takt nepřekreslí.

let host: HTMLDivElement;
let root: Root;
let seen: WarSceneView | null | undefined;
let renders = 0;
let events: FakeServerEvents;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  seen = undefined;
  renders = 0;
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const KEY = 'settlement:s1';

function Probe({ id = 's1', enabled = true }: { id?: string; enabled?: boolean }): null {
  seen = useWarScene(`settlement:${id}`, `/api/war-scene/${id}`, enabled);
  renders++;
  return null;
}
const render = (props: { id?: string; enabled?: boolean } = {}): void =>
  act(() => root.render(events.wrap(<Probe {...props} />)));

const war = (tick: number, campaignId = 'c1'): WarSceneView =>
  ({ campaignId, tick, day: 1, side: 'defend' }) as WarSceneView;
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;
const flush = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
};

describe('useWarScene', () => {
  it('za 60 s jen jeden dotaz', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ war: war(7) }));
    vi.stubGlobal('fetch', fetchMock);
    render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/war-scene/s1');
    expect(seen).toEqual(war(7));
  });

  it('vypnutý se neptá, událost svého klíče ale použije; zapnutí se zeptá jednou', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ war: null }));
    vi.stubGlobal('fetch', fetchMock);
    render({ enabled: false });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen).toBeUndefined();
    act(() => events.emit('war', { key: KEY, war: war(9) }));
    expect(seen).toEqual(war(9));
    render({ enabled: true });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).toBeNull();
  });

  it('war jiného klíče se zahodí', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ war: null })));
    render();
    await flush();
    expect(seen).toBeNull();
    act(() => events.emit('war', { key: 'settlement:s2', war: war(9) }));
    act(() => events.emit('war', { key: 'scene:c1@1,1', war: war(9) }));
    expect(seen).toBeNull();
    act(() => events.emit('war', { key: KEY, war: war(9) }));
    expect(seen).toEqual(war(9));
    // konec války na mapě
    act(() => events.emit('war', { key: KEY, war: null }));
    expect(seen).toBeNull();
  });

  it('stejný takt nepřekreslí, nový takt nebo jiné tažení ano', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ war: war(7) })));
    render();
    await flush();
    const before = renders;
    act(() => events.emit('war', { key: KEY, war: war(7) }));
    act(() => events.emit('war', { key: KEY, war: null }));
    act(() => events.emit('war', { key: KEY, war: null }));
    expect(renders).toBe(before + 1);
    act(() => events.emit('war', { key: KEY, war: war(8) }));
    act(() => events.emit('war', { key: KEY, war: war(8, 'c2') }));
    expect(renders).toBe(before + 3);
    expect(seen).toEqual(war(8, 'c2'));
  });

  it('sync se zeptá znovu; odpověď, během které přišla událost, se zahodí', async () => {
    let answer: (body: unknown) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ war: war(7) }))
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (answer = (body) => resolve(ok(body)))),
      );
    vi.stubGlobal('fetch', fetchMock);
    render();
    await flush();
    act(() => events.resync());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // válka mezitím skončila – událost přišla dřív než odpověď staršího dotazu
    act(() => events.emit('war', { key: KEY, war: null }));
    answer({ war: war(7) });
    await flush();
    expect(seen).toBeNull();
  });

  it('jiná mapa stav zahodí a zeptá se jednou', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ war: war(7) }));
    vi.stubGlobal('fetch', fetchMock);
    render();
    await flush();
    fetchMock.mockResolvedValue(ok({ war: null }));
    render({ id: 's2' });
    expect(seen).toBeUndefined();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/war-scene/s2');
    expect(seen).toBeNull();
  });
});
