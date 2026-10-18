import type { Landscape } from '../../landscape';
import { pathTerrainOf, pathWindowFor, type PathTerrain } from '../paths/terrain';
import type { PathVillage } from '../paths/network';
import { makeLandscape } from './placement-fixtures';

// Krajina pro testy pěšin: louka 20 × 20 políček (300 × 300 m, střed v počátku), řada vodních
// políček z ∈ (75, 90) (potok bez osy – voda je celé políčko), les pro x < −90 (sloupce 0–3).

export function pathLandscape(height?: (x: number, y: number) => number): Landscape {
  return makeLandscape({
    size: 20,
    surface: (x, y) => (y === 15 ? 'water' : x <= 3 ? 'forest' : 'meadow'),
    ...(height ? { height } : {}),
  });
}

export const LANDSCAPE = pathLandscape();

/** Terén celé krajiny testu. */
export function pathTestTerrain(l: Landscape = LANDSCAPE): PathTerrain {
  return pathTerrainOf(l, pathWindowFor(l, { minX: -150, minZ: -150, maxX: 150, maxZ: 150 }));
}

export const house = (
  id: number,
  x: number,
  z: number,
  rotation = 0,
  extra: Partial<PathVillage['dwellings'][number]> = {},
): PathVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x, z, rotation },
  built: true,
  ...extra,
});

/** Čtverec pole (políčko 15 m) se středem v (x, z) – středy políček leží na −142,5 + 15 k. */
export const part = (
  x: number,
  z: number,
  stage: PathVillage['fields'][number]['parts'][number]['stage'] = 'sown',
): PathVillage['fields'][number]['parts'][number] => ({
  cell: { x: Math.round((x + 142.5) / 15), y: Math.round((z + 142.5) / 15) },
  x,
  z,
  size: 15,
  stage,
});
