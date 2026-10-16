import { distanceToMask, maxStep } from './grid';
import { SURFACE_CODES, type Landscape } from './types';

// Pásmo srovnatelnosti startovních krajin (docs/design/landscape.md).
export const FOREST_SHARE: readonly [number, number] = [0.55, 0.7];
export const VILLAGE_SITE_CELLS: readonly [number, number] = [400, 1200];
export const VILLAGE_SITE_MIN_FERTILITY = 60;
export const VILLAGE_SITE_MAX_WATER_DISTANCE_CELLS = 20;
export const RELIEF_M: readonly [number, number] = [10, 40];
export const FLAT_MAX_STEP_M = 1.0;
/**
 * Počet políček s úrodností ≥ 60 – nastaveno podle měření (scripts/measure-landscapes.ts):
 * p5 a p95 z 500 seedů s rezervou ~150. Zvlněnější terén (16. 10. 2026) má víc svahů, a proto
 * méně úrodné půdy než původní 3800–5200.
 */
export const FERTILE_CELLS: readonly [number, number] = [3600, 4850];

export interface LandscapeMetrics {
  waterSpansEdges: boolean;
  forestShare: number;
  villageSiteCells: number;
  reliefM: number;
  fertileCells: number;
}

export function measureLandscape(l: Landscape): LandscapeMetrics {
  const { size } = l;
  const water = l.surface.map((v) => (v === SURFACE_CODES.water ? 1 : 0));
  let forest = 0;
  let fertileCells = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < l.surface.length; i++) {
    if (l.surface[i] === SURFACE_CODES.forest) forest++;
    if (l.fertility[i]! >= VILLAGE_SITE_MIN_FERTILITY) fertileCells++;
    min = Math.min(min, l.heights[i]!);
    max = Math.max(max, l.heights[i]!);
  }

  const waterDistance = distanceToMask(water, size);
  const site = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      site[i] =
        l.surface[i] === SURFACE_CODES.meadow &&
        l.fertility[i]! >= VILLAGE_SITE_MIN_FERTILITY &&
        waterDistance[i]! <= VILLAGE_SITE_MAX_WATER_DISTANCE_CELLS &&
        maxStep(l.heights, size, x, y) <= FLAT_MAX_STEP_M
          ? 1
          : 0;
    }
  }

  return {
    waterSpansEdges: spansOppositeEdges(water, size),
    forestShare: forest / l.surface.length,
    villageSiteCells: largestComponent(site, size),
    reliefM: max - min,
    fertileCells,
  };
}

export function checkBand(l: Landscape): { ok: boolean; failures: string[] } {
  const m = measureLandscape(l);
  const within = (value: number, [low, high]: readonly [number, number]): boolean =>
    value >= low && value <= high;
  const failures = [
    !m.waterSpansEdges && 'water-edges',
    !within(m.forestShare, FOREST_SHARE) && 'forest-share',
    !within(m.villageSiteCells, VILLAGE_SITE_CELLS) && 'village-site',
    !within(m.reliefM, RELIEF_M) && 'relief',
    !within(m.fertileCells, FERTILE_CELLS) && 'fertile-cells',
  ].filter((failure): failure is string => failure !== false);
  return { ok: failures.length === 0, failures };
}

function neighbours8(i: number, size: number): number[] {
  const x = i % size;
  const y = Math.floor(i / size);
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) result.push(ny * size + nx);
    }
  }
  return result;
}

function spansOppositeEdges(water: Uint8Array, size: number): boolean {
  const seen = new Uint8Array(water.length);
  for (let start = 0; start < water.length; start++) {
    if (!water[start] || seen[start]) continue;
    let left = false;
    let right = false;
    let top = false;
    let bottom = false;
    const queue = [start];
    seen[start] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      left ||= x === 0;
      right ||= x === size - 1;
      top ||= y === 0;
      bottom ||= y === size - 1;
      for (const n of neighbours8(i, size)) {
        if (water[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    if ((left && right) || (top && bottom)) return true;
  }
  return false;
}

function largestComponent(mask: Uint8Array, size: number): number {
  const seen = new Uint8Array(mask.length);
  let largest = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const n of [i - 1, i + 1, i - size, i + size]) {
        const nx = n % size;
        const ny = Math.floor(n / size);
        if (n < 0 || n >= mask.length || Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    largest = Math.max(largest, queue.length);
  }
  return largest;
}
