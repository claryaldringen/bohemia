// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameMenu } from '../GameMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 14. 11. 2026: „Vynutit zlý rok a vynutit pohromu je jedno a to samé a mělo by to být
// v hlavní nabídce pod tlačítkem vývojářského menu.“

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
const noop = (): void => {};
const asyncNull = (): Promise<string | null> => Promise.resolve(null);

function menu(devMenu: Parameters<typeof GameMenu>[0]['devMenu'], onClose = noop): void {
  act(() =>
    root.render(
      <GameMenu
        canRestart
        email="a@b.cz"
        soundOn
        onToggleSound={noop}
        onClose={onClose}
        onRestart={asyncNull}
        onSignOut={asyncNull}
        devMenu={devMenu}
      />,
    ),
  );
}

const buttonByText = (text: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text);

it('Vývojářské menu je v nabídce jen ve vývojovém režimu', () => {
  menu(null);
  expect(buttonByText('Vývojářské menu')).toBeUndefined();
  menu({ pending: false, onForce: noop });
  expect(buttonByText('Vývojářské menu')).toBeDefined();
});

it('tlačítko druhu pohromy volá stejnou akci jako dřív (zlý rok i pohroma)', () => {
  const onForce = vi.fn();
  menu({ pending: false, onForce });
  act(() => buttonByText('Vývojářské menu')!.click());
  expect(q('dev-menu')).not.toBeNull();
  expect(host.textContent).toContain('Vynutit pohromu');
  act(() => q('dev-force-drought')!.click());
  expect(onForce).toHaveBeenLastCalledWith({ kind: 'year', value: 'drought' });
  menu({ pending: false, onForce });
  act(() => q('dev-force-fire')!.click());
  expect(onForce).toHaveBeenLastCalledWith({ kind: 'disaster', value: 'fire' });
});

it('po vynucení se nabídka zavře, až server doběhne', () => {
  const onClose = vi.fn();
  let pending = false;
  const onForce = vi.fn(() => {
    pending = true;
  });
  menu({ pending, onForce }, onClose);
  act(() => buttonByText('Vývojářské menu')!.click());
  act(() => q('dev-force-hail')!.click());
  menu({ pending: true, onForce }, onClose);
  expect(onClose).not.toHaveBeenCalled();
  menu({ pending: false, onForce }, onClose);
  expect(onClose).toHaveBeenCalledTimes(1);
});
