// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VillageListItem } from '@/lib/village-list';
import type { SelectionDetails } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';
import { StewardBuiltMark, StewardToggle } from '../StewardToggle';
import { VillageList, VillageSwitcher } from '../VillageSwitcher';

// Správce vsi v rozhraní (steward.md – Co hráč vidí): přepínač, značka u jména a u staveb.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const village = (over: Partial<VillageListItem> = {}): VillageListItem => ({
  id: 'v-1',
  settlementId: 's-1',
  name: 'Libice',
  people: 12,
  extinct: false,
  abandoned: false,
  travelling: false,
  hunger: 'fed',
  ...over,
});

describe('StewardToggle', () => {
  it('zapnutý svítí, vypnutý je tlumený; popisek jen „Správce“', () => {
    const on = renderToStaticMarkup(<StewardToggle on onToggle={() => Promise.resolve()} />);
    const off = renderToStaticMarkup(
      <StewardToggle on={false} onToggle={() => Promise.resolve()} />,
    );
    expect(on).toContain('aria-pressed="true"');
    expect(on).not.toContain('opacity-40');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('opacity-40');
    expect(on).toContain('>Správce<');
  });

  it('klik volá akci s opačnou hodnotou', async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<StewardToggle on={false} onToggle={onToggle} />));
    const button = host.querySelector<HTMLButtonElement>('[data-testid="steward-toggle"]');
    await act(async () => button?.click());
    expect(onToggle).toHaveBeenCalledWith(true);
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('seznam vsí – správce', () => {
  it('přepínač u každé žijící vsi volá akci s id vsi; vymřelá bez něj', async () => {
    const onSetSteward = vi.fn(() => Promise.resolve());
    const villages = [
      village({ steward: true }),
      village({ id: 'v-2', name: 'Budeč' }),
      village({ id: 'v-3', name: 'Zaniklá', extinct: true }),
    ];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <VillageList
          villages={villages}
          currentId="v-1"
          onSelect={() => undefined}
          onSetSteward={onSetSteward}
        />,
      ),
    );
    const toggles = host.querySelectorAll<HTMLButtonElement>(
      '[data-testid="village-steward-toggle"]',
    );
    expect(toggles).toHaveLength(2);
    expect(toggles[0]?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => toggles[1]?.click());
    expect(onSetSteward).toHaveBeenCalledWith('v-2', true);
    await act(async () => root.unmount());
    host.remove();
  });

  it('ikona u jména vybrané vsi jen při zapnutém správci', () => {
    const render = (steward: boolean): string =>
      renderToStaticMarkup(
        <VillageSwitcher
          name="Libice"
          currentId="v-1"
          villages={[village()]}
          onSelect={() => undefined}
          onRename={() => Promise.resolve(null)}
          steward={steward}
        />,
      );
    expect(render(true)).toContain('data-testid="steward-badge"');
    expect(render(false)).not.toContain('data-testid="steward-badge"');
  });
});

describe('panel výběru – správce', () => {
  const field = (stewardBuilt: boolean): SelectionDetails =>
    ({
      kind: 'cemetery',
      id: 5,
      squares: 1,
      places: 4,
      used: 0,
      ...(stewardBuilt ? { stewardBuilt: true } : {}),
    }) as unknown as SelectionDetails;

  it('stavba postavená správcem má ikonu „Postavil správce“, jiná ne', () => {
    const render = (d: SelectionDetails): string =>
      renderToStaticMarkup(<SelectionPanel details={d} />);
    expect(render(field(true))).toContain('data-testid="steward-built"');
    expect(render(field(true))).toContain('Postavil správce');
    expect(render(field(false))).not.toContain('steward-built');
  });

  it('značka samotná nese popisek', () => {
    expect(renderToStaticMarkup(<StewardBuiltMark />)).toContain('Postavil správce');
  });
});
