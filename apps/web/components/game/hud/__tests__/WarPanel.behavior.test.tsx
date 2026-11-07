// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TermItem } from '@bohemia/game';
import type { HouseView } from '@/lib/house-view';
import { WarPanel } from '../WarPanel';

// Mírový formulář: výběr vsí k postoupení (war.md – Konec války).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEW = {
  ownHouseId: 'h-me',
  wars: [
    {
      warId: 'w1',
      other: { houseId: 'h-o', lordName: 'Ctibor' },
      startedDay: 10,
      how: 'declared',
      lastClashDay: 10,
      label: 'Ctibor – opověď',
      otherVillages: [{ id: 'vo1', name: 'Hrádek', settlementId: 'vo1', asleep: false }],
    },
  ],
} as unknown as HouseView;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const click = async (testId: string): Promise<void> => {
  await act(async () => {
    host.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
  });
};

const setSide = async (value: string): Promise<void> => {
  const select = host.querySelector<HTMLSelectElement>('[data-testid="peace-cede-side"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('WarPanel – postoupení vsí v míru', () => {
  it('poslední mapa rodu je zašedlá, jiná ves jde vybrat a pošle se v řádku míru', async () => {
    const onOfferPeace = vi.fn<(to: string, items: TermItem[], message: string | null) => void>();
    act(() =>
      root.render(
        <WarPanel
          view={VIEW}
          onClose={() => {}}
          onOfferPeace={onOfferPeace}
          ownVillages={[
            { id: 'a', name: 'Budeč', settlementId: 'm1', asleep: false },
            { id: 'b', name: 'Libice', settlementId: 'm2', asleep: false },
          ]}
        />,
      ),
    );
    await click('war-offer-peace');
    await setSide('own');
    const boxes = [
      ...host.querySelectorAll<HTMLInputElement>('[data-testid="peace-cede-village"]'),
    ];
    expect(boxes.map((b) => b.disabled)).toEqual([false, false]);
    await act(async () => boxes[0]!.click());
    // druhá mapa by rodu nenechala nic
    const after = [
      ...host.querySelectorAll<HTMLInputElement>('[data-testid="peace-cede-village"]'),
    ];
    expect(after[1]!.disabled).toBe(true);
    expect(after[1]!.getAttribute('data-reason')).toContain('Poslední ves');
    await click('peace-send');
    expect(onOfferPeace).toHaveBeenCalledWith('h-o', [{ kind: 'peace', cede: ['a'] }], null);
  });

  it('rod s jedinou vsí ji postoupit nemůže, vsi protivníka jdou vybrat', async () => {
    act(() =>
      root.render(
        <WarPanel
          view={VIEW}
          onClose={() => {}}
          onOfferPeace={() => {}}
          ownVillages={[{ id: 'a', name: 'Budeč', settlementId: 'm1', asleep: false }]}
        />,
      ),
    );
    await click('war-offer-peace');
    await setSide('own');
    const own = host.querySelector<HTMLInputElement>('[data-testid="peace-cede-village"]')!;
    expect(own.disabled).toBe(true);
    await setSide('other');
    const other = host.querySelector<HTMLInputElement>('[data-testid="peace-cede-village"]')!;
    expect(other.disabled).toBe(false);
    expect(host.textContent).toContain('Hrádek');
  });
});

describe('WarPanel – lidé v poplatku', () => {
  it('muži v poplatku se pošlou ve svazku poplatku s plátcem', async () => {
    const onOfferPeace = vi.fn<(to: string, items: TermItem[], message: string | null) => void>();
    act(() => root.render(<WarPanel view={VIEW} onClose={() => {}} onOfferPeace={onOfferPeace} />));
    await click('war-offer-peace');
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>('[data-testid="peace-fee-men"]')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('peace-send');
    const items = onOfferPeace.mock.calls[0]![1];
    expect(items[0]).toMatchObject({
      kind: 'peace',
      payer: 'h-me',
      fee: { grainKg: 0, people: { men: 2, women: 0, families: 0 } },
    });
  });
});
