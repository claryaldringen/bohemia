import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import type { ForestField } from './forest-field';
import { IMPOSTOR_ATLAS } from './impostor-atlas';
import type { StreamCenterline } from './stream-geometry';
import { heightAt, tileAt } from './tile-at';
import { edgeDensity } from './tree-placement';
import { pickModel, speciesWeights } from './tree-species';

export interface ImpostorPlacement {
  /** Index buňky v `IMPOSTOR_ATLAS.cells`. */
  cell: number;
  worldX: number;
  worldZ: number;
  /** Násobek velikosti stromu v atlasu. */
  scale: number;
  /** Zrcadlově převrácený obrázek – víc podob z jedné buňky. */
  mirror: boolean;
}

/** Rozteč kandidátních míst (m) – každé se posune náhodně v rámci své buňky. */
const SPACING_M = 6.5;
/**
 * Impostory začínají za první řadou 3D stromů okraje (ty je ze všech směrů zakryjí) a plné
 * hustoty dosáhnou za třetí řadou.
 */
const RAMP_START_M = 10;
const RAMP_FULL_M = 18;
const FULL_CHANCE = 0.95;
const VILLAGE_CLEARING_TILES = 2;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). Jiné konstanty než u 3D stromů. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 2246822519) ^ Math.imul(y, 3266489917) ^ Math.imul(k, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Vnitřek lesa z impostorů (obrázků stromů): náhodně posunutá mřížka, hustota náběhem od
 * okraje, skladba druhů stejnou funkcí jako u 3D stromů okraje, náhodná podoba z atlasu.
 */
export function impostorPlacements(
  l: Landscape,
  field: ForestField,
  stream?: StreamCenterline,
): ImpostorPlacement[] {
  let maxHeight = 0;
  for (const h of l.heights) maxHeight = Math.max(maxHeight, h);
  const cellsByModel = new Map<string, number[]>();
  IMPOSTOR_ATLAS.cells.forEach((cell, i) => {
    cellsByModel.set(cell.model, [...(cellsByModel.get(cell.model) ?? []), i]);
  });

  const half = (l.size * l.cellSizeM) / 2;
  const count = Math.floor((l.size * l.cellSizeM) / SPACING_M);
  const placements: ImpostorPlacement[] = [];
  for (let gz = 0; gz < count; gz++) {
    for (let gx = 0; gx < count; gx++) {
      const worldX = -half + (gx + hash(gx, gz, 1)) * SPACING_M;
      const worldZ = -half + (gz + hash(gx, gz, 2)) * SPACING_M;
      const d = field.distanceAt(worldX, worldZ);
      if (d < RAMP_START_M) continue;
      // V náběhu hustota sleduje shluky okraje (edgeDensity) – nepravidelný okraj s mezerami.
      const ramp = Math.min(1, (d - RAMP_START_M) / (RAMP_FULL_M - RAMP_START_M));
      const clump = ramp + (1 - ramp) * Math.min(1, edgeDensity(worldX, worldZ));
      if (hash(gx, gz, 3) >= FULL_CHANCE * (0.15 + 0.85 * ramp) * clump) continue;

      const tile = tileAt(l, worldX, worldZ);
      if (!tile) continue;
      const surface = l.surface[tile.y * l.size + tile.x];
      if (surface === SURFACE_CODES.water) continue;
      if (stream && stream.nearest(worldX, worldZ).bankDistance <= 2) continue;
      const site = l.villageSite;
      const nearVillage =
        Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES;
      if (surface !== SURFACE_CODES.forest && nearVillage) continue;

      const model = pickModel(
        hash(gx, gz, 4),
        speciesWeights(d, heightAt(l, worldX, worldZ) / (maxHeight || 1), worldX, worldZ),
        hash(gx, gz, 5),
      );
      const options = cellsByModel.get(model)!;
      placements.push({
        cell: options[Math.floor(hash(gx, gz, 6) * options.length)]!,
        worldX,
        worldZ,
        scale: 0.8 + hash(gx, gz, 7) * 0.45,
        mirror: hash(gx, gz, 8) < 0.5,
      });
    }
  }
  return placements;
}
