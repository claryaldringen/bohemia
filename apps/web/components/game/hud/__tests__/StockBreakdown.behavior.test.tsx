// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  StockBreakdown,
  grainStockRows,
  grainStockTotal,
  livestockRows,
  livestockTotal,
} from '../TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 14. 11. 2026: ikona obilí ukazuje součet kg plodin (obilí, luštěniny, jablka – bez snopů),
// ikona dobytka součet kusů; klik otevře u ikony panel s rozpisem.

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

const q = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`);
const click = (el: Element | null): void => {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const press = (key: string): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

const crops = { storesKg: 1200, legumesKg: 300, applesKg: 45 };
const stock = {
  livestock: { herds: { sheep: 12, goat: 3, pig: 5, cow: 7 }, oxen: 4 },
  horses: { count: 2 },
};

it('součet plodin je obilí + luštěniny + jablka, rozpis má tři řádky', () => {
  expect(grainStockTotal(crops)).toBe(1545);
  expect(grainStockRows(crops).map((r) => [r.key, r.amount])).toEqual([
    ['grain', 1200],
    ['legumes', 300],
    ['apples', 45],
  ]);
});

it('součet dobytka a rozpis podle druhů; druh, který ves nemá, v rozpisu chybí', () => {
  expect(livestockTotal(stock as never)).toBe(33);
  expect(livestockRows(stock as never).map((r) => r.key)).toEqual([
    'cow',
    'ox',
    'sheep',
    'goat',
    'pig',
    'horse',
  ]);
  const noHorses = { livestock: stock.livestock };
  expect(livestockRows(noHorses as never).map((r) => r.key)).not.toContain('horse');
  expect(livestockTotal(noHorses as never)).toBe(31);
});

const render = (): void =>
  act(() =>
    root.render(
      <StockBreakdown
        icon="food"
        name="Obilí"
        total={grainStockTotal(crops)}
        rows={grainStockRows(crops)}
        testId="village-stores"
      />,
    ),
  );

it('ikona ukáže součet, klik otevře rozpis s čísly, další klik a Esc ho zavřou', () => {
  render();
  expect(q('village-stores')?.textContent).toBe('1 545');
  expect(q('village-stores-panel')).toBeNull();
  click(q('village-stores-toggle'));
  expect(q('village-stores-panel')).not.toBeNull();
  expect(q('village-stores-grain')?.textContent).toBe('1 200');
  expect(q('village-stores-legumes')?.textContent).toBe('300');
  expect(q('village-stores-apples')?.textContent).toBe('45');
  click(q('village-stores-toggle'));
  expect(q('village-stores-panel')).toBeNull();
  click(q('village-stores-toggle'));
  press('Escape');
  expect(q('village-stores-panel')).toBeNull();
});

it('stisk mimo panel ho zavře, uvnitř ne', () => {
  render();
  click(q('village-stores-toggle'));
  const down = (target: Element): void =>
    act(() => {
      target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
  down(q('village-stores-panel')!);
  expect(q('village-stores-panel')).not.toBeNull();
  down(document.body);
  expect(q('village-stores-panel')).toBeNull();
});
