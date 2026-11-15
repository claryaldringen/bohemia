// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarSceneView } from '@bohemia/game';
import { WAR_SCENE_IDLE_MS, WAR_SCENE_POLL_MS } from '@/lib/war-scene-view';
import { useWarScene } from '../use-war-scene';

// Válka ve scéně (D62; web-ui.md – Dotazování na válku ve scéně): bez války na mapě (dotaz na ves
// ji nehlásí – `enabled: false`) se klient na válku vůbec neptá; s ní 2× za sekundu.

let host: HTMLDivElement;
let root: Root;
let seen: WarSceneView | null | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  seen = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe({ enabled }: { enabled: boolean }): null {
  seen = useWarScene('/api/war-scene/s1', enabled);
  return null;
}

const war = { campaignId: 'c1', tick: 7 } as WarSceneView;
const ok = (body: unknown): Response => ({ json: () => Promise.resolve(body) }) as Response;
const advance = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('useWarScene', () => {
  it('bez války na mapě se neptá vůbec, s válkou 2× za sekundu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ war }));
    vi.stubGlobal('fetch', fetchMock);
    act(() => root.render(<Probe enabled={false} />));
    await advance(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen).toBeNull();
    // dotaz na ves ohlásil válku na mapě – první dotaz hned, pak po ½ s
    act(() => root.render(<Probe enabled />));
    await advance(WAR_SCENE_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(war);
    await advance(4 * WAR_SCENE_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // válka z mapy zmizela – po 5 s, dokud ji dotaz na ves hlásí; pak vůbec
    fetchMock.mockResolvedValue(ok({ war: null }));
    await advance(WAR_SCENE_POLL_MS);
    expect(seen).toBeNull();
    const calls = fetchMock.mock.calls.length;
    await advance(WAR_SCENE_IDLE_MS);
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
    act(() => root.render(<Probe enabled={false} />));
    await advance(60_000);
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });
});
