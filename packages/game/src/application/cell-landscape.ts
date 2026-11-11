import {
  BandFailureError,
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  MAX_ATTEMPTS,
  obstaclesOf,
  SKELETON_LAYER_VERSION,
  type Landscape,
  type LayerVersions,
  type ObstacleLayer,
  type PremiumType,
  type SkeletonSlice,
} from '../domain/landscape';
import { marchGrid, type MarchGrid } from '../domain/war';
import { cellLandscapeSeed, isDry, skeletonSlice, type SkeletonCache } from '../domain/world';
import type { GridCell } from '../domain/village/people/world-grid';

// Krajina políčka mřížky světa pro tažení (war.md – Pohyb – mapu po mapě): vojsko jde každou
// mapou, i prázdnou. Prázdné políčko má krajinu z `cellLandscapeSeed` a výřezu kostry světa
// (world-skeleton.md – Uložení: prázdné políčko bere výřez z kostry); políčko se vsí má krajinu
// z uloženého seedu, verzí, typu a výřezu sídla.

/** Mapa pro pochod: přijatý seed, krajina a její vrstva překážek. */
export interface CellLandscape {
  seed: number;
  landscape: Landscape;
  obstacles: ObstacleLayer;
}

/**
 * Verze vrstev mapy s výřezem `slice`: s řekou nebo stezkou `versions` s vrstvou `skeleton`, suchá
 * mapa bez ní (verze bez `skeleton` se vrátí beze změny – suchá mapa bit po bitu jako dřív).
 */
export function cellSkeletonVersions(
  slice: SkeletonSlice | null,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
): LayerVersions {
  if (!isDry(slice)) return { ...versions, skeleton: SKELETON_LAYER_VERSION };
  if (versions.skeleton === undefined) return versions;
  const dry = { ...versions };
  delete dry.skeleton;
  return dry;
}

/**
 * Kolik oken po `MAX_ATTEMPTS` pokusech zkusí prázdné políčko, než vezme první pokus bez pásma –
 * mapa z kostry projde pásmem do `MAX_ATTEMPTS` aspoň na 95 % seedů a pochod potřebuje krajinu
 * vždy (návrh Clauda).
 */
const EMPTY_CELL_SEED_WINDOWS = 4;

/**
 * Krajina prázdného políčka `cell` světa se seedem `worldSeed`: výřez z kostry světa, první pokus
 * v pásmu (suchá mapa jako dřív – tutéž krajinu by dostala ves syna, kdyby tam vznikla). Mapa
 * z kostry, která pásmem neprojde ani v dalších oknech seedů, má první pokus bez pásma.
 */
export function emptyCellLandscape(
  worldSeed: number,
  cell: GridCell,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
  cache?: SkeletonCache,
): CellLandscape {
  const slice = skeletonSlice(worldSeed, cell, cache);
  const cellVersions = cellSkeletonVersions(slice, versions);
  const seed = cellLandscapeSeed(worldSeed, cell);
  const accepted =
    slice === null
      ? generateAcceptedLandscape(seed, cellVersions)
      : acceptedSkeletonLandscape(seed, cellVersions, slice);
  return { ...accepted, obstacles: obstaclesOf(accepted.landscape) };
}

/** Mapa z kostry prázdného políčka – první okno seedů, kde projde pásmem, jinak první pokus. */
function acceptedSkeletonLandscape(
  seed: number,
  versions: LayerVersions,
  slice: SkeletonSlice,
): { seed: number; landscape: Landscape } {
  for (let window = 0; window < EMPTY_CELL_SEED_WINDOWS; window++) {
    try {
      return generateAcceptedLandscape(
        (seed + window * MAX_ATTEMPTS) >>> 0,
        versions,
        undefined,
        slice,
      );
    } catch (error) {
      if (!(error instanceof BandFailureError)) throw error;
    }
  }
  return { seed, landscape: generateLandscapeAttempt(seed, versions, undefined, slice) };
}

/**
 * Krajina políčka se vsí – z uloženého seedu sídla, verzí jeho vrstev, prémiového typu a výřezu
 * kostry (bez výřezu suchá mapa, i když políčkem kostra vede – vývojová sídla bit po bitu).
 */
export function settledCellLandscape(
  landscapeSeed: number,
  versions: LayerVersions,
  premium?: PremiumType,
  skeleton?: SkeletonSlice | null,
): CellLandscape {
  const landscape = generateLandscapeAttempt(landscapeSeed, versions, premium, skeleton);
  return { seed: landscapeSeed, landscape, obstacles: obstaclesOf(landscape) };
}

/** Mřížka pochodu prázdného políčka (bez vsi). */
export function emptyCellMarchGrid(
  worldSeed: number,
  cell: GridCell,
  cache?: SkeletonCache,
): MarchGrid {
  const { landscape, obstacles } = emptyCellLandscape(
    worldSeed,
    cell,
    CURRENT_LAYER_VERSIONS,
    cache,
  );
  return marchGrid(landscape, obstacles, null);
}
