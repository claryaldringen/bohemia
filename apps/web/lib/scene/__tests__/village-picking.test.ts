import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import {
  insideFootprint,
  pickVillageTarget,
  rayAtHeight,
  targetExists,
  type Ray,
} from '../village-picking';

const CELL = 15;
const village: SceneVillage = {
  dwellings: [
    { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    {
      id: 7,
      type: 'polozemnice',
      position: { x: 30, z: 0, rotation: Math.PI / 4 },
      built: false,
      progress: 0.3,
    },
  ],
  fields: [
    {
      id: 3,
      parts: [
        { cell: { x: 2, y: 0 }, x: 37.5, z: 7.5, size: CELL, stage: 'sown' },
        { cell: { x: 3, y: 0 }, x: 52.5, z: 7.5, size: CELL, stage: 'sown' },
      ],
    },
  ],
};
const flat = (): number => 0;
const cellOf = (x: number, z: number): { x: number; y: number } | null =>
  x < 0 || z < 0 ? null : { x: Math.floor(x / CELL), y: Math.floor(z / CELL) };
/** Paprsek shora šikmo na bod (x, z) země – jako kamera, která se dívá k +z. */
const rayTo = (x: number, z: number): Ray => ({
  origin: { x, y: 90, z: z - 80 },
  direction: { x: 0, y: -90, z: 80 },
});

describe('rayAtHeight', () => {
  it('bod paprsku ve výšce, za kamerou ani rovnoběžně nic', () => {
    expect(rayAtHeight(rayTo(5, 10), 0)).toMatchObject({ x: 5, z: 10, t: 1 });
    expect(rayAtHeight(rayTo(5, 10), 200)).toBeNull();
    const level: Ray = { origin: { x: 0, y: 5, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    expect(rayAtHeight(level, 0)).toBeNull();
  });
});

describe('insideFootprint', () => {
  it('natočený půdorys s okrajem', () => {
    const d = village.dwellings[1]!; // 5 × 5 m, natočená o 45°
    expect(insideFootprint({ x: 30, z: 0 }, d, 0)).toBe(true);
    // roh nenatočeného čtverce (2,5; 2,5) leží po natočení o 45° mimo půdorys
    expect(insideFootprint({ x: 32.4, z: 2.4 }, d, 0)).toBe(false);
    expect(insideFootprint({ x: 33.4, z: 0 }, d, 0)).toBe(true);
  });
});

describe('pickVillageTarget', () => {
  const options = (ground: { x: number; z: number } | null) => ({
    ground,
    groundHeight: flat,
    cellOf,
  });

  it('kliknutí na obydlí a staveniště je vybere', () => {
    expect(pickVillageTarget(village, rayTo(0, 0), options({ x: 0, z: 0 }))).toEqual({
      kind: 'dwelling',
      id: 1,
    });
    expect(pickVillageTarget(village, rayTo(30, 0), options({ x: 30, z: 0 }))).toEqual({
      kind: 'dwelling',
      id: 7,
    });
  });

  it('střecha nad zemí za obydlím se ještě počítá – paprsek protne obydlí ve výšce', () => {
    // paprsek dopadne na zem 3,5 m za zemnicí (mimo půdorys s okrajem), ve výšce 3 m je nad ní
    const behind = rayTo(0, 5.5);
    expect(pickVillageTarget(village, behind, options({ x: 0, z: 5.5 }))).toEqual({
      kind: 'dwelling',
      id: 1,
    });
  });

  it('čtverec pole vybere pole, prázdná zem nic, mimo krajinu nic', () => {
    expect(pickVillageTarget(village, rayTo(52, 8), options({ x: 52, z: 8 }))).toEqual({
      kind: 'field',
      id: 3,
    });
    expect(pickVillageTarget(village, rayTo(100, 100), options({ x: 100, z: 100 }))).toBeNull();
    expect(pickVillageTarget(village, rayTo(100, 100), options(null))).toBeNull();
  });

  it('targetExists hlídá zaniklé cíle', () => {
    expect(targetExists(village, { kind: 'dwelling', id: 7 })).toBe(true);
    expect(targetExists(village, { kind: 'dwelling', id: 3 })).toBe(false);
    expect(targetExists(village, { kind: 'field', id: 3 })).toBe(true);
  });
});

describe('hřbitov', () => {
  const withCemetery: SceneVillage = {
    ...village,
    cemeteries: [
      {
        id: 40,
        squares: [{ cell: { x: 0, y: 3 }, x: 7.5, z: 52.5, size: CELL }],
        built: true,
        progress: 1,
        graves: 3,
      },
    ],
  };

  it('klik na čtverec hřbitova ho vybere; zaniklý hřbitov neexistuje', () => {
    const target = pickVillageTarget(withCemetery, rayTo(7, 50), {
      ground: { x: 7, z: 50 },
      groundHeight: flat,
      cellOf,
    });
    expect(target).toEqual({ kind: 'cemetery', id: 40 });
    expect(targetExists(withCemetery, { kind: 'cemetery', id: 40 })).toBe(true);
    expect(targetExists(village, { kind: 'cemetery', id: 40 })).toBe(false);
  });
});
