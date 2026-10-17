import { describe, expect, it } from 'vitest';
import { BUILD_ITEMS, buildItemForKey } from '../build-items';

const key = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('zkratky staveb', () => {
  it('Z zemnice, X polozemnice, C pole – nekolidují s kamerou (WASD, Q/E, R)', () => {
    expect(buildItemForKey(key('KeyZ'))?.kind).toBe('zemnice');
    expect(buildItemForKey(key('KeyX'))?.kind).toBe('polozemnice');
    expect(buildItemForKey(key('KeyC'))?.kind).toBe('field');
    const camera = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR'];
    expect(BUILD_ITEMS.filter((item) => camera.includes(item.hotkey))).toEqual([]);
  });

  it('s modifikátorem nic (Ctrl+Z vrací tah pole)', () => {
    expect(buildItemForKey(key('KeyZ', { ctrlKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { metaKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyZ', { shiftKey: true }))).toBeNull();
    expect(buildItemForKey(key('KeyQ'))).toBeNull();
  });
});
