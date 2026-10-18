import { describe, expect, it } from 'vitest';
import {
  ROTATION_STEP,
  rotationCosSin,
  squareCenter,
  squareCorners,
  type SquareGrid,
  type TileCell,
} from '@bohemia/game';
import {
  parsePlaceCemeteryInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlot,
} from '../../village-input';
import type { SceneVillage } from '../../village-view';
import {
  cellsBoundary,
  cellsContain,
  rowDirection,
  squaresContain,
  structureGridAt,
  touchingSquares,
  type CellSquare,
} from '../field-cells';
import { fieldSpace } from '../field-space';
import { homesteadLayout, insidePlot, plotHouse, plotStakingLine } from '../homestead-layout';
import { squareLookup } from '../livestock-placement';
import { orchardRowLines, orchardTreeSpots } from '../orchard-layout';
import { pickVillageTarget, type Ray } from '../village-picking';
import { decalGrid } from '../village-layout';

// Natočené stavby ve scéně (fields.md – Natočené stavby; Martin 18. 10. 2026): pozemek, pole
// a sad natočené po 15° – geometrie čtverců, plot a záhony pozemku, jabloně v řadách, výběr
// kliknutím a vstup server actions.

const GEO = { size: 16, cellSizeM: 15 };
const G30: SquareGrid = { x: 7.5, z: 7.5, rotation: 2 * ROTATION_STEP };
const G45: SquareGrid = { x: 7.5, z: 7.5, rotation: 3 * ROTATION_STEP };

/** Čtverec natočené mřížky pro scénu (střed a natočení z jádra). */
function square(grid: SquareGrid, cell: TileCell): CellSquare {
  const c = squareCenter(GEO, grid, cell);
  return { cell, x: c.x, z: c.z, size: 15, rotation: grid.rotation };
}

/** Bod v osách čtverce (u, v od středu). */
function local(s: { x: number; z: number; rotation?: number }, x: number, z: number): number[] {
  const [c, sn] = rotationCosSin(s.rotation ?? 0);
  const dx = x - s.x;
  const dz = z - s.z;
  return [dx * c - dz * sn, dx * sn + dz * c];
}

describe('čtverce natočené mřížky (field-cells)', () => {
  const field = [square(G30, { x: 0, y: 0 }), square(G30, { x: 1, y: 0 })];

  it('mez kolem natočeného pole vede po rozích čtverců z jádra', () => {
    const segments = cellsBoundary(field);
    expect(segments).toHaveLength(4);
    const corners = [
      ...squareCorners(GEO, G30, { x: 0, y: 0 }),
      ...squareCorners(GEO, G30, { x: 1, y: 0 }),
    ];
    for (const point of segments.flat()) {
      expect(corners.some(([x, z]) => Math.hypot(x - point[0], z - point[1]) < 1e-9)).toBe(true);
    }
  });

  it('bod leží v natočeném čtverci podle jeho os, řádky jdou podél delší strany mřížky', () => {
    const contain = cellsContain(field);
    const [c, s] = rotationCosSin(G30.rotation);
    // 7 m po ose x čtverce (0, 0) – uvnitř; 7 m po ose x světa a 7 m po ose z – mimo roh
    expect(contain(7.5 + 7 * c, 7.5 - 7 * s)).toBe(true);
    expect(contain(7.5 - 7, 7.5 - 7)).toBe(false);
    const [dx, dz] = rowDirection(field);
    expect(dx).toBeCloseTo(c, 12);
    expect(dz).toBeCloseTo(-s, 12);
  });

  it('sousední čtverce se hledají jen ve stejné mřížce', () => {
    const neighbour = square(G30, { x: 0, y: 1 });
    const other = square(G45, { x: 0, y: 1 });
    expect(touchingSquares(field, [neighbour, other])).toEqual([neighbour]);
  });

  it('stavby v různých mřížkách: bod najde svůj čtverec, malování se chytí mřížky stavby', () => {
    const aligned: CellSquare = { cell: { x: 3, y: 3 }, x: -67.5, z: -67.5, size: 15 };
    const contain = squaresContain([...field, aligned]);
    expect(contain(-67.5, -67.5)).toBe(true);
    expect(contain(7.5, 7.5)).toBe(true);
    expect(contain(-30, -30)).toBe(false);
    const structures = [{ grid: G30, squares: field }, { squares: [aligned] }];
    expect(structureGridAt(structures, 7.5, 7.5)).toEqual(G30);
    expect(structureGridAt(structures, -67.5, -67.5)).toBeUndefined();
    expect(structureGridAt(structures, -30, -30)).toBeNull();
  });

  it('obsah natočeného pole se počítá v rovném prostoru a otočí se do světa', () => {
    const space = fieldSpace(field)!;
    expect(space).not.toBeNull();
    expect(fieldSpace([{ cell: { x: 8, y: 8 }, x: 7.5, z: 7.5, size: 15 }])).toBeNull();
    const flat = space.square(field[1]!);
    expect(flat.rotation).toBeUndefined();
    expect(flat.x).toBeCloseTo(22.5, 9);
    expect(flat.z).toBeCloseTo(7.5, 9);
    const grid = space.grid(
      decalGrid({ minX: flat.x - 7.5, maxX: flat.x + 7.5, minZ: 0, maxZ: 15 }, 15, () => 1),
    );
    const corners = squareCorners(GEO, G30, { x: 1, y: 0 });
    for (let k = 0; k < grid.positions.length; k += 2) {
      const [x, z] = [grid.positions[k]!, grid.positions[k + 1]!];
      expect(corners.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1e-4)).toBe(true);
    }
  });
});

describe('natočený pozemek (varianta a)', () => {
  const plot = { x: 40, z: -12, size: 15, rotation: 3 * ROTATION_STEP };

  it('plot, záhony i dům leží v natočeném čtverci, branka vpředu proti domu', () => {
    const layout = homesteadLayout(plot, 'back-left', 7);
    expect(layout.rotation).toBe(plot.rotation);
    const house = plotHouse(plot, 'back-left');
    expect(layout.house).toEqual(house);
    expect(house.rotation).toBeCloseTo(Math.PI + plot.rotation, 9);
    const posts = layout.fence.runs.flatMap((run) => run.posts);
    expect(posts.length).toBeGreaterThan(20);
    for (const post of posts) {
      const [u, v] = local(plot, post.x, post.z);
      expect(Math.max(Math.abs(u!), Math.abs(v!))).toBeLessThan(7.5);
    }
    // branka je na přední straně pozemku (−z v jeho osách)
    const gate = posts.filter((p) => p.gate);
    expect(gate).toHaveLength(2);
    for (const p of gate) expect(local(plot, p.x, p.z)[1]!).toBeLessThan(-6);
    for (const bed of layout.beds) expect(insidePlot(plot, bed.x, bed.z)).toBe(true);
    // 10,5 m po ose x světa je v osách natočeného pozemku za plotem (7,4 m), 7 m uvnitř (4,9 m)
    expect(insidePlot(plot, 40 + 10.5, -12)).toBe(false);
    expect(insidePlot(plot, 40 + 7, -12)).toBe(true);
  });

  it('vytyčení vede po natočeném obrysu plotu', () => {
    const line = plotStakingLine(plot);
    expect(line).toHaveLength(5);
    for (const [x, z] of line) {
      const [u, v] = local(plot, x, z);
      expect(Math.abs(Math.abs(u!) - 7)).toBeLessThan(1e-9);
      expect(Math.abs(Math.abs(v!) - 7)).toBeLessThan(1e-9);
    }
  });

  it('pozemek bez natočení se rozmístí jako dřív', () => {
    const square = { x: 40, z: -12, size: 15 };
    expect(homesteadLayout({ ...square, rotation: 0 }, 'center', 3)).toEqual(
      homesteadLayout(square, 'center', 3),
    );
  });
});

describe('natočený sad', () => {
  it('jabloně stojí v řadách podél os čtverce', () => {
    const s = square(G45, { x: 1, y: 2 });
    const spots = orchardTreeSpots(s);
    expect(spots).toHaveLength(4);
    const along = spots.map((spot) =>
      local(s, spot.x, spot.z).map((v) => Math.round(v * 1e6) / 1e6),
    );
    expect(along).toEqual([
      [-3.75, -3.75],
      [3.75, -3.75],
      [-3.75, 3.75],
      [3.75, 3.75],
    ]);
    for (const [a, b] of orchardRowLines([s])) {
      const [, va] = local(s, a![0], a![1]);
      const [, vb] = local(s, b![0], b![1]);
      expect(va).toBeCloseTo(vb!, 9);
    }
  });
});

describe('výběr a stáda na natočených stavbách', () => {
  const part = square(G30, { x: 0, y: 0 });
  const village: SceneVillage = {
    dwellings: [],
    fields: [{ id: 4, grid: G30, parts: [{ ...part, stage: 'sown' }] }],
  };
  const ray = (x: number, z: number): Ray => ({
    origin: { x, y: 90, z: z - 80 },
    direction: { x: 0, y: -90, z: 80 },
  });
  const options = (x: number, z: number) => ({
    ground: { x, z },
    groundHeight: () => 0,
    cellOf: (wx: number, wz: number) => ({
      x: Math.floor((wx + 120) / 15),
      y: Math.floor((wz + 120) / 15),
    }),
  });

  it('kliknutí na natočený díl vybere pole, roh políčka mimo díl ne', () => {
    const [c, s] = rotationCosSin(G30.rotation);
    const inside = { x: 7.5 + 6 * c, z: 7.5 - 6 * s };
    expect(
      pickVillageTarget(village, ray(inside.x, inside.z), options(inside.x, inside.z)),
    ).toEqual({ kind: 'field', id: 4 });
    expect(pickVillageTarget(village, ray(0.5, 0.5), options(0.5, 0.5))).toBeNull();
  });

  it('stáda poznají natočený čtverec podle jeho os', () => {
    const lookup = squareLookup(Array.from({ length: 10 }, () => part));
    const [c, s] = rotationCosSin(G30.rotation);
    expect(lookup(7.5 + 7 * c, 7.5 - 7 * s, 0)).toBe(true);
    expect(lookup(0.5, 0.5, 0)).toBe(false);
  });
});

describe('vstup server actions s natočením', () => {
  it('pole a sad nesou mřížku, hřbitov a ohrada ne', () => {
    const grid = { x: 7.5, z: 7.5, rotation: 0.5 };
    expect(parsePlaceFieldInput({ cells: [{ x: 0, y: -1 }], grid })).toEqual({
      cells: [{ x: 0, y: -1 }],
      grid,
    });
    expect(parsePlaceOrchardInput({ cells: [], grid: { x: 1, z: 'a', rotation: 0 } })).toBeNull();
    expect(parsePlaceCemeteryInput({ cells: [{ x: 1, y: 1 }], grid })).toBeNull();
    expect(parsePlaceFieldInput({ cells: [{ x: 1, y: 1 }] })).toEqual({ cells: [{ x: 1, y: 1 }] });
  });

  it('natočený pozemek nese střed a natočení', () => {
    expect(
      parsePlot({
        cell: { x: 8, y: 8 },
        variant: 'back-left',
        square: { x: 7.5, z: 9, rotation: ROTATION_STEP },
      }),
    ).toEqual({
      cell: { x: 8, y: 8 },
      variant: 'back-left',
      square: { x: 7.5, z: 9, rotation: ROTATION_STEP },
    });
    expect(parsePlot({ cell: { x: 8, y: 8 }, variant: 'center', square: { x: 1 } })).toBeNull();
  });
});
