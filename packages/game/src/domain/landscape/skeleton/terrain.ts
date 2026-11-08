import { length2, smoothstep } from '../det-math';
import { distanceToMask } from '../grid';
import { borderDistance, RIVER } from '../premium/river';
import { createRandom, deriveSeed, type Random } from '../random';
import { buildStream, planStream, type ChannelSample } from '../stream';
import { planPromontory, sculptStreamRocks, type PromontoryPlan } from '../stream-rocks';
import {
  carveStream,
  chooseVillageSite,
  flattenAround,
  generateTerrain,
  routeStream,
  siteKeepsWater,
  terrainStart,
  WATER_DEPTH_M,
  type Terrain,
} from '../terrain';
import { LANDSCAPE_SIZE, type StreamPoint } from '../types';
import { portTile } from './ports-map';
import { planRiverCourses } from './river-course';
import { carveRiverCourses } from './rivers';
import { SKELETON_MAP } from './rules-map';
import type { SkeletonSlice } from './types';

// Terén mapy s řekou kostry (world-skeleton.md – Mapa z kostry, „řeka první“): výšky a sesypání
// svahů jako dnes, náklon k výtoku, koryta řek z bodů výřezu, potok mapy jako přítok od okraje do
// řeky (u pramene do počátku řeky), místo pro vesnici dál od řek, koryto potoka a skály u něj.
// Výřez bez řeky (jen stezka) dá terén suché mapy beze změny.

type Cell = { x: number; y: number };

/** Parametry terénu z kostry – prémie na kostře (`premium: 2`) změní nivu řeky nebo brody. */
export interface SkeletonTerrainOptions {
  /** Rovná niva podél vody řeky (políčka); výchozí `RIVER.floodplainCells`. */
  readonly floodplainCells?: number;
  /**
   * Jen jeden brod na každé řece (vyvýšenina nad brodem – stezka kostry pak řeku přejde právě
   * jím); výchozí 1–2 brody.
   */
  readonly singleFord?: boolean;
}

/**
 * Terén mapy z výřezu kostry. Bez řeky ve výřezu terén suché mapy (`generateTerrain`, bit po bitu).
 * S řekou: když trasa řeky nebo potoka nevede, vrátí terén suché mapy bez `rivers` – pokus pak
 * neprojde pásmem (`checkBand` – `skeleton-rivers`).
 */
export function generateSkeletonTerrain(
  seed: number,
  version: 1 | 2,
  slice: SkeletonSlice,
  options: SkeletonTerrainOptions = {},
): Terrain {
  if (version !== 1 && version !== 2) {
    throw new RangeError(`Neznámá verze vrstvy terénu: ${String(version)}`);
  }
  if (slice.rivers.length === 0) return generateTerrain(seed, version);
  return riverTerrain(seed, version, slice, options) ?? generateTerrain(seed, version);
}

function riverTerrain(
  seed: number,
  version: 1 | 2,
  slice: SkeletonSlice,
  options: SkeletonTerrainOptions,
): Terrain | null {
  const size = LANDSCAPE_SIZE;
  const { random, relief, heights } = terrainStart(seed, size);
  tiltTowardOutflow(heights, size, slice);
  const courses = planRiverCourses(
    heights,
    size,
    slice,
    createRandom(deriveSeed(seed, 'skeleton-courses')),
  );
  if (!courses || courses.length === 0) return null;
  const terrain: Terrain = {
    size,
    heights,
    water: new Uint8Array(size * size),
    villageSite: { x: size >> 1, y: size >> 1 },
    stream: [],
  };
  carveRiverCourses(terrain, courses, deriveSeed(seed, 'skeleton-rivers'), {
    floodplainCells: options.floodplainCells ?? RIVER.floodplainCells,
    singleFord: options.singleFord === true,
  });
  const rivers = terrain.rivers!;
  const riverWater = terrain.water;
  const riverDistance = distanceToMask(riverWater, size);

  // Potok mapy – přítok řeky (u pramene počátek řeky).
  const stream = planMapStream(heights, size, relief, slice, rivers, riverDistance, random);
  if (!stream) return null;
  let { samples, water } = stream.built;

  const allowed = villageAllowed(rivers, size);
  const villageSite = chooseVillageSite(heights, water, size, random, allowed);
  if (!allowed[villageSite.y * size + villageSite.x]) return null;
  const rocks = version === 2 ? createRandom(deriveSeed(seed, 'stream-rocks')) : null;
  let promontory: PromontoryPlan | null = null;
  if (rocks) {
    promontory = planPromontory(stream.plan, heights, size, villageSite, rocks);
    const looped = promontory ? buildStream(stream.plan, heights, size, promontory.loop) : null;
    if (
      looped &&
      siteKeepsWater(looped.water, size, villageSite) &&
      clearOfRiver(looped.water, riverDistance)
    ) {
      samples = looped.samples;
      water = looped.water;
    } else {
      promontory = null;
    }
  }
  // Voda potoka nezasáhne do koryta řeky – dno řeky zůstane.
  for (let i = 0; i < water.length; i++) if (riverWater[i]) water[i] = 0;

  flattenAwayFromRiver(heights, size, villageSite, riverDistance);
  const before = rocks ? heights.slice() : null;
  const mouthLevel = levelNear(rivers, samples.at(-1)!);
  const levels = carveStream(
    heights,
    water,
    samples,
    size,
    0.8 + random.next() * 0.6,
    mouthLevel - WATER_DEPTH_M,
  );
  let min = Infinity;
  for (const h of heights) min = Math.min(min, h);
  const allWater = Uint8Array.from(water, (v, i) => v | riverWater[i]!);
  const sculpted =
    rocks && before
      ? sculptStreamRocks(
          heights,
          before,
          allWater,
          samples,
          levels,
          size,
          villageSite,
          promontory,
          rocks,
        )
      : null;

  for (let i = 0; i < heights.length; i++) heights[i] = heights[i]! - min;
  const streamPoints = samples.map((p, k): StreamPoint => {
    const point = {
      x: p.x,
      y: p.y,
      halfWidthLeft: p.left,
      halfWidthRight: p.right,
      level: levels[k]! - min,
      shallow: p.shallow,
    };
    return sculpted
      ? { ...point, bankLeft: sculpted.bankLeft[k]!, bankRight: sculpted.bankRight[k]! }
      : point;
  });
  const shiftedRivers = rivers.map((course) => course.map((p) => ({ ...p, level: p.level - min })));
  return {
    size,
    heights,
    water: allWater,
    villageSite,
    stream: streamPoints,
    ...(sculpted ? { promontories: sculpted.promontories } : {}),
    rivers: shiftedRivers,
  };
}

/**
 * Náklon k výtoku: políčko dostane `tiltM` × podíl vzdálenosti od výtoku k součtu vzdáleností od
 * výtoku a od nejbližšího vtoku – u vtoku celé, u výtoku nic. U pramene roste terén od výtoku dál
 * i za bodem pramene (`tiltM` na `sourceCells`, nejvýš dvojnásobek) – potok mapy k prameni teče
 * z kopce.
 */
function tiltTowardOutflow(heights: Float32Array, size: number, slice: SkeletonSlice): void {
  const out = slice.rivers.find((p) => p.flow === 'out');
  if (!out) return;
  const outTile = portTile(out.side, out.at, size);
  const heads = slice.rivers
    .filter((p) => p.flow === 'in')
    .map((p) => portTile(p.side, p.at, size));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const toOut = length2(x - outTile.x, y - outTile.y);
      let toHead = Infinity;
      for (const h of heads) toHead = Math.min(toHead, length2(x - h.x, y - h.y));
      const share =
        heads.length === 0
          ? Math.min(2, toOut / SKELETON_MAP.sourceCells)
          : toOut / (toOut + toHead);
      heights[y * size + x] = heights[y * size + x]! + SKELETON_MAP.tiltM * share;
    }
  }
}

interface MapStream {
  readonly plan: ReturnType<typeof planStream>;
  readonly built: { samples: ChannelSample[]; water: Uint8Array };
}

/**
 * Potok mapy: od okraje (aspoň `streamMouthPortCells` od bodů řeky i od vody řeky) do řeky – cíl
 * je souš hned u vody řeky, u pramene okolí počátku hlavního toku. Starty se zkouší od nejdál od
 * řeky (s losem); potok musí téct z kopce – start výš než ústí.
 */
function planMapStream(
  heights: Float32Array,
  size: number,
  relief: number,
  slice: SkeletonSlice,
  rivers: readonly (readonly StreamPoint[])[],
  riverDistance: Float32Array,
  random: Random,
): MapStream | null {
  const ports = slice.rivers.map((p) => portTile(p.side, p.at, size));
  const source = slice.rivers.some((p) => p.flow === 'in') ? null : rivers[0]![0]!;
  const minGap = SKELETON_MAP.streamMouthPortCells;
  const candidates: { tile: number; score: number }[] = [];
  const low = 24;
  const high = size - 1 - 24;
  for (const side of ['N', 'E', 'S', 'W'] as const) {
    for (let at = low; at <= high; at++) {
      const t = portTile(side, at, size);
      const tile = t.y * size + t.x;
      const far = ports.every((p) => length2(p.x - t.x, p.y - t.y) >= minGap);
      if (!far || riverDistance[tile]! < minGap) continue;
      candidates.push({ tile, score: riverDistance[tile]! + random.next() * 16 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const gap = RIVER.streamGapCells;
  const isGoal = source
    ? (i: number): boolean =>
        riverDistance[i]! > 0 &&
        length2((i % size) - source.x, Math.floor(i / size) - source.y) <= 2.5
    : (i: number): boolean =>
        riverDistance[i]! > 0 &&
        riverDistance[i]! <= 1 &&
        // Ne do rovného úseku řeky u okraje – potok ústí uvnitř mapy.
        borderDistance(i, size) > SKELETON_MAP.portLeadCells;
  const extraCost = (i: number): number => {
    if (riverDistance[i] === 0) return Infinity;
    if (isGoal(i)) return 0;
    return (1.5 * Math.max(0, 2 * gap - riverDistance[i]!)) / gap + borderCost(i, size);
  };
  for (const { tile } of candidates.slice(0, SKELETON_MAP.streamStartTries)) {
    const path = routeStream(heights, size, relief, random, { start: tile, isGoal, extraCost });
    if (path.length < 2) continue;
    if (heights[path[0]!]! <= heights[path.at(-1)!]!) continue;
    const plan = planStream(path, heights, size, random);
    const built = buildStream(plan, heights, size, null);
    if (!built) continue;
    const first = built.samples[0]!;
    if (borderDistance(Math.round(first.y) * size + Math.round(first.x), size) !== 0) continue;
    return { plan, built };
  }
  return null;
}

/** Potok mimo start nevede podél okraje mapy (jen první políčko trasy leží na okraji). */
function borderCost(i: number, size: number): number {
  return borderDistance(i, size) === 0 ? Infinity : 0;
}

/** Ves aspoň `RIVER.villageMinCells` od každého bodu os řek (s rezervou na zaokrouhlení). */
function villageAllowed(rivers: readonly (readonly StreamPoint[])[], size: number): Uint8Array {
  const axis = new Uint8Array(size * size);
  for (const course of rivers) {
    for (const p of course) axis[Math.round(p.y) * size + Math.round(p.x)] = 1;
  }
  const distance = distanceToMask(axis, size);
  return Uint8Array.from(distance, (d) => (d >= RIVER.villageMinCells + 0.75 ? 1 : 0));
}

/** Voda smyčky potoka zůstane aspoň `streamGapCells` / 3 od vody řeky. */
function clearOfRiver(water: Uint8Array, riverDistance: Float32Array): boolean {
  for (let i = 0; i < water.length; i++) {
    if (water[i] && riverDistance[i]! < RIVER.streamGapCells / 3) return false;
  }
  return true;
}

/** Hladina řeky v bodě osy nejblíž k danému místu (m, stejný základ jako výšky). */
function levelNear(rivers: readonly (readonly StreamPoint[])[], p: Cell): number {
  let best = Infinity;
  let level = 0;
  for (const course of rivers) {
    for (const q of course) {
      const d = length2(q.x - p.x, q.y - p.y);
      if (d < best) {
        best = d;
        level = q.level;
      }
    }
  }
  return level;
}

/**
 * Rovina kolem místa pro vesnici (`flattenAround`) nezmění údolí řeky: u vody řeky nic, plně až
 * od `villageFlattenRiverCells[1]` políček od vody.
 */
function flattenAwayFromRiver(
  heights: Float32Array,
  size: number,
  site: Cell,
  riverDistance: Float32Array,
): void {
  const before = heights.slice();
  flattenAround(heights, size, site);
  const [near, far] = SKELETON_MAP.villageFlattenRiverCells;
  for (let i = 0; i < heights.length; i++) {
    const keep = smoothstep(near, far, riverDistance[i]!);
    heights[i] = before[i]! + (heights[i]! - before[i]!) * keep;
  }
}
