import { createNoise2D } from 'simplex-noise';
import { distanceToMask, maxStep } from './grid';
import { createRandom } from './random';
import type { Terrain } from './terrain';
import { SURFACE_CODES } from './types';

/** Kolem místa pro vesnici (stejný poloměr jako rovina v terénu) je půda vždy dobrá. */
const SITE_RADIUS = 17;
const SITE_MIN_FERTILITY = 64;

/** Vrstva úrodnosti 0–100: roviny v rozumné vzdálenosti od vody nejlepší, podmáčené a svahy horší. */
export function computeFertility(
  seed: number,
  terrain: Terrain,
  surface: Uint8Array,
  version: 1,
): Uint8Array {
  if (version !== 1) throw new RangeError(`Neznámá verze vrstvy úrodnosti: ${String(version)}`);
  const { size, heights, water, villageSite } = terrain;
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const waterDistance = distanceToMask(water, size);

  let landSum = 0;
  let landCount = 0;
  for (let i = 0; i < heights.length; i++) {
    if (!water[i]) {
      landSum += heights[i]!;
      landCount++;
    }
  }
  const meanHeight = landSum / landCount;

  const fertility = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (surface[i] === SURFACE_CODES.water) continue;
      let value = byWaterDistance(waterDistance[i]!);
      value -= maxStep(heights, size, x, y) * 22;
      value -= Math.max(0, heights[i]! - meanHeight) * 0.6;
      value += noise(x / 10, y / 10) * 6;
      const nearSite = Math.hypot(x - villageSite.x, y - villageSite.y) <= SITE_RADIUS;
      if (nearSite && waterDistance[i]! > 2.5) value = Math.max(value, SITE_MIN_FERTILITY);
      fertility[i] = Math.round(Math.min(100, Math.max(0, value)));
    }
  }
  return fertility;
}

/** Podmáčená půda u vody je slabá, optimum 3–15 políček od vody, dál pozvolna klesá. */
function byWaterDistance(distance: number): number {
  if (distance <= 1.5) return 30;
  if (distance <= 2.5) return 58;
  if (distance <= 15) return 85;
  if (distance <= 25) return 85 - (distance - 15) * 3;
  return Math.max(30, 55 - (distance - 25) * 0.6);
}
