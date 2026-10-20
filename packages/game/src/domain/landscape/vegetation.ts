import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { NEAR_SITE_RADIUS_CELLS } from './band';
import { alluvialness, clamp01, heightAboveStream } from './floodplain';
import { distanceToMask, maxStep } from './grid';
import { removeSmallForestPatches, removeSmallMeadowPatches } from './patches';
import { createRandom } from './random';
import type { Terrain } from './terrain';
import { SURFACE_CODES } from './types';

const { water: WATER, forest: FOREST, meadow: MEADOW } = SURFACE_CODES;

/** Podmáčené louky v nivě – do této vzdálenosti od vody (políčka, včetně úhlopříčky). */
const WET_MEADOW_DISTANCE = 1.5;
/** Suché louky na vršcích jen dál od vody – nespojí se s místem pro vesnici. */
const UPLAND_MEADOW_MIN_WATER_DISTANCE = 22;

/**
 * Verze 2 (18. 10. 2026, Martin – víc kvalitní louky): do 600 m od místa pro vesnici (dosah
 * polí) leží 58–62 ha louky, hlavně lužní louky v nivě potoka a roviny u vody.
 */
const NEAR_MEADOW_CELLS: readonly [number, number] = [2600, 2750];
/** Louky kolem vsi se rozbíhají i kousek za 600 m (podél potoka), ale ne dál než sem. */
const NEAR_MEADOW_REACH_CELLS = 52;
/** Lužní louka podél potoka, kde niva × šum (0–1) přesáhne tuto mez. */
const STREAM_MEADOW_THRESHOLD = 0.62;
/** Suché louky na vršcích až za loukami vsi – ty se počítají do cíle zvlášť. */
const UPLAND_MIN_SITE_DISTANCE_V2 = NEAR_SITE_RADIUS_CELLS + 4;

/** Vrstva vegetace: les a louky. Terén nemění. */
export function generateVegetation(seed: number, terrain: Terrain, version: 1 | 2): Uint8Array {
  if (version === 1) return vegetationV1(seed, terrain);
  if (version === 2) return vegetationV2(seed, terrain);
  throw new RangeError(`Neznámá verze vrstvy vegetace: ${String(version)}`);
}

/** Verze 1 (16. 10. 2026) – po ostrém spuštění se nesmí změnit (krajiny uložených sídel). */
function vegetationV1(seed: number, terrain: Terrain): Uint8Array {
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

/**
 * Verze 2: kolem vsi se louky rozšíří do nivy potoka a na roviny u vody, dokud jich do 600 m
 * není cílový počet; suché louky na vršcích doplní podíl lesa až za nimi. Les zůstane
 * na svazích údolí, na vršcích a dál od vsi.
 */
function vegetationV2(seed: number, terrain: Terrain): Uint8Array {
  const { size, water, heights, villageSite } = terrain;
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const clearingRadius = 14 + random.next() * 3;
  const targetForestShare = 0.58 + random.next() * 0.08;
  const nearTarget = Math.round(
    NEAR_MEADOW_CELLS[0] + random.next() * (NEAR_MEADOW_CELLS[1] - NEAR_MEADOW_CELLS[0]),
  );

  const waterDistance = distanceToMask(water, size);
  const aboveStream = heightAboveStream(water, heights, size);
  const siteDistance = (x: number, y: number): number =>
    Math.hypot(x - villageSite.x, y - villageSite.y);
  const surface = new Uint8Array(size * size).fill(FOREST);
  let open = 0;
  let near = 0;
  const openCell = (i: number): void => {
    surface[i] = MEADOW;
    open++;
    if (siteDistance(i % size, Math.floor(i / size)) <= NEAR_SITE_RADIUS_CELLS) near++;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const ragged = noise(x / 6, y / 6) * 1.5;
      if (water[i]) {
        surface[i] = WATER;
        open++;
      } else if (siteDistance(x, y) <= clearingRadius + ragged) openCell(i);
      else if (waterDistance[i]! <= WET_MEADOW_DISTANCE) openCell(i);
      // Lužní louky podél celého potoka – úseky volné nivy střídají úseky, kde les sahá k vodě.
      else if (
        alluvialness(waterDistance[i]!, aboveStream[i]!) *
          (0.5 + 0.5 * noise(x / 12 + 500, y / 12)) >
        STREAM_MEADOW_THRESHOLD
      )
        openCell(i);
    }
  }

  // Louky vsi: nejvhodnější políčka (niva, rovina, blízko vody a vsi) se zvlněnými okraji
  // podle šumu, dokud jich do 600 m od vsi není cílový počet.
  const nearCandidates: { index: number; score: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const d = siteDistance(x, y);
      if (surface[i] !== FOREST || d > NEAR_MEADOW_REACH_CELLS) continue;
      nearCandidates.push({
        index: i,
        score: nearMeadowScore(noise, x, y, {
          waterDistance: waterDistance[i]!,
          aboveStream: aboveStream[i]!,
          step: maxStep(heights, size, x, y),
          siteDistance: d,
        }),
      });
    }
  }
  nearCandidates.sort((a, b) => b.score - a.score);
  for (const { index } of nearCandidates) {
    if (near >= nearTarget) break;
    openCell(index);
  }

  // Suché louky: souvislé celky podle šumu za loukami vsi, kolik jich je potřeba na cílový
  // podíl lesa.
  const uplandNeeded = Math.max(0, Math.round(size * size * (1 - targetForestShare)) - open);
  const candidates: { index: number; score: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (surface[i] !== FOREST || waterDistance[i]! <= UPLAND_MEADOW_MIN_WATER_DISTANCE) continue;
      if (siteDistance(x, y) <= UPLAND_MIN_SITE_DISTANCE_V2) continue;
      // Delší vlna než ve verzi 1 – suchých luk je méně, ať jsou to celky, ne roztroušené skvrny.
      const score = noise(x / 30 + 100, y / 30) + 0.35 * noise(x / 11 + 200, y / 11);
      candidates.push({ index: i, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const { index } of candidates.slice(0, uplandNeeded)) surface[index] = MEADOW;

  removeSmallMeadowPatches(surface, size);
  removeSmallForestPatches(surface, size);
  return surface;
}

interface NearCell {
  waterDistance: number;
  aboveStream: number;
  /** Největší výškový rozdíl vůči sousedům (m). */
  step: number;
  siteDistance: number;
}

/**
 * Vhodnost políčka pro louku vsi: niva (nízko nad potokem u vody), rovina, blízkost vody,
 * blízkost vsi a šum ve dvou měřítkách – okraje luk se vlní a v loukách zůstanou háje.
 */
function nearMeadowScore(noise: NoiseFunction2D, x: number, y: number, cell: NearCell): number {
  const alluvial = alluvialness(cell.waterDistance, cell.aboveStream);
  const flat = clamp01(1 - cell.step / 1.0);
  const nearWater = clamp01(1 - (cell.waterDistance - 2) / 14);
  const far = Math.max(0, cell.siteDistance - 28) / 14;
  return (
    0.9 * alluvial +
    1.0 * nearWater +
    0.35 * flat -
    far +
    0.55 * noise(x / 14 + 300, y / 14) +
    0.35 * noise(x / 7 + 400, y / 7)
  );
}
