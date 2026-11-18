// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { dayIndexOf } from '@bohemia/game';
import {
  FoodLastsRow,
  StockBreakdown,
  foodLastsTooltip,
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

it('obilí v liště je bez hromady osiva – osivo má v rozpisu vlastní řádek s popiskem (diet.md, D95)', () => {
  // Vlkov 15. 3. 896: Obilí 3 131 kg, z toho 3 124 kg osivo na jař (ves ho nejí)
  const seeded = {
    storesKg: 3131,
    legumesKg: 15,
    applesKg: 0,
    sowingSeed: { crop: 'spring' as const, kg: 3124, winter: false },
  };
  expect(grainStockRows(seeded).map((r) => [r.key, r.amount])).toEqual([
    ['grain', 7],
    ['seed', 3124],
    ['legumes', 15],
    ['apples', 0],
  ]);
  expect(grainStockTotal(seeded)).toBe(22);
  // zimní osivo na jař – popisek v Tooltipu jako v panelu pole
  const winter = { ...seeded, sowingSeed: { crop: 'spring' as const, kg: 3124, winter: true } };
  expect(grainStockRows(winter).find((r) => r.key === 'seed')?.name).toMatch(/Zimní osivo/);
  // bez hromady osiva tři řádky jako dřív
  expect(grainStockRows(crops).map((r) => r.key)).toEqual(['grain', 'legumes', 'apples']);
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

it('otevřený rozpis vypne popisek ikony, zavřený ho nechá', () => {
  render();
  const tip = (): Element | null => host.querySelector('[role="tooltip"]');
  expect(tip()).not.toBeNull();
  click(q('village-stores-toggle'));
  const toggle = q('village-stores-toggle')!;
  expect(toggle.querySelector('[role="tooltip"]')).toBeNull();
  click(q('village-stores-toggle'));
  expect(toggle.querySelector('[role="tooltip"]')).not.toBeNull();
});

it('panel se přizpůsobí obsahu: bez pevné šířky, bez zalamování, čísla vpravo – plodiny i dobytek', () => {
  const rows = [
    ...grainStockRows({ storesKg: 12_345_678, legumesKg: 300, applesKg: 45 }),
    ...livestockRows(stock as never),
  ];
  act(() =>
    root.render(
      <StockBreakdown icon="food" name="Vše" total={1} rows={rows} testId="village-all" />,
    ),
  );
  click(q('village-all-toggle'));
  const panel = q('village-all-panel')!;
  expect(panel.className).toContain('w-max');
  expect(panel.className).toContain('whitespace-nowrap');
  expect(panel.className).not.toMatch(/(^|\s)w-\d/);
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  for (const row of rows) {
    const num = q(`village-all-${row.key}`)!;
    expect(num.className).toContain('text-right');
    expect(num.textContent).not.toBe('');
  }
  expect(panel.textContent).toContain('Voli');
  expect(panel.textContent).toContain('Koně');
});

// D56 (Martin 15. 11. 2026: „dolů do panelu s plodinami napiš, na jak dlouho vystačí zásoby“)
it('pod rozpisem plodin řádek s přesýpacími hodinami a dobou, v popisku datum z kalendáře', () => {
  const today = dayIndexOf({ year: 887, month: 3, day: 1 });
  const days = dayIndexOf({ year: 888, month: 6, day: 14 }) - today;
  act(() =>
    root.render(
      <StockBreakdown
        icon="food"
        name="Obilí"
        total={grainStockTotal(crops)}
        rows={grainStockRows(crops)}
        testId="village-stores"
        footer={<FoodLastsRow dayIndex={today} days={days} />}
      />,
    ),
  );
  expect(q('village-stores-last')).toBeNull();
  click(q('village-stores-toggle'));
  const panel = q('village-stores-panel')!;
  const last = q('village-stores-last')!;
  expect(last.textContent).toBe('1 rok 3 měsíce');
  // řádek je poslední v panelu, s ikonou přesýpacích hodin a bez slov mimo popisek
  expect(last.parentElement?.querySelector('img')?.getAttribute('src')).toBe(
    '/icons/resources/hourglass.png',
  );
  expect(panel.lastElementChild?.contains(last)).toBe(true);
  const tip = panel.querySelector('[role="tooltip"]');
  expect(tip?.textContent).toBe(
    'Zásoby vystačí do 14. června 888 – bez sklizně, při plném přídělu.',
  );
});

it('popisek bez zásob na den a krátké doby', () => {
  const today = dayIndexOf({ year: 887, month: 3, day: 1 });
  expect(foodLastsTooltip(today, 0)).toBe(
    'Zásoby nevystačí ani na den – bez sklizně, při plném přídělu.',
  );
  expect(foodLastsTooltip(today, 12)).toBe(
    'Zásoby vystačí do 13. března 887 – bez sklizně, při plném přídělu.',
  );
});
