import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { distanceToMask, MinHeap, smoothstep } from './grid';
import { createRandom, type Random } from './random';
import { LANDSCAPE_SIZE } from './types';

/** Vrstva terénu: výšky, potok a místo pro vesnici. */
export interface Terrain {
  size: number;
  /** Metry nad nejnižším políčkem. */
  heights: Float32Array;
  /** 1 = voda. */
  water: Uint8Array;
  villageSite: { x: number; y: number };
}

// Místo pro vesnici leží 9–11 políček od potoka: mýtina kolem něj dosáhne k vodě,
// ale potok ji nerozdělí napůl.
const SITE_WATER_DISTANCE: readonly [number, number] = [9, 11];
const SITE_AREA_MARGIN = 28;
/** Do tohoto poloměru je terén kolem místa pro vesnici rovný, pak plynule přechází. */
const FLAT_RADIUS = 17;
const BLEND_RADIUS = 33;
/** Svahy údolí kolem potoka stoupají nejvýš o tolik metrů na políčko. */
const VALLEY_SLOPE = 0.9;
/** Největší pokles dna mezi sousedními políčky potoka (schodovitý šikmý úsek má 2 kroky na √2). */
const MAX_BED_DROP = 0.7 * VALLEY_SLOPE;

export function generateTerrain(seed: number, version: 1): Terrain {
  if (version !== 1) throw new RangeError(`Neznámá verze vrstvy terénu: ${String(version)}`);
  const size = LANDSCAPE_SIZE;
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const relief = 16 + random.next() * 14;

  const heights = baseHeights(noise, size, relief);
  const { water, path } = routeStream(heights, size, relief, random);
  const villageSite = chooseVillageSite(heights, water, size, random);
  flattenAround(heights, size, villageSite);
  carveStream(heights, water, path, size, 0.8 + random.next() * 0.6);

  let min = Infinity;
  for (const h of heights) min = Math.min(min, h);
  for (let i = 0; i < heights.length; i++) heights[i] = heights[i]! - min;
  return { size, heights, water, villageSite };
}

/** Vrstvený šum (fBm) škálovaný na převýšení relief. */
function baseHeights(noise: NoiseFunction2D, size: number, relief: number): Float32Array {
  const heights = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1 / 64;
      for (let octave = 0; octave < 4; octave++) {
        value += amplitude * noise(x * frequency, y * frequency);
        amplitude *= 0.4;
        frequency *= 2;
      }
      heights[y * size + x] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  for (let i = 0; i < heights.length; i++)
    heights[i] = ((heights[i]! - min) / (max - min)) * relief;
  return heights;
}

/**
 * Potok jako nejlevnější cesta (Dijkstra, 8 směrů) od jednoho okraje k protilehlému –
 * preferuje nízko položená místa a vyhýbá se stoupání a bočním okrajům mapy.
 */
function routeStream(
  heights: Float32Array,
  size: number,
  relief: number,
  random: Random,
): { water: Uint8Array; path: number[] } {
  const horizontal = random.next() < 0.5;
  const along = Math.floor(size * 0.3 + random.next() * size * 0.4);
  const start = horizontal ? along * size : along;
  const isGoal = (i: number): boolean =>
    horizontal ? i % size === size - 1 : Math.floor(i / size) === size - 1;
  const sideDistance = (i: number): number => {
    const across = horizontal ? Math.floor(i / size) : i % size;
    return Math.min(across, size - 1 - across);
  };

  const cost = new Float64Array(size * size).fill(Infinity);
  const previous = new Int32Array(size * size).fill(-1);
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(start, 0);
  let goal = -1;
  while (heap.size > 0) {
    const i = heap.pop();
    if (isGoal(i)) {
      goal = i;
      break;
    }
    const x = i % size;
    const y = Math.floor(i / size);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        const length = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        const uphill = Math.max(0, heights[n]! - heights[i]!);
        const edgePenalty = Math.max(0, 24 - sideDistance(n)) * 0.25;
        const stepCost = length * (1 + (4 * heights[n]!) / relief + edgePenalty) + 6 * uphill;
        if (cost[i]! + stepCost < cost[n]!) {
          cost[n] = cost[i]! + stepCost;
          previous[n] = i;
          heap.push(n, cost[n]!);
        }
      }
    }
  }

  const water = new Uint8Array(size * size);
  const path: number[] = [];
  const add = (i: number): void => {
    if (water[i]) return;
    water[i] = 1;
    path.push(i);
  };
  for (let i = goal; i !== -1; i = previous[i]!) {
    add(i);
    const p = previous[i]!;
    if (p === -1) continue;
    // Diagonální krok doplníme o nižší z rohových políček – potok je souvislý i po hranách.
    const ix = i % size;
    const iy = Math.floor(i / size);
    const px = p % size;
    const py = Math.floor(p / size);
    if (ix !== px && iy !== py) {
      const a = py * size + ix;
      const b = iy * size + px;
      add(heights[a]! <= heights[b]! ? a : b);
    }
  }
  return { water, path: path.reverse() };
}

/** Nejklidnější místo v přiměřené vzdálenosti od potoka, uprostřed mapy. */
function chooseVillageSite(
  heights: Float32Array,
  water: Uint8Array,
  size: number,
  random: Random,
): { x: number; y: number } {
  const distance = distanceToMask(water, size);
  let best = { x: size / 2, y: size / 2 };
  let bestScore = Infinity;
  for (let y = SITE_AREA_MARGIN; y < size - SITE_AREA_MARGIN; y++) {
    for (let x = SITE_AREA_MARGIN; x < size - SITE_AREA_MARGIN; x++) {
      const d = distance[y * size + x]!;
      if (d < SITE_WATER_DISTANCE[0] || d > SITE_WATER_DISTANCE[1]) continue;
      const score = roughness(heights, size, x, y, 24) + random.next() * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Největší výškový rozdíl vůči středu v okruhu radius (vzorkováno po 3 políčkách). */
function roughness(
  heights: Float32Array,
  size: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  const center = heights[cy * size + cx]!;
  let worst = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(size - 1, cy + radius); y += 3) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(size - 1, cx + radius); x += 3) {
      worst = Math.max(worst, Math.abs(heights[y * size + x]! - center));
    }
  }
  return worst;
}

/** Vyrovná terén kolem místa pro vesnici na průměrnou výšku a plynule ho napojí na okolí. */
function flattenAround(heights: Float32Array, size: number, site: { x: number; y: number }): void {
  let sum = 0;
  let count = 0;
  for (let y = site.y - 6; y <= site.y + 6; y++) {
    for (let x = site.x - 6; x <= site.x + 6; x++) {
      sum += heights[y * size + x]!;
      count++;
    }
  }
  const target = sum / count;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - site.x, y - site.y);
      const weight = smoothstep(1 - (d - FLAT_RADIUS) / (BLEND_RADIUS - FLAT_RADIUS));
      const i = y * size + x;
      heights[i] = heights[i]! * (1 - weight) + target * weight;
    }
  }
}

/**
 * Koryto potoka teče po spádu: dno vede od vyššího konce jako klesající minimum (prořízne
 * sedla), okolní terén se ke korytu svažuje nejvýš o VALLEY_SLOPE na políčko – vzniká údolí.
 */
function carveStream(
  heights: Float32Array,
  water: Uint8Array,
  path: readonly number[],
  size: number,
  depth: number,
): void {
  const downstream = heights[path[0]!]! >= heights[path.at(-1)!]! ? path : [...path].reverse();
  const bed = new Float32Array(size * size);
  let level = Infinity;
  for (const i of downstream) {
    level = Math.min(level, heights[i]! - depth);
    bed[i] = level;
  }
  // Dno nesmí klesat rychleji, než stoupají svahy údolí – jinak by kužel z níže položeného
  // úseku podřízl břeh horního úseku a voda by „visela“ nad svahem. Kde terén spadne
  // prudčeji, prořízne se dno nad ním hlouběji (soutěska).
  for (let k = downstream.length - 2; k >= 0; k--) {
    const i = downstream[k]!;
    bed[i] = Math.min(bed[i]!, bed[downstream[k + 1]!]! + MAX_BED_DROP);
  }

  // Strop údolí = vodní políčka plus vzdálenost po mřížce × VALLEY_SLOPE (Dijkstra z celého
  // koryta). Plocha je spojitá a mezi sousedy nikde nestoupá o víc než VALLEY_SLOPE × délka
  // kroku – bez skoků tam, kde se mění nejbližší úsek potoka.
  const valleyTop = new Float64Array(size * size).fill(Infinity);
  const heap = new MinHeap();
  for (const i of downstream) {
    valleyTop[i] = bed[i]! + depth - VALLEY_SLOPE;
    heap.push(i, valleyTop[i]!);
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const x = i % size;
    const y = Math.floor(i / size);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        const top = valleyTop[i]! + VALLEY_SLOPE * (dx && dy ? Math.SQRT2 : 1);
        if (top < valleyTop[n]!) {
          valleyTop[n] = top;
          heap.push(n, top);
        }
      }
    }
  }
  for (let i = 0; i < heights.length; i++) {
    heights[i] = water[i] ? bed[i]! : Math.min(heights[i]!, valleyTop[i]!);
  }
}
