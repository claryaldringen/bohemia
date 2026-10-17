import { describe, expect, it } from 'vitest';
import {
  clipToRect,
  isSimplePolygon,
  normalizeOutline,
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

describe('clipToRect', () => {
  it('ořízne čtverec přes roh obdélníku na čtvrtinu', () => {
    const clipped = clipToRect(square(-5, -5, 10), 0, 0, 15, 15);
    expect(polygonArea(clipped)).toBeCloseTo(25);
  });

  it('mnohoúhelník celý uvnitř zůstane, celý mimo zmizí', () => {
    expect(polygonArea(clipToRect(square(2, 2, 5), 0, 0, 15, 15))).toBeCloseTo(25);
    expect(clipToRect(square(20, 20, 5), 0, 0, 15, 15)).toHaveLength(0);
  });

  it('nekonvexní tvar L dá správnou plochu průniku', () => {
    const l: Point[] = [
      [0, 0],
      [20, 0],
      [20, 5],
      [5, 5],
      [5, 20],
      [0, 20],
    ];
    // v obdélníku 0–15 × 0–15: pruh 15 × 5 dole + pruh 5 × 10 vlevo
    expect(polygonArea(clipToRect(l, 0, 0, 15, 15))).toBeCloseTo(75 + 50);
  });
});

describe('isSimplePolygon', () => {
  it('čtverec a nekonvexní mnohoúhelník jsou jednoduché', () => {
    expect(isSimplePolygon(square(0, 0, 10))).toBe(true);
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 0],
        [5, 3],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(true);
  });

  it('motýlek (křížící se obrys) jednoduchý není', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(false);
  });

  it('obrys, který se vrací po vlastní hraně, jednoduchý není', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 0],
        [5, 0],
        [5, 5],
      ]),
    ).toBe(false);
  });

  it('obrys dotýkající se sám sebe vrcholem jednoduchý není', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 0],
        [0, 10],
      ]),
    ).toBe(false);
  });

  it('méně než 3 body jednoduchý mnohoúhelník nejsou', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(false);
  });
});

describe('normalizeOutline', () => {
  it('vynechá body na sobě i uzavírající opakování prvního bodu', () => {
    expect(
      normalizeOutline([
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
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
