import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../village/people/world-grid';
import { WAR } from '../rules-war';
import { edgeCrossing, firstRouteStep, sideBySide, worldRoute } from '../world-route';

// Cesta mapu po mapě (war.md – Pohyb – mapu po mapě, Přechod okrajem).

const key = (c: GridCell): string => `${c.x},${c.y}`;
const never = (): boolean => false;

describe('trasa po mřížce světa', () => {
  it('rovně každou mapou, úhlopříčně dvěma kolmými kroky – čtyřsousedná (oprava Úlohy 5)', () => {
    expect(worldRoute({ x: 0, y: 0 }, { x: 3, y: 0 }, never).map(key)).toEqual([
      '0,0',
      '1,0',
      '2,0',
      '3,0',
    ]);
    // úhlopříčný soused přes sousední mapu – přechod okrajem, ne rohem mapy (rohová buňka 2,5 m)
    expect(worldRoute({ x: 0, y: 0 }, { x: 1, y: 1 }, never).map(key)).toEqual([
      '0,0',
      '0,1',
      '1,1',
    ]);
    const diagonal = worldRoute({ x: 0, y: 0 }, { x: 2, y: -2 }, never);
    expect(diagonal.length).toBe(5);
    expect(diagonal.at(-1)).toEqual({ x: 2, y: -2 });
    for (let k = 1; k < diagonal.length; k++) {
      const a = diagonal[k - 1]!;
      const b = diagonal[k]!;
      expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBe(1);
    }
    expect(worldRoute({ x: 4, y: 4 }, { x: 4, y: 4 }, never).map(key)).toEqual(['4,4']);
    // první krok k úhlopříčnému sousedovi (kurzor nad rohem mapy) – týž jako trasa
    expect(firstRouteStep('NE')).toBe('N');
    expect(firstRouteStep('SE')).toBe('E');
    expect(firstRouteStep('W')).toBe('W');
  });

  it('starší trasa s úhlopříčným krokem – dva kolmé kroky jako `worldRoute`', () => {
    const old = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 0 },
    ];
    expect(sideBySide({ x: 0, y: 0 }, old).map(key)).toEqual(['0,1', '1,1', '2,1', '3,1', '3,0']);
    expect(sideBySide({ x: 0, y: 0 }, old)[0]).not.toBe(old[0]);
    const straight = worldRoute({ x: 0, y: 0 }, { x: 3, y: 2 }, never).slice(1);
    expect(sideBySide({ x: 0, y: 0 }, straight)).toEqual(straight);
  });

  it('obejde zakázaná políčka, start a cíl se nezakazují', () => {
    const wall = new Set(['1,-1', '1,0', '1,1']);
    const avoid = (c: GridCell): boolean =>
      wall.has(key(c)) || key(c) === '0,0' || key(c) === '2,0';
    const route = worldRoute({ x: 0, y: 0 }, { x: 2, y: 0 }, avoid);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 2, y: 0 });
    expect(route.slice(1, -1).some((c) => wall.has(key(c)))).toBe(false);
    expect(route.length).toBe(7);
    // každý krok vede na sousední mapu přes společný okraj
    for (let k = 1; k < route.length; k++) {
      const d = Math.abs(route[k]!.x - route[k - 1]!.x) + Math.abs(route[k]!.y - route[k - 1]!.y);
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
  /** Střed okrajové buňky mřížky pochodu: 960 − půl buňky. */
  const E = 960 - WAR.march.cellM / 2;

  it('východ → západní okraj sousední mapy, druhá osa zůstane', () => {
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: E, z: 123 })).toEqual({
      x: -E,
      z: 123,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -40, z: E })).toEqual({
      x: -40,
      z: -E,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 2000, z: -E })).toEqual({
      x: E,
      z: E,
    });
  });

  it('úhlopříčně z rohu do protějšího rohu', () => {
    expect(edgeCrossing({ x: 2, y: 2 }, { x: 3, y: 3 }, { x: E, z: E })).toEqual({
      x: -E,
      z: -E,
    });
    expect(edgeCrossing({ x: 0, y: 0 }, { x: -1, y: 1 }, { x: -E, z: E })).toEqual({
      x: E,
      z: -E,
    });
  });

  it('nesousední mapy – chyba', () => {
    expect(() => edgeCrossing({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, z: 0 })).toThrow(RangeError);
    expect(() => edgeCrossing({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, z: 0 })).toThrow(RangeError);
  });
});
