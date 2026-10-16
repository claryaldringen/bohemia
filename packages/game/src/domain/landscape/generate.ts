import { checkBand } from './band';
import { computeFertility } from './fertility';
import { deriveSeed } from './random';
import { generateTerrain } from './terrain';
import { CELL_SIZE_M, CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from './types';
import { generateVegetation } from './vegetation';

export const MAX_ATTEMPTS = 16;

/**
 * Krajina sídla ze seedu. Vrátí první pokus (seed, seed+1, …), který padne do pásma
 * srovnatelnosti; každá vrstva má vlastní seed odvozený z pokusu.
 */
export function generateLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
): Landscape {
  for (const [layer, version] of Object.entries(versions)) {
    if (version !== 1) throw new RangeError(`Neznámá verze vrstvy ${layer}: ${String(version)}`);
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const landscape = generateLandscapeAttempt((seed + attempt) >>> 0, versions);
    if (checkBand(landscape).ok) return landscape;
  }
  throw new Error(`Krajina pro seed ${seed} nesplnila pásmo ani na ${MAX_ATTEMPTS} pokusů.`);
}

/** Jeden pokus bez kontroly pásma – pro generateLandscape a měření (scripts/measure-landscapes). */
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
