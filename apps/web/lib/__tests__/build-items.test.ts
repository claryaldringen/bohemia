import { describe, expect, it } from 'vitest';
import type { Landscape, PlacementVillage } from '@bohemia/game';
import { BUILD_ITEMS, buildItem, buildItemForKey } from '../build-items';

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
  it('Z zemnice, X polozemnice, C pole, V hřbitov – nekolidují s kamerou (WASD, Q/E, R)', () => {
    expect(buildItemForKey(key('KeyZ'))?.kind).toBe('zemnice');
    expect(buildItemForKey(key('KeyX'))?.kind).toBe('polozemnice');
    expect(buildItemForKey(key('KeyC'))?.kind).toBe('field');
    expect(buildItemForKey(key('KeyV'))?.kind).toBe('cemetery');
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

describe('hřbitov', () => {
  const SIZE = 32;
  const landscape: Landscape = {
    size: SIZE,
    cellSizeM: 15,
    heights: new Float32Array(SIZE * SIZE),
    surface: new Uint8Array(SIZE * SIZE).fill(2),
    fertility: new Uint8Array(SIZE * SIZE).fill(50),
    villageSite: { x: 16, y: 16 },
    stream: [],
  };
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  const item = buildItem('cemetery');

  it('maluje se po čtvercích; blízko obydlí jen varuje', () => {
    if (item.placement !== 'squares') throw new Error('Hřbitov se maluje po čtvercích.');
    const near = item.check(landscape, village, [{ x: 18, y: 16 }]);
    expect(near.check.ok).toBe(true);
    expect(near.check.warning).toMatch(/^Blízko obydlí \(\d+ m\)$/);
    expect(near.warningCells).toEqual([{ x: 18, y: 16 }]);
    const far = item.check(landscape, village, [{ x: 30, y: 30 }]);
    expect(far.check.ok).toBe(true);
    expect(far.check.warning).toBeUndefined();
    const over = item.check(landscape, village, [{ x: 16, y: 16 }]);
    expect(over.check.reason).toBe('Hřbitov se překrývá s obydlím.');
  });
});
