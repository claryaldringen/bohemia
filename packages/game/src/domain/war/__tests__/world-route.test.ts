import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../village/people/world-grid';
import { edgeCrossing, worldRoute } from '../world-route';

// Cesta mapu po mapě (war.md – Pohyb – mapu po mapě, Přechod okrajem).

const key = (c: GridCell): string => `${c.x},${c.y}`;
const never = (): boolean => false;

describe('trasa po mřížce světa', () => {
  it('rovně a úhlopříčně v 8 směrech, každou mapou', () => {
    expect(worldRoute({ x: 0, y: 0 }, { x: 3, y: 0 }, never).map(key)).toEqual([
      '0,0',
      '1,0',
      '2,0',
      '3,0',
    ]);
    expect(worldRoute({ x: 0, y: 0 }, { x: 2, y: -2 }, never).map(key)).toEqual([
      '0,0',
      '1,-1',
      '2,-2',
    ]);
    expect(worldRoute({ x: 4, y: 4 }, { x: 4, y: 4 }, never).map(key)).toEqual(['4,4']);
  });

  it('obejde zakázaná políčka, start a cíl se nezakazují', () => {
    const wall = new Set(['1,-1', '1,0', '1,1']);
    const avoid = (c: GridCell): boolean =>
      wall.has(key(c)) || key(c) === '0,0' || key(c) === '2,0';
    const route = worldRoute({ x: 0, y: 0 }, { x: 2, y: 0 }, avoid);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 2, y: 0 });
    expect(route.slice(1, -1).some((c) => wall.has(key(c)))).toBe(false);
    expect(route.length).toBe(5);
    // každý krok vede na sousední mapu
    for (let k = 1; k < route.length; k++) {
      const d = Math.max(
        Math.abs(route[k]!.x - route[k - 1]!.x),
        Math.abs(route[k]!.y - route[k - 1]!.y),
      );
      expect(d).toBe(1);
    }
  });

  it('obklíčený cíl je nedosažitelný', () => {
    const avoid = (c: GridCell): boolean => Math.max(Math.abs(c.x - 5), Math.abs(c.y)) === 1;
    expect(worldRoute({ x: 0, y: 0 }, { x: 5, y: 0 }, avoid)).toEqual([]);
  });

  it('stejný vstup – stejná trasa bez ohledu na pořadí volání', () => {
    const avoid = (c: GridCell): boolean => (c.x + 2 * c.y) % 5 === 0 && c.x !== 0;
    const first = worldRoute({ x: 0, y: 0 }, { x: 6, y: 3 }, avoid).map(key);
    worldRoute({ x: 6, y: 3 }, { x: -4, y: 1 }, avoid);
    expect(worldRoute({ x: 0, y: 0 }, { x: 6, y: 3 }, avoid).map(key)).toEqual(first);
  });
});

describe('přechod okrajem na opačný okraj', () => {
  it('východ → západní okraj sousední mapy, druhá osa zůstane', () => {
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 955, z: 123 })).toEqual({
      x: -955,
      z: 123,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -40, z: 955 })).toEqual({
      x: -40,
      z: -955,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 2000, z: -955 })).toEqual({
      x: 955,
      z: 955,
    });
  });

  it('úhlopříčně z rohu do protějšího rohu', () => {
    expect(edgeCrossing({ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 955, z: 955 })).toEqual({
      x: -955,
      z: -955,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: -1, y: 1 }, { x: -955, z: 955 })).toEqual({
      x: 955,
      z: -955,
    });
  });

  it('nesousední mapy – chyba', () => {
    expect(() => edgeCrossing({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, z: 0 })).toThrow(RangeError);
    expect(() => edgeCrossing({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, z: 0 })).toThrow(RangeError);
  });
});
