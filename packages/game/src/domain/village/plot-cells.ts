import type { Point } from './polygon';
import {
  plotSquareTile,
  rotatedSquareCorners,
  squareCorners,
  squareTile,
  type GridGeometry,
} from './square-grid';
import type { DwellingPlot, PlotSquare, TileCell } from './types';

/** Políčka pozemku – políčko domu a u dvorce vojvody i dvůr (trade.md – Dvorec vojvody). */
export function plotCells(plot: Pick<DwellingPlot, 'cell' | 'yard'>): TileCell[] {
  return plot.yard ? [plot.cell, plot.yard] : [plot.cell];
}

/** Tvar, který stavba zabírá: mnohoúhelník a políčko krajiny, které přesně zabírá (nebo null). */
export interface Shape {
  readonly corners: readonly Point[];
  readonly tile: number | null;
  /** Natočený čtverec pozemku (střed a natočení) – podle něj se vzorkuje krajina. */
  readonly square?: PlotSquare;
}

/**
 * Čtverce pozemku ve světě: natočený pozemek (`plot.square` – fields.md, Natočené stavby) jeden
 * natočený čtverec (o násobek 90° natočený ve středu políčka je to přesně políčko), jinak políčko
 * domu a u dvorce i dvůr (trade.md).
 */
export function plotShapes(geo: GridGeometry, plot: DwellingPlot): Shape[] {
  if (plot.square && !plot.yard) {
    const tile = plotSquareTile(geo, plot.square);
    if (tile !== null) {
      const cell = { x: tile % geo.size, y: Math.floor(tile / geo.size) };
      return [{ corners: squareCorners(geo, undefined, cell), tile }];
    }
    const { x, z, rotation } = plot.square;
    return [
      {
        corners: rotatedSquareCorners(x, z, geo.cellSizeM, rotation),
        tile: null,
        square: plot.square,
      },
    ];
  }
  return plotCells(plot).map((cell) => ({
    corners: squareCorners(geo, undefined, cell),
    tile: squareTile(geo, undefined, cell),
  }));
}
