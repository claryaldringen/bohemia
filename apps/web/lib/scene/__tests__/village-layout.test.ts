import { describe, it, expect } from 'vitest';
import {
  decalGrid,
  dwellingHideShape,
  fieldHideShape,
  footprintCorners,
  hiddenMask,
  localToWorld,
  pointInPolygon,
  polygonArea,
  signedDistance,
  softCoverage,
  stripSegments,
  type Point,
} from '../village-layout';

const square: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
// Tvar L – nekonvexní obrys (chybí pravý horní čtverec 5 × 5).
const lShape: Point[] = [
  [0, 0],
  [10, 0],
  [10, 5],
  [5, 5],
  [5, 10],
  [0, 10],
];

describe('localToWorld a footprintCorners', () => {
  it('natočení 0 nechá souřadnice modelu, vchod (+z) míří do +Z', () => {
    expect(localToWorld({ x: 5, z: -3, rotation: 0 }, 1, 2)).toEqual([6, -1]);
  });

  it('natočení π/2 otočí vchod do +X jako mesh.rotation.y v Babylonu', () => {
    const [x, z] = localToWorld({ x: 0, z: 0, rotation: Math.PI / 2 }, 0, 1);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });

  it('rohy půdorysu leží ve vzdálenosti půl úhlopříčky od středu při každém natočení', () => {
    for (const rotation of [0, 0.4, 2, 5.5]) {
      const corners = footprintCorners({ x: 10, z: 20, rotation }, 4, 4);
      expect(corners).toHaveLength(4);
      for (const [x, z] of corners) expect(Math.hypot(x - 10, z - 20)).toBeCloseTo(Math.SQRT2 * 2);
      expect(polygonArea(corners)).toBeCloseTo(16);
    }
  });
});

describe('mnohoúhelník pole', () => {
  it('bod uvnitř a venku i u nekonvexního obrysu', () => {
    expect(pointInPolygon(lShape, 2, 2)).toBe(true);
    expect(pointInPolygon(lShape, 2, 8)).toBe(true);
    expect(pointInPolygon(lShape, 8, 8)).toBe(false);
    expect(pointInPolygon(lShape, -1, 5)).toBe(false);
  });

  it('znaménková vzdálenost je kladná uvnitř a záporná venku', () => {
    expect(signedDistance(square, 5, 5)).toBeCloseTo(5);
    expect(signedDistance(square, 5, 1)).toBeCloseTo(1);
    expect(signedDistance(square, 5, -2)).toBeCloseTo(-2);
    expect(signedDistance(lShape, 7, 7)).toBeCloseTo(-2);
  });

  it('plocha nezávisí na směru obíhání', () => {
    expect(polygonArea(lShape)).toBeCloseTo(75);
    expect(polygonArea([...lShape].reverse())).toBeCloseTo(75);
  });
});

describe('decalGrid – výplň plochy sítí bodů', () => {
  it('vyplní čtverec a vynechá průhledné čtverce sítě', () => {
    const grid = decalGrid(
      { minX: -2, maxX: 12, minZ: -2, maxZ: 12 },
      1,
      softCoverage(square, 0.5),
    );
    expect(grid.alphas.length).toBe(15 * 15);
    expect(grid.positions.length).toBe(grid.alphas.length * 2);
    // Uvnitř plné krytí, daleko venku nic.
    const at = (x: number, z: number): number => grid.alphas[(z + 2) * 15 + (x + 2)]!;
    expect(at(5, 5)).toBe(1);
    expect(at(-2, -2)).toBe(0);
    expect(at(0, 5)).toBeCloseTo(0.5);
    // Trojúhelníky jen tam, kde aspoň jeden roh něco kryje – ne celý obdélník sítě.
    const full = 14 * 14 * 6;
    expect(grid.indices.length).toBeGreaterThan(10 * 10 * 6);
    expect(grid.indices.length).toBeLessThan(full);
    for (const index of grid.indices) expect(index).toBeLessThan(grid.alphas.length);
  });

  it('u tvaru L zůstane chybějící roh prázdný', () => {
    const grid = decalGrid(
      { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      0.5,
      softCoverage(lShape, 0.4),
    );
    const at = (x: number, z: number): number => grid.alphas[z * 2 * 21 + x * 2]!;
    expect(at(8, 8)).toBe(0);
    expect(at(2, 8)).toBe(1);
  });
});

describe('stripSegments – mez podél obrysu', () => {
  it('uzavřený obrys má úsek na každou hranu, body nejvýš po kroku', () => {
    const segments = stripSegments(square, true, 0.3, 2);
    expect(segments).toHaveLength(4);
    // 10 m po 2 m = 5 kroků → 6 dvojic bodů
    for (const strip of segments) expect(strip).toHaveLength(12);
  });

  it('otevřená čára nemá uzavírací hranu a pás má danou šířku', () => {
    const segments = stripSegments(square, false, 0.4, 20);
    expect(segments).toHaveLength(3);
    const [left, right] = segments[0]!;
    expect(Math.hypot(left![0] - right![0], left![1] - right![1])).toBeCloseTo(0.4);
  });
});

describe('skrytí stromů a kamenů pod vsí', () => {
  it('pod obydlím a v poli se skryjí, jinde zůstanou', () => {
    const shapes = [
      dwellingHideShape('zemnice', { x: 100, z: 100, rotation: 0 }),
      fieldHideShape({
        id: 1,
        parts: [
          { cell: { x: 0, y: 0 }, x: 2.5, z: 2.5, size: 5, stage: 'sown' },
          { cell: { x: 0, y: 1 }, x: 2.5, z: 7.5, size: 5, stage: 'sown' },
        ],
      })!,
    ];
    const points: [number, number, string][] = [
      [100, 100, 'pod obydlím'],
      [100, 105, 'vyšlapaná hlína před vchodem (+z)'],
      [100, 112, 'daleko před vchodem'],
      [2, 2, 'v dílu pole'],
      [5.5, 7, 'těsně vedle dílu (do 1 m)'],
      [7, 2, 'vedle pole'],
      [50, 50, 'mimo ves'],
    ];
    const mask = hiddenMask(Float32Array.from(points.flatMap(([x, z]) => [x, z])), shapes);
    expect(Object.fromEntries(points.map(([, , name], i) => [name, mask[i]]))).toEqual({
      'pod obydlím': 1,
      'vyšlapaná hlína před vchodem (+z)': 1,
      'daleko před vchodem': 0,
      'v dílu pole': 1,
      'těsně vedle dílu (do 1 m)': 1,
      'vedle pole': 0,
      'mimo ves': 0,
    });
  });

  it('pole bez dílů nic neskrývá', () => {
    expect(fieldHideShape({ id: 2, parts: [] })).toBeNull();
  });
});
