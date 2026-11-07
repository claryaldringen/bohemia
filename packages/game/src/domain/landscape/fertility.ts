import { createNoise2D } from 'simplex-noise';
import { alluvialness, clamp01, heightAboveStream } from './floodplain';
import { distanceToMask, maxStep } from './grid';
import { createRandom } from './random';
import type { Terrain } from './terrain';
import { SURFACE_CODES } from './types';

/** Kolem místa pro vesnici (stejný poloměr jako rovina v terénu) je půda vždy dobrá. */
const SITE_RADIUS = 17;
const SITE_MIN_FERTILITY = 64;

/** Průměrná výška souše terénu (m) – nad ní úrodnost s výškou klesá. */
export function meanLandHeight(terrain: Pick<Terrain, 'heights' | 'water'>): number {
  const { heights, water } = terrain;
  let landSum = 0;
  let landCount = 0;
  for (let i = 0; i < heights.length; i++) {
    if (!water[i]) {
      landSum += heights[i]!;
      landCount++;
    }
  }
  return landSum / landCount;
}

/**
 * Vrstva úrodnosti 0–100: roviny v rozumné vzdálenosti od vody nejlepší, podmáčené a svahy horší.
 * `meanHeight` – průměrná výška souše, nad kterou úrodnost klesá; bez ní z terénu
 * (`meanLandHeight`). Typy reliéfu prémiových krajin dávají průměr průměrné krajiny pokusu, ať
 * hora nezvedne úrodnost zbytku mapy (premium/generate.ts).
 */
export function computeFertility(
  seed: number,
  terrain: Terrain,
  surface: Uint8Array,
  version: 1 | 2,
  meanHeight: number = meanLandHeight(terrain),
): Uint8Array {
  if (version !== 1 && version !== 2) {
    throw new RangeError(`Neznámá verze vrstvy úrodnosti: ${String(version)}`);
  }
  const { size, heights, water, villageSite } = terrain;
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const waterDistance = distanceToMask(water, size);
  const aboveStream = version === 2 ? heightAboveStream(water, heights, size) : null;

  const fertility = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (surface[i] === SURFACE_CODES.water) continue;
      const distance = waterDistance[i]!;
      const step = maxStep(heights, size, x, y);
      let value: number;
      if (aboveStream) {
        // Verze 2: naplaveniny v nivě a roviny u vody přidají.
        value = byWaterDistanceV2(distance);
        if (distance > 2.5) {
          value += ALLUVIAL_BONUS * alluvialness(distance, aboveStream[i]!);
          value +=
            FLAT_NEAR_WATER_BONUS * clamp01(1 - step / 0.6) * clamp01(1 - (distance - 3) / 17);
        }
        value -= step * 22;
      } else {
        value = byWaterDistance(distance);
        value -= step * 22;
      }
      value -= Math.max(0, heights[i]! - meanHeight) * 0.6;
      value += noise(x / 10, y / 10) * 6;
      const nearSite = Math.hypot(x - villageSite.x, y - villageSite.y) <= SITE_RADIUS;
      if (nearSite && distance > 2.5) value = Math.max(value, SITE_MIN_FERTILITY);
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

/**
 * Verze 2: naplavenina těsně u vody je podmáčená, ale ne tak chudá jako ve verzi 1; základ
 * dál od vody je o kus nižší – nejlepší půdu dávají až niva a roviny (bonusy níž).
 */
function byWaterDistanceV2(distance: number): number {
  if (distance <= 1.5) return 38;
  if (distance <= 2.5) return 60;
  if (distance <= 15) return 80;
  if (distance <= 25) return 80 - (distance - 15) * 3;
  return Math.max(30, 50 - (distance - 25) * 0.6);
}

/** Naplaveniny v nivě (verze 2) – úrodnost navíc v plné nivě. */
const ALLUVIAL_BONUS = 10;
/**
 * Rovina u vody (verze 2) – úrodnost navíc: plná na úplné rovině do 3 políček od vody, slábne
 * se sklonem (nulová od 0,6 m na políčko) a se vzdáleností (nulová od 20 políček).
 */
const FLAT_NEAR_WATER_BONUS = 6;
