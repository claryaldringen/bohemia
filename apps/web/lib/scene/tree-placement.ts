import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { ForestField } from './forest-field';
import { CHANNEL_HALF_WIDTH_M } from './render-surface';
import type { StreamCenterline } from './stream-geometry';
import { heightAt, tileAt } from './tile-at';

/** Modely vegetace ve scéně – stromy i keře. */
export type TreeModel =
  | 'spruce-1'
  | 'spruce-2'
  | 'oak-1'
  | 'oak-2'
  | 'beech-1'
  | 'beech-2'
  | 'birch-1'
  | 'birch-2'
  | 'bush-1'
  | 'bush-2';
export const TREE_MODELS: readonly TreeModel[] = [
  'spruce-1',
  'spruce-2',
  'oak-1',
  'oak-2',
  'beech-1',
  'beech-2',
  'birch-1',
  'birch-2',
  'bush-1',
  'bush-2',
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
/** Pásma podle vzdálenosti od hranice lesa (m, kladná v lese) a pravděpodobnost stromu v nich. */
const BANDS: readonly { from: number; to: number; chance: number }[] = [
  { from: 7, to: 16, chance: 0.4 }, // druhá řada – vyčnívá z náběhu korun
  { from: 0, to: 7, chance: 0.8 }, // okraj lesa
  { from: -6, to: 0, chance: 0.22 }, // řidší lem před lesem
  { from: -30, to: -6, chance: 0.012 }, // ojedinělé stromy a keře v louce
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
      const density = d < -6 ? 1 : edgeDensity(worldX, worldZ);
      if (hash(gx, gz, 3) >= band.chance * density) continue;

      const tile = tileAt(l, worldX, worldZ);
      if (!tile) continue;
      const surface = l.surface[tile.y * l.size + tile.x];
      if (surface === SURFACE_CODES.water) continue;
      if (stream && stream.nearest(worldX, worldZ).distance <= CHANNEL_HALF_WIDTH_M + 2) continue;
      const site = l.villageSite;
      const nearVillage =
        Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES;
      if (surface !== SURFACE_CODES.forest && nearVillage) continue;

      const outside = d < 0;
      const bush = outside && hash(gx, gz, 4) < 0.45;
      const coniferChance =
        (0.2 + 0.6 * (heightAt(l, worldX, worldZ) / (maxHeight || 1))) * (d < -6 ? 0.5 : 1);
      placements.push({
        model: bush
          ? `bush-${hash(gx, gz, 5) < 0.5 ? 1 : 2}`
          : pickModel(hash(gx, gz, 6), coniferChance, hash(gx, gz, 5)),
        worldX,
        worldZ,
        rotationY: hash(gx, gz, 7) * Math.PI * 2,
        scale: 0.8 + hash(gx, gz, 8) * 0.4 + (d < -6 && !bush ? 0.15 : 0),
      });
    }
  }
  return placements;
}

/** Smrk s pravděpodobností coniferChance, jinak listnáč: dub 40 %, buk 35 %, bříza 25 %. */
function pickModel(kind: number, coniferChance: number, variant: number): TreeModel {
  const v = variant < 0.5 ? 1 : 2;
  if (kind < coniferChance) return `spruce-${v}`;
  const broadleaf = (kind - coniferChance) / (1 - coniferChance);
  if (broadleaf < 0.4) return `oak-${v}`;
  if (broadleaf < 0.75) return `beech-${v}`;
  return `birch-${v}`;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
