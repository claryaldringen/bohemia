import { describe, expect, it } from 'vitest';
import { generateLandscape } from '../generate';
import { heightAtWorld, tileCenterWorld, tileOfWorldPoint } from '../world';

const landscape = generateLandscape(42);

describe('souřadnice světa scény', () => {
  it('střed políčka 0, 0 leží v rohu krajiny (střed krajiny je počátek)', () => {
    expect(tileCenterWorld(landscape, 0, 0)).toEqual({ x: -952.5, z: -952.5 });
  });

  it('střed políčka patří zpět tomu políčku, bod mimo krajinu žádnému', () => {
    const { x, z } = tileCenterWorld(landscape, 30, 40);
    expect(tileOfWorldPoint(landscape, x, z)).toEqual({ x: 30, y: 40 });
    expect(tileOfWorldPoint(landscape, 961, 0)).toBeNull();
    expect(tileOfWorldPoint(landscape, -961, 0)).toBeNull();
  });

  it('výška ve středu políčka je výška políčka, mezi středy se prolíná', () => {
    const a = tileCenterWorld(landscape, 30, 40);
    const b = tileCenterWorld(landscape, 31, 40);
    const ha = landscape.heights[40 * landscape.size + 30]!;
    const hb = landscape.heights[40 * landscape.size + 31]!;
    expect(heightAtWorld(landscape, a.x, a.z)).toBeCloseTo(ha, 5);
    expect(heightAtWorld(landscape, (a.x + b.x) / 2, a.z)).toBeCloseTo((ha + hb) / 2, 5);
  });
});
