import { describe, expect, it } from 'vitest';
import {
  clipToConvex,
  coveredArea,
  pointInPolygon,
  polygonArea,
  polygonsOverlap,
  rectangleCorners,
  type Point,
} from '../polygon';

const square = (x: number, z: number, size: number): Point[] => [
  [x, z],
  [x + size, z],
  [x + size, z + size],
  [x, z + size],
];

describe('polygonArea', () => {
  it('spočítá plochu čtverce a trojúhelníku bez ohledu na směr obíhání', () => {
    expect(polygonArea(square(0, 0, 10))).toBeCloseTo(100);
    expect(polygonArea([...square(0, 0, 10)].reverse())).toBeCloseTo(100);
    expect(
      polygonArea([
        [0, 0],
        [10, 0],
        [0, 10],
      ]),
    ).toBeCloseTo(50);
  });

  it('méně než 3 body mají plochu 0', () => {
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
      ]),
    ).toBe(0);
  });
});

describe('pointInPolygon', () => {
  it('bod uvnitř je uvnitř, na hraně a venku ne', () => {
    const s = square(0, 0, 10);
    expect(pointInPolygon([5, 5], s)).toBe(true);
    expect(pointInPolygon([10, 5], s)).toBe(false);
    expect(pointInPolygon([0, 0], s)).toBe(false);
    expect(pointInPolygon([15, 5], s)).toBe(false);
  });
});

describe('polygonsOverlap', () => {
  it('křížící se čtverce se překrývají', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(5, 5, 10))).toBe(true);
  });

  it('čtverce posunuté o půl šířky (hrany se jen dotýkají vrcholy) se překrývají', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(5, 0, 10))).toBe(true);
  });

  it('stejné čtverce i čtverec uvnitř jiného se překrývají', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(0, 0, 10))).toBe(true);
    expect(polygonsOverlap(square(0, 0, 10), square(2, 2, 3))).toBe(true);
    expect(polygonsOverlap(square(2, 2, 3), square(0, 0, 10))).toBe(true);
  });

  it('kosočtverec vepsaný do čtverce (vrcholy na hranách) se překrývá', () => {
    const diamond: Point[] = [
      [5, 0],
      [10, 5],
      [5, 10],
      [0, 5],
    ];
    expect(polygonsOverlap(square(0, 0, 10), diamond)).toBe(true);
  });

  it('sousední čtverce se společnou hranou ani vzdálené čtverce se nepřekrývají', () => {
    expect(polygonsOverlap(square(0, 0, 10), square(10, 0, 10))).toBe(false);
    expect(polygonsOverlap(square(0, 0, 10), square(10, 3, 4))).toBe(false);
    expect(polygonsOverlap(square(0, 0, 10), square(30, 30, 10))).toBe(false);
  });
});

describe('rectangleCorners', () => {
  it('bez otočení dá osové rohy kolem středu', () => {
    const corners = rectangleCorners(10, 20, 4, 6, 0);
    expect(corners).toEqual([
      [8, 17],
      [12, 17],
      [12, 23],
      [8, 23],
    ]);
  });

  it('otočení o 90° prohodí šířku a hloubku', () => {
    const corners = rectangleCorners(0, 0, 4, 6, Math.PI / 2);
    const xs = corners.map(([x]) => x);
    const zs = corners.map(([, z]) => z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(4);
    expect(polygonArea(corners)).toBeCloseTo(24);
  });
});

describe('clipToConvex a coveredArea – kolik plochy stavba sebere čtverci', () => {
  it('průnik obdélníků bez ohledu na obíhání; bez průniku prázdný', () => {
    expect(polygonArea(clipToConvex(square(0, 0, 10), square(5, 5, 10)))).toBeCloseTo(25, 9);
    expect(
      polygonArea(clipToConvex([...square(0, 0, 10)].reverse(), square(5, -5, 10))),
    ).toBeCloseTo(25, 9);
    expect(clipToConvex(square(0, 0, 10), square(20, 20, 5))).toEqual([]);
    // natočený čtverec uvnitř celý
    const turned = rectangleCorners(5, 5, 4, 4, 0.7);
    expect(polygonArea(clipToConvex(turned, square(0, 0, 10)))).toBeCloseTo(16, 9);
  });

  it('sjednocení dvou ploch ve čtverci se nepočítá dvakrát; dotyk hranou nic', () => {
    const cell = square(0, 0, 15);
    expect(coveredArea([square(-5, -5, 10)], cell)).toBeCloseTo(25, 9);
    // dvě plochy 10 × 10 přes sebe o 5 × 10 – sjednocení 150, ve čtverci 15 × 15 jen 15 × 10
    expect(coveredArea([square(0, 0, 10), square(5, 0, 10)], cell)).toBeCloseTo(150, 9);
    expect(coveredArea([square(10, 0, 10), square(5, 0, 10)], cell)).toBeCloseTo(100, 9);
    expect(coveredArea([square(15, 0, 10)], cell)).toBeCloseTo(0, 9);
  });
});
