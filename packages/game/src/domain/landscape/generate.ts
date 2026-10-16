import { checkBand } from './band';
import { computeFertility } from './fertility';
import { deriveSeed } from './random';
import { generateTerrain } from './terrain';
import { CELL_SIZE_M, CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from './types';
import { generateVegetation } from './vegetation';

export const MAX_ATTEMPTS = 16;

/**
 * Krajina pro nové sídlo: první pokus (seed, seed+1, …), který padne do pásma srovnatelnosti.
 * Vrací i seed přijatého pokusu – ten se ukládá u sídla, aby krajinu ukotvil i při pozdějším
 * ladění pásma (uložené sídlo se pak generuje jen přes generateLandscapeAttempt).
 */
export function generateAcceptedLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
): { seed: number; landscape: Landscape } {
  for (const [layer, version] of Object.entries(versions)) {
    if (version !== 1) throw new RangeError(`Neznámá verze vrstvy ${layer}: ${String(version)}`);
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed + attempt) >>> 0;
    const landscape = generateLandscapeAttempt(attemptSeed, versions);
    if (checkBand(landscape).ok) return { seed: attemptSeed, landscape };
  }
  throw new Error(`Krajina pro seed ${seed} nesplnila pásmo ani na ${MAX_ATTEMPTS} pokusů.`);
}

/** Krajina z vylosovaného seedu – první pokus v pásmu srovnatelnosti. */
export function generateLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
): Landscape {
  return generateAcceptedLandscape(seed, versions).landscape;
}

/** Krajina přesně z daného seedu, bez kontroly pásma – pro uložená sídla a měření. */
export function generateLandscapeAttempt(attemptSeed: number, versions: LayerVersions): Landscape {
  const terrain = generateTerrain(deriveSeed(attemptSeed, 'terrain'), versions.terrain);
  const surface = generateVegetation(
    deriveSeed(attemptSeed, 'vegetation'),
    terrain,
    versions.vegetation,
  );
  const fertility = computeFertility(
    deriveSeed(attemptSeed, 'fertility'),
    terrain,
    surface,
    versions.fertility,
  );
  return {
    size: terrain.size,
    cellSizeM: CELL_SIZE_M,
    heights: terrain.heights,
    surface,
    fertility,
    villageSite: terrain.villageSite,
  };
}
