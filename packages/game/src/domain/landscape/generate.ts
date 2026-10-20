import { checkBand } from './band';
import { computeFertility } from './fertility';
import { hasPremiumPass, PREMIUM_LAYER_VERSION, premiumGeneration } from './premium/generate';
import type { PremiumType } from './premium/types';
import { deriveSeed } from './random';
import { generateTerrain, type Terrain } from './terrain';
import { CELL_SIZE_M, CURRENT_LAYER_VERSIONS, type Landscape, type LayerVersions } from './types';
import { generateVegetation } from './vegetation';

export const MAX_ATTEMPTS = 16;

/** Žádný z `MAX_ATTEMPTS` pokusů nepadl do pásma srovnatelnosti (i s kontrolou prémiového typu). */
export class BandFailureError extends Error {
  constructor(readonly seed: number) {
    super(`Krajina pro seed ${seed} nesplnila pásmo ani na ${MAX_ATTEMPTS} pokusů.`);
    this.name = 'BandFailureError';
  }
}

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
 * typem (návrh Clauda) se celé pásmo měří na průměrné krajině pokusu – vrstvách před prémiovým
 * průchodem –, takže bonus typu nevytáhne do pásma základ, který by neprošel; prémiová krajina
 * pak musí splnit dolní meze pásma (start není horší) a kontrolu typu (`checkPremium`). Neznámý
 * typ vyhodí RangeError jako neznámá verze.
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
  if (premium !== undefined) hasPremiumPass(premium); // neznámý typ → RangeError hned
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed + attempt) >>> 0;
    const average = averageLayers(attemptSeed, versions);
    const plain = assemble(attemptSeed, versions, average);
    if (!checkBand(plain, versions).ok) continue;
    if (premium === undefined) return { seed: attemptSeed, landscape: plain };
    const layers = premiumLayers(attemptSeed, versions, premium, average);
    const landscape = assemble(attemptSeed, versions, layers, premium);
    if (checkBand(landscape, versions).ok) return { seed: attemptSeed, landscape };
  }
  throw new BandFailureError(seed);
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
  const average = averageLayers(attemptSeed, versions);
  if (premium === undefined) return assemble(attemptSeed, versions, average);
  return assemble(
    attemptSeed,
    versions,
    premiumLayers(attemptSeed, versions, premium, average),
    premium,
  );
}

/** Vrstvy pokusu před sestavením krajiny. */
interface Layers {
  readonly terrain: Terrain;
  readonly surface: Uint8Array;
  readonly fertility: Uint8Array;
}

/** Vrstvy průměrné krajiny pokusu – terén a voda → vegetace → úrodnost. */
function averageLayers(attemptSeed: number, versions: LayerVersions): Layers {
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
  return { terrain, surface, fertility };
}

/**
 * Vrstvy prémiové krajiny pokusu: průchod typu po každé vrstvě. Vrstvy průměrné krajiny, které
 * průchod nemění, se použijí znovu; průchod dostane vlastní kopie (terén vygenerovaný znovu,
 * povrch a úrodnost zkopírované), takže průměrné vrstvy zůstanou, jak byly (měří se na nich
 * pásmo).
 */
function premiumLayers(
  attemptSeed: number,
  versions: LayerVersions,
  type: PremiumType,
  average: Layers,
): Layers {
  const pass = premiumGeneration(type, attemptSeed, versions);
  const terrain = pass.changesTerrain
    ? pass.terrain(generateTerrain(deriveSeed(attemptSeed, 'terrain'), versions.terrain))
    : average.terrain;
  const baseSurface = pass.changesTerrain
    ? generateVegetation(deriveSeed(attemptSeed, 'vegetation'), terrain, versions.vegetation)
    : average.surface;
  const surface = pass.vegetation(baseSurface.slice(), terrain);
  // Úrodnost průměrné krajiny platí, jen když terén i povrch zůstaly.
  const baseFertility =
    pass.changesTerrain || pass.changesVegetation
      ? computeFertility(deriveSeed(attemptSeed, 'fertility'), terrain, surface, versions.fertility)
      : average.fertility;
  const fertility = pass.fertility(baseFertility.slice(), terrain, surface);
  return { terrain, surface, fertility };
}

/** Krajina z vrstev pokusu (s prémiovým typem i typ). */
function assemble(
  attemptSeed: number,
  versions: LayerVersions,
  { terrain, surface, fertility }: Layers,
  premium?: PremiumType,
): Landscape {
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
