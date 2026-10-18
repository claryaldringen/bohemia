import type { DwellingPlot, TileCell } from './types';

/** Políčka pozemku – políčko domu a u dvorce vojvody i dvůr (trade.md – Dvorec vojvody). */
export function plotCells(plot: Pick<DwellingPlot, 'cell' | 'yard'>): TileCell[] {
  return plot.yard ? [plot.cell, plot.yard] : [plot.cell];
}
