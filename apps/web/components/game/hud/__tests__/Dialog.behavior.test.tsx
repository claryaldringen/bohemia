// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

// Standardní dialog: titulek, křížek vpravo nahoře, Esc a klik mimo okno zavírají.

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

function render(props: { locked?: boolean; closeOnEscape?: boolean } = {}): () => void {
  const onClose = vi.fn();
  act(() =>
    root.render(
      <Dialog title="Zkouška" onClose={onClose} backdropTestId="bd" {...props}>
        <p>obsah</p>
      </Dialog>,
    ),
  );
  return onClose;
}

describe('Dialog', () => {
  it('ukáže titulek a obsah v modálním okně', () => {
    render();
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.querySelector('h2')?.textContent).toBe('Zkouška');
    expect(dialog?.textContent).toContain('obsah');
  });

  it('křížek stojí vpravo – okraj zarovnání nese položka řádku, ne tlačítko v obalu popisku', () => {
    render();
    const slot = host.querySelector('[data-testid="dialog-close-slot"]');
    expect(slot?.classList.contains('ml-auto')).toBe(true);
    expect(slot?.parentElement?.querySelector('h2')).not.toBeNull();
    expect(slot?.querySelector('[data-testid="dialog-close"]')).not.toBeNull();
  });

  it('křížek zavře', () => {
    const onClose = render();
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="dialog-close"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc zavře', () => {
    const onClose = render();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('klik mimo okno zavře', () => {
    const onClose = render();
    act(() => host.querySelector<HTMLElement>('[data-testid="bd"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('zamčený dialog se nezavře', () => {
    const onClose = render({ locked: true });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
    act(() => host.querySelector<HTMLElement>('[data-testid="bd"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="dialog-close"]')!.click());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('bez closeOnEscape Esc nezavírá', () => {
    const onClose = render({ closeOnEscape: false });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
  });
});
