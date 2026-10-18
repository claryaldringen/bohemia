import type { SceneVillage } from '../../village-view';
import { buildPathTerrain, type PathTerrain, type PathTerrainSource } from '../path-terrain';

// Společná krajina pro testy pěšin: rovná louka 300 × 300 m (síť po 3,75 m jako vykreslení),
// potok v pásu z ∈ (70, 76) s brodem kolem x = −100, les pro x < −90.

export const STEP = 3.75;
export const N = 81;
export const ORIGIN = -150;

export function testSource(
  options: { slope?: (x: number, z: number) => number } = {},
): PathTerrainSource {
  const heights = new Float32Array(N * N);
  const waterLevel = new Float32Array(N * N).fill(-Infinity);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = ORIGIN + i * STEP;
      const z = ORIGIN + j * STEP;
      heights[j * N + i] = options.slope?.(x, z) ?? 0;
      if (z > 70 && z < 76) waterLevel[j * N + i] = 0.5;
    }
  }
  return {
    resolution: N,
    originX: ORIGIN,
    originZ: ORIGIN,
    step: STEP,
    heights,
    waterLevel,
    forestDistance: (x) => -90 - x,
    ford: (x) => Math.abs(x + 100) < 6,
    halfExtent: 1000,
  };
}

export function testTerrain(): PathTerrain {
  return buildPathTerrain(testSource(), { i0: 0, j0: 0, i1: N - 1, j1: N - 1 });
}

export const house = (
  id: number,
  x: number,
  z: number,
  rotation = 0,
  extra: Partial<SceneVillage['dwellings'][number]> = {},
): SceneVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x, z, rotation },
  built: true,
  progress: 1,
  ...extra,
});

/** Čtverec pole (políčko 15 m) se středem v (x, z). */
export const part = (
  x: number,
  z: number,
  stage: SceneVillage['fields'][number]['parts'][number]['stage'] = 'sown',
): SceneVillage['fields'][number]['parts'][number] => ({
  cell: { x: Math.floor(x / 15), y: Math.floor(z / 15) },
  x,
  z,
  size: 15,
  stage,
});
