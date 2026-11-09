import { describe, expect, it } from 'vitest';
import { BUILD_ITEMS } from '../build-items';
import { PANEL_HOTKEYS, panelForKey } from '../panel-keys';

// Zkratky panelů horní lišty (Martin 9. 11. 2026): J Kronika, U Upozornění.

type KeyLike = Parameters<typeof panelForKey>[0];

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('panelForKey', () => {
  it('J je Kronika, U Upozornění', () => {
    expect(panelForKey(key('KeyJ'))).toBe('chronicle');
    expect(panelForKey(key('KeyU'))).toBe('notices');
    expect(panelForKey(key('KeyP'))).toBeNull();
  });

  it('s modifikátorem nebo při držení klávesy nic', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat'] as const) {
      expect(panelForKey(key('KeyJ', { [mod]: true }))).toBeNull();
    }
  });

  it('nekoliduje se zkratkami staveb ani kamery (WASD, Q, E, R)', () => {
    const taken = new Set([
      ...BUILD_ITEMS.map((item) => item.hotkey),
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyQ',
      'KeyE',
      'KeyR',
    ]);
    for (const { code } of Object.values(PANEL_HOTKEYS)) expect(taken.has(code)).toBe(false);
  });
});
