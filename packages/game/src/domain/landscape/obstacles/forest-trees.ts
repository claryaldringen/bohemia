import { createNoise2D } from 'simplex-noise';
import { noiseRandom } from '../det-math';
import { SURFACE_CODES } from '../types';
import { heightAtWorld } from '../world';
import { hashFor, nearVillageSite, seedFor, surfaceCodeAt, type ScatterContext } from './context';
import { forestSpecies, pickForestLook, type ForestSpecies } from './species';
import { obstacleId, type ObstaclePlacement } from './types';

/** Rozteč kandidátních míst 3D stromů okraje (m) – každé se posune náhodně v rámci své buňky. */
const EDGE_SPACING_M = 5;
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

/** Rozteč kandidátních míst impostorů vnitřku lesa (m). */
const IMPOSTOR_SPACING_M = 6.5;
/**
 * Impostory začínají za první řadou 3D stromů okraje (ty je ze všech směrů zakryjí) a plné
 * hustoty dosáhnou za třetí řadou.
 */
const RAMP_START_M = 10;
const RAMP_FULL_M = 18;
const FULL_CHANCE = 0.95;

/** Násobek hustoty stromů okraje (0,15–1,3) – shluky a mezery o velikosti desítek metrů. */
export type EdgeDensity = (worldX: number, worldZ: number) => number;

/** Šum hustoty podél okraje lesa – shluky a mezery jako v 0 A.D. */
export function edgeDensityField(seed: number): EdgeDensity {
  const clumps = createNoise2D(noiseRandom(seed));
  return (worldX, worldZ) =>
    Math.min(1.3, Math.max(0.15, 0.55 + 0.9 * clumps(worldX / 45, worldZ / 45)));
}

/** Společné pro okraj i vnitřek lesa: hustota shluků a skladba druhů ze seedu vrstvy. */
export interface ForestScatter {
  edgeDensity: EdgeDensity;
  species: ForestSpecies;
}

export function forestScatter(ctx: ScatterContext): ForestScatter {
  return {
    edgeDensity: edgeDensityField(seedFor(ctx, 'edge-clumps')),
    species: forestSpecies(seedFor(ctx, 'species-clusters')),
  };
}

/** Na souši, mimo koryto a (mimo les) mimo místo pro vesnici – společná podmínka lesa. */
function forestSpotFree(ctx: ScatterContext, x: number, z: number): boolean {
  const l = ctx.landscape;
  const surface = surfaceCodeAt(l, x, z);
  if (surface === null || surface === SURFACE_CODES.water) return false;
  if (ctx.stream.nearest(x, z).bankDistance <= 2) return false;
  return surface === SURFACE_CODES.forest || !nearVillageSite(l, x, z);
}

/**
 * 3D stromy podél vyhlazené hranice lesa: 2–3 husté řady okraje (zakryjí začátek impostorů),
 * před lesem řidší lem a v louce ojedinělé stromy. Skladba druhů jako ve vnitřku lesa.
 */
export function edgeTreePlacements(
  ctx: ScatterContext,
  forest: ForestScatter = forestScatter(ctx),
): ObstaclePlacement[] {
  const l = ctx.landscape;
  const hash = hashFor(ctx, 'edge-trees');
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / EDGE_SPACING_M);
  const placements: ObstaclePlacement[] = [];

  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const x = -half + (gx + hash(gx, gz, 1)) * EDGE_SPACING_M;
      const z = -half + (gz + hash(gx, gz, 2)) * EDGE_SPACING_M;
      const d = ctx.field.distanceAt(x, z);
      const band = BANDS.find((b) => d >= b.from && d < b.to);
      if (!band) continue;
      // Řady okraje jsou souvislé, shluky jen mírně mění hustotu; lem před lesem je nepravidelný.
      const density =
        d < -6 ? 1 : d >= 0 ? 0.8 + 0.2 * forest.edgeDensity(x, z) : forest.edgeDensity(x, z);
      if (hash(gx, gz, 3) >= band.chance * density) continue;
      if (!forestSpotFree(ctx, x, z)) continue;

      const weights = forest.species(d, heightAtWorld(l, x, z) / (ctx.maxHeight || 1), x, z);
      placements.push({
        id: obstacleId('edgeTree', gz * cells + gx),
        kind: 'tree',
        look: pickForestLook(hash(gx, gz, 6), weights, hash(gx, gz, 5)),
        x,
        z,
        rotation: hash(gx, gz, 7) * Math.PI * 2,
        scale: 0.8 + hash(gx, gz, 8) * 0.4 + (d < -6 ? 0.15 : 0),
      });
    }
  }
  return placements;
}

/**
 * Vnitřek lesa – stromy kreslené obrázky (impostory): náhodně posunutá mřížka, hustota náběhem
 * od okraje, skladba druhů stejnou funkcí jako u 3D stromů okraje. Herně jsou to dospělé
 * stromy jako každé jiné.
 */
export function impostorTreePlacements(
  ctx: ScatterContext,
  forest: ForestScatter = forestScatter(ctx),
): ObstaclePlacement[] {
  const l = ctx.landscape;
  const hash = hashFor(ctx, 'impostor-trees');
  const half = (l.size * l.cellSizeM) / 2;
  const count = Math.floor((l.size * l.cellSizeM) / IMPOSTOR_SPACING_M);
  const placements: ObstaclePlacement[] = [];
  for (let gz = 0; gz < count; gz++) {
    for (let gx = 0; gx < count; gx++) {
      const x = -half + (gx + hash(gx, gz, 1)) * IMPOSTOR_SPACING_M;
      const z = -half + (gz + hash(gx, gz, 2)) * IMPOSTOR_SPACING_M;
      const d = ctx.field.distanceAt(x, z);
      if (d < RAMP_START_M) continue;
      // V náběhu hustota sleduje shluky okraje – nepravidelný okraj s mezerami.
      const ramp = Math.min(1, (d - RAMP_START_M) / (RAMP_FULL_M - RAMP_START_M));
      const clump = ramp + (1 - ramp) * Math.min(1, forest.edgeDensity(x, z));
      if (hash(gx, gz, 3) >= FULL_CHANCE * (0.15 + 0.85 * ramp) * clump) continue;
      if (!forestSpotFree(ctx, x, z)) continue;

      const weights = forest.species(d, heightAtWorld(l, x, z) / (ctx.maxHeight || 1), x, z);
      placements.push({
        id: obstacleId('impostor', gz * count + gx),
        kind: 'tree',
        look: pickForestLook(hash(gx, gz, 4), weights, hash(gx, gz, 5)),
        x,
        z,
        rotation: hash(gx, gz, 6) * Math.PI * 2,
        scale: 0.8 + hash(gx, gz, 7) * 0.45,
        impostor: true,
      });
    }
  }
  return placements;
}
