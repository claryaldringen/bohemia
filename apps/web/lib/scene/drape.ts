import { HEIGHT_SCALE } from './constants';
import type { RenderSurface } from './render-surface';

/**
 * Výška vykresleného terénu ve scéně (m, s převýšením) – přesně na jeho trojúhelnících
 * (terrain-mesh.ts dělí čtverec sítě úhlopříčkou z (i+1, j) do (i, j+1)). Obtisky na terénu
 * (pole, hlína před vchodem, obrysy) podle ní neprořezávají kopce ani nevisí nad údolím;
 * `RenderSurface.heightAt` interpoluje bilineárně a uvnitř čtverce se od terénu liší.
 */
export function terrainMeshHeight(
  surface: Pick<RenderSurface, 'resolution' | 'heights' | 'position'>,
  x: number,
  z: number,
): number {
  const n = surface.resolution;
  const origin = surface.position(0);
  const step = surface.position(1).x - origin.x;
  const fi = Math.min(n - 1, Math.max(0, (x - origin.x) / step));
  const fj = Math.min(n - 1, Math.max(0, (z - origin.z) / step));
  const i = Math.min(n - 2, Math.floor(fi));
  const j = Math.min(n - 2, Math.floor(fj));
  const ti = fi - i;
  const tj = fj - j;
  const h = (di: number, dj: number): number => surface.heights[(j + dj) * n + i + di]!;
  const height =
    ti + tj <= 1
      ? h(0, 0) + (h(1, 0) - h(0, 0)) * ti + (h(0, 1) - h(0, 0)) * tj
      : h(1, 1) + (h(0, 1) - h(1, 1)) * (1 - ti) + (h(1, 0) - h(1, 1)) * (1 - tj);
  return height * HEIGHT_SCALE;
}
