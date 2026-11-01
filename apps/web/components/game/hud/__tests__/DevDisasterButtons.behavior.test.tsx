// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DevDisasterButtons } from '../TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 1. 11. 2026: „Nemůžu vynutit pohromu, protože přes nabídku pohrom se mi vždycky zobrazí
// bublinová nápověda“ – po kliknutí má tlačítko fokus a jeho popisek by ležel přes řadu ikon.
it('otevřená nabídka pohrom nemá nad sebou popisek tlačítka a druh jde vybrat', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onForce = vi.fn();
  act(() => root.render(<DevDisasterButtons pending={false} onForce={onForce} />));
  const button = host.querySelector<HTMLButtonElement>('[data-testid="dev-disaster"]')!;
  expect(button.parentElement!.querySelector('[role="tooltip"]')).not.toBeNull();

  act(() => button.click());
  expect(button.parentElement!.querySelector('[role="tooltip"]')).toBeNull();
  const choice = host.querySelector<HTMLButtonElement>(
    '[data-testid="dev-disaster-choices"] button',
  )!;
  act(() => choice.click());
  expect(onForce).toHaveBeenCalledWith(expect.objectContaining({ kind: 'disaster' }));
  // po výběru se nabídka zavře a popisek se vrátí
  expect(host.querySelector('[data-testid="dev-disaster-choices"]')).toBeNull();
  expect(button.parentElement!.querySelector('[role="tooltip"]')).not.toBeNull();

  act(() => root.unmount());
  host.remove();
});
