import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { heightAt, tileAt, tileCenter } from '../tile-at';

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

describe('heightAt', () => {
  it('ve středu políčka vrátí jeho výšku', () => {
    for (const [x, y] of [
      [10, 20],
      [64, 64],
      [127, 0],
    ] as const) {
      const { worldX, worldZ } = tileCenter(landscape, x, y);
      expect(heightAt(landscape, worldX, worldZ)).toBeCloseTo(landscape.heights[y * 128 + x]!, 5);
    }
  });

  it('mezi středy dvou políček vrátí průměr jejich výšek', () => {
    const a = tileCenter(landscape, 30, 40);
    const b = tileCenter(landscape, 31, 40);
    const expected = (landscape.heights[40 * 128 + 30]! + landscape.heights[40 * 128 + 31]!) / 2;
    expect(heightAt(landscape, (a.worldX + b.worldX) / 2, a.worldZ)).toBeCloseTo(expected, 5);
  });
});
