// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownMapContext, useKnownMapList } from '../../hud/KnownMapEye';
import { useKnownMap, type KnownMap } from '../use-known-map';

// Seznam známých map (journey.md – Známá mapa; závěrečná recenze – Important 5): čte se jen pro
// otevřený panel s oky – při jeho otevření a po návratu ze známé mapy, bez dotazování na pozadí.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let game: KnownMap | null = null;
let root: Root;
const fetchMock = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ known: [] }) }));

/** Panel s oky (Rod a vazalové, Vojsko). */
function Panel(): null {
  useKnownMapList();
  return null;
}

function Game({ panel }: { panel: boolean }): ReactElement {
  const known = useKnownMap();
  game = known;
  return (
    <KnownMapContext.Provider value={known.actions}>
      {panel ? <Panel /> : null}
    </KnownMapContext.Provider>
  );
}

async function show(panel: boolean): Promise<void> {
  await act(async () => {
    root.render(<Game panel={panel} />);
    await Promise.resolve();
  });
}

/** Minuta hry bez zásahu hráče – dotazování na pozadí by se tu ukázalo. */
async function minute(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useKnownMap – seznam známých map', () => {
  it('bez otevřeného panelu se seznam nečte – ani po minutě', async () => {
    await show(false);
    await minute();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('otevření panelu ho načte jednou, na pozadí se neobnovuje; další otevření znovu', async () => {
    await show(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await minute();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(game?.actions.status).toBe('ready');
    await show(false);
    await show(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('na známé mapě se nečte; po návratu se seznam načte znovu', async () => {
    await show(true);
    await act(async () => {
      game?.actions.open('h1', { x: 1, y: 0 });
      await Promise.resolve();
    });
    await minute();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      game?.back();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('dotaz má časový limit; po selhání (i vypršení) se načtení uvolní a jde zkusit znovu', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new DOMException('limit', 'TimeoutError')),
    );
    await show(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(game?.actions.status).toBe('error');
    await show(false);
    await show(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(game?.actions.status).toBe('ready');
  });
});
