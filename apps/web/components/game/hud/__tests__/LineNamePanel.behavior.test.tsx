// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LineNamePanel } from '../LineNamePanel';

// Chování panelu jména v DOM: Enter odešle, Esc zavře jen s `onClose`, během `busy` neodejde
// druhé odeslání, neplatné jméno neodejde a důvod ze serveru se ukáže.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const render = (props: Partial<Parameters<typeof LineNamePanel>[0]> = {}): void => {
  act(() => {
    root.render(
      <LineNamePanel
        lord
        portrait="man"
        taken={[]}
        onConfirm={() => Promise.resolve(null)}
        {...props}
      />,
    );
  });
};
const input = (): HTMLInputElement => host.querySelector('input')!;
const type = (value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = (): void => {
  act(() => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};
const press = (key: string): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
};

describe('LineNamePanel – chování', () => {
  it('odeslání (Enter v poli) pošle ořezané platné jméno jednou', () => {
    const onConfirm = vi.fn(() => Promise.resolve(null));
    render({ onConfirm });
    type('Bořivoj');
    submit();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('Bořivoj');
  });

  it('neplatné nebo prázdné jméno se neodešle', () => {
    const onConfirm = vi.fn(() => Promise.resolve(null));
    render({ onConfirm });
    submit();
    type('Bořivoj1');
    submit();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dvojí odeslání během busy neodejde dvakrát', async () => {
    let finish: (v: string | null) => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<string | null>((r) => (finish = r)));
    render({ onConfirm, initialName: 'Bořivoj' });
    submit();
    submit();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="line-name-confirm"]')!.disabled,
    ).toBe(true);
    await act(async () => finish(null));
    submit();
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('důvod odmítnutí ze serveru se ukáže a při psaní zmizí', async () => {
    render({ initialName: 'Bořivoj', onConfirm: () => Promise.resolve('Jméno už nosí jiný muž.') });
    submit();
    await act(async () => undefined);
    expect(host.textContent).toContain('Jméno už nosí jiný muž.');
    expect(input().getAttribute('aria-describedby')).toBeTruthy();
    type('Ctibor');
    expect(host.textContent).not.toContain('Jméno už nosí jiný muž.');
  });

  it('neplatné jméno má důvod i pro čtečku (aria-describedby)', () => {
    render({ initialName: 'Bořivoj1' });
    const id = input().getAttribute('aria-describedby')!;
    expect(host.querySelector(`[id="${id}"]`)?.textContent).toBe('Jen písmena.');
  });

  it('Esc zavře panel jen s onClose', () => {
    const onClose = vi.fn();
    render({ onClose });
    press('Enter');
    expect(onClose).not.toHaveBeenCalled();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(() => {
      render({ onClose: undefined });
      press('Escape');
    }).not.toThrow();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
