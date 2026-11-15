// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpeditions } from '../use-journey';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({ running, onEnded }: { running: boolean; onEnded: () => void }): null {
  useExpeditions(running, onEnded);
  return null;
}

const party = (id: number, groups: number[]): unknown => ({
  id,
  groups: groups.map((g) => ({ id: g, cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } })),
});
const expedition = (tick: number, parties: unknown[]): unknown => ({
  journeyId: 'j',
  tick,
  parties,
});
const views = [expedition(1, [party(0, [0, 1])])];
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;

describe('useExpeditions', () => {
  it('výpadek sítě dotazování nezastaví', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('síť'))
      .mockResolvedValue(ok({ views }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe running onEnded={() => undefined} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('zmizí hlouček (druhý zůstává) – konec jednou a dotazování běží dál', async () => {
    const onEnded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ views }))
      .mockResolvedValue(ok({ views: [expedition(2, [party(0, [0])])] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe running onEnded={onEnded} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('po zmizení všech pohledů ohlásí konec; bez running se neptá', async () => {
    const onEnded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ views }))
      .mockResolvedValue(ok({ views: [] }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe running onEnded={onEnded} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls.length;
    act(() => root.render(<Probe running={false} onEnded={onEnded} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
