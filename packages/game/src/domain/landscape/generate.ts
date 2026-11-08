import { checkBand } from './band';
import { computeFertility, meanLandHeight } from './fertility';
import {
  hasPremiumPass,
  PREMIUM_LAYER_VERSION,
  premiumGeneration,
  type PremiumGeneration,
} from './premium/generate';
import type { PremiumType } from './premium/types';
import { deriveSeed } from './random';
import { generateSkeletonTerrain } from './skeleton/terrain';
import type { SkeletonSlice } from './skeleton/types';
import { generateTerrain, type Terrain } from './terrain';
import {
  CELL_SIZE_M,
  CURRENT_LAYER_VERSIONS,
  SKELETON_LAYER_VERSION,
  type Landscape,
  type LayerVersions,
} from './types';
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
  skeleton: [SKELETON_LAYER_VERSION],
};

/**
 * Výřez kostry mapy – prázdný výřez je suchá mapa (null). Verze `skeleton` patří jen k neprázdnému
 * výřezu a naopak; prémie na kostře přijde s `premium: 2` – zatím `RangeError`.
 */
function skeletonOf(
  versions: LayerVersions,
  skeleton: SkeletonSlice | null | undefined,
  premium: PremiumType | undefined,
): SkeletonSlice | null {
  const slice =
    skeleton && (skeleton.rivers.length > 0 || skeleton.trails.length > 0) ? skeleton : null;
  if (slice && versions.skeleton === undefined) {
    throw new RangeError('Výřez kostry bez verze vrstvy skeleton.');
  }
  if (!slice && versions.skeleton !== undefined) {
    throw new RangeError(`Verze vrstvy skeleton ${String(versions.skeleton)} bez výřezu kostry.`);
  }
  if (slice && premium !== undefined) {
    throw new RangeError(`Prémiový typ ${premium} na mapě z kostry zatím není (premium: 2).`);
  }
  return slice;
}

/**
 * Krajina pro nové sídlo: první pokus (seed, seed+1, …), který padne do pásma srovnatelnosti.
 * Vrací i seed přijatého pokusu – ten se ukládá u sídla, aby krajinu ukotvil i při pozdějším
 * ladění pásma (uložené sídlo se pak generuje jen přes generateLandscapeAttempt). S prémiovým
 * typem (návrh Clauda) se celé pásmo měří na průměrné krajině pokusu – vrstvách před prémiovým
 * průchodem –, takže bonus typu nevytáhne do pásma základ, který by neprošel; prémiová krajina
 * pak musí splnit dolní meze pásma (start není horší) a kontrolu typu (`checkPremium`). Neznámý
 * typ vyhodí RangeError jako neznámá verze. Výřez kostry (`skeleton`, world-skeleton.md – Mapa z kostry)
 * je čtvrtý vstup: s řekou terén „řeka první“, se stezkou jen nese výřez; null = suchá mapa bit
 * po bitu jako dřív.
 */
export function generateAcceptedLandscape(
  seed: number,
  versions: LayerVersions = CURRENT_LAYER_VERSIONS,
  premium?: PremiumType,
  skeleton?: SkeletonSlice | null,
): { seed: number; landscape: Landscape } {
  for (const [layer, version] of Object.entries(versions)) {
    const known = KNOWN_VERSIONS[layer as keyof LayerVersions] as readonly unknown[] | undefined;
    if (!known?.includes(version)) {
      throw new RangeError(`Neznámá verze vrstvy ${layer}: ${String(version)}`);
    }
  }
  if (premium !== undefined) hasPremiumPass(premium); // neznámý typ → RangeError hned
  const slice = skeletonOf(versions, skeleton, premium);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed + attempt) >>> 0;
    const average = averageLayers(attemptSeed, versions, slice);
    const plain = assemble(attemptSeed, versions, average, undefined, slice);
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
  skeleton?: SkeletonSlice | null,
): Landscape {
  return generateAcceptedLandscape(seed, versions, premium, skeleton).landscape;
}

/**
 * Krajina přesně z daného seedu, bez kontroly pásma – pro uložená sídla a měření. Prémiový typ
 * (premium-landscapes.md) je třetí vstup: jeho průchod upraví vrstvy po terénu, vegetaci
 * a úrodnosti (`premiumGeneration`, vlastní seed – náhoda vrstev se nemění) a krajina nese typ.
 * Bez typu je krajina bit po bitu jako dřív. Průměrné vrstvy se tu nepočítají zbytečně: každá
 * vrstva vznikne jednou (průchod, který mění terén, dostane rovnou čerstvý terén) – vyjde stejně
 * jako prémiová krajina přijatého pokusu v `generateAcceptedLandscape`. Výřez kostry jako tam.
 */
export function generateLandscapeAttempt(
  attemptSeed: number,
  versions: LayerVersions,
  premium?: PremiumType,
  skeleton?: SkeletonSlice | null,
): Landscape {
  const slice = skeletonOf(versions, skeleton, premium);
  if (premium === undefined) {
    return assemble(
      attemptSeed,
      versions,
      averageLayers(attemptSeed, versions, slice),
      undefined,
      slice,
    );
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
function averageLayers(
  attemptSeed: number,
  versions: LayerVersions,
  slice: SkeletonSlice | null = null,
): Layers {
  const terrain = averageTerrain(attemptSeed, versions, slice);
  const surface = averageVegetation(attemptSeed, versions, terrain);
  const fertility = averageFertility(attemptSeed, versions, terrain, surface);
  return { terrain, surface, fertility };
}

/** Terén průměrné krajiny pokusu – s výřezem kostry terén mapy z kostry. */
function averageTerrain(
  attemptSeed: number,
  versions: LayerVersions,
  slice: SkeletonSlice | null = null,
): Terrain {
  const seed = deriveSeed(attemptSeed, 'terrain');
  return slice
    ? generateSkeletonTerrain(seed, versions.terrain, slice)
    : generateTerrain(seed, versions.terrain);
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
  meanHeight?: number,
): Uint8Array {
  return computeFertility(
    deriveSeed(attemptSeed, 'fertility'),
    terrain,
    surface,
    versions.fertility,
    meanHeight,
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
  const base = pass.changesTerrain
    ? passTerrain(attemptSeed, versions, pass, average)
    : (average?.terrain ?? averageTerrain(attemptSeed, versions));
  // Průměr souše průměrné krajiny pokusu (typy reliéfu) – spočítá se před průchodem, který terén
  // upraví na místě; vlastní terén typu (`terrainOptions`) průměrný není, pak se průměrný terén
  // u uloženého sídla spočítá navíc.
  const meanHeight = pass.fertilityAverageMean
    ? meanLandHeight(
        average?.terrain ?? (pass.terrainOptions ? averageTerrain(attemptSeed, versions) : base),
      )
    : undefined;
  const terrain = pass.changesTerrain ? pass.terrain(base) : base;
  const ownSurface = pass.changesTerrain || average === null;
  const baseSurface = ownSurface
    ? averageVegetation(attemptSeed, versions, terrain)
    : average.surface;
  const surface = pass.vegetation(ownSurface ? baseSurface : baseSurface.slice(), terrain);
  // Úrodnost průměrné krajiny platí, jen když terén i povrch zůstaly.
  const ownFertility = pass.changesTerrain || pass.changesVegetation || average === null;
  const baseFertility = ownFertility
    ? averageFertility(attemptSeed, versions, terrain, surface, meanHeight)
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
    ...(terrain.rivers
      ? { rivers: terrain.rivers.map((course) => course.map((p) => ({ ...p }))) }
      : {}),
  };
}

/** Krajina z vrstev pokusu (s prémiovým typem i typ, s výřezem kostry i výřez a osy řek). */
function assemble(
  attemptSeed: number,
  versions: LayerVersions,
  { terrain, surface, fertility }: Layers,
  premium?: PremiumType,
  slice: SkeletonSlice | null = null,
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
    ...(terrain.rivers ? { rivers: terrain.rivers } : {}),
    ...(premium !== undefined ? { premium } : {}),
    ...(slice ? { skeleton: slice } : {}),
  };
}
