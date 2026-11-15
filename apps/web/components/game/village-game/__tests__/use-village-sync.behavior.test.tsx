// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Landscape, MapWatch, WorldClock } from '@bohemia/game';
import type { LandscapeTransfer } from '@/lib/landscape-transfer';
import type { VillageView } from '@/lib/village-view';
import { useVillageSync, type VillageSync } from '../use-village-sync';

// Na trasy vozů nic nečeká (D63; web-ui.md – Dotazování na ves): Web Worker, který nikdy
// neodpoví, nezastaví frontu akcí ani použití pohledu z dotazu na ves.

const getVillageView = vi.fn();
vi.mock('@/app/game/actions', () => ({
  getVillageView: (input: unknown): unknown => getVillageView(input),
}));
const routes = vi.fn((): Promise<never> => new Promise<never>(() => undefined));
vi.mock('@/lib/cart-router', () => ({
  cartRouter: () => ({ routes, dispose: (): void => undefined }),
}));
// pohled v testu nese jen to, co čte synchronizace – upozornění vsi a kusy pohledu jinde
vi.mock('@/lib/village-notices', () => ({ newNotices: (): unknown[] => [] }));
vi.mock('@/lib/view-pieces', () => ({
  knownViewPieces: (): undefined => undefined,
  unpackViewPieces: (view: VillageView) => ({ view, lost: false }),
}));

let host: HTMLDivElement;
let root: Root;
let sync: VillageSync;

const WORLD = { startMs: 0, endMs: 365 * 86_400_000 } as WorldClock;
const QUIET: MapWatch = { war: false, riders: false };

/** Pohled dne `day`; s vozem, který má cíl jízdy (trasu by počítal Worker), když `cart`. */
function view(day: number, cart: boolean): VillageView {
  return {
    id: 'v1',
    settlementId: 's1',
    dayIndex: day,
    stamp: `stamp-${day}`,
    scene: cart
      ? {
          carts: [
            { id: 1, kind: 'two-wheel', x: 0, z: 0, goal: { to: { x: 5, z: 5 }, reachM: 3 } },
          ],
        }
      : {},
  } as unknown as VillageView;
}

function Probe(): null {
  sync = useVillageSync({
    initialVillage: view(1, false),
    landscape: {} as LandscapeTransfer,
    decoded: {} as Landscape,
    settlementId: 's1',
    clock: WORLD,
    pushNotice: () => undefined,
    playerNotices: { current: () => undefined },
    initialWatch: QUIET,
  });
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  routes.mockClear();
  getVillageView.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('useVillageSync – trasy vozů mimo kritickou cestu (D63)', () => {
  it('akce se odešlou a pohled se použije, i když výpočet tras nikdy neskončí', async () => {
    act(() => root.render(<Probe />));
    const sent: number[] = [];
    let first: Promise<string | null> = Promise.resolve(null);
    let second: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      first = sync.runAction(() => {
        sent.push(2);
        return Promise.resolve(view(2, true));
      });
      second = sync.runAction(() => {
        sent.push(3);
        return Promise.resolve(view(3, true));
      });
      await Promise.all([first, second]);
    });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    // obě akce došly na server a pohled druhé se použil, ač Worker na trasy neodpověděl
    expect(sent).toEqual([2, 3]);
    expect(routes).toHaveBeenCalledTimes(2);
    expect(sync.view?.dayIndex).toBe(3);
  });

  it('dotaz na ves pohled použije bez tras a převezme válku a jezdce na mapě (D62)', async () => {
    act(() => root.render(<Probe />));
    expect(sync.watch).toEqual(QUIET);
    getVillageView.mockResolvedValue({ ...view(4, true), watch: { war: true, riders: false } });
    await act(async () => {
      sync.refresh();
      await vi.waitFor(() => expect(getVillageView).toHaveBeenCalledTimes(1));
    });
    await act(async () => {
      await vi.waitFor(() => expect(sync.view?.dayIndex).toBe(4));
    });
    expect(routes).toHaveBeenCalledTimes(1);
    expect(sync.watch).toEqual({ war: true, riders: false });
    // nezměněný pohled nese válku a jezdce taky
    getVillageView.mockResolvedValue({ unchanged: true, watch: QUIET });
    await act(async () => {
      sync.refresh();
      await vi.waitFor(() => expect(getVillageView).toHaveBeenCalledTimes(2));
    });
    // stav Reactu se promítne až po `act`
    await act(() => Promise.resolve());
    expect(sync.watch).toEqual(QUIET);
    expect(sync.view?.dayIndex).toBe(4);
  });
});
