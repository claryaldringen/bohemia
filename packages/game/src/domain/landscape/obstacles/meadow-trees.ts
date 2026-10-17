import { createNoise2D } from 'simplex-noise';
import { detCos, detSin, length2, noiseRandom, smoothstep } from '../det-math';
import { streamStations } from '../stream-geometry';
import { SURFACE_CODES } from '../types';
import { hashFor, nearVillageSite, seedFor, surfaceCodeAt, type ScatterContext } from './context';
import { obstacleId, type ObstaclePlacement, type TreeLook } from './types';

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
export const BANK_TREE_M = { from: 4, to: 11 };

/**
 * Stromy mimo les jako ve středoevropské krajině: břehový porost topolů a jilmů podél potoka
 * (s mezerami) a v loukách osamělé mohutné duby a jilmy, jednotlivě i ve skupinkách. Někde
 * je louka parková, jinde rozlehlá a volná – deterministicky. Nejdřív břehový porost, pak
 * louky (pořadí, ve kterém si stromy hlídají rozestup).
 */
export function meadowTreePlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { field, stream } = ctx;
  const placements: ObstaclePlacement[] = [];
  const fits = (x: number, z: number, minBankM: number): boolean => {
    if (surfaceCodeAt(l, x, z) !== SURFACE_CODES.meadow || nearVillageSite(l, x, z)) return false;
    if (stream.nearest(x, z).bankDistance < minBankM) return false;
    return placements.every((p) => length2(p.x - x, p.z - z) >= MIN_SPACING_M);
  };

  // Břehový porost: úseky stromů střídané s volnými úseky (šum podél toku), na každém břehu jinak.
  const bankHash = hashFor(ctx, 'bank-trees');
  const gallery = createNoise2D(noiseRandom(seedFor(ctx, 'bank-gallery')));
  for (const station of streamStations(stream, BANK_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      if (gallery(station.s / 160, side * 9) < 0.05 || bankHash(k, 1, 81) >= 0.6) continue;
      const here = stream.nearest(
        station.x + station.nx * side * 0.5,
        station.z + station.nz * side * 0.5,
      );
      const offset =
        here.halfWidth +
        BANK_TREE_M.from +
        bankHash(k, 2, 81) * (BANK_TREE_M.to - BANK_TREE_M.from);
      const along = (bankHash(k, 3, 81) - 0.5) * 6;
      const x = station.x + station.nx * side * offset - station.nz * along;
      const z = station.z + station.nz * side * offset + station.nx * along;
      const d = stream.nearest(x, z).bankDistance;
      if (d > BANK_TREE_M.to + 3) continue;
      if (field.distanceAt(x, z) >= -4 || !fits(x, z, BANK_TREE_M.from - 0.5)) continue;
      placements.push({
        id: obstacleId('bankTree', k),
        kind: 'tree',
        look: bankLook(bankHash(k, 4, 81), bankHash(k, 5, 81)),
        x,
        z,
        rotation: bankHash(k, 6, 81) * Math.PI * 2,
        scale: 0.85 + bankHash(k, 7, 81) * 0.3,
      });
    }
  }

  // Louky: osamělé stromy a skupinky, hustěji v „parkových“ částech.
  const hash = hashFor(ctx, 'meadow-trees');
  const park = createNoise2D(noiseRandom(seedFor(ctx, 'meadow-park')));
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
        const x = cx + detCos(angle) * radius;
        const z = cz + detSin(angle) * radius;
        if (field.distanceAt(x, z) >= FOREST_CLEARANCE_M || !fits(x, z, BANK_TREE_M.to)) continue;
        const streamside = stream.nearest(x, z).bankDistance < STREAMSIDE_M;
        placements.push({
          id: obstacleId('meadowTree', k, i),
          kind: 'tree',
          look: meadowLook(hash(k, i, 98), hash(k, i, 99), streamside),
          x,
          z,
          rotation: hash(k, i, 100) * Math.PI * 2,
          scale: 0.85 + hash(k, i, 101) * 0.35,
        });
      }
    }
  }
  return placements;
}

/** Na břehu topoly a jilmy, občas dub. */
function bankLook(kind: number, variant: number): TreeLook {
  if (kind < 0.45) return variantOf('poplar', 3, variant);
  if (kind < 0.85) return variantOf('elm', 4, variant);
  return variantOf('oak-large', 3, variant);
}

/** V loukách hlavně mohutné duby, k tomu jilmy; blízko potoka i topoly. */
function meadowLook(kind: number, variant: number, streamside: boolean): TreeLook {
  if (streamside && kind < 0.2) return variantOf('poplar', 3, variant);
  if (kind < 0.72) return variantOf('oak-large', 3, variant);
  return variantOf('elm', 4, variant);
}

function variantOf(species: string, variants: number, pick: number): TreeLook {
  return `${species}-${1 + Math.min(variants - 1, Math.floor(pick * variants))}` as TreeLook;
}
