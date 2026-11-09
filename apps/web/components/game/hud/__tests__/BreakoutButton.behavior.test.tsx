// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VillageRightsView } from '@/lib/village-view-types';
import { BreakoutButton } from '../BreakoutButton';
import { RightsProvider } from '../rights';

// Tlačítko „Probít se“ obránce (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení):
// ikona s popiskem; když rozkaz nejde, zašedne a důvod je červeně v popisku.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: ReactElement): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

const button = (host: HTMLElement): HTMLButtonElement =>
  host.querySelector<HTMLButtonElement>('[data-testid="breakout"]')!;
const reason = (host: HTMLElement): string | null =>
  host.querySelector('[data-testid="rights-reason"]')?.textContent ?? null;

describe('tlačítko „Probít se“', () => {
  it('pošle rozkaz; pak zašedne, dokud server neukáže jiný stav', async () => {
    const onOrder = vi.fn(() => Promise.resolve(null));
    const { host, root } = await mount(<BreakoutButton denied={null} onOrder={onOrder} />);
    expect(button(host).getAttribute('aria-label')).toBe('Probít se');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/icons/resources/breakout.png');
    expect(button(host).disabled).toBe(false);
    await act(async () => button(host).click());
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(button(host).disabled).toBe(true);
    expect(reason(host)).toBe('Obránci se už probíjejí.');
    // server ukáže probíjení – důvod od serveru
    await act(async () =>
      root.render(<BreakoutButton denied="Obránci se už probíjejí." onOrder={onOrder} />),
    );
    expect(reason(host)).toBe('Obránci se už probíjejí.');
    await act(async () => root.unmount());
    host.remove();
  });

  it('když rozkaz nejde, je zašedlé s důvodem; chyba serveru se ukáže taky', async () => {
    const onOrder = vi.fn(() => Promise.resolve('Tahle ves ti nepatří.'));
    const { host, root } = await mount(
      <BreakoutButton denied="Nikdo nebrání hradbu." onOrder={onOrder} />,
    );
    expect(button(host).disabled).toBe(true);
    expect(reason(host)).toBe('Nikdo nebrání hradbu.');
    await act(async () => root.render(<BreakoutButton denied={null} onOrder={onOrder} />));
    await act(async () => button(host).click());
    expect(reason(host)).toBe('Tahle ves ti nepatří.');
    await act(async () => root.unmount());
    host.remove();
  });

  it('bez práva war (správce cizí vsi) zašedne s důvodem práva', async () => {
    const rights: VillageRightsView = { allowed: ['build'], reason: 'Ves jen spravuješ.' };
    const { host, root } = await mount(
      <RightsProvider value={rights}>
        <BreakoutButton denied={null} onOrder={() => Promise.resolve(null)} />
      </RightsProvider>,
    );
    expect(button(host).disabled).toBe(true);
    expect(reason(host)).toBe('Ves jen spravuješ.');
    await act(async () => root.unmount());
    host.remove();
  });
});
