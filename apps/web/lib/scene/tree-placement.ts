import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { ForestField } from './forest-field';
import type { StreamCenterline } from './stream-geometry';
import { heightAt, tileAt } from './tile-at';
import { pickModel, speciesWeights } from './tree-species';

/**
 * Modely stromů: lesní druhy (3D na okraji lesa, v atlasu impostorů uvnitř) a stromy luk
 * a břehů (`meadow-trees.ts`, jen 3D). Keřový lem kreslí dekorace.
 */
export type TreeModel =
  | 'spruce-1'
  | 'spruce-2'
  | 'oak-1'
  | 'oak-2'
  | 'beech-1'
  | 'beech-2'
  | 'birch-1'
  | 'birch-2'
  | 'oak-large-1'
  | 'oak-large-2'
  | 'oak-large-3'
  | 'elm-1'
  | 'elm-2'
  | 'elm-3'
  | 'elm-4'
  | 'poplar-1'
  | 'poplar-2'
  | 'poplar-3';

export const TREE_MODELS: readonly TreeModel[] = [
  'spruce-1',
  'spruce-2',
  'oak-1',
  'oak-2',
  'beech-1',
  'beech-2',
  'birch-1',
  'birch-2',
  'oak-large-1',
  'oak-large-2',
  'oak-large-3',
  'elm-1',
  'elm-2',
  'elm-3',
  'elm-4',
  'poplar-1',
  'poplar-2',
  'poplar-3',
];

export interface TreePlacement {
  model: TreeModel;
  worldX: number;
  worldZ: number;
  rotationY: number;
  /** Násobek velikosti modelu. */
  scale: number;
}

/** Rozteč kandidátních míst (m) – každé se posune náhodně v rámci své buňky. */
const CANDIDATE_SPACING_M = 5;
/**
 * Pásma podle vzdálenosti od hranice lesa (m, kladná v lese) a pravděpodobnost stromu v nich.
 * Okraj tvoří 2–3 husté řady 3D stromů – zakryjí začátek impostorů vnitřku lesa (od 10 m).
 */
const BANDS: readonly { from: number; to: number; chance: number }[] = [
  { from: 12, to: 18, chance: 0.75 }, // třetí řada – za ní už jen impostory
  { from: 6, to: 12, chance: 0.95 }, // druhá řada
  { from: 0, to: 6, chance: 0.95 }, // krajní řada
  { from: -6, to: 0, chance: 0.22 }, // řidší lem před lesem
  { from: -30, to: -6, chance: 0.012 }, // ojedinělé stromy v louce
];
/** Bez stromů mimo les do této vzdálenosti (políčka) od místa pro vesnici. */
const VILLAGE_CLEARING_TILES = 2;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). Stejná krajina = stejný les. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Šum hustoty podél okraje – shluky a mezery jako v 0 A.D.; pevný, krajina se liší hranicí.
const clumps = createNoise2D(seededRandom(0xc1a5));

/** Násobek hustoty stromů okraje (0,15–1,3) – shluky a mezery o velikosti desítek metrů. */
export function edgeDensity(worldX: number, worldZ: number): number {
  return Math.min(1.3, Math.max(0.15, 0.55 + 0.9 * clumps(worldX / 45, worldZ / 45)));
}

/**
 * Stromy podél vyhlazené hranice lesa: hustý okraj, řidší druhá řada (dál les kreslí plocha
 * korun), před lesem řidší lem a v louce ojedinělé stromy a keře. Výš převažují smrky.
 */
export function treePlacements(
  l: Landscape,
  field: ForestField,
  stream?: StreamCenterline,
): TreePlacement[] {
  let maxHeight = 0;
  for (const h of l.heights) maxHeight = Math.max(maxHeight, h);
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / CANDIDATE_SPACING_M);
  const placements: TreePlacement[] = [];

  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const worldX = -half + (gx + hash(gx, gz, 1)) * CANDIDATE_SPACING_M;
      const worldZ = -half + (gz + hash(gx, gz, 2)) * CANDIDATE_SPACING_M;
      const d = field.distanceAt(worldX, worldZ);
      const band = BANDS.find((b) => d >= b.from && d < b.to);
      if (!band) continue;
      // Řady okraje jsou souvislé, shluky jen mírně mění hustotu; lem před lesem je nepravidelný.
      const density =
        d < -6 ? 1 : d >= 0 ? 0.8 + 0.2 * edgeDensity(worldX, worldZ) : edgeDensity(worldX, worldZ);
      if (hash(gx, gz, 3) >= band.chance * density) continue;

      const tile = tileAt(l, worldX, worldZ);
      if (!tile) continue;
      const surface = l.surface[tile.y * l.size + tile.x];
      if (surface === SURFACE_CODES.water) continue;
      if (stream && stream.nearest(worldX, worldZ).bankDistance <= 2) continue;
      const site = l.villageSite;
      const nearVillage =
        Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES;
      if (surface !== SURFACE_CODES.forest && nearVillage) continue;

      const weights = speciesWeights(
        d,
        heightAt(l, worldX, worldZ) / (maxHeight || 1),
        worldX,
        worldZ,
      );
      placements.push({
        model: pickModel(hash(gx, gz, 6), weights, hash(gx, gz, 5)),
        worldX,
        worldZ,
        rotationY: hash(gx, gz, 7) * Math.PI * 2,
        scale: 0.8 + hash(gx, gz, 8) * 0.4 + (d < -6 ? 0.15 : 0),
      });
    }
  }
  return placements;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
