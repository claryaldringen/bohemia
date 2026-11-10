// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VillageRightsView } from '@/lib/village-view-types';
import { BAPTIZE_WARNING, BaptizeButton, FAITH_CROSS_ICON } from '../BaptizeButton';
import { RightsProvider } from '../rights';

// Tlačítko „Nechat se pokřtít“ u vojvody (christianity.md – Křest rodu): ikona kříže víry, klik
// otevře potvrzení (krok nejde vzít zpět), teprve potvrzení zavolá server; odmítnutí u kurzoru.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: ReactElement): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

const byTestId = <T extends HTMLElement>(id: string): T | null =>
  document.body.querySelector<T>(`[data-testid="${id}"]`);
const button = (): HTMLButtonElement => byTestId<HTMLButtonElement>('selection-person-baptize')!;
const reason = (host: HTMLElement): string | null =>
  host.querySelector('[data-testid="rights-reason"]')?.textContent ?? null;

async function unmount(host: HTMLElement, root: Root): Promise<void> {
  await act(async () => root.unmount());
  host.remove();
}

describe('tlačítko „Nechat se pokřtít“', () => {
  it('klik otevře potvrzení s varováním; až potvrzení zavolá server', async () => {
    const onBaptize = vi.fn(() => Promise.resolve(null));
    const { host, root } = await mount(<BaptizeButton onBaptize={onBaptize} />);
    expect(button().getAttribute('aria-label')).toBe('Nechat se pokřtít');
    expect(button().querySelector('img')?.getAttribute('src')).toBe(FAITH_CROSS_ICON);
    expect(byTestId('baptize-dialog')).toBeNull();
    await act(async () => button().click());
    expect(onBaptize).not.toHaveBeenCalled();
    expect(byTestId('baptize-dialog')?.getAttribute('role')).toBe('alertdialog');
    expect(byTestId('baptize-warning')?.textContent).toBe(BAPTIZE_WARNING);
    expect(BAPTIZE_WARNING).toBe('Křest nejde vzít zpět. Vedlejší manželky budou propuštěny.');
    await act(async () => byTestId<HTMLButtonElement>('baptize-confirm')!.click());
    expect(onBaptize).toHaveBeenCalledTimes(1);
    expect(byTestId('baptize-dialog')).toBeNull();
    await unmount(host, root);
  });

  it('Zrušit okno zavře bez volání serveru', async () => {
    const onBaptize = vi.fn(() => Promise.resolve(null));
    const { host, root } = await mount(<BaptizeButton onBaptize={onBaptize} />);
    await act(async () => button().click());
    await act(async () => byTestId<HTMLButtonElement>('baptize-cancel')!.click());
    expect(byTestId('baptize-dialog')).toBeNull();
    expect(onBaptize).not.toHaveBeenCalled();
    await unmount(host, root);
  });

  it('odmítnutí serveru je u kurzoru', async () => {
    const onBaptize = vi.fn(() => Promise.resolve('Tvůj vojvoda tu není.'));
    const { host, root } = await mount(<BaptizeButton onBaptize={onBaptize} />);
    await act(async () => button().click());
    await act(async () => byTestId<HTMLButtonElement>('baptize-confirm')!.click());
    expect(reason(host)).toBe('Tvůj vojvoda tu není.');
    await unmount(host, root);
  });

  it('bez práva rozhodnutí rodu zašedne s důvodem a okno neotevře', async () => {
    const rights: VillageRightsView = { allowed: ['build'], reason: 'Rozhoduje Bořivoj.' };
    const onBaptize = vi.fn(() => Promise.resolve(null));
    const { host, root } = await mount(
      <RightsProvider value={rights}>
        <BaptizeButton onBaptize={onBaptize} />
      </RightsProvider>,
    );
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(reason(host)).toBe('Rozhoduje Bořivoj.');
    await act(async () => button().click());
    expect(byTestId('baptize-dialog')).toBeNull();
    await unmount(host, root);
  });
});
