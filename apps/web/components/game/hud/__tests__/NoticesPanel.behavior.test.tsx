// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoticePage } from '@/lib/notice-page';
import { NoticesPanel } from '../NoticesPanel';

// Panel Upozornění (absence.md – Návrat): od nejnovějších, nová zvýrazněná, starší na vyžádání.

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

const page: NoticePage = {
  items: [
    { id: 9, kind: 'invitee-played', dateLabel: '12. března 507', text: 'Ctibor se rozehrál.' },
    { id: 8, kind: 'blocked', dateLabel: '1. března 507', text: 'Jan tě zablokoval.' },
  ],
  olderThan: 8,
};

function render(props: Partial<Parameters<typeof NoticesPanel>[0]>): {
  onOlder: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onOlder = vi.fn();
  const onClose = vi.fn();
  act(() =>
    root.render(
      <NoticesPanel
        page={null}
        highlightAfter={0}
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

const entries = (): Element[] => [...host.querySelectorAll('[data-testid="notice-entry"]')];

describe('panel Upozornění', () => {
  it('bez stránky čeká; se stránkou ukáže upozornění s datem od nejnovějšího', () => {
    render({ page: null });
    expect(host.querySelector('[aria-busy]')).not.toBeNull();
    render({ page });
    expect(entries().map((e) => e.textContent)).toEqual([
      '12. března 507Ctibor se rozehrál.',
      '1. března 507Jan tě zablokoval.',
    ]);
  });

  it('zvýrazní jen upozornění novější než poslední viděné', () => {
    render({ page, highlightAfter: 8 });
    expect(entries().map((e) => e.getAttribute('data-unread'))).toEqual(['true', 'false']);
  });

  it('tlačítko starších jen když starší jsou, a při načítání je zakázané', () => {
    const { onOlder } = render({ page });
    const older = host.querySelector<HTMLButtonElement>('[data-testid="notices-older"]')!;
    act(() => older.click());
    expect(onOlder).toHaveBeenCalledTimes(1);
    render({ page, loading: true });
    expect(host.querySelector<HTMLButtonElement>('[data-testid="notices-older"]')!.disabled).toBe(
      true,
    );
    render({ page: { ...page, olderThan: null } });
    expect(host.querySelector('[data-testid="notices-older"]')).toBeNull();
  });

  it('křížek i Esc panel zavřou, chyba se ukáže', () => {
    const { onClose } = render({ page, error: 'Spojení se serverem selhalo.' });
    expect(host.querySelector('[data-testid="notices-error"]')?.textContent).toContain('Spojení');
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="notices-close"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
