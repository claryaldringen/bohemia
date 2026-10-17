import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { ForestField } from './forest-field';
import { streamStations, type StreamCenterline } from './stream-geometry';
import { tileAt } from './tile-at';
import type { TreeModel, TreePlacement } from './tree-placement';

/** Rozteč kandidátních míst pro osamělé stromy a skupinky v loukách (m). */
const GROUP_SPACING_M = 36;
/**
 * Pravděpodobnost skupinky na kandidátním místě – v otevřené louce a v „parkové“ části
 * (pastvina s rozptýlenými stromy). Které části jsou které, určuje šum s měřítkem PARK_SCALE_M.
 */
const GROUP_CHANCE = { open: 0.01, park: 0.24 };
const PARK_SCALE_M = 320;
/** Vzdálenost členů skupinky od jejího středu (m). */
const GROUP_RADIUS_M = { from: 7.5, to: 13.5 };
/** Nejmenší rozestup kmenů (m) – koruny se dotýkají, ale nesplynou do jedné hmoty. */
const MIN_SPACING_M = 7.5;
/** Osamělé stromy až dál od hranice lesa (m, záporná v louce) – u lesa je lem a keře. */
const FOREST_CLEARANCE_M = -14;
/** Blíž k vodě (m) než tohle už jde o břeh: tam rostou i topoly. */
const STREAMSIDE_M = 25;
/** Břehový porost: krok podél osy potoka (m) a vzdálenost kmene od okraje vody (m). */
const BANK_STEP_M = 9;
const BANK_TREE_M = { from: 4, to: 11 };
/** Bez stromů do této vzdálenosti (políčka) od místa pro vesnici. */
const VILLAGE_CLEARING_TILES = 2;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). Stejná krajina = stejné stromy. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Stromy mimo les jako ve středoevropské krajině: břehový porost topolů a jilmů podél potoka
 * (s mezerami) a v loukách osamělé mohutné duby a jilmy, jednotlivě i ve skupinkách. Někde
 * je louka parková, jinde rozlehlá a volná – deterministicky.
 */
export function meadowTreePlacements(
  l: Landscape,
  field: ForestField,
  stream: StreamCenterline,
): TreePlacement[] {
  const placements: TreePlacement[] = [];
  const site = l.villageSite;
  const fits = (x: number, z: number, minBankM: number): boolean => {
    const tile = tileAt(l, x, z);
    if (!tile || l.surface[tile.y * l.size + tile.x] !== SURFACE_CODES.meadow) return false;
    if (Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES)
      return false;
    if (stream.nearest(x, z).bankDistance < minBankM) return false;
    return placements.every((p) => Math.hypot(p.worldX - x, p.worldZ - z) >= MIN_SPACING_M);
  };

  // Břehový porost: úseky stromů střídané s volnými úseky (šum podél toku), na každém břehu jinak.
  const gallery = createNoise2D(seededRandom(0xa1de));
  for (const station of streamStations(stream, BANK_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      if (gallery(station.s / 160, side * 9) < 0.05 || hash(k, 1, 81) >= 0.6) continue;
      const here = stream.nearest(
        station.x + station.nx * side * 0.5,
        station.z + station.nz * side * 0.5,
      );
      const offset =
        here.halfWidth + BANK_TREE_M.from + hash(k, 2, 81) * (BANK_TREE_M.to - BANK_TREE_M.from);
      const along = (hash(k, 3, 81) - 0.5) * 6;
      const x = station.x + station.nx * side * offset - station.nz * along;
      const z = station.z + station.nz * side * offset + station.nx * along;
      const d = stream.nearest(x, z).bankDistance;
      if (d > BANK_TREE_M.to + 3) continue;
      if (field.distanceAt(x, z) >= -4 || !fits(x, z, BANK_TREE_M.from - 0.5)) continue;
      placements.push({
        model: bankModel(hash(k, 4, 81), hash(k, 5, 81)),
        worldX: x,
        worldZ: z,
        rotationY: hash(k, 6, 81) * Math.PI * 2,
        scale: 0.85 + hash(k, 7, 81) * 0.3,
      });
    }
  }

  // Louky: osamělé stromy a skupinky, hustěji v „parkových“ částech.
  const park = createNoise2D(seededRandom(0x0a4c));
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / GROUP_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = -half + (gx + hash(gx, gz, 91)) * GROUP_SPACING_M;
      const cz = -half + (gz + hash(gx, gz, 92)) * GROUP_SPACING_M;
      const parkness = smoothstep(-0.1, 0.6, park(cx / PARK_SCALE_M, cz / PARK_SCALE_M));
      const chance = GROUP_CHANCE.open + (GROUP_CHANCE.park - GROUP_CHANCE.open) * parkness;
      if (hash(gx, gz, 93) >= chance) continue;
      const roll = hash(gx, gz, 94);
      const count =
        roll < 0.6
          ? 1
          : roll < 0.88
            ? 2 + Math.floor(hash(gx, gz, 95) * 2)
            : 4 + (roll > 0.95 ? 1 : 0);
      const k = gz * cells + gx;
      for (let i = 0; i < count; i++) {
        const angle = hash(k, i, 96) * Math.PI * 2;
        const radius =
          i === 0
            ? 0
            : GROUP_RADIUS_M.from + hash(k, i, 97) * (GROUP_RADIUS_M.to - GROUP_RADIUS_M.from);
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        if (field.distanceAt(x, z) >= FOREST_CLEARANCE_M || !fits(x, z, BANK_TREE_M.to)) continue;
        const streamside = stream.nearest(x, z).bankDistance < STREAMSIDE_M;
        placements.push({
          model: meadowModel(hash(k, i, 98), hash(k, i, 99), streamside),
          worldX: x,
          worldZ: z,
          rotationY: hash(k, i, 100) * Math.PI * 2,
          scale: 0.85 + hash(k, i, 101) * 0.35,
        });
      }
    }
  }
  return placements;
}

/** Na břehu topoly a jilmy, občas dub. */
function bankModel(kind: number, variant: number): TreeModel {
  if (kind < 0.45) return variantOf('poplar', 3, variant);
  if (kind < 0.85) return variantOf('elm', 4, variant);
  return variantOf('oak-large', 3, variant);
}

/** V loukách hlavně mohutné duby, k tomu jilmy; blízko potoka i topoly. */
function meadowModel(kind: number, variant: number, streamside: boolean): TreeModel {
  if (streamside && kind < 0.2) return variantOf('poplar', 3, variant);
  if (kind < 0.72) return variantOf('oak-large', 3, variant);
  return variantOf('elm', 4, variant);
}

function variantOf<T extends string>(species: T, variants: number, pick: number): TreeModel {
  return `${species}-${1 + Math.min(variants - 1, Math.floor(pick * variants))}` as TreeModel;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
