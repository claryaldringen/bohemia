// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayIndexOf, type ChronicleEvent } from '@bohemia/game';
import { appendOlder, chroniclePage, type ChroniclePage } from '@/lib/chronicle-view';
import { ChroniclePanel } from '../ChroniclePanel';

// Panel Kronika (absence.md – Návrat): roky od nejnovějšího, starší stránky na vyžádání, Esc zavře.

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const day = (year: number, month: number, d: number): number => dayIndexOf({ year, month, day: d });

/** Kronika: založení vsi v roce 500 a v každém dalším roce 25 narození (stránka = 2 roky). */
function events(): ChronicleEvent[] {
  const list: ChronicleEvent[] = [{ day: day(500, 1, 1), kind: 'village-founded' }];
  for (let year = 500; year <= 504; year++) {
    for (let i = 0; i < 25; i++) list.push({ day: day(year, 4, 1 + i), kind: 'birth' });
  }
  return list;
}

function render(props: Partial<Parameters<typeof ChroniclePanel>[0]>): {
  onOlder: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onOlder = vi.fn();
  const onClose = vi.fn();
  act(() =>
    root.render(
      <ChroniclePanel
        page={null}
        loading={false}
        error={null}
        onOlder={onOlder}
        onClose={onClose}
        {...props}
      />,
    ),
  );
  return { onOlder, onClose };
}

const years = (): string[] =>
  [...host.querySelectorAll('[data-testid="chronicle-year"]')].map(
    (el) => el.getAttribute('data-year') ?? '',
  );

describe('panel Kronika', () => {
  it('bez stránky čeká; se stránkou ukáže roky od nejnovějšího a zápisy s datem', () => {
    render({ page: null });
    expect(host.querySelector('[aria-busy]')).not.toBeNull();
    const page = chroniclePage(events(), 'Lhota', { before: null });
    render({ page });
    expect(years()).toEqual(['504', '503']);
    const entry = host.querySelector('[data-testid="chronicle-entry"]');
    expect(entry?.getAttribute('data-kind')).toBe('birth');
    expect(entry?.textContent).toContain('25. dubna');
    expect(entry?.textContent).toContain('Narodilo se dítě.');
  });

  it('tlačítko starších zápisů načte další stránku; na konci zmizí a ukáže se založení vsi', () => {
    const all = events();
    let page: ChroniclePage = chroniclePage(all, 'Lhota', { before: null });
    const { onOlder } = render({ page });
    const older = host.querySelector<HTMLButtonElement>('[data-testid="chronicle-older"]');
    expect(older).not.toBeNull();
    act(() => older!.click());
    expect(onOlder).toHaveBeenCalledTimes(1);
    while (page.olderThan !== null) {
      page = appendOlder(page, chroniclePage(all, 'Lhota', { before: page.olderThan }));
    }
    render({ page });
    expect(years()).toEqual(['504', '503', '502', '501', '500']);
    expect(host.querySelector('[data-testid="chronicle-older"]')).toBeNull();
    const kinds = [...host.querySelectorAll('[data-testid="chronicle-entry"]')].map((el) =>
      el.getAttribute('data-kind'),
    );
    expect(kinds.at(-1)).toBe('village-founded');
    expect(host.querySelector('[data-testid="chronicle-lost"]')).toBeNull();
  });

  it('při načítání je tlačítko starších zápisů vypnuté', () => {
    render({ page: chroniclePage(events(), 'Lhota', { before: null }), loading: true });
    const older = host.querySelector<HTMLButtonElement>('[data-testid="chronicle-older"]');
    expect(older?.disabled).toBe(true);
  });

  it('nedochované zápisy a chyba se ukážou textem', () => {
    render({
      page: { years: [], olderThan: null, lost: true },
      error: 'Spojení se serverem selhalo.',
    });
    expect(host.querySelector('[data-testid="chronicle-lost"]')?.textContent).toBe(
      'Starší zápisy se nedochovaly.',
    );
    expect(host.querySelector('[data-testid="chronicle-error"]')?.textContent).toBe(
      'Spojení se serverem selhalo.',
    );
  });

  it('Esc i křížek panel zavřou', () => {
    const { onClose } = render({ page: chroniclePage(events(), 'Lhota', { before: null }) });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="chronicle-close"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
