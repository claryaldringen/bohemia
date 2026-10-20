import { checkBand } from './band';
import { computeFertility } from './fertility';
import {
  hasPremiumPass,
  PREMIUM_LAYER_VERSION,
  premiumGeneration,
  type PremiumGeneration,
} from './premium/generate';
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
 * Bez typu je krajina bit po bitu jako dřív. Průměrné vrstvy se tu nepočítají zbytečně: každá
 * vrstva vznikne jednou (průchod, který mění terén, dostane rovnou čerstvý terén) – vyjde stejně
 * jako prémiová krajina přijatého pokusu v `generateAcceptedLandscape`.
 */
export function generateLandscapeAttempt(
  attemptSeed: number,
  versions: LayerVersions,
  premium?: PremiumType,
): Landscape {
  if (premium === undefined) {
    return assemble(attemptSeed, versions, averageLayers(attemptSeed, versions));
  }
  return assemble(
    attemptSeed,
    versions,
    premiumLayers(attemptSeed, versions, premium, null),
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
  const terrain = averageTerrain(attemptSeed, versions);
  const surface = averageVegetation(attemptSeed, versions, terrain);
  const fertility = averageFertility(attemptSeed, versions, terrain, surface);
  return { terrain, surface, fertility };
}

function averageTerrain(attemptSeed: number, versions: LayerVersions): Terrain {
  return generateTerrain(deriveSeed(attemptSeed, 'terrain'), versions.terrain);
}

/**
 * Terén, který dostane průchod typu: vlastní terén typu (`terrainOptions` – generuje se znovu
 * ze seedu terénu pokusu), kopie terénu průměrné krajiny (přijetí – ten zůstane pro pásmo),
 * nebo terén průměrné krajiny spočítaný jednou (uložené sídlo).
 */
function passTerrain(
  attemptSeed: number,
  versions: LayerVersions,
  pass: PremiumGeneration,
  average: Layers | null,
): Terrain {
  if (pass.terrainOptions) {
    return generateTerrain(
      deriveSeed(attemptSeed, 'terrain'),
      versions.terrain,
      pass.terrainOptions,
    );
  }
  return average ? cloneTerrain(average.terrain) : averageTerrain(attemptSeed, versions);
}

function averageVegetation(
  attemptSeed: number,
  versions: LayerVersions,
  terrain: Terrain,
): Uint8Array {
  return generateVegetation(deriveSeed(attemptSeed, 'vegetation'), terrain, versions.vegetation);
}

function averageFertility(
  attemptSeed: number,
  versions: LayerVersions,
  terrain: Terrain,
  surface: Uint8Array,
): Uint8Array {
  return computeFertility(
    deriveSeed(attemptSeed, 'fertility'),
    terrain,
    surface,
    versions.fertility,
  );
}

/**
 * Vrstvy prémiové krajiny pokusu: průchod typu po každé vrstvě. Se zadanými vrstvami průměrné
 * krajiny (přijetí – měří se na nich pásmo) se použijí znovu ty, které průchod nemění; průchod
 * dostane vlastní kopie (terén zkopírovaný – nebo vlastní terén typu, `passTerrain` –, povrch
 * a úrodnost `slice()`), takže průměrné vrstvy zůstanou, jak byly. Bez nich (uložené sídlo) se
 * každá vrstva spočítá jen jednou – vegetace a úrodnost průměrné krajiny jen tam, kde z nich
 * průchod vychází.
 */
function premiumLayers(
  attemptSeed: number,
  versions: LayerVersions,
  type: PremiumType,
  average: Layers | null,
): Layers {
  const pass = premiumGeneration(type, attemptSeed, versions);
  const terrain = pass.changesTerrain
    ? pass.terrain(passTerrain(attemptSeed, versions, pass, average))
    : (average?.terrain ?? averageTerrain(attemptSeed, versions));
  const ownSurface = pass.changesTerrain || average === null;
  const baseSurface = ownSurface
    ? averageVegetation(attemptSeed, versions, terrain)
    : average.surface;
  const surface = pass.vegetation(ownSurface ? baseSurface : baseSurface.slice(), terrain);
  // Úrodnost průměrné krajiny platí, jen když terén i povrch zůstaly.
  const ownFertility = pass.changesTerrain || pass.changesVegetation || average === null;
  const baseFertility = ownFertility
    ? averageFertility(attemptSeed, versions, terrain, surface)
    : average.fertility;
  const fertility = pass.fertility(
    ownFertility ? baseFertility : baseFertility.slice(),
    terrain,
    surface,
  );
  return { terrain, surface, fertility };
}

/**
 * Hluboká kopie terénu – průchod, který terén mění, ho smí upravit na místě; terén průměrné
 * krajiny pokusu (pásmo) zůstane. Vyjde stejně, jako kdyby se terén vygeneroval znovu.
 */
function cloneTerrain(terrain: Terrain): Terrain {
  return {
    size: terrain.size,
    heights: terrain.heights.slice(),
    water: terrain.water.slice(),
    villageSite: { ...terrain.villageSite },
    stream: terrain.stream.map((p) => ({ ...p })),
    ...(terrain.promontories
      ? {
          promontories: terrain.promontories.map((p) => ({
            ...p,
            outline: p.outline.map((q) => ({ ...q })),
            neck: [{ ...p.neck[0] }, { ...p.neck[1] }] as const,
            center: { ...p.center },
          })),
        }
      : {}),
    ...(terrain.river ? { river: terrain.river.map((p) => ({ ...p })) } : {}),
  };
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
    ...(terrain.river ? { river: terrain.river } : {}),
    ...(premium !== undefined ? { premium } : {}),
  };
}
