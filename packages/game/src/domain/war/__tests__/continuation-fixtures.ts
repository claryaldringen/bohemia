import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  skeletonFeaturesOf,
  type Landscape,
  type LayerVersions,
} from '../../landscape';
import type { SkeletonSlice, SkeletonTrailPort } from '../../landscape/skeleton/types';
import type { RoadPoint } from '../../village/types';
import { forestInterior } from '../dense-forest';
import { marchTerrain } from '../march-terrain';

// Přípravky testů pokračování zemské stezky na sousední mapě (plán 2026-11-16-dense-forest –
// Rozhodnutí 13, Úloha 4b) a stezky krajiny (Úloha 4).

/** Krajina testu pokračování a vstup na jejím západním okraji. */
export interface WestForest {
  seed: number;
  landscape: Landscape;
  /** Střed nejdelšího souvislého úseku hustého lesa v západním sloupci mřížky pochodu. */
  entry: RoadPoint;
}

let west: WestForest | null = null;

/**
 * První ze seedů 1–20, jehož mapa má v západním sloupci mřížky pochodu buňku hustého lesa
 * (`forestInterior`); vstup je střed nejdelšího souvislého úseku hustého lesa toho sloupce.
 * Jednou na běh souboru – generování krajiny je drahé.
 */
export function westForest(): WestForest {
  if (west) return west;
  for (let seed = 1; seed <= 20; seed++) {
    const landscape = generateLandscape(seed);
    const t = marchTerrain(landscape);
    const dense = forestInterior(landscape, t);
    let best = { start: 0, length: 0 };
    let start = -1;
    for (let j = 0; j <= t.height; j++) {
      const inForest = j < t.height && dense[j * t.width] === 1;
      if (inForest && start < 0) start = j;
      else if (!inForest && start >= 0) {
        if (j - start > best.length) best = { start, length: j - start };
        start = -1;
      }
    }
    if (best.length === 0) continue;
    const j = best.start + Math.floor(best.length / 2);
    west = { seed, landscape, entry: { x: t.originX, z: t.originZ + j * t.cellM } };
    return west;
  }
  throw new Error('žádná krajina s hustým lesem na západním okraji');
}

export const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };

export const port = (side: SkeletonTrailPort['side'], at: number): SkeletonTrailPort => ({
  side,
  at,
});

/** První ze seedů 1–20, jehož mapa z kostry má trasu stezky. */
export function withRoute(trails: SkeletonTrailPort[]): Landscape {
  const slice: SkeletonSlice = { world: 1, rivers: [], trails };
  for (let seed = 1; seed <= 20; seed++) {
    const l = generateLandscapeAttempt(seed, SKELETON, undefined, slice);
    if (skeletonFeaturesOf(l)?.route) return l;
  }
  throw new Error('žádná mapa se stezkou');
}
