// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketVillage } from '@bohemia/game';
import type { VillageView } from '@/lib/village-view';
import { usePanels, type Panels } from '../use-panels';

// Panel Trh (markets.md – Pravidla 8): zavření všech panelů zavře i trh a zpožděná odpověď
// staršího otevření nepřepíše novější stav ani zavřený panel.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getMarketOverview = vi.fn();
vi.mock('@/app/game/actions', () => ({
  getMarketOverview: (input: unknown): Promise<unknown> => getMarketOverview(input),
  levyDialogs: vi.fn(),
  passagesToAnswer: vi.fn(),
  protectionView: vi.fn(),
}));

let panels: Panels | null = null;
let root: Root;
const viewRef = { current: { id: 'v1' } as VillageView };

function Host(): ReactElement | null {
  panels = usePanels({
    refreshHouse: () => Promise.resolve(),
    refreshEscheats: () => Promise.resolve(),
    setHouseError: () => undefined,
    viewRef,
  });
  return null;
}

const village = (name: string): MarketVillage => ({
  villageId: name,
  name,
  houseName: null,
  own: false,
  cells: 1,
  travelDays: 0,
  blocked: null,
  news: null,
  seen: null,
});

/** Odpověď, kterou test splní sám a v libovolném pořadí. */
function deferred(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  getMarketOverview.mockReset();
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Host />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('usePanels – panel Trh', () => {
  it('closeAll zavře i panel Trh', async () => {
    getMarketOverview.mockResolvedValue([village('Lhota')]);
    await act(async () => {
      await panels!.openMarket();
    });
    expect(panels!.market.open).toBe(true);
    act(() => panels!.closeAll());
    expect(panels!.market.open).toBe(false);
  });

  it('zpožděná odpověď staršího otevření nepřepíše novější', async () => {
    const first = deferred();
    const second = deferred();
    getMarketOverview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let opening: Promise<void>[] = [];
    await act(async () => {
      opening = [panels!.openMarket(), panels!.openMarket()];
    });
    await act(async () => {
      second.resolve([village('Nová')]);
      await opening[1];
    });
    await act(async () => {
      first.resolve([village('Stará')]);
      await opening[0];
    });
    expect(panels!.market.villages?.map((v) => v.name)).toEqual(['Nová']);
  });

  it('odpověď po zavření panelu nic nezmění', async () => {
    const late = deferred();
    getMarketOverview.mockReturnValueOnce(late.promise);
    let opening: Promise<void> = Promise.resolve();
    await act(async () => {
      opening = panels!.openMarket();
    });
    act(() => panels!.closeMarket());
    await act(async () => {
      late.resolve([village('Pozdě')]);
      await opening;
    });
    expect(panels!.market.villages).toBeNull();
  });
});
