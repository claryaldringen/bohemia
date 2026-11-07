// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRansomItems, type MacroSpare, type TermItem } from '@bohemia/game';
import { emptyBundle } from '@/lib/terms-view';
import { termRows } from '@/lib/negotiation-view';
import { TermsForm, type TermsContext } from '../TermsForm';

// Formulář podmínek: řádky dávky, služby a cílové vsi, výhled šedým číslem.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const byId = (id: string): HTMLElement => {
  const el = host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`chybí ${id}`);
  return el;
};
const has = (id: string): boolean => host.querySelector(`[data-testid="${id}"]`) !== null;
const type = (id: string, value: string): void => {
  const input = byId(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const oath: TermItem = { kind: 'oath', lord: 'h-a', vassal: 'h-b' };
const spare: MacroSpare = { ...emptyBundle(), grainKg: 800, logs: 12 };
const context = (over: Partial<TermsContext> = {}): TermsContext => ({
  lordIsOwn: false,
  villages: [],
  ...over,
});

function render(
  ctx: TermsContext,
  items: TermItem[],
  onSubmit = vi.fn(),
): ReturnType<typeof vi.fn> {
  act(() =>
    root.render(
      <TermsForm
        rows={termRows(items, 'h-b', { lordName: 'Ctibor' })}
        submitLabel="Protinávrh"
        submitIcon="pen"
        busy={false}
        context={ctx}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    ),
  );
  return onSubmit;
}

describe('TermsForm – podmínky', () => {
  it('přidá dávku a službu, čísla se odešlou jako položky jednání', () => {
    const onSubmit = render(context(), [oath]);
    act(() => byId('terms-add-tribute').click());
    type('term-tribute-grainKg', '500');
    act(() => byId('terms-add-service').click());
    type('term-service-men', '3');
    type('term-service-days', '30');
    expect(has('terms-add-tribute')).toBe(false);
    act(() => byId('terms-submit').click());
    const [items] = onSubmit.mock.calls[0] as [TermItem[]];
    expect(items[0]).toEqual(oath);
    expect(items[1]).toMatchObject({ kind: 'tribute', goods: { grainKg: 500 } });
    expect(items[2]).toEqual({ kind: 'service', men: 3, days: 30 });
  });

  it('křížek odebere řádek; přísaha křížek nemá', () => {
    render(context(), [oath, { kind: 'service', men: 1, days: 10 }]);
    expect(has('term-remove-oath')).toBe(false);
    act(() => byId('term-remove-service').click());
    expect(has('term-row-service')).toBe(false);
  });

  it('výhled se načte při otevření a ukáže se šedým číslem u dávky, kterou platí vazal', async () => {
    const loadSpare = vi.fn(async () => spare);
    await act(async () => {
      render(context({ loadSpare }), [oath, { kind: 'tribute', goods: emptyBundle() }]);
    });
    expect(loadSpare).toHaveBeenCalledWith(null);
    expect(byId('term-tribute-grainKg-spare').textContent).toBe('800');
    expect(byId('term-tribute-logs-spare').textContent).toBe('12');
  });

  it('odměnu platí pán: vazal výhled u odměny nevidí a bez dávky se výhled nenačítá', async () => {
    const loadSpare = vi.fn(async () => spare);
    await act(async () => {
      render(context({ loadSpare }), [oath, { kind: 'reward', goods: emptyBundle() }]);
    });
    expect(loadSpare).not.toHaveBeenCalled();
    expect(has('term-reward-grainKg-spare')).toBe(false);
  });

  it('cílovou ves vybírá jen pán ze svých vsí', () => {
    const villages = [
      { id: 'v-1', name: 'Dub' },
      { id: 'v-2', name: 'Lípa' },
    ];
    const onSubmit = render(context({ lordIsOwn: true, villages }), [oath]);
    act(() => byId('terms-add-target-village').click());
    expect((byId('term-target-village-select') as HTMLSelectElement).value).toBe('v-1');
    act(() => {
      const select = byId('term-target-village-select') as HTMLSelectElement;
      select.value = 'v-2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => byId('terms-submit').click());
    expect((onSubmit.mock.calls[0] as [TermItem[]])[0][1]).toEqual({
      kind: 'target-village',
      villageId: 'v-2',
    });
  });

  it('vazal cílovou ves přidat nemůže', () => {
    render(context({ lordIsOwn: false, villages: [{ id: 'v-1', name: 'Dub' }] }), [oath]);
    expect(has('terms-add-target-village')).toBe(false);
  });
});

describe('TermsForm – výkupné zajatců', () => {
  const captives = [
    { id: 'z-1', name: 'Bořivoj', noble: true },
    { id: 'z-2', name: null, noble: false },
  ];

  it('bez zajatců se výkupné nenabízí, se zajatci ano', () => {
    render(context(), []);
    expect(has('terms-add-ransom')).toBe(false);
    render(context({ captives }), []);
    expect(has('terms-add-ransom')).toBe(true);
  });

  it('sestaví řádek výkupného: vybraní zajatci a cena; bez zajatce nejde odeslat', () => {
    const onSubmit = render(context({ captives }), []);
    act(() => byId('terms-add-ransom').click());
    // bez vybraného zajatce odeslání nejde
    expect((byId('terms-submit') as HTMLButtonElement).disabled).toBe(true);
    act(() => byId('term-ransom-prisoner-z-1').click());
    act(() => byId('term-ransom-prisoner-z-2').click());
    act(() => byId('term-ransom-prisoner-z-2').click());
    type('term-ransom-grainKg', '300');
    act(() => byId('terms-submit').click());
    const items = onSubmit.mock.calls[0]![0] as TermItem[];
    expect(items).toEqual([
      {
        kind: 'ransom',
        prisonerIds: ['z-1'],
        price: expect.objectContaining({ grainKg: 300 }),
      },
    ]);
    // řádek projde kontrolou jednání (domény)
    expect(checkRansomItems(items, ['h-a', 'h-b'])).toBeNull();
  });
});
