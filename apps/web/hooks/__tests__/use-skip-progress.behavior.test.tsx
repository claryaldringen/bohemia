// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComputeProgress } from '@bohemia/game';
import { SKIP_PROGRESS_URL, useSkipProgress } from '../use-skip-progress';
import { fakeServerEvents, type FakeServerEvents } from './server-events-test-utils';

// Průběh přeskoku času z událostí serveru (server-events.md – Přeskok času): bez události jen
// jeden dotaz při zapnutí, `skip` mění průběh, po vypnutí null.

let host: HTMLDivElement;
let root: Root;
let events: FakeServerEvents;
let shown: ComputeProgress | null;
const fetchMock = vi.fn();

function Probe({ active }: { active: boolean }): null {
  shown = useSkipProgress(active);
  return null;
}

const answer = (progress: ComputeProgress | null): void => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ progress }), { status: 200 }));
};
const flush = (): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const render = (active: boolean): void =>
  act(() => root.render(events.wrap(<Probe active={active} />)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  answer(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSkipProgress', () => {
  it('nezapnutý se neptá; zapnutý bez události jen jednou při zapnutí', async () => {
    render(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    answer({ doneDays: 5, totalDays: 30 });
    render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SKIP_PROGRESS_URL, { cache: 'no-store' });
    expect(shown).toEqual({ doneDays: 5, totalDays: 30 });
  });

  it('`skip` mění průběh a null ho ukončí', async () => {
    render(true);
    await flush();
    act(() => events.emit('skip', { progress: { doneDays: 146, totalDays: 365 } }));
    expect(shown).toEqual({ doneDays: 146, totalDays: 365 });
    act(() => events.emit('skip', { progress: { doneDays: 300, totalDays: 365 } }));
    expect(shown).toEqual({ doneDays: 300, totalDays: 365 });
    act(() => events.emit('skip', { progress: null }));
    expect(shown).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('po vypnutí null a událost se ignoruje; obnova po mezeře se ptá jen zapnutý', async () => {
    render(true);
    await flush();
    act(() => events.emit('skip', { progress: { doneDays: 1, totalDays: 2 } }));
    render(false);
    expect(shown).toBeNull();
    act(() => events.emit('skip', { progress: { doneDays: 2, totalDays: 2 } }));
    expect(shown).toBeNull();
    act(() => events.resync());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    render(true);
    await flush();
    act(() => events.resync());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('pozdní odpověď dotazu nepřepíše novější událost', async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    render(true);
    await flush();
    act(() => events.emit('skip', { progress: { doneDays: 9, totalDays: 10 } }));
    await act(async () => {
      finish(new Response(JSON.stringify({ progress: { doneDays: 1, totalDays: 10 } })));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(shown).toEqual({ doneDays: 9, totalDays: 10 });
  });
});
