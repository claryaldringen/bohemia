// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JourneyVisitor } from '@bohemia/game';
import { useJourneyVisitors } from '../use-journey-visitors';

// Jezdci na mapě vsi (journey.md – Scéna vsi): s jezdci 2× za sekundu, jinak po 5 s; výpadek sítě
// dotazování nezastaví ani nevyhodí výjimku.

let host: HTMLDivElement;
let root: Root;
let seen: JourneyVisitor[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  seen = [];
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({ villageId }: { villageId: string | null }): null {
  seen = useJourneyVisitors(villageId, true);
  return null;
}

const visitor: JourneyVisitor = {
  journeyId: 'j2',
  own: false,
  leader: 'Vratislav',
  house: 'Lučané',
  tick: 10,
  pos: { x: 1, z: 2 },
  goal: null,
  men: [{ lord: true, mounted: true }],
};
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;

describe('useJourneyVisitors', () => {
  it('bez jezdců se ptá po 5 s, s jezdci 2× za sekundu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ visitors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe villageId="v1" />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    // poprvé hned po otevření mapy (0,5 s), pak po 5 s
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/journey?visitors=v1');
    fetchMock.mockResolvedValue(ok({ visitors: [visitor] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(seen).toEqual([visitor]);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls.length - calls).toBeGreaterThanOrEqual(3);
  });

  it('výpadek sítě a chyba serveru dotazování nezastaví a nechají poslední jezdce', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ visitors: [visitor] }))
      .mockRejectedValueOnce(new Error('síť'))
      .mockResolvedValueOnce(ok({ error: 'Nejste přihlášen.' }))
      .mockResolvedValue(ok({ visitors: [visitor] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe villageId="v1" />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(seen).toEqual([visitor]);
  });

  it('bez vsi se neptá', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ visitors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe villageId={null} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });
});
