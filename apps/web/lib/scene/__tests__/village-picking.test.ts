import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { targetOutline } from '../selection-highlight';
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

describe('sad', () => {
  const withOrchard: SceneVillage = {
    ...village,
    orchards: [
      {
        id: 50,
        squares: [
          {
            cell: { x: 1, y: 4 },
            x: 22.5,
            z: 67.5,
            size: CELL,
            planting: 1,
            growth: 0.6,
            fruit: false,
          },
        ],
      },
    ],
  };

  it('klik na čtverec sadu ho vybere; zaniklý sad neexistuje', () => {
    const target = pickVillageTarget(withOrchard, rayTo(22, 66), {
      ground: { x: 22, z: 66 },
      groundHeight: flat,
      cellOf,
    });
    expect(target).toEqual({ kind: 'orchard', id: 50 });
    expect(targetExists(withOrchard, { kind: 'orchard', id: 50 })).toBe(true);
    expect(targetExists(village, { kind: 'orchard', id: 50 })).toBe(false);
  });
});

describe('pozemek polozemnice', () => {
  // políčko (4, 2) = svět x 60 … 75, z 30 … 45; dům vzadu vlevo
  const plot = {
    cell: { x: 4, y: 2 },
    x: 67.5,
    z: 37.5,
    size: CELL,
    variant: 'back-left' as const,
  };
  const withPlot: SceneVillage = {
    ...village,
    dwellings: [
      ...village.dwellings,
      {
        id: 9,
        type: 'polozemnice',
        position: { x: 64.2, z: 40.7, rotation: Math.PI },
        built: true,
        progress: 1,
        plot,
      },
    ],
  };

  it('kliknutí kamkoli na pozemek (záhony, branka) vybere obydlí', () => {
    const pick = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
      pickVillageTarget(withPlot, rayTo(x, z), {
        ground: { x, z },
        groundHeight: flat,
        cellOf,
      });
    expect(pick(72, 32)).toEqual({ kind: 'dwelling', id: 9 });
    expect(pick(61, 31)).toEqual({ kind: 'dwelling', id: 9 });
    // vedlejší políčko je prázdné
    expect(pick(80, 32)).toBeNull();
  });

  it('výběr obydlí na pozemku označí celé políčko, volné obydlí jen rámeček kolem domu', () => {
    const ring = targetOutline(withPlot, { kind: 'dwelling', id: 9 }).flat();
    const xs = ring.map(([x]) => x);
    const zs = ring.map(([, z]) => z);
    expect(Math.min(...xs)).toBe(60);
    expect(Math.max(...xs)).toBe(75);
    expect(Math.min(...zs)).toBe(30);
    expect(Math.max(...zs)).toBe(45);
    const [house] = targetOutline(withPlot, { kind: 'dwelling', id: 1 });
    const hx = house!.map(([x]) => x);
    expect(Math.max(...hx) - Math.min(...hx)).toBeLessThan(8);
  });
});

describe('pickVillageTarget – posvátná místa', () => {
  const sacredVillage: SceneVillage = {
    ...village,
    sacred: {
      oaks: [{ id: 501, x: 100, z: 100 }],
      groves: [
        {
          id: 601,
          x: 157.5,
          z: 7.5,
          squares: [{ cell: { x: 10, y: 0 }, x: 157.5, z: 7.5, size: CELL }],
        },
      ],
      buildings: [
        {
          id: 701,
          kind: 'shrine',
          position: { x: 0, z: 200, rotation: 0 },
          built: true,
          progress: 1,
        },
        {
          id: 702,
          kind: 'idol',
          position: { x: 60, z: 60, rotation: 0 },
          built: false,
          progress: 0,
        },
      ],
    },
  };
  const options = (x: number, z: number) => ({ ground: { x, z }, groundHeight: flat, cellOf });

  it('svatyně a modla podle půdorysu (i staveniště), dub u kmene, háj po čtvercích', () => {
    expect(pickVillageTarget(sacredVillage, rayTo(10, 205), options(10, 205))).toEqual({
      kind: 'sacred',
      id: 701,
    });
    expect(pickVillageTarget(sacredVillage, rayTo(61, 60), options(61, 60))).toEqual({
      kind: 'sacred',
      id: 702,
    });
    expect(pickVillageTarget(sacredVillage, rayTo(102, 101), options(102, 101))).toEqual({
      kind: 'sacred-oak',
      id: 501,
    });
    expect(pickVillageTarget(sacredVillage, rayTo(160, 5), options(160, 5))).toEqual({
      kind: 'grove',
      id: 601,
    });
    // daleko od všeho nic, pole zůstává polem
    expect(pickVillageTarget(sacredVillage, rayTo(120, 140), options(120, 140))).toBeNull();
    expect(pickVillageTarget(sacredVillage, rayTo(40, 5), options(40, 5))).toEqual({
      kind: 'field',
      id: 3,
    });
  });

  it('existují jen posvátná místa, která ves má', () => {
    expect(targetExists(sacredVillage, { kind: 'sacred', id: 702 })).toBe(true);
    expect(targetExists(sacredVillage, { kind: 'grove', id: 601 })).toBe(true);
    expect(targetExists(sacredVillage, { kind: 'sacred-oak', id: 999 })).toBe(false);
    expect(targetExists(village, { kind: 'sacred', id: 701 })).toBe(false);
  });
});

describe('výběr ohrady (oxen.md)', () => {
  const withPen: SceneVillage = {
    ...village,
    pens: [
      {
        id: 21,
        cell: { x: 1, y: 2 },
        x: 22.5,
        z: 37.5,
        size: CELL,
        built: true,
        progress: 1,
        oxen: 2,
        trainees: 0,
        cows: 0,
      },
    ],
  };

  it('klik na čtverec ohrady ji vybere, obrys je čtverec ohrady', () => {
    const target = pickVillageTarget(withPen, rayTo(22, 38), {
      ground: { x: 22, z: 38 },
      groundHeight: flat,
      cellOf,
    });
    expect(target).toEqual({ kind: 'pen', id: 21 });
    expect(targetExists(withPen, { kind: 'pen', id: 21 })).toBe(true);
    expect(targetExists(village, { kind: 'pen', id: 21 })).toBe(false);
    const outline = targetOutline(withPen, { kind: 'pen', id: 21 });
    const xs = outline.flat().map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(15, 9);
    expect(Math.max(...xs)).toBeCloseTo(30, 9);
  });
});
