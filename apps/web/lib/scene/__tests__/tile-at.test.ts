import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { tileAt, tileCenter } from '../tile-at';

// Krajina 128 × 128 po 15 m má střed v počátku a sahá od −960 do 960 m v osách X a Z.
const landscape = generateLandscape(1);

describe('tileAt', () => {
  it('střed světa je políčko (64, 64)', () => {
    expect(tileAt(landscape, 0, 0)).toEqual({ x: 64, y: 64 });
  });

  it('roh krajiny je políčko (0, 0) a protější roh (127, 127)', () => {
    expect(tileAt(landscape, -959, -959)).toEqual({ x: 0, y: 0 });
    expect(tileAt(landscape, 959, 959)).toEqual({ x: 127, y: 127 });
  });

  it('bod mimo krajinu vrátí null', () => {
    expect(tileAt(landscape, 2000, 0)).toBeNull();
    expect(tileAt(landscape, 0, -961)).toBeNull();
  });

  it('střed políčka se převede zpět na stejné políčko', () => {
    for (const [x, y] of [
      [0, 0],
      [127, 127],
      [5, 100],
      [64, 3],
      [99, 42],
    ] as const) {
      const { worldX, worldZ } = tileCenter(landscape, x, y);
      expect(tileAt(landscape, worldX, worldZ)).toEqual({ x, y });
    }
    expect(tileCenter(landscape, 0, 0)).toEqual({ worldX: -952.5, worldZ: -952.5 });
  });
});
