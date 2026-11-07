import { describe, expect, it } from 'vitest';
import { NEAR_SITE_RADIUS_CELLS } from '../../band';
import { cellsOutline, circleOutline, polygonAreaM2 } from '../geometry';
import { NEAR_CELLS } from '../soil-forest';

const grid = { size: 8, cellSizeM: 15 };
const HALF = 60;
/** Roh mřížky políček ve světě. */
const corner = (x: number, y: number): [number, number] => [-HALF + x * 15, -HALF + y * 15];
const cells = (...xy: [number, number][]): number[] => xy.map(([x, y]) => y * grid.size + x);

describe('geometrie prvků', () => {
  it('okolí vsi typů půdy je 600 m jako v pásmu', () => {
    expect(NEAR_CELLS).toBe(NEAR_SITE_RADIUS_CELLS);
  });

  it('plocha mnohoúhelníku nezávisí na směru obíhání', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(polygonAreaM2(square)).toBe(100);
    expect(polygonAreaM2([...square].reverse())).toBe(100);
  });

  it('obrys jednoho políčka – čtyři rohy', () => {
    const outline = cellsOutline(cells([2, 3]), grid);
    expect(outline).toEqual([corner(2, 3), corner(3, 3), corner(3, 4), corner(2, 4)]);
    expect(polygonAreaM2(outline)).toBe(225);
  });

  it('obrys tvaru L – jen rohy, kde se mění směr', () => {
    const outline = cellsOutline(cells([1, 1], [2, 1], [3, 1], [1, 2], [1, 3]), grid);
    expect(outline).toHaveLength(6);
    expect(polygonAreaM2(outline)).toBe(5 * 225);
  });

  it('díra uvnitř celku do obrysu patří (vnější obrys)', () => {
    const ring: [number, number][] = [];
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) ring.push([x, y]);
    }
    const outline = cellsOutline(cells(...ring), grid);
    expect(outline).toEqual([corner(1, 1), corner(4, 1), corner(4, 4), corner(1, 4)]);
    expect(polygonAreaM2(outline)).toBe(9 * 225);
  });

  it('políčka celku, která se dotýkají jen rohem, obrys v rohu nespojí (4-sousedství)', () => {
    // Prstenec kolem (2, 2), kde se (2, 1) a (1, 2) dotýkají jen rohem: (2, 2) není díra – spojuje
    // ho s okolím úhlopříčka přes (1, 1), obrys jde dovnitř a kolem něj.
    const notch = cellsOutline(cells([2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]), grid);
    expect(polygonAreaM2(notch)).toBe(7 * 225);
    expect(notch.filter(([x, z]) => x === corner(2, 2)[0] && z === corner(2, 2)[1])).toHaveLength(
      2,
    );
    // Opačný roh: (1, 1) a (2, 2) se dotýkají jen rohem, spojené přes levý a spodní okraj.
    const other = cellsOutline(cells([1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 2]), grid);
    expect(polygonAreaM2(other)).toBe(7 * 225);
  });

  it('kruh se ořízne na krajinu a nepřesáhne poloměr', () => {
    const big = { size: 128, cellSizeM: 15 };
    const inner = circleOutline(big, 0, 0, 600);
    expect(polygonAreaM2(inner)).toBeGreaterThan(0.99 * Math.PI * 600 * 600);
    expect(polygonAreaM2(inner)).toBeLessThan(Math.PI * 600 * 600);
    const clipped = circleOutline(big, 700, 0, 600);
    for (const [x, z] of clipped) {
      expect(x).toBeLessThanOrEqual(960);
      expect(Math.hypot(x - 700, z)).toBeLessThanOrEqual(600 + 1e-9);
    }
    expect(clipped.some(([x]) => x === 960)).toBe(true);
    expect(polygonAreaM2(clipped)).toBeLessThan(polygonAreaM2(inner));
  });
});
