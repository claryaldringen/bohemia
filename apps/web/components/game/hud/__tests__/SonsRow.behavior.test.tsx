// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionDetails, SelectionLeave, SelectionSon } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';
import { SonsRow } from '../selection/sons';

// Řada synů vojvody v panelu dvorce (lord.md – Dělení vsi, Co hráč vidí): ikony, zašedlý nástupce
// a syn bez jména s důvodem, klik ukáže obrys dílu a růžici odchodu se synem.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const leave: SelectionLeave = {
  households: [3, 4],
  people: 9,
  foodKg: 120,
  cart: 'two-wheel',
  horse: true,
  directions: [
    { direction: 'N', days: 2, blocked: null },
    { direction: 'S', days: 3, blocked: null },
  ],
};
const son = (over: Partial<SelectionSon>): SelectionSon => ({
  id: 7,
  name: 'Bořivoj',
  age: 20,
  reason: null,
  dwellingIds: [3, 4],
  people: 9,
  foodKg: 120,
  cart: 'two-wheel',
  horse: true,
  leave,
  ...over,
});
const SONS: SelectionSon[] = [
  son({}),
  son({
    id: 5,
    name: 'Ctibor',
    age: 28,
    reason: 'Nástupce zůstává.',
    dwellingIds: [],
    leave: null,
  }),
  son({
    id: 8,
    name: undefined,
    age: 18,
    reason: 'Syn potřebuje jméno.',
    dwellingIds: [],
    leave: null,
  }),
];

describe('SonsRow – statické vykreslení', () => {
  const html = renderToStaticMarkup(<SonsRow sons={SONS} />);

  it('ikona pro každého syna, nástupce a syn bez jména zašedlí s důvodem v popisku', () => {
    expect(html.match(/data-testid="son-\d+"/g)).toHaveLength(3);
    expect(html).toMatch(/data-testid="son-5"[^>]*aria-disabled="true"/);
    expect(html).toMatch(/data-testid="son-8"[^>]*aria-disabled="true"/);
    expect(html).not.toMatch(/data-testid="son-7"[^>]*aria-disabled/);
    expect(html).toContain('Nástupce zůstává.');
    expect(html).toContain('Syn potřebuje jméno.');
  });

  it('bez výběru růžice odchodu není', () => {
    expect(html).not.toContain('data-testid="leave-compass"');
  });

  it('panel dvorce řadu ukáže, pokud ji details nesou', () => {
    const details = {
      kind: 'dwelling',
      id: 1,
      type: 'zemnice',
      occupants: 2,
      family: { men: 1, women: 1, boys: 0, girls: 0, elderMen: 0, elderWomen: 0, couples: 1 },
      capacity: 6,
      ages: [30, 28],
      residents: [],
      condition: 1,
      ageYears: 1,
      full: false,
      overcrowded: false,
      rebuild: null,
      workshop: null,
      relocation: null,
      relocate: null,
      manor: null,
      leave: null,
      sons: SONS,
    } satisfies SelectionDetails;
    expect(renderToStaticMarkup(<SelectionPanel details={details} />)).toContain(
      'data-testid="selection-sons"',
    );
  });
});

describe('SonsRow – klik', () => {
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
  const click = (testId: string): void => {
    act(() => {
      host
        .querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('klik na syna ukáže obrys dílu a růžici; Odejít na sever pošle sonId, druhý klik vše zruší', () => {
    const onLeaveSon = vi.fn();
    const onPreviewSon = vi.fn();
    act(() =>
      root.render(<SonsRow sons={SONS} onLeaveSon={onLeaveSon} onPreviewSon={onPreviewSon} />),
    );
    expect(host.querySelector('[data-testid="leave-compass"]')).toBeNull();
    click('son-7');
    expect(onPreviewSon).toHaveBeenLastCalledWith([3, 4]);
    expect(host.querySelector('[data-testid="son-7"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="leave-compass"]')).not.toBeNull();
    // jedna ves, jedna mapa – tlačítko „sem“ (na téže mapě) v růžici není
    expect(host.querySelector('[data-testid="leave-here"]')).toBeNull();
    click('leave-N');
    expect(onLeaveSon).toHaveBeenLastCalledWith('N', 7);
    click('son-7');
    expect(onPreviewSon).toHaveBeenLastCalledWith(null);
    expect(host.querySelector('[data-testid="leave-compass"]')).toBeNull();
  });

  it('díl jen z rodiny syna (bez dalších obydlí) má růžici a obrys se neposílá', () => {
    const onPreviewSon = vi.fn();
    act(() =>
      root.render(
        <SonsRow
          sons={[son({ dwellingIds: [], leave: { ...leave, households: [] } })]}
          onLeaveSon={vi.fn()}
          onPreviewSon={onPreviewSon}
        />,
      ),
    );
    click('son-7');
    expect(host.querySelector('[data-testid="leave-compass"]')).not.toBeNull();
    expect(onPreviewSon).toHaveBeenLastCalledWith(null);
    expect(onPreviewSon).not.toHaveBeenCalledWith([0]);
  });

  it('zašedlá ikona nese důvod i v aria-label', () => {
    act(() => root.render(<SonsRow sons={SONS} />));
    expect(host.querySelector('[data-testid="son-5"]')!.getAttribute('aria-label')).toBe(
      'Ctibor, 28 let – Nástupce zůstává.',
    );
  });

  it('klik na nástupce ani na syna bez jména nic nevybere', () => {
    const onPreviewSon = vi.fn();
    act(() => root.render(<SonsRow sons={SONS} onPreviewSon={onPreviewSon} />));
    click('son-5');
    click('son-8');
    expect(host.querySelector('[data-testid="leave-compass"]')).toBeNull();
    expect(onPreviewSon).not.toHaveBeenCalledWith([]);
  });
});
