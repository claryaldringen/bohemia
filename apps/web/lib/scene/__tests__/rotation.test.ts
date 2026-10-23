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
  parsePlacePenInput,
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
import { GRAVE_GRID, fenceLayout, gravePlacements } from '../cemetery-layout';
import { fieldSpace } from '../field-space';
import { homesteadLayout, insidePlot, plotHouse, plotStakingLine } from '../homestead-layout';
import { squareLookup } from '../livestock-placement';
import { foreignFromScene } from '../neighbour-villages';
import { orchardRowLines, orchardTreeSpots } from '../orchard-layout';
import {
  insidePen,
  penFacing,
  penLayout,
  penMudAt,
  penMudBounds,
  penStakingLine,
} from '../pen-layout';
import { targetOutline } from '../selection-highlight';
import { pickVillageTarget, type Ray } from '../village-picking';
import { nextSelection } from '../village-selection';
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

  it('kliknutí na natočený díl vybere díl, dvojklik pole; roh políčka mimo díl nic', () => {
    const [c, s] = rotationCosSin(G30.rotation);
    const inside = { x: 7.5 + 6 * c, z: 7.5 - 6 * s };
    const picked = pickVillageTarget(village, ray(inside.x, inside.z), options(inside.x, inside.z));
    expect(picked).toEqual({ kind: 'field-part', id: 4, cell: { x: 0, y: 0 } });
    expect(nextSelection(null, picked, false, true)).toEqual({ kind: 'field', id: 4 });
    expect(pickVillageTarget(village, ray(0.5, 0.5), options(0.5, 0.5))).toBeNull();
    // obrys vybraného dílu je natočený čtverec dílu
    const outline = targetOutline(village, picked!).flat();
    const corners = squareCorners(GEO, G30, { x: 0, y: 0 });
    for (const [x, z] of corners) {
      expect(outline.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 1e-6)).toBe(true);
    }
  });

  it('stáda poznají natočený čtverec podle jeho os', () => {
    const lookup = squareLookup(Array.from({ length: 10 }, () => part));
    const [c, s] = rotationCosSin(G30.rotation);
    expect(lookup(7.5 + 7 * c, 7.5 - 7 * s, 0)).toBe(true);
    expect(lookup(0.5, 0.5, 0)).toBe(false);
  });
});

describe('vstup server actions s natočením', () => {
  it('pole, sad, hřbitov i ohrada nesou mřížku', () => {
    const grid = { x: 7.5, z: 7.5, rotation: 0.5 };
    expect(parsePlaceFieldInput({ cells: [{ x: 0, y: -1 }], grid })).toEqual({
      cells: [{ x: 0, y: -1 }],
      grid,
    });
    expect(parsePlaceOrchardInput({ cells: [], grid: { x: 1, z: 'a', rotation: 0 } })).toBeNull();
    expect(parsePlaceCemeteryInput({ cells: [{ x: 1, y: 1 }], grid })).toEqual({
      cells: [{ x: 1, y: 1 }],
      grid,
    });
    // ohrada nese druh (oxen.md – Ohrady podle druhu); bez druhu skot jako dřívější ohrada
    expect(parsePlacePenInput({ cells: [{ x: 0, y: 0 }], grid })).toEqual({
      cells: [{ x: 0, y: 0 }],
      species: 'cattle',
      grid,
    });
    expect(
      parsePlacePenInput({
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        species: 'sheep',
        grid,
      }),
    ).toEqual({
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      species: 'sheep',
      grid,
    });
    expect(parsePlacePenInput({ cells: [{ x: 0, y: 0 }], species: 'horse' })).toBeNull();
    expect(parsePlacePenInput({ cells: [], grid })).toBeNull();
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

describe('natočený hřbitov ve scéně', () => {
  const squares = [square(G30, { x: 0, y: 0 }), square(G30, { x: 1, y: 0 })];
  const inUnion = (x: number, z: number, margin: number): boolean =>
    squares.some((q) => {
      const [u, v] = local(q, x, z);
      return Math.max(Math.abs(u!), Math.abs(v!)) <= 7.5 + margin;
    });

  it('plot vede po obrysu natočených čtverců se zakulacenými rohy, branka míří k obydlí', () => {
    const [c, sn] = rotationCosSin(G30.rotation);
    // obydlí 40 m po ose y mřížky (místní +z)
    const toward = { x: 7.5 + 40 * sn, z: 7.5 + 40 * c };
    const layout = fenceLayout(squares, toward);
    const posts = layout.fence.runs.flatMap((run) => run.posts);
    expect(posts.length).toBeGreaterThan(30);
    for (const post of posts) {
      // kůly stojí uvnitř čtverců u jejich obvodu (ne v ose krajiny)
      expect(inUnion(post.x, post.z, 1e-6)).toBe(true);
      // plot stojí 1,5 m od okraje čtverců (mezi stavbami ulička 3 m)
      expect(inUnion(post.x, post.z, -2.5)).toBe(false);
    }
    const gate = posts.filter((p) => p.gate);
    expect(gate).toHaveLength(2);
    for (const p of gate) expect(local(squares[0]!, p.x, p.z)[1]!).toBeGreaterThan(5.5);
    // vytyčení po rozích plotu – 1,5 m diagonálně dovnitř od rohů čtverců z jádra
    for (const point of layout.outline.flat()) {
      const corners = [
        ...squareCorners(GEO, G30, { x: 0, y: 0 }),
        ...squareCorners(GEO, G30, { x: 1, y: 0 }),
      ];
      expect(
        corners.some(
          ([x, z]) => Math.abs(Math.hypot(x - point[0], z - point[1]) - 1.5 * Math.SQRT2) < 1e-9,
        ),
      ).toBe(true);
    }
  });

  it('hroby stojí po řadách v osách natočených čtverců', () => {
    const graves = gravePlacements(squares, 70, 3);
    expect(graves).toHaveLength(70);
    for (const grave of graves) expect(inUnion(grave.x, grave.z, -0.4)).toBe(true);
    // první řada prvního čtverce leží podél osy x mřížky (stejné místní v, rostoucí u)
    const row = graves.slice(0, GRAVE_GRID.columns).map((g) => local(squares[0]!, g.x, g.z));
    for (const [u, v] of row) {
      expect(Math.abs(v! - row[0]![1]!)).toBeLessThan(1);
      expect(u!).toBeGreaterThan(-7.5);
    }
    expect(row[GRAVE_GRID.columns - 1]![0]!).toBeGreaterThan(row[0]![0]! + 8);
  });

  it('nenatočený hřbitov má plot a hroby jako dřív', () => {
    const aligned: CellSquare[] = [
      { cell: { x: 8, y: 8 }, x: 7.5, z: 7.5, size: 15 },
      { cell: { x: 9, y: 8 }, x: 22.5, z: 7.5, size: 15 },
    ];
    const layout = fenceLayout(aligned, { x: 0, z: 60 });
    for (const post of layout.fence.runs.flatMap((run) => run.posts)) {
      expect(post.z).toBeGreaterThanOrEqual(-1e-9);
      expect(post.z).toBeLessThanOrEqual(15 + 1e-9);
    }
    expect(gravePlacements(aligned, 5, 1)).toEqual(
      gravePlacements(
        aligned.map((q) => ({ ...q })),
        5,
        1,
      ),
    );
  });
});

describe('natočená ohrada ve scéně', () => {
  const pen = { x: 40, z: -12, size: 15, rotation: ROTATION_STEP };
  const toward = { x: 40, z: 60 };

  it('plot, branka, přístřešek a zvířata v natočeném čtverci; branka k obydlí', () => {
    const layout = penLayout(pen, penFacing(pen, toward));
    expect(layout.rotation).toBe(ROTATION_STEP);
    const posts = layout.fence.runs.flatMap((run) => run.posts);
    for (const post of posts) {
      const [u, v] = local(pen, post.x, post.z);
      expect(Math.max(Math.abs(u!), Math.abs(v!))).toBeLessThan(7.5);
    }
    // branka na straně ke vsi (místní +z – obydlí leží dál po ose z)
    expect(local(pen, layout.gate.x, layout.gate.z)[1]!).toBeGreaterThan(5.5);
    // přístřešek v zadním rohu (místní −z), natočený o natočení ohrady víc než v osách
    const [, shelterV] = local(pen, layout.shelter.x, layout.shelter.z);
    expect(shelterV!).toBeLessThan(-2);
    for (const spot of [...layout.spots, ...layout.animals]) {
      expect(insidePen(layout, spot.x, spot.z)).toBe(true);
    }
    // bod za natočeným plotem (v osách krajiny by byl uvnitř)
    const [c, sn] = rotationCosSin(ROTATION_STEP);
    const corner = { x: pen.x + 7 * c + 7 * sn, z: pen.z - 7 * sn + 7 * c };
    expect(insidePen(layout, corner.x, corner.z)).toBe(false);
    expect(penMudAt(layout, corner.x, corner.z)).toBe(0);
    // vytyčení po natočeném obdélníku plotu, bláto v obdélníku kolem něj
    const line = penStakingLine(layout);
    expect(line).toHaveLength(5);
    for (const [x, z] of line) {
      const [u, v] = local(pen, x, z);
      expect(Math.abs(Math.abs(u!) - Math.abs(v!))).toBeLessThan(1e-9);
    }
    const bounds = penMudBounds(layout);
    for (const [x, z] of line) {
      expect(x).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
      expect(x).toBeLessThanOrEqual(bounds.maxX + 1e-9);
      expect(z).toBeGreaterThanOrEqual(bounds.minZ - 1e-9);
      expect(z).toBeLessThanOrEqual(bounds.maxZ + 1e-9);
    }
  });

  it('ohrada bez natočení se rozmístí jako dřív', () => {
    const square = { x: 40, z: -12, size: 15 };
    const {
      square: _zero,
      squares: _zeros,
      ...zero
    } = penLayout({ ...square, rotation: 0 }, penFacing(square, toward));
    const {
      square: _none,
      squares: _nones,
      ...none
    } = penLayout(square, penFacing(square, toward));
    void _zero;
    void _none;
    void _zeros;
    void _nones;
    expect(zero).toEqual(none);
    expect(penLayout(square, penFacing(square, toward)).rotation).toBeUndefined();
  });
});

describe('natočený hřbitov a ohrada jiné vsi', () => {
  it('cizí půda pro kontrolu umístění nese jejich mřížku', () => {
    const cemetery = square(G30, { x: 0, y: 0 });
    const village: SceneVillage = {
      dwellings: [],
      fields: [],
      neighbours: [
        {
          dwellings: [],
          fields: [],
          cemeteries: [
            { id: 3, grid: G30, squares: [cemetery], built: true, progress: 1, graves: 0 },
          ],
          pens: [
            {
              id: 4,
              cell: { x: 0, y: 0 },
              grid: G45,
              x: 7.5,
              z: 7.5,
              size: 15,
              rotation: G45.rotation,
              built: true,
              progress: 1,
              oxen: 0,
              trainees: 0,
              cows: 0,
            },
          ],
        },
      ],
    };
    const foreign = foreignFromScene(village)!;
    expect(foreign.cells).toEqual([]);
    expect(foreign.squares).toEqual([
      { cell: { x: 0, y: 0 }, grid: G30 },
      { cell: { x: 0, y: 0 }, grid: G45 },
    ]);
  });
});
