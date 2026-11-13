// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJourney } from '../use-journey';

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
  useJourney(running, onEnded);
  return null;
}

const view = { journeyId: 'j', tick: 1, cell: { x: 0, y: 0 }, group: { pos: { x: 0, z: 0 } } };
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;

describe('useJourney', () => {
  it('výpadek sítě dotazování nezastaví', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('síť'))
      .mockResolvedValue(ok({ view }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe running onEnded={() => undefined} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('po zmizení pohledu ohlásí konec; bez running se neptá', async () => {
    const onEnded = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ view }))
      .mockResolvedValue(ok({ view: null }));
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
