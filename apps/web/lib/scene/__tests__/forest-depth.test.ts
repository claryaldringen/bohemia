import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { forestDepth } from '../forest-depth';

const landscape = generateLandscape(5);
const depth = forestDepth(landscape);
const at = (x: number, y: number): number => depth[y * 128 + x]!;

describe('forestDepth', () => {
  it('mimo les je 0', () => {
    for (let i = 0; i < landscape.surface.length; i++) {
      if (landscape.surface[i] !== SURFACE_CODES.forest) expect(depth[i]).toBe(0);
    }
  });

  it('lesní políčko sousedící s nelesním má hloubku 1', () => {
    let checked = 0;
    for (let y = 1; y < 127; y++) {
      for (let x = 1; x < 127; x++) {
        if (landscape.surface[y * 128 + x] !== SURFACE_CODES.forest) continue;
        const touches = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => landscape.surface[(y + dy!) * 128 + x + dx!] !== SURFACE_CODES.forest);
        if (!touches) continue;
        expect(at(x, y)).toBe(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('hloubka mezi sousedy roste nejvýš o 1', () => {
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 127; x++) {
        expect(Math.abs(at(x, y) - at(x + 1, y))).toBeLessThanOrEqual(1);
      }
    }
  });
});
