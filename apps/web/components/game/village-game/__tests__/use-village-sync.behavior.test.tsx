// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateOfDayIndex, realTimeOf, type Landscape } from '@bohemia/game';
import {
  fakeServerEvents,
  type FakeServerEvents,
} from '@/hooks/__tests__/server-events-test-utils';
import type { LandscapeTransfer } from '@/lib/landscape-transfer';
import { DAY_CHECK_GRACE_MS } from '@/lib/village-day-check';
import type { VillageView } from '@/lib/village-view';
import { useVillageSync, type VillageSync } from '../use-village-sync';

// Stav vsi ze serveru (web-ui.md – Obnova pohledu vsi (události)): na trasy vozů nic nečeká (D63 –
// Web Worker, který nikdy neodpoví, nezastaví frontu akcí ani použití pohledu); dotaz na ves jen na
// událost serveru, obnovu po mezeře a hlídač dne – nárazy se sloučí, událost vlastní akce nic
// nestojí.

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
let events: FakeServerEvents;

const WORLD = { startMs: 0, endMs: 365 * 86_400_000 };
/** Začátek herního dne `day` ve světě testu. */
const dayStart = (day: number): number => realTimeOf(dateOfDayIndex(day), WORLD);

/** Pohled dne `day`; s vozem, který má cíl jízdy (trasu by počítal Worker), když `cart`. */
function view(day: number, cart = false, versions?: Record<string, number>): VillageView {
  return {
    id: 'v1',
    settlementId: 's1',
    dayIndex: day,
    stamp: `stamp-${day}`,
    ...(versions ? { versions } : {}),
    scene: cart
      ? {
          carts: [
            { id: 1, kind: 'two-wheel', x: 0, z: 0, goal: { to: { x: 5, z: 5 }, reachM: 3 } },
          ],
        }
      : {},
  } as unknown as VillageView;
}

function Probe({ initial = view(1) }: { initial?: VillageView }): null {
  sync = useVillageSync({
    initialVillage: initial,
    landscape: {} as LandscapeTransfer,
    decoded: {} as Landscape,
    settlementId: 's1',
    clock: WORLD,
    pushNotice: () => undefined,
    playerNotices: { current: () => undefined },
  });
  return null;
}

const flush = (): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Dotaz na ves, který odpoví až na pokyn testu. */
function heldQueries(): { answer: (value: unknown) => Promise<void> } {
  const waiting: ((value: unknown) => void)[] = [];
  getVillageView.mockImplementation(
    () =>
      new Promise((resolve) => {
        waiting.push(resolve);
      }),
  );
  return {
    answer: (value) =>
      act(async () => {
        waiting.shift()?.(value);
        await vi.advanceTimersByTimeAsync(0);
      }),
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // den 1 právě začal – hlídač dne čeká na začátek dne 2
  vi.useFakeTimers({ now: dayStart(1) + 1_000 });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  routes.mockClear();
  getVillageView.mockReset();
  events = fakeServerEvents();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
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

  it('dotaz na ves pohled použije bez tras', async () => {
    act(() => root.render(<Probe />));
    getVillageView.mockResolvedValue(view(4, true));
    act(() => sync.refresh());
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
    expect(sync.view?.dayIndex).toBe(4);
    expect(routes).toHaveBeenCalledTimes(1);
    getVillageView.mockResolvedValue({ unchanged: true });
    act(() => sync.refresh());
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(2);
    expect(sync.view?.dayIndex).toBe(4);
  });
});

describe('useVillageSync – události ze serveru', () => {
  it('rozsah spojení nese id zobrazené vsi; bez události se za 60 s nikdo neptá', async () => {
    act(() => root.render(events.wrap(<Probe />)));
    expect(events.scope().villageId).toBe('v1');
    await advance(60_000);
    expect(getVillageView).not.toHaveBeenCalled();
    act(() => root.render(events.wrap(<p />)));
    expect(events.scope().villageId).toBeNull();
    expect(events.listeners('village')).toBe(0);
  });

  it('10 událostí `village` za 50 ms dá nejvýš 2 dotazy', async () => {
    const queries = heldQueries();
    act(() => root.render(events.wrap(<Probe />)));
    for (let i = 0; i < 10; i++) {
      act(() => events.emit('village', { villageId: 'v1', version: 2 + i }));
      await advance(5);
    }
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await queries.answer(view(1, false, { v1: 5 }));
    expect(getVillageView).toHaveBeenCalledTimes(2);
    await queries.answer({ unchanged: true });
    await advance(1_000);
    expect(getVillageView).toHaveBeenCalledTimes(2);
  });

  it('verze, kterou pohled zná, nic nestojí; novější, upozornění a obnova po mezeře se zeptají', async () => {
    getVillageView.mockResolvedValue({ unchanged: true });
    act(() => root.render(events.wrap(<Probe initial={view(1, false, { v1: 7, v2: 3 })} />)));
    act(() => events.emit('village', { villageId: 'v1', version: 7 }));
    act(() => events.emit('village', { villageId: 'v2', version: 2 }));
    await flush();
    expect(getVillageView).not.toHaveBeenCalled();
    act(() => events.emit('village', { villageId: 'v2', version: 4 }));
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
    expect(getVillageView).toHaveBeenLastCalledWith(
      expect.objectContaining({ villageId: 'v1', known: 'stamp-1', withNotices: true }),
    );
    act(() => events.emit('notices', {}));
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(2);
    act(() => events.resync());
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(3);
  });

  it('událost vlastní akce po akci nic nestojí; novější verze se po akci dočte', async () => {
    getVillageView.mockResolvedValue({ unchanged: true });
    act(() => root.render(events.wrap(<Probe initial={view(1, false, { v1: 1 })} />)));
    let finish: (value: VillageView) => void = () => undefined;
    const action = (): Promise<VillageView> =>
      new Promise((resolve) => {
        finish = resolve;
      });

    let done: Promise<string | null> = Promise.resolve(null);
    act(() => {
      done = sync.runAction(action);
    });
    await flush();
    // uložení akce oznámí trigger dřív, než přijde odpověď akce
    act(() => events.emit('village', { villageId: 'v1', version: 2 }));
    await act(async () => {
      finish(view(1, false, { v1: 2 }));
      await done;
    });
    await flush();
    expect(getVillageView).not.toHaveBeenCalled();

    // během akce uložil ves i worker (novější verze, než nese odpověď akce) – po akci jeden dotaz
    act(() => {
      done = sync.runAction(action);
    });
    await flush();
    act(() => events.emit('village', { villageId: 'v1', version: 4 }));
    act(() => events.emit('notices', {}));
    await act(async () => {
      finish(view(1, false, { v1: 3 }));
      await done;
    });
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
  });

  it('hlídač dne: bez události přesně jeden dotaz v okamžiku začátku dne + 10 s', async () => {
    getVillageView.mockResolvedValue(view(2));
    act(() => root.render(events.wrap(<Probe />)));
    const due = dayStart(2) + DAY_CHECK_GRACE_MS - Date.now();
    await advance(due - 1);
    expect(getVillageView).not.toHaveBeenCalled();
    await advance(1);
    expect(getVillageView).toHaveBeenCalledTimes(1);
    expect(sync.view?.dayIndex).toBe(2);
    // další kontrola až na začátku dne 3 + 10 s
    await advance(dayStart(3) - dayStart(2) - 1);
    expect(getVillageView).toHaveBeenCalledTimes(1);
  });

  it('hlídač dne: pohled nového dne z události před tím – žádný dotaz navíc', async () => {
    getVillageView.mockResolvedValue(view(2));
    act(() => root.render(events.wrap(<Probe />)));
    await advance(dayStart(2) + 1_000 - Date.now());
    act(() => events.emit('village', { villageId: 'v1', version: 9 }));
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await advance(2 * DAY_CHECK_GRACE_MS);
    expect(getVillageView).toHaveBeenCalledTimes(1);
  });

  it('hlídač dne: odpověď pořád se starým dnem – jeden opakovaný dotaz po odkladu, pak už ne', async () => {
    getVillageView.mockResolvedValue({ unchanged: true });
    act(() => root.render(events.wrap(<Probe />)));
    await advance(dayStart(2) + DAY_CHECK_GRACE_MS - Date.now());
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await advance(DAY_CHECK_GRACE_MS - 1);
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(getVillageView).toHaveBeenCalledTimes(2);
    await advance(5 * DAY_CHECK_GRACE_MS);
    expect(getVillageView).toHaveBeenCalledTimes(2);
  });

  it('událost během akce nespustí dotaz, ani z fronty, dřív než akce doběhne', async () => {
    const queries = heldQueries();
    act(() => root.render(events.wrap(<Probe initial={view(1, false, { v1: 1 })} />)));
    act(() => events.emit('village', { villageId: 'v1', version: 3 }));
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
    // další událost čeká ve frontě za běžícím dotazem; mezitím začne akce
    act(() => events.emit('notices', {}));
    let finish: (value: VillageView) => void = () => undefined;
    let done: Promise<string | null> = Promise.resolve(null);
    act(() => {
      done = sync.runAction(
        () =>
          new Promise<VillageView>((resolve) => {
            finish = resolve;
          }),
      );
    });
    await flush();
    await queries.answer({ unchanged: true });
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(view(1, false, { v1: 1 }));
      await done;
    });
    await flush();
    // po akci se odložená obnova vyhodnotí a zeptá se
    expect(getVillageView).toHaveBeenCalledTimes(2);
  });

  it('náraz, který už pokryl běžící dotaz, nestojí druhý', async () => {
    const queries = heldQueries();
    act(() => root.render(events.wrap(<Probe initial={view(1, false, { v1: 1 })} />)));
    act(() => events.emit('village', { villageId: 'v1', version: 5 }));
    await flush();
    act(() => events.emit('village', { villageId: 'v1', version: 6 }));
    expect(getVillageView).toHaveBeenCalledTimes(1);
    await queries.answer(view(1, false, { v1: 6 }));
    await flush();
    expect(getVillageView).toHaveBeenCalledTimes(1);
  });

  it('hlídač dne: ve skrytém panelu žádný dotaz', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    getVillageView.mockResolvedValue(view(2));
    act(() => root.render(events.wrap(<Probe />)));
    await advance(dayStart(2) + 2 * DAY_CHECK_GRACE_MS - Date.now());
    expect(getVillageView).not.toHaveBeenCalled();
  });
});
