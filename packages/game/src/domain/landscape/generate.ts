import { checkBand } from './band';
import { computeFertility } from './fertility';
import { PREMIUM_LAYER_VERSION, premiumGeneration } from './premium/generate';
import type { PremiumType } from './premium/types';
import { deriveSeed } from './random';
import { generateTerrain } from './terrain';
import { CELL_SIZE_M, CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from './types';
import { generateVegetation } from './vegetation';

export const MAX_ATTEMPTS = 16;

/** Verze, které generátor umí, po vrstvách. */
const KNOWN_VERSIONS: { readonly [K in keyof LayerVersions]-?: readonly LayerVersions[K][] } = {
  terrain: [1, 2],
  vegetation: [1, 2],
  fertility: [1, 2],
  obstacles: [1, 2],
  premium: [PREMIUM_LAYER_VERSION],
};

/**
 * Krajina pro nové sídlo: první pokus (seed, seed+1, …), který padne do pásma srovnatelnosti.
 * Vrací i seed přijatého pokusu – ten se ukládá u sídla, aby krajinu ukotvil i při pozdějším
 * ladění pásma (uložené sídlo se pak generuje jen přes generateLandscapeAttempt). S prémiovým
 * typem musí pokus projít i kontrolou typu (`checkPremium` – součást pásma); neznámý typ vyhodí
 * RangeError jako neznámá verze.
 */
export function generateAcceptedLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
  premium?: PremiumType,
): { seed: number; landscape: Landscape } {
  for (const [layer, version] of Object.entries(versions)) {
    const known = KNOWN_VERSIONS[layer as keyof LayerVersions] as readonly unknown[] | undefined;
    if (!known?.includes(version)) {
      throw new RangeError(`Neznámá verze vrstvy ${layer}: ${String(version)}`);
    }
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed + attempt) >>> 0;
    const landscape = generateLandscapeAttempt(attemptSeed, versions, premium);
    if (checkBand(landscape, versions).ok) return { seed: attemptSeed, landscape };
  }
  throw new Error(`Krajina pro seed ${seed} nesplnila pásmo ani na ${MAX_ATTEMPTS} pokusů.`);
}

/** Krajina z vylosovaného seedu – první pokus v pásmu srovnatelnosti. */
export function generateLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
  premium?: PremiumType,
): Landscape {
  return generateAcceptedLandscape(seed, versions, premium).landscape;
}

/**
 * Krajina přesně z daného seedu, bez kontroly pásma – pro uložená sídla a měření. Prémiový typ
 * (premium-landscapes.md) je třetí vstup: jeho průchod upraví vrstvy po terénu, vegetaci
 * a úrodnosti (`premiumGeneration`, vlastní seed – náhoda vrstev se nemění) a krajina nese typ.
 * Bez typu je krajina bit po bitu jako dřív.
 */
export function generateLandscapeAttempt(
  attemptSeed: number,
  versions: LayerVersions,
  premium?: PremiumType,
): Landscape {
  const pass = premium === undefined ? null : premiumGeneration(premium, attemptSeed, versions);
  const baseTerrain = generateTerrain(deriveSeed(attemptSeed, 'terrain'), versions.terrain);
  const terrain = pass ? pass.terrain(baseTerrain) : baseTerrain;
  const baseSurface = generateVegetation(
    deriveSeed(attemptSeed, 'vegetation'),
    terrain,
    versions.vegetation,
  );
  const surface = pass ? pass.vegetation(baseSurface, terrain) : baseSurface;
  const baseFertility = computeFertility(
    deriveSeed(attemptSeed, 'fertility'),
    terrain,
    surface,
    versions.fertility,
  );
  const fertility = pass ? pass.fertility(baseFertility, terrain, surface) : baseFertility;
  return {
    size: terrain.size,
    cellSizeM: CELL_SIZE_M,
    heights: terrain.heights,
    surface,
    fertility,
    villageSite: terrain.villageSite,
    stream: terrain.stream,
    obstacleLayer: {
      seed: deriveSeed(attemptSeed, 'obstacles'),
      version: versions.obstacles ?? 1,
    },
    ...(terrain.promontories ? { promontories: terrain.promontories } : {}),
    ...(premium !== undefined ? { premium } : {}),
  };
}
