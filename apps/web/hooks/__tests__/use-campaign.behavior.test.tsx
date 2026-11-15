// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignView } from '@bohemia/game';
import { useCampaign, type CampaignHandle } from '../use-campaign';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Tažení z událostí serveru (web-ui.md – Dotazování na tažení; server-events.md – Válka): jeden
// `GET /api/campaign/<id>?since=-1` při otevření, na `sync` a `refresh`, dál pohled nese událost
// `campaign`; přítomnost vůdce hlásí spojení samo – hook žádný maják neposílá.

let host: HTMLDivElement;
let root: Root;
let handle: CampaignHandle;
let events: FakeServerEvents;

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

function Probe({ campaignId }: { campaignId: string | null }): null {
  handle = useCampaign(campaignId);
  return null;
}
const render = (campaignId: string | null): void =>
  act(() => root.render(events.wrap(<Probe campaignId={campaignId} />)));

const view = (tick: number, o: Partial<CampaignView> = {}): CampaignView =>
  ({
    id: 'c1',
    tick,
    fresh: true,
    phase: 'march',
    leader: true,
    men: [],
    allies: [],
    groups: [],
    foreign: [],
    ...o,
  }) as unknown as CampaignView;
const ok = (body: unknown, status = 200): Response =>
  ({ status, json: () => Promise.resolve(body) }) as Response;
const flush = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
};

describe('useCampaign', () => {
  it('za 60 s bez události jen dotaz při otevření a žádná přítomnost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ view: view(40) }));
    vi.stubGlobal('fetch', fetchMock);
    render('c1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // jediné volání serveru – dotaz na tažení (přítomnost už neposílá prohlížeč)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/campaign/c1?since=-1');
    expect(handle.view?.tick).toBe(40);
    expect(handle.gone).toBe(false);
  });

  it('campaign s novým taktem posune pohled, starší takt a jiné tažení se zahodí', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ view: view(40) })));
    render('c1');
    await flush();
    expect(handle.view?.tick).toBe(40);
    act(() => events.emit('campaign', { campaignId: 'c1', view: view(80) }));
    expect(handle.view?.tick).toBe(80);
    act(() => events.emit('campaign', { campaignId: 'c1', view: view(60) }));
    act(() => events.emit('campaign', { campaignId: 'c2', view: view(120, { id: 'c2' }) }));
    await flush();
    expect(handle.view?.tick).toBe(80);
    expect(handle.sample(performance.now())?.tick).toBe(80);
    // změna fáze v témž taktu (konec tažení) projde
    act(() => events.emit('campaign', { campaignId: 'c1', view: view(80, { phase: 'done' }) }));
    expect(handle.view?.phase).toBe('done');
  });

  it('odpověď dotazu, během kterého přišla událost, se zahodí – konec se nevrátí na pochod (revize Úlohy 5)', async () => {
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ),
    );
    render('c1');
    act(() => events.emit('campaign', { campaignId: 'c1', view: view(80, { phase: 'done' }) }));
    expect(handle.view?.phase).toBe('done');
    // dotaz spočtený před koncem odpoví pochod v témž taktu
    answer(ok({ view: view(80) }));
    await flush();
    expect(handle.view?.phase).toBe('done');
    expect(handle.sample(performance.now())?.phase).toBe('done');
  });

  it('polohy mezi dvěma body se interpolují po dobu mezi nimi (nejvýš 15 s)', async () => {
    const man = (x: number): CampaignView['men'][number] =>
      ({ member: 1, cell: { x: 0, y: 0 }, pos: { x, z: 0 } }) as CampaignView['men'][number];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ view: view(40, { men: [man(0)] }) })));
    render('c1');
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    act(() => events.emit('campaign', { campaignId: 'c1', view: view(80, { men: [man(100)] }) }));
    // rozpětí = doba mezi body (≈ 10 s): po 5 s je muž v polovině cesty
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const x = handle.view?.men[0]?.pos.x ?? -1;
    expect(x).toBeGreaterThan(40);
    expect(x).toBeLessThan(60);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(handle.view?.men[0]?.pos.x).toBe(100);
  });

  it('view: null dá gone, stejně jako 404 dotazu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ view: view(40) })));
    render('c1');
    await flush();
    act(() => events.emit('campaign', { campaignId: 'c1', view: null }));
    expect(handle.gone).toBe(true);
    // jiné tažení – gone se smaže a 404 dotazu ho nastaví znovu
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ error: 'To tažení neznáš.' }, 404)));
    render('c2');
    expect(handle.gone).toBe(false);
    await flush();
    expect(handle.gone).toBe(true);
  });

  it('sync a refresh se zeptají znovu – jednou', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ view: view(40) }));
    vi.stubGlobal('fetch', fetchMock);
    render('c1');
    await flush();
    act(() => events.resync());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => handle.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // zavřené tažení se neptá
    render(null);
    act(() => events.resync());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
