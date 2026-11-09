// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelHotkey } from '@/lib/panel-keys';
import { usePanelHotkeys } from '../use-panel-hotkeys';

// Zkratky J (Kronika) a U (Upozornění): přepnou panel, při psaní do pole a s vypnutými zkratkami
// (otevřená nabídka hry) nic.

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

function Probe({
  toggle,
  enabled,
}: {
  toggle: (panel: PanelHotkey) => void;
  enabled: boolean;
}): ReactElement {
  usePanelHotkeys(toggle, enabled);
  return <input data-testid="field" />;
}

function press(
  code: string,
  target: EventTarget = window,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('usePanelHotkeys', () => {
  it('J přepne Kroniku, U Upozornění – každý stisk znovu (druhý panel zavře)', () => {
    const toggle = vi.fn();
    act(() => root.render(<Probe toggle={toggle} enabled />));
    const event = press('KeyJ');
    press('KeyJ');
    press('KeyU');
    expect(toggle.mock.calls).toEqual([['chronicle'], ['chronicle'], ['notices']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('při psaní do pole, s modifikátorem a s vypnutými zkratkami nic', () => {
    const toggle = vi.fn();
    act(() => root.render(<Probe toggle={toggle} enabled />));
    const field = host.querySelector('input');
    if (!field) throw new Error('chybí pole');
    expect(press('KeyJ', field).defaultPrevented).toBe(false);
    press('KeyU', window, { ctrlKey: true });
    act(() => root.render(<Probe toggle={toggle} enabled={false} />));
    press('KeyJ');
    expect(toggle).not.toHaveBeenCalled();
  });
});
