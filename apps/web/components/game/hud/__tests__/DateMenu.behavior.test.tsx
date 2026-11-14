// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DateWithDevTime } from '../TopBar';
import { GameMenu } from '../GameMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Martin 14. 11. 2026: zrychlení jen ve vývojovém režimu a po kliku na datum; nabídka uprostřed
// obrazovky s Nastavením (zvuky krajiny).

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

const devTime = { pending: null, onSkip: () => {} };

it('mimo vývojový režim je datum jen údaj bez zrychlení', () => {
  act(() => root.render(<DateWithDevTime date="9. května 634" devTime={null} />));
  expect(q('game-date')?.textContent).toBe('9. května 634');
  expect(q('game-date-toggle')).toBeNull();
  expect(q('dev-time-panel')).toBeNull();
});

it('ve vývojovém režimu klik na datum panel otevře, další klik a Esc ho zavřou', () => {
  act(() => root.render(<DateWithDevTime date="9. května 634" devTime={devTime} />));
  expect(q('dev-time-panel')).toBeNull();
  click(q('game-date-toggle'));
  expect(q('dev-time-panel')).not.toBeNull();
  expect(q('dev-skip-month')).not.toBeNull();
  click(q('game-date-toggle'));
  expect(q('dev-time-panel')).toBeNull();
  click(q('game-date-toggle'));
  press('Escape');
  expect(q('dev-time-panel')).toBeNull();
});

function renderMenu(onToggleSound: () => void, onClose = (): void => {}): void {
  act(() =>
    root.render(
      <GameMenu
        canRestart
        email="a@b.cz"
        soundOn
        onToggleSound={onToggleSound}
        onClose={onClose}
        onRestart={async () => null}
        onSignOut={async () => null}
      />,
    ),
  );
}

it('nabídka je okno uprostřed s Nastavením, kde se přepínají zvuky; Esc vrací a zavírá', () => {
  const toggle = vi.fn();
  const close = vi.fn();
  renderMenu(toggle, close);
  expect(q('game-menu')?.className).toContain('top-1/2');
  const settings = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Nastavení');
  click(settings ?? null);
  const sound = q('setting-sound');
  expect(sound?.getAttribute('aria-checked')).toBe('true');
  click(sound);
  expect(toggle).toHaveBeenCalledTimes(1);
  press('Escape');
  expect(q('game-settings')).toBeNull();
  expect(close).not.toHaveBeenCalled();
  press('Escape');
  expect(close).toHaveBeenCalledTimes(1);
});

it('klik mimo okno nabídku zavře', () => {
  const close = vi.fn();
  renderMenu(() => {}, close);
  click(host.querySelector('div[aria-hidden]'));
  expect(close).toHaveBeenCalledTimes(1);
});

/** Úhel ručičky z transform; těsně pod 360° bere jako 0°. */
const handAngle = (el: Element | null): number => {
  const angle = Number(/rotate\(([\d.]+)/.exec(el?.getAttribute('transform') ?? '')?.[1]);
  return angle > 359.9 ? 0 : angle;
};

it('u data je ciferník s jednou ručičkou: poledne nahoře, 18:00 vpravo', () => {
  vi.useFakeTimers();
  try {
    const world = {
      startMs: Date.parse('2027-01-01T00:00:00Z'),
      endMs: Date.parse('2028-01-01T00:00:00Z'),
    };
    // ostrý svět: herní den ≈ 86 s – půl dne po začátku dne 0 je poledne
    const dayMs = (world.endMs - world.startMs) / 365250;
    vi.setSystemTime(world.startMs + dayMs * 0.5);
    act(() => root.render(<DateWithDevTime date="1. ledna 500" devTime={null} world={world} />));
    const hand = q('day-dial-hand');
    expect(handAngle(hand)).toBeCloseTo(0, 0);
    vi.setSystemTime(world.startMs + dayMs * 0.75 - 1000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(handAngle(q('day-dial-hand'))).toBeCloseTo(90, 0);
  } finally {
    vi.useRealTimers();
  }
});

it('bez hodin světa ciferník není (ikona data)', () => {
  act(() => root.render(<DateWithDevTime date="1. ledna 500" devTime={null} />));
  expect(q('day-dial')).toBeNull();
});
