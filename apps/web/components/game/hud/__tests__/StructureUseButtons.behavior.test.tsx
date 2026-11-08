// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructureUseView } from '@/lib/village-view-types';
import { RightsProvider } from '../rights';
import { StructureUseButtons, demolishLabel } from '../StructureUseButtons';

// Opustit, zbourat a vrátit stavbu v panelu (demolition.md – Rozhraní).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const use = (over: Partial<StructureUseView> = {}): StructureUseView => ({
  structure: 'dwelling',
  id: 3,
  state: 'in-use',
  block: null,
  demolition: { laborManDays: 7.5, logs: 2 },
  demolishing: null,
  ...over,
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(element: ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const button = (el: HTMLElement, id: string): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

describe('StructureUseButtons', () => {
  it('v provozu Opustit a Zbourat; během akce stojí obě (busy), pak zase jdou', async () => {
    let finish: () => void = () => {};
    const onUse = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const el = render(<StructureUseButtons use={use()} onStructureUse={onUse} />);
    expect(button(el, 'structure-restore')).toBeNull();
    expect(el.textContent).toContain('Zbourat – 7,5 čd, 2 klády zpět na hromadu');
    act(() => button(el, 'structure-demolish')!.click());
    expect(onUse).toHaveBeenCalledWith('demolish', 'dwelling', 3);
    expect(button(el, 'structure-demolish')!.disabled).toBe(true);
    expect(button(el, 'structure-abandon')!.disabled).toBe(true);
    // dvojklik: druhý klik během akce nic nepošle
    act(() => button(el, 'structure-demolish')!.click());
    expect(onUse).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button(el, 'structure-abandon')!.disabled).toBe(false);
  });

  it('opuštěná stavba Vrátit a Zbourat', () => {
    const onUse = vi.fn(() => Promise.resolve());
    const el = render(
      <StructureUseButtons
        use={use({ structure: 'pen', state: 'abandoned' })}
        onStructureUse={onUse}
      />,
    );
    expect(button(el, 'structure-abandon')).toBeNull();
    act(() => button(el, 'structure-restore')!.click());
    expect(onUse).toHaveBeenCalledWith('restore', 'pen', 3);
    expect(button(el, 'structure-demolish')).not.toBeNull();
  });

  it('bouraná stavba jen Zrušit bourání', () => {
    const onCancel = vi.fn(() => Promise.resolve());
    const el = render(
      <StructureUseButtons
        use={use({
          state: 'demolishing',
          demolition: null,
          demolishing: { constructionId: 120, progress: 0.4 },
        })}
        onStructureUse={vi.fn()}
        onCancelConstruction={onCancel}
      />,
    );
    expect(button(el, 'structure-abandon')).toBeNull();
    expect(button(el, 'structure-demolish')).toBeNull();
    act(() => button(el, 'cancel-construction')!.click());
    expect(onCancel).toHaveBeenCalledWith(120);
  });

  it('důvod stavby zašedí Opustit i Zbourat a ukáže se u kurzoru', () => {
    const reason = 'Obyvatelé nemají kam jít – v ostatních obydlích chybí 2 místa.';
    const el = render(
      <StructureUseButtons use={use({ block: reason })} onStructureUse={vi.fn()} />,
    );
    expect(button(el, 'structure-abandon')!.disabled).toBe(true);
    expect(button(el, 'structure-demolish')!.disabled).toBe(true);
    expect(el.querySelector('[data-testid="rights-reason"]')!.textContent).toBe(reason);
  });

  it('bez práva build důvod práva', () => {
    const el = render(
      <RightsProvider value={{ allowed: ['trade'], reason: 'Rozhoduje Bořivoj.' }}>
        <StructureUseButtons use={use({ state: 'abandoned' })} onStructureUse={vi.fn()} />
      </RightsProvider>,
    );
    expect(button(el, 'structure-restore')!.disabled).toBe(true);
    expect(button(el, 'structure-demolish')!.disabled).toBe(true);
    expect(el.querySelector('[data-testid="rights-reason"]')!.textContent).toBe(
      'Rozhoduje Bořivoj.',
    );
  });

  it('popisek Zbourat skloňuje klády a bez klád říká „bez klád“', () => {
    expect(demolishLabel({ laborManDays: 10, logs: 1 })).toBe(
      'Zbourat – 10 čd, 1 kláda zpět na hromadu',
    );
    expect(demolishLabel({ laborManDays: 2.5, logs: 5 })).toBe(
      'Zbourat – 2,5 čd, 5 klád zpět na hromadu',
    );
    expect(demolishLabel({ laborManDays: 2.5, logs: 0 })).toBe('Zbourat – 2,5 čd, bez klád');
  });
});
