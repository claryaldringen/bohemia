// Pomocné kontroly prvků prémiových krajin pro testy typů reliéfu a nalezišť – nezávislé na kódu
// průchodů (jen typy a hotová krajina), ať chyba v průchodu neprojde stejnou chybou v kontrole.
import { expect } from 'vitest';
import { NEAR_SITE_RADIUS_CELLS } from '../../band';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { CURRENT_LAYER_VERSIONS, SURFACE_CODES, type Landscape } from '../../types';
import { tileCenterWorld, tileOfWorldPoint } from '../../world';
import { premiumFeaturesOf } from '../generate';
import type { PremiumSite, PremiumSiteKind, PremiumType } from '../types';

/** Přijatá prémiová krajina a průměrná krajina z téhož (přijatého) seedu pokusu. */
export interface Pair {
  readonly premium: Landscape;
  readonly average: Landscape;
}

const pairCache = new Map<string, readonly Pair[]>();

/** Přijaté krajiny typu pro seedy 1…count a průměrné krajiny jejich pokusů. */
export function pairs(type: PremiumType, count: number): readonly Pair[] {
  const key = `${type}|${count}`;
  const cached = pairCache.get(key);
  if (cached) return cached;
  const result = Array.from({ length: count }, (_, i): Pair => {
    const accepted = generateAcceptedLandscape(i + 1, CURRENT_LAYER_VERSIONS, type);
    return {
      premium: accepted.landscape,
      average: generateLandscapeAttempt(accepted.seed, CURRENT_LAYER_VERSIONS),
    };
  });
  pairCache.set(key, result);
  return result;
}

export const village = (l: Landscape): { x: number; z: number } =>
  tileCenterWorld(l, l.villageSite.x, l.villageSite.y);

export const half = (l: Landscape): number => (l.size * l.cellSizeM) / 2;

export function sitesOf(l: Landscape, kind: PremiumSiteKind): readonly PremiumSite[] {
  const features = premiumFeaturesOf(l);
  expect(features).not.toBeNull();
  return features!.sites.filter((s) => s.kind === kind);
}

export function onlySite(l: Landscape, kind: PremiumSiteKind): PremiumSite {
  const sites = sitesOf(l, kind);
  expect(sites, kind).toHaveLength(1);
  return sites[0]!;
}

/** Nejmenší vzdálenost bodu od lomené čáry (m). */
export function lineDistance(
  line: readonly (readonly [number, number])[],
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

/** Strana okraje mapy, na které bod leží (do `tolerance` m), nebo null. */
export function edgeSide(
  l: Landscape,
  [x, z]: readonly [number, number],
  tolerance = 0.01,
): string | null {
  const h = half(l);
  if (Math.abs(x + h) <= tolerance) return 'left';
  if (Math.abs(x - h) <= tolerance) return 'right';
  if (Math.abs(z + h) <= tolerance) return 'top';
  if (Math.abs(z - h) <= tolerance) return 'bottom';
  return null;
}

/** Povrch políčka pod bodem (bod na okraji mapy patří krajnímu políčku). */
export function surfaceAtWorld(l: Landscape, x: number, z: number): number {
  const inner = half(l) - 1e-6;
  const tile = tileOfWorldPoint(
    l,
    Math.min(inner, Math.max(-inner, x)),
    Math.min(inner, Math.max(-inner, z)),
  )!;
  return l.surface[tile.y * l.size + tile.x]!;
}

function count(l: Landscape, test: (i: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < l.surface.length; i++) if (test(i)) n++;
  return n;
}

/** Louka do 600 m od místa vsi (políčka). */
export const nearMeadow = (l: Landscape): number =>
  count(
    l,
    (i) =>
      l.surface[i] === SURFACE_CODES.meadow &&
      Math.hypot((i % l.size) - l.villageSite.x, Math.floor(i / l.size) - l.villageSite.y) <=
        NEAR_SITE_RADIUS_CELLS,
  );

export const forestShare = (l: Landscape): number =>
  count(l, (i) => l.surface[i] === SURFACE_CODES.forest) / l.surface.length;

/** Plocha mnohoúhelníku (m²). */
export function polygonArea(points: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    twice += ax * bz - bx * az;
  }
  return Math.abs(twice) / 2;
}

/** Leží bod uvnitř mnohoúhelníku (sudý–lichý počet průsečíků)? */
export function insidePolygon(
  points: readonly (readonly [number, number])[],
  x: number,
  z: number,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Dojde se z bodu a do bodu b po souši (4-sousedství po políčkách)? */
export function landConnected(
  l: Landscape,
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const from = tileOfWorldPoint(l, a.x, a.z)!;
  const to = tileOfWorldPoint(l, b.x, b.z)!;
  const seen = new Uint8Array(l.size * l.size);
  const start = from.y * l.size + from.x;
  const goal = to.y * l.size + to.x;
  const queue = [start];
  seen[start] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    if (i === goal) return true;
    const x = i % l.size;
    const y = Math.floor(i / l.size);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= l.size || ny >= l.size) continue;
      const n = ny * l.size + nx;
      if (seen[n] || l.surface[n] === SURFACE_CODES.water) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}
