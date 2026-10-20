import { editedHeight, type TerrainEdits } from '@bohemia/game';
import type { RenderSurface } from './render-surface';

// Úpravy terénu vozových cest ve scéně (roads.md – Vozová cesta, landscape.md – Úpravy terénu):
// výšková síť scény (render-surface.ts) se v úvozu sníží a v náspu zvedne stejnou funkcí jako
// terén jádra (`editedHeight` – pláň v navržené výšce, svahy 1 : 1 k původnímu terénu), jen nad
// vyhlazeným terénem scény. Přepočítá se jen obdélník kolem cest a jen při změně profilu. Ve vodě
// (koryto potoka) se nic nemění – brod zůstává brodem. Čisté funkce bez Babylonu.

/** Obdélník vrcholů sítě (včetně). */
export interface SurfaceRegion {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

/** Ve vodě se terén neupravuje – vrchol pod hladinou nebo do tolika metrů nad ní. */
const WATER_MARGIN_M = 0.3;

/** Vrcholy sítě, které pokryje obdélník světa (m) – oříznuté na síť; prázdný null. */
export function surfaceRegion(
  surface: Pick<RenderSurface, 'resolution' | 'position'>,
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): SurfaceRegion | null {
  const n = surface.resolution;
  const origin = surface.position(0);
  const step = surface.position(1).x - origin.x;
  const i0 = Math.max(0, Math.floor((bounds.minX - origin.x) / step));
  const j0 = Math.max(0, Math.floor((bounds.minZ - origin.z) / step));
  const i1 = Math.min(n - 1, Math.ceil((bounds.maxX - origin.x) / step));
  const j1 = Math.min(n - 1, Math.ceil((bounds.maxZ - origin.z) / step));
  return i0 > i1 || j0 > j1 ? null : { i0, j0, i1, j1 };
}

/** Sjednocení obdélníků (bez prázdných); nic null. */
export function unionRegion(...regions: (SurfaceRegion | null)[]): SurfaceRegion | null {
  let out: SurfaceRegion | null = null;
  for (const r of regions) {
    if (!r) continue;
    out = out
      ? {
          i0: Math.min(out.i0, r.i0),
          j0: Math.min(out.j0, r.j0),
          i1: Math.max(out.i1, r.i1),
          j1: Math.max(out.j1, r.j1),
        }
      : { ...r };
  }
  return out;
}

/**
 * Výšky sítě scény po úpravách v obdélníku `region` (mutuje `surface.heights`): z původních výšek
 * `base` (vyhlazený terén s korytem) a úprav `edits`; vrchol ve vodě zůstane. Mimo obdélník beze
 * změny. Vrátí obdélník vrcholů, které se opravdu změnily, nebo null.
 */
export function editSurfaceHeights(
  surface: Pick<RenderSurface, 'resolution' | 'heights' | 'waterLevel' | 'position'>,
  base: Float32Array,
  edits: TerrainEdits,
  region: SurfaceRegion,
): SurfaceRegion | null {
  const n = surface.resolution;
  let changed: SurfaceRegion | null = null;
  for (let j = region.j0; j <= region.j1; j++) {
    for (let i = region.i0; i <= region.i1; i++) {
      const v = j * n + i;
      const natural = base[v]!;
      const { x, z } = surface.position(v);
      const water = surface.waterLevel[v]!;
      const h =
        Number.isFinite(water) && natural < water + WATER_MARGIN_M
          ? natural
          : editedHeight(edits, x, z, natural);
      const next = Math.fround(h);
      if (next !== surface.heights[v]) {
        surface.heights[v] = next;
        if (!changed) changed = { i0: i, j0: j, i1: i, j1: j };
        else {
          changed.i0 = Math.min(changed.i0, i);
          changed.i1 = Math.max(changed.i1, i);
          changed.j1 = j;
        }
      }
    }
  }
  return changed;
}

/**
 * Normály vrcholů v obdélníku (mutuje `normals`) – jako `VertexData.ComputeNormals` Babylonu:
 * součet jednotkových normál sousedních trojúhelníků (čtverec dělí úhlopříčka z (i + 1, j) do
 * (i, j + 1) – terrain-mesh.ts), pak jednotkově. Trojúhelníky kolem obdélníku se započtou celé,
 * takže normály na jeho kraji sedí s okolím.
 */
export function recomputeNormals(
  positions: Float32Array,
  normals: Float32Array,
  n: number,
  region: SurfaceRegion,
): void {
  const sum = new Float64Array((region.i1 - region.i0 + 1) * (region.j1 - region.j0 + 1) * 3);
  const w = region.i1 - region.i0 + 1;
  const add = (v: number, nx: number, ny: number, nz: number): void => {
    const i = v % n;
    const j = (v - i) / n;
    if (i < region.i0 || i > region.i1 || j < region.j0 || j > region.j1) return;
    const k = ((j - region.j0) * w + (i - region.i0)) * 3;
    sum[k] = sum[k]! + nx;
    sum[k + 1] = sum[k + 1]! + ny;
    sum[k + 2] = sum[k + 2]! + nz;
  };
  const face = (a: number, b: number, c: number): void => {
    // jako Babylon: p1p2 = p1 − p2, p3p2 = p3 − p2, normála = p1p2 × p3p2
    const ax = positions[a * 3]! - positions[b * 3]!;
    const ay = positions[a * 3 + 1]! - positions[b * 3 + 1]!;
    const az = positions[a * 3 + 2]! - positions[b * 3 + 2]!;
    const cx = positions[c * 3]! - positions[b * 3]!;
    const cy = positions[c * 3 + 1]! - positions[b * 3 + 1]!;
    const cz = positions[c * 3 + 2]! - positions[b * 3 + 2]!;
    let nx = ay * cz - az * cy;
    let ny = az * cx - ax * cz;
    let nz = ax * cy - ay * cx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    add(a, nx, ny, nz);
    add(b, nx, ny, nz);
    add(c, nx, ny, nz);
  };
  for (let j = Math.max(0, region.j0 - 1); j <= Math.min(n - 2, region.j1); j++) {
    for (let i = Math.max(0, region.i0 - 1); i <= Math.min(n - 2, region.i1); i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      face(a, b, c);
      face(b, d, c);
    }
  }
  for (let j = region.j0; j <= region.j1; j++) {
    for (let i = region.i0; i <= region.i1; i++) {
      const k = ((j - region.j0) * w + (i - region.i0)) * 3;
      const length =
        Math.sqrt(sum[k]! * sum[k]! + sum[k + 1]! * sum[k + 1]! + sum[k + 2]! * sum[k + 2]!) || 1;
      const v = (j * n + i) * 3;
      normals[v] = sum[k]! / length;
      normals[v + 1] = sum[k + 1]! / length;
      normals[v + 2] = sum[k + 2]! / length;
    }
  }
}
