import { describe, expect, it } from 'vitest';
import type { TileCell } from '@bohemia/game';
import {
  CellSelection,
  cellsBoundary,
  cellsContain,
  cellsCoverage,
  mergeDecalGrids,
  rectangleCells,
  rowDirection,
  type CellSquare,
} from '../field-cells';
import { decalGrid } from '../village-layout';

/** Čtverec pole 10 × 10 m: políčko (x, y) má střed (5 + 10x, 5 + 10y). */
const square = (x: number, y: number): CellSquare => ({
  cell: { x, y },
  x: 5 + 10 * x,
  z: 5 + 10 * y,
  size: 10,
});

describe('rectangleCells', () => {
  it('obdélník mezi rohovými čtverci v libovolném pořadí, po řádcích', () => {
    expect(rectangleCells({ x: 3, y: 2 }, { x: 2, y: 3 })).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(rectangleCells({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('CellSelection', () => {
  it('tah přidá obdélník, tah s ubíráním ho zmenší, náhled výběr nemění', () => {
    const selection = new CellSelection();
    selection.apply(rectangleCells({ x: 0, y: 0 }, { x: 2, y: 1 }), 'add');
    expect(selection.count).toBe(6);
    const preview = selection.preview([{ x: 1, y: 0 }], 'remove');
    expect(preview).toHaveLength(5);
    expect(selection.count).toBe(6);
    selection.apply(rectangleCells({ x: 1, y: 0 }, { x: 1, y: 1 }), 'remove');
    expect(selection.cells()).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('kliknutí přepíná čtverec, zpět vrací tahy po jednom', () => {
    const selection = new CellSelection();
    const cell: TileCell = { x: 4, y: 4 };
    selection.toggle(cell);
    expect(selection.has(cell)).toBe(true);
    selection.toggle(cell);
    expect(selection.has(cell)).toBe(false);
    expect(selection.undo()).toBe(true);
    expect(selection.has(cell)).toBe(true);
    expect(selection.undo()).toBe(true);
    expect(selection.count).toBe(0);
    expect(selection.undo()).toBe(false);
  });

  it('tah, který nic nezmění, nejde do historie', () => {
    const selection = new CellSelection();
    selection.apply([{ x: 0, y: 0 }], 'add');
    expect(selection.apply([{ x: 0, y: 0 }], 'add')).toBe(false);
    expect(selection.apply([{ x: 5, y: 5 }], 'remove')).toBe(false);
    selection.undo();
    expect(selection.count).toBe(0);
  });
});

describe('cellsBoundary – mez kolem čtverců', () => {
  it('jeden čtverec má 4 strany', () => {
    const segments = cellsBoundary([square(0, 0)]);
    expect(segments).toHaveLength(4);
    expect(segments).toContainEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(segments).toContainEqual([
      [10, 0],
      [10, 10],
    ]);
  });

  it('navazující strany se spojí, společná strana se vynechá', () => {
    const segments = cellsBoundary([square(0, 0), square(1, 0)]);
    expect(segments).toHaveLength(4);
    expect(segments).toContainEqual([
      [0, 0],
      [20, 0],
    ]);
    expect(segments).not.toContainEqual([
      [10, 0],
      [10, 10],
    ]);
  });

  it('tvar L má 6 stran o celkové délce obvodu', () => {
    const segments = cellsBoundary([square(0, 0), square(1, 0), square(0, 1)]);
    expect(segments).toHaveLength(6);
    const length = segments.reduce(
      (sum, [a, b]) => sum + Math.hypot(b![0] - a![0], b![1] - a![1]),
      0,
    );
    expect(length).toBeCloseTo(80);
  });

  it('bez čtverců není mez', () => {
    expect(cellsBoundary([])).toEqual([]);
  });
});

describe('cellsCoverage – měkký okraj pole', () => {
  const coverage = cellsCoverage([square(0, 0), square(1, 0)], 2);

  it('uvnitř plné, na hranici a venku nula', () => {
    expect(coverage(5, 5)).toBe(1);
    expect(coverage(0, 5)).toBe(0);
    expect(coverage(5, 0)).toBe(0);
    expect(coverage(-3, 5)).toBe(0);
    expect(coverage(1, 5)).toBeGreaterThan(0);
    expect(coverage(1, 5)).toBeLessThan(1);
  });

  it('na společné straně dvou čtverců pole není šev', () => {
    expect(coverage(10, 5)).toBe(1);
    expect(coverage(9.5, 5)).toBe(1);
  });

  it('vnitřní roh tvaru L změkne podle vzdálenosti k rohu', () => {
    const l = cellsCoverage([square(0, 0), square(1, 0), square(0, 1)], 2);
    // bod 1 m od vnitřního rohu (10, 10) po úhlopříčce uvnitř pole
    expect(l(10 - Math.SQRT1_2, 10 - Math.SQRT1_2)).toBeGreaterThan(0);
    expect(l(10 - Math.SQRT1_2, 10 - Math.SQRT1_2)).toBeLessThan(1);
    expect(l(15, 15)).toBe(0);
  });
});

describe('cellsContain a rowDirection', () => {
  it('bod ve čtverci nebo do okraje od něj', () => {
    const contains = cellsContain([square(0, 0), square(1, 0)], 1);
    expect(contains(15, 5)).toBe(true);
    expect(contains(20.5, 5)).toBe(true);
    expect(contains(22, 5)).toBe(false);
    expect(contains(5, 12)).toBe(false);
  });

  it('řádky jdou podél delší strany pole', () => {
    expect(rowDirection([square(0, 0), square(1, 0), square(2, 0)])).toEqual([1, 0]);
    expect(rowDirection([square(0, 0), square(0, 1)])).toEqual([0, 1]);
  });
});

describe('mergeDecalGrids', () => {
  it('spojí sítě s posunutými indexy, barvou a krytím každé sítě', () => {
    const bounds = (x: number) => ({ minX: x, maxX: x + 1, minZ: 0, maxZ: 1 });
    const a = decalGrid(bounds(0), 1, () => 1);
    const b = decalGrid(bounds(5), 1, () => 1);
    const { grid, colors } = mergeDecalGrids([
      { grid: a, color: [1, 0, 0], alpha: 1 },
      { grid: b, color: [0, 1, 0], alpha: 0.5 },
    ]);
    expect(grid.alphas).toHaveLength(8);
    expect([...grid.indices.slice(6)]).toEqual([...b.indices].map((i) => i + 4));
    expect(grid.alphas[4]).toBe(0.5);
    expect([...colors.slice(12, 15)]).toEqual([0, 1, 0]);
  });
});
