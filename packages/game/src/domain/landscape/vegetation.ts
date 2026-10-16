import { createNoise2D } from 'simplex-noise';
import { distanceToMask } from './grid';
import { createRandom } from './random';
import type { Terrain } from './terrain';
import { SURFACE_CODES } from './types';

const { water: WATER, forest: FOREST, meadow: MEADOW } = SURFACE_CODES;

/** Podmáčené louky v nivě – do této vzdálenosti od vody (políčka, včetně úhlopříčky). */
const WET_MEADOW_DISTANCE = 1.5;
/** Suché louky na vršcích jen dál od vody – nespojí se s místem pro vesnici. */
const UPLAND_MEADOW_MIN_WATER_DISTANCE = 22;
const MIN_FOREST_PATCH = 4;

/** Vrstva vegetace: les a louky. Terén nemění. */
export function generateVegetation(seed: number, terrain: Terrain, version: 1): Uint8Array {
  if (version !== 1) throw new RangeError(`Neznámá verze vrstvy vegetace: ${String(version)}`);
  const { size, water, villageSite } = terrain;
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const clearingRadius = 14 + random.next() * 3;
  const targetForestShare = 0.58 + random.next() * 0.08;

  const waterDistance = distanceToMask(water, size);
  const surface = new Uint8Array(size * size).fill(FOREST);
  let open = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const siteDistance = Math.hypot(x - villageSite.x, y - villageSite.y);
      const ragged = noise(x / 6, y / 6) * 1.5;
      if (water[i]) surface[i] = WATER;
      else if (siteDistance <= clearingRadius + ragged) surface[i] = MEADOW;
      else if (waterDistance[i]! <= WET_MEADOW_DISTANCE) surface[i] = MEADOW;
      else continue;
      open++;
    }
  }

  // Suché louky: souvislé celky podle šumu, kolik jich je potřeba na cílový podíl lesa.
  const uplandNeeded = Math.max(0, Math.round(size * size * (1 - targetForestShare)) - open);
  const candidates: { index: number; score: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (surface[i] !== FOREST || waterDistance[i]! <= UPLAND_MEADOW_MIN_WATER_DISTANCE) continue;
      if (Math.hypot(x - villageSite.x, y - villageSite.y) <= clearingRadius + 4) continue;
      const score = noise(x / 22 + 100, y / 22) + 0.35 * noise(x / 9 + 200, y / 9);
      candidates.push({ index: i, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const { index } of candidates.slice(0, uplandNeeded)) surface[index] = MEADOW;

  removeSmallForestPatches(surface, size);
  return surface;
}

/** Lesní ostrůvky menší než MIN_FOREST_PATCH políček se stanou loukou. */
function removeSmallForestPatches(surface: Uint8Array, size: number): void {
  const seen = new Uint8Array(surface.length);
  for (let start = 0; start < surface.length; start++) {
    if (surface[start] !== FOREST || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (surface[n] === FOREST && !seen[n]) {
          seen[n] = 1;
          patch.push(n);
        }
      }
    }
    if (patch.length < MIN_FOREST_PATCH) for (const i of patch) surface[i] = MEADOW;
  }
}
