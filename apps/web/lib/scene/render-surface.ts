import type { Landscape } from '@bohemia/game';
import { streamCenterline, type StreamCenterline } from './stream-geometry';
import { tileCenter } from './tile-at';

/** Body sítě na stranu políčka – terén je ve scéně hladší a koryto může být užší než políčko. */
export const RENDER_SUBDIVISION = 4;
/** Polovina šířky hladiny potoka (m). */
export const CHANNEL_HALF_WIDTH_M = 7;
/** Nejhlubší místo koryta pod hladinou (m). */
const CHANNEL_DEPTH_M = 1.1;
/** Břeh: nejdřív sotva nad hladinou, pak stoupá nejvýš tímto sklonem (m/m), než naváže na terén. */
const BANK_MIN_SLOPE = 0.02;
const BANK_MAX_SLOPE = 0.12;
/** Do této vzdálenosti od osy se terén upravuje a nese hladinu (m). */
const CHANNEL_REACH_M = 45;

/** Výšková síť pro vykreslení (jen vzhled – herní data krajiny se nemění). */
export interface RenderSurface {
  /** Počet bodů na stranu: (políčka − 1) × RENDER_SUBDIVISION + 1, od středu krajního políčka. */
  resolution: number;
  /** Výška terénu v bodě (m, bez převýšení). */
  heights: Float32Array;
  /** Hladina potoka v bodě (m), nebo −Infinity daleko od potoka. */
  waterLevel: Float32Array;
  stream: StreamCenterline;
  /** Světové souřadnice bodu sítě. */
  position(v: number): { x: number; z: number };
  /** Výška terénu (m) kdekoli – bilineárně mezi body sítě. */
  heightAt(x: number, z: number): number;
}

export function buildRenderSurface(l: Landscape): RenderSurface {
  const resolution = (l.size - 1) * RENDER_SUBDIVISION + 1;
  const step = l.cellSizeM / RENDER_SUBDIVISION;
  const origin = tileCenter(l, 0, 0);
  const stream = streamCenterline(l);
  const heights = new Float32Array(resolution * resolution);
  const waterLevel = new Float32Array(resolution * resolution).fill(-Infinity);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const v = j * resolution + i;
      const base = bicubicHeight(l, i / RENDER_SUBDIVISION, j / RENDER_SUBDIVISION);
      const x = origin.worldX + i * step;
      const z = origin.worldZ + j * step;
      const near = stream.nearest(x, z, CHANNEL_REACH_M);
      if (!Number.isFinite(near.distance)) {
        heights[v] = base;
        continue;
      }
      waterLevel[v] = near.level;
      heights[v] = channelHeight(base, near.distance, near.level);
    }
  }

  const position = (v: number): { x: number; z: number } => ({
    x: origin.worldX + (v % resolution) * step,
    z: origin.worldZ + Math.floor(v / resolution) * step,
  });
  const heightAt = (x: number, z: number): number => {
    const fi = Math.min(resolution - 1, Math.max(0, (x - origin.worldX) / step));
    const fj = Math.min(resolution - 1, Math.max(0, (z - origin.worldZ) / step));
    const i0 = Math.min(resolution - 2, Math.floor(fi));
    const j0 = Math.min(resolution - 2, Math.floor(fj));
    const ti = fi - i0;
    const tj = fj - j0;
    const h = (i: number, j: number): number => heights[j * resolution + i]!;
    const top = h(i0, j0) + (h(i0 + 1, j0) - h(i0, j0)) * ti;
    const bottom = h(i0, j0 + 1) + (h(i0 + 1, j0 + 1) - h(i0, j0 + 1)) * ti;
    return top + (bottom - top) * tj;
  };
  return { resolution, heights, waterLevel, stream, position, heightAt };
}

/**
 * Profil koryta: uvnitř parabolické dno pod hladinou, na břehu terén mezi „sotva nad hladinou“
 * a „mírný svah“ – zasype schodovité zbytky koryta z mřížky políček a nevytvoří útes.
 */
function channelHeight(base: number, distance: number, level: number): number {
  if (distance < CHANNEL_HALF_WIDTH_M) {
    const t = distance / CHANNEL_HALF_WIDTH_M;
    return level - CHANNEL_DEPTH_M * (1 - t * t);
  }
  const beyond = distance - CHANNEL_HALF_WIDTH_M;
  const lowest = level + 0.05 + beyond * BANK_MIN_SLOPE;
  const highest = level + 0.3 + beyond * BANK_MAX_SLOPE;
  return Math.min(Math.max(base, lowest), highest);
}

/** Catmull-Rom interpolace výšek středů políček – hladká a ve středech políček přesná. */
function bicubicHeight(l: Landscape, u: number, v: number): number {
  const x1 = Math.floor(u);
  const y1 = Math.floor(v);
  const tx = u - x1;
  const ty = v - y1;
  const h = (x: number, y: number): number => {
    const cx = Math.min(l.size - 1, Math.max(0, x));
    const cy = Math.min(l.size - 1, Math.max(0, y));
    return l.heights[cy * l.size + cx]!;
  };
  const row = (y: number): number =>
    catmullRom(h(x1 - 1, y), h(x1, y), h(x1 + 1, y), h(x1 + 2, y), tx);
  return catmullRom(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
