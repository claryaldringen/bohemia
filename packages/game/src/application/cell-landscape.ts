import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  obstaclesOf,
  type Landscape,
  type LayerVersions,
  type ObstacleLayer,
  type PremiumType,
} from '../domain/landscape';
import { marchGrid, type MarchGrid } from '../domain/war';
import { cellLandscapeSeed } from '../domain/world';
import type { GridCell } from '../domain/village/world-grid';

// Krajina políčka mřížky světa pro tažení (war.md – Pohyb – mapu po mapě): vojsko jde každou
// mapou, i prázdnou. Prázdné políčko má krajinu z `cellLandscapeSeed` – tutéž, jakou by dostala
// ves, kdyby tam vznikla (`enterGame`, `newVillage`); políčko se vsí má krajinu z uloženého seedu
// sídla.

/** Krajina mapy pro pochod: přijatý seed, krajina a její vrstva překážek. */
export interface CellLandscape {
  seed: number;
  landscape: Landscape;
  obstacles: ObstacleLayer;
}

/** Krajina prázdného políčka `cell` světa se seedem `worldSeed` (první pokus v pásmu). */
export function emptyCellLandscape(
  worldSeed: number,
  cell: GridCell,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
): CellLandscape {
  const accepted = generateAcceptedLandscape(cellLandscapeSeed(worldSeed, cell), versions);
  return { ...accepted, obstacles: obstaclesOf(accepted.landscape) };
}

/** Krajina políčka se vsí – z uloženého seedu sídla, verzí jeho vrstev a prémiového typu. */
export function settledCellLandscape(
  landscapeSeed: number,
  versions: LayerVersions,
  premium?: PremiumType,
): CellLandscape {
  const landscape = generateLandscapeAttempt(landscapeSeed, versions, premium);
  return { seed: landscapeSeed, landscape, obstacles: obstaclesOf(landscape) };
}

/** Mřížka pochodu prázdného políčka (bez vsi). */
export function emptyCellMarchGrid(worldSeed: number, cell: GridCell): MarchGrid {
  const { landscape, obstacles } = emptyCellLandscape(worldSeed, cell);
  return marchGrid(landscape, obstacles, null);
}
