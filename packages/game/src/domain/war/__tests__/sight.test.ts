import { describe, expect, it } from 'vitest';
import { discoverBuildings, inSight } from '../sight';
import { field } from './battle-fixtures';

// Mlha války (war.md – Mlha války): dohled 150 m, v lese 50 m; objevené zůstane.

const forest = (tx: number, ty: number): boolean => tx >= 58 && tx <= 70 && ty >= 69 && ty <= 72;

describe('dohled a objevené stavby', () => {
  it('v lese dohlédne muž jen na 50 m, bez mapy taky', () => {
    const grid = field([], forest).grid;
    const eye = { x: 0, z: 0 };
    expect(inSight(grid, eye, { x: 140, z: 0 })).toBe(true);
    expect(inSight(grid, eye, { x: 160, z: 0 })).toBe(false);
    expect(inSight(grid, eye, { x: 0, z: 100 })).toBe(false);
    expect(inSight(grid, { x: 0, z: 70 }, { x: 0, z: 100 })).toBe(true);
    expect(inSight(null, eye, { x: 60, z: 0 })).toBe(false);
  });

  it('objevené stavby přibývají a zůstanou seřazené', () => {
    const grid = field().grid;
    const houses = [
      { id: 9, position: { x: 100, z: 0 } },
      { id: 3, position: { x: 400, z: 0 } },
    ];
    expect(discoverBuildings([], houses, [{ x: 0, z: 0 }], grid)).toEqual([9]);
    // muž odešel – stavba 9 zůstane objevená
    expect(discoverBuildings([9], houses, [{ x: 350, z: 0 }], grid)).toEqual([3, 9]);
    expect(discoverBuildings([5], houses, [], grid)).toEqual([5]);
  });
});
