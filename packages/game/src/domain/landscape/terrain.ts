import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { distanceToMask, MinHeap, smoothstep } from './grid';
import { createRandom, type Random } from './random';
import { buildStream, heightAt, planStream, SAMPLE_STEP, type ChannelSample } from './stream';
import { deriveSeed } from './random';
import {
  planPromontory,
  sculptStreamRocks,
  type PromontoryOptions,
  type PromontoryPlan,
} from './stream-rocks';
import { LANDSCAPE_SIZE, type Promontory, type StreamPoint } from './types';

/** Vrstva terénu: výšky, potok a místo pro vesnici. */
export interface Terrain {
  size: number;
  /** Metry nad nejnižším políčkem. */
  heights: Float32Array;
  /** 1 = voda. */
  water: Uint8Array;
  villageSite: { x: number; y: number };
  /** Osa potoka po proudu s šířkou břehů a hladinou. */
  stream: StreamPoint[];
  /** Ostrožny (terén 2); terén 1 je nemá. */
  promontories?: Promontory[];
  /** Osa řeky – jen prémiové krajiny s řekou (prémiový průchod terénu, `premium/river.ts`). */
  river?: StreamPoint[];
  /**
   * Osy řek kostry světa (`skeleton/rivers.ts`) – hlavní tok první, pak přítoky. Jen mapy
   * s řekou kostry; čtou se přes `riversOf`.
   */
  rivers?: StreamPoint[][];
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
/** Hloubka vody nad dnem v ose potoka (m) – tůně prohloubí až vykreslení. */
export const WATER_DEPTH_M = 0.6;
/** Terén: vrstvený šum (fBm) – základní vlnová délka (políčka), počet oktáv a jejich útlum. */
const NOISE_BASE_WAVELENGTH = 48;
const NOISE_OCTAVES = 4;
const NOISE_PERSISTENCE = 0.5;
/** Převýšení krajiny (m) – losuje se v tomto rozsahu. */
const RELIEF_RANGE_M: readonly [number, number] = [18, 28];
/** Svahy strmější než tolik metrů na políčko se „sesypou“ – zvlněná krajina bez útesů. */
const MAX_SLOPE_M = 2.4;

/**
 * Parametry terénu prémiového typu (`PremiumPass.terrainOptions`); bez nich terén průměrné
 * krajiny. Mění jen meze, ne náhodu – terén s nimi vychází ze stejných losů.
 */
export interface TerrainOptions {
  /**
   * Ostrožna nad zaříznutým meandrem (terén 2) s jinými rozměry a převýšením okolí – „Přirozená
   * pevnost“ ji chce jistou a velkou.
   */
  readonly promontory?: PromontoryOptions;
}

/**
 * Terén krajiny. Verze 1 se generuje dál bit po bitu stejně; verze 2 (20. 10. 2026) přidá skály
 * u potoka – skalní ostroh v ostrém ohybu, strmý nárazový břeh nebo skalní stěnu na vnější
 * straně oblouků a kde terén dovolí zaříznutý meandr s ostrožnou (`stream-rocks.ts`). Náhoda
 * verze 2 jde z vlastního generátoru – bez ostrožny je osa potoka stejná jako ve verzi 1.
 * Parametry prémiového typu (`options`) mění jen meze ostrožny; bez nich je terén průměrné krajiny.
 */
export function generateTerrain(
  seed: number,
  version: 1 | 2,
  options: TerrainOptions = {},
): Terrain {
  if (version !== 1 && version !== 2) {
    throw new RangeError(`Neznámá verze vrstvy terénu: ${String(version)}`);
  }
  const size = LANDSCAPE_SIZE;
  const { random, relief, heights } = terrainStart(seed, size);
  const path = routeStream(heights, size, relief, random);
  const plan = planStream(path, heights, size, random);
  let { samples, water } = buildStream(plan, heights, size, null)!;
  const villageSite = chooseVillageSite(heights, water, size, random);
  const rocks = version === 2 ? createRandom(deriveSeed(seed, 'stream-rocks')) : null;
  let promontory: PromontoryPlan | null = null;
  if (rocks) {
    promontory = planPromontory(plan, heights, size, villageSite, rocks, options.promontory);
    const looped = promontory ? buildStream(plan, heights, size, promontory.loop) : null;
    if (looped && siteKeepsWater(looped.water, size, villageSite)) {
      samples = looped.samples;
      water = looped.water;
    } else {
      promontory = null;
    }
  }
  flattenAround(heights, size, villageSite);
  const before = rocks ? heights.slice() : null;
  const levels = carveStream(heights, water, samples, size, 0.8 + random.next() * 0.6);
  // Nejnižší políčko před skalami – skály terén jen zvedají, výšky a hladina zůstanou jako v terénu 1.
  let min = Infinity;
  for (const h of heights) min = Math.min(min, h);
  const sculpted =
    rocks && before
      ? sculptStreamRocks(
          heights,
          before,
          water,
          samples,
          levels,
          size,
          villageSite,
          promontory,
          rocks,
        )
      : null;

  for (let i = 0; i < heights.length; i++) heights[i] = heights[i]! - min;
  const stream = samples.map((p, k): StreamPoint => {
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
  return sculpted
    ? { size, heights, water, villageSite, stream, promontories: sculpted.promontories }
    : { size, heights, water, villageSite, stream };
}

/**
 * Začátek terénu ze seedu – náhoda, převýšení a výšky po sesypání svahů (`generateTerrain`,
 * terén mapy z kostry). Losy jdou ve stejném pořadí jako dřív.
 */
export function terrainStart(
  seed: number,
  size: number,
): { random: Random; relief: number; heights: Float32Array } {
  const random = createRandom(seed);
  const noise = createNoise2D(() => random.next());
  const relief = RELIEF_RANGE_M[0] + random.next() * (RELIEF_RANGE_M[1] - RELIEF_RANGE_M[0]);
  const heights = baseHeights(noise, size, relief);
  relaxSlopes(heights, size);
  return { random, relief, heights };
}

/** Místo pro vesnici zůstane po vložení smyčky ve stejné vzdálenosti od vody jako při výběru. */
export function siteKeepsWater(
  water: Uint8Array,
  size: number,
  site: { x: number; y: number },
): boolean {
  const d = distanceToMask(water, size)[site.y * size + site.x]!;
  return d >= SITE_WATER_DISTANCE[0] && d <= SITE_WATER_DISTANCE[1];
}

/** Vrstvený šum (fBm) škálovaný na převýšení relief. */
export function baseHeights(noise: NoiseFunction2D, size: number, relief: number): Float32Array {
  const heights = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1 / NOISE_BASE_WAVELENGTH;
      for (let octave = 0; octave < NOISE_OCTAVES; octave++) {
        value += amplitude * noise(x * frequency, y * frequency);
        amplitude *= NOISE_PERSISTENCE;
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
 * Termální eroze: kde se sousední políčka liší víc než MAX_SLOPE_M, přesune se materiál
 * z vyššího na nižší, dokud svahy nejsou dost mírné. Zvlnění ve středních měřítkách zůstane.
 */
export function relaxSlopes(heights: Float32Array, size: number): void {
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        for (const n of [x < size - 1 ? i + 1 : -1, y < size - 1 ? i + size : -1]) {
          if (n < 0) continue;
          const difference = heights[i]! - heights[n]!;
          const excess = Math.abs(difference) - MAX_SLOPE_M;
          if (excess <= 0) continue;
          // O něco víc než polovinu přebytku – svah se ustálí kousek pod limitem.
          const shift = (excess / 2 + 0.01) * Math.sign(difference);
          heights[i] = heights[i]! - shift;
          heights[n] = heights[n]! + shift;
          moved = true;
        }
      }
    }
    if (!moved) return;
  }
}

/**
 * Cíl trasy potoka na mapě z kostry (`skeleton/terrain.ts`): start na okraji, cíl (břeh řeky
 * nebo pramen) a přirážka kroku (`Infinity` = tudy nejde). Okraje mapy zdražují všechny strany.
 */
export interface StreamGoal {
  readonly start: number;
  readonly isGoal: (i: number) => boolean;
  readonly extraCost: (i: number) => number;
}

/**
 * Trasa potoka jako nejlevnější cesta (Dijkstra, 8 směrů) od jednoho okraje k protilehlému –
 * preferuje nízko položená místa a vyhýbá se stoupání a bočním okrajům mapy. Tvar koryta
 * (meandry, šířka, tůně) z ní udělají planStream a buildStream. S cílem `goal` (mapa z kostry) vede od jeho
 * startu k jeho cíli bez losů; [] = cíl nedosažitelný.
 */
export function routeStream(
  heights: Float32Array,
  size: number,
  relief: number,
  random: Random,
  goal?: StreamGoal,
): number[] {
  let start: number;
  let isGoal: (i: number) => boolean;
  let sideDistance: (i: number) => number;
  if (goal) {
    start = goal.start;
    isGoal = goal.isGoal;
    sideDistance = (i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      return Math.min(x, y, size - 1 - x, size - 1 - y);
    };
  } else {
    const horizontal = random.next() < 0.5;
    const along = Math.floor(size * 0.3 + random.next() * size * 0.4);
    start = horizontal ? along * size : along;
    isGoal = (i) => (horizontal ? i % size === size - 1 : Math.floor(i / size) === size - 1);
    sideDistance = (i) => {
      const across = horizontal ? Math.floor(i / size) : i % size;
      return Math.min(across, size - 1 - across);
    };
  }

  const cost = new Float64Array(size * size).fill(Infinity);
  const previous = new Int32Array(size * size).fill(-1);
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(start, 0);
  let found = -1;
  while (heap.size > 0) {
    const i = heap.pop();
    if (isGoal(i)) {
      found = i;
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
        const extra = goal ? goal.extraCost(n) : 0;
        if (extra === Infinity) continue;
        const stepCost =
          length * (1 + (4 * heights[n]!) / relief + edgePenalty + extra) + 6 * uphill;
        if (cost[i]! + stepCost < cost[n]!) {
          cost[n] = cost[i]! + stepCost;
          previous[n] = i;
          heap.push(n, cost[n]!);
        }
      }
    }
  }

  if (found === -1) return [];
  const path: number[] = [];
  for (let i = found; i !== -1; i = previous[i]!) path.push(i);
  return path.reverse();
}

/**
 * Nejklidnější místo v přiměřené vzdálenosti od potoka, uprostřed mapy. `allowed` (mapa z kostry –
 * dál od řek) vyloučí políčka s 0; los se u nich nespotřebuje.
 */
export function chooseVillageSite(
  heights: Float32Array,
  water: Uint8Array,
  size: number,
  random: Random,
  allowed?: Uint8Array,
): { x: number; y: number } {
  const distance = distanceToMask(water, size);
  let best = { x: size / 2, y: size / 2 };
  let bestScore = Infinity;
  for (let y = SITE_AREA_MARGIN; y < size - SITE_AREA_MARGIN; y++) {
    for (let x = SITE_AREA_MARGIN; x < size - SITE_AREA_MARGIN; x++) {
      const d = distance[y * size + x]!;
      if (d < SITE_WATER_DISTANCE[0] || d > SITE_WATER_DISTANCE[1]) continue;
      if (allowed && !allowed[y * size + x]) continue;
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
export function flattenAround(
  heights: Float32Array,
  size: number,
  site: { x: number; y: number },
): void {
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
 * Koryto potoka teče po spádu: dno podél osy vede od pramene jako klesající minimum terénu
 * (prořízne sedla), vodní políčko dostane dno nejbližšího bodu osy a okolní terén se ke korytu
 * svažuje nejvýš o VALLEY_SLOPE na políčko – vzniká údolí s nivou kolem meandrů. Vrací hladinu
 * v každém bodě osy. `bedFloor` (mapa z kostry – ústí do řeky) je nejnižší dno potoka.
 */
export function carveStream(
  heights: Float32Array,
  water: Uint8Array,
  samples: readonly ChannelSample[],
  size: number,
  depth: number,
  bedFloor = -Infinity,
): number[] {
  const bed: number[] = [];
  let level = Infinity;
  for (const p of samples) {
    // Dno pod nejnižším terénem v okolí – meandr vybočený na svah nesmí viset nad nivou.
    level = Math.min(
      level,
      lowestAround(heights, size, p, Math.max(p.left, p.right) + 1.5) - depth,
    );
    bed.push(Math.max(level, bedFloor));
  }
  // Dno nesmí klesat rychleji, než stoupají svahy údolí – jinak by kužel z níže položeného
  // úseku podřízl břeh horního úseku a voda by „visela“ nad svahem. Kde terén spadne
  // prudčeji, prořízne se dno nad ním hlouběji (soutěska).
  for (let k = bed.length - 2; k >= 0; k--) {
    bed[k] = Math.min(bed[k]!, bed[k + 1]! + MAX_BED_DROP * SAMPLE_STEP);
  }

  // Vodní políčko: dno nejbližšího bodu osy.
  const tileBed = new Float32Array(size * size).fill(Infinity);
  const nearest = new Float32Array(size * size).fill(Infinity);
  samples.forEach((p, k) => {
    const reach = Math.ceil(Math.max(p.left, p.right)) + 2;
    for (
      let y = Math.max(0, Math.floor(p.y) - reach);
      y <= Math.min(size - 1, Math.ceil(p.y) + reach);
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(p.x) - reach);
        x <= Math.min(size - 1, Math.ceil(p.x) + reach);
        x++
      ) {
        const i = y * size + x;
        const d = Math.hypot(x - p.x, y - p.y);
        if (!water[i] || d >= nearest[i]!) continue;
        nearest[i] = d;
        tileBed[i] = bed[k]!;
      }
    }
  });
  enforceDownhill(tileBed, water, size);

  // Strop údolí = vodní políčka plus vzdálenost po mřížce × VALLEY_SLOPE (Dijkstra z celého
  // koryta). Plocha je spojitá a mezi sousedy nikde nestoupá o víc než VALLEY_SLOPE × délka
  // kroku – bez skoků tam, kde se mění nejbližší úsek potoka.
  const valleyTop = new Float64Array(size * size).fill(Infinity);
  const heap = new MinHeap();
  for (let i = 0; i < water.length; i++) {
    if (!water[i]) continue;
    valleyTop[i] = tileBed[i]! + depth - VALLEY_SLOPE;
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
    heights[i] = water[i] ? tileBed[i]! : Math.min(heights[i]!, valleyTop[i]!);
  }
  return bed.map((b) => b + WATER_DEPTH_M);
}

/** Nejnižší výška políček v kruhu o poloměru radius (políčka) kolem bodu. */
function lowestAround(
  heights: Float32Array,
  size: number,
  p: { x: number; y: number },
  radius: number,
): number {
  let lowest = heightAt(heights, size, p);
  for (
    let y = Math.max(0, Math.floor(p.y - radius));
    y <= Math.min(size - 1, Math.ceil(p.y + radius));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(p.x - radius));
      x <= Math.min(size - 1, Math.ceil(p.x + radius));
      x++
    ) {
      if (Math.hypot(x - p.x, y - p.y) <= radius) lowest = Math.min(lowest, heights[y * size + x]!);
    }
  }
  return lowest;
}

/**
 * Voda teče z kopce i ve tvaru po políčkách: od nejvyššího vodního políčka na okraji mapy
 * (pramen) nemá žádné políčko dno výš než sousední políčko blíž prameni. U širokých úseků
 * a v obloucích by jinak „nejbližší bod osy“ mohl dát o kousek výš i políčku níž po proudu.
 */
function enforceDownhill(tileBed: Float32Array, water: Uint8Array, size: number): void {
  let source = -1;
  for (let i = 0; i < water.length; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (water[i] && onEdge && (source === -1 || tileBed[i]! > tileBed[source]!)) source = i;
  }
  if (source === -1) return;
  const hops = new Int32Array(water.length).fill(-1);
  hops[source] = 0;
  const queue = [source];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    const x = i % size;
    const y = Math.floor(i / size);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!water[n]) continue;
        if (hops[n] === -1) {
          hops[n] = hops[i]! + 1;
          queue.push(n);
        }
        // Políčko o krok dál od pramene nesmí být výš než kterýkoli soused blíž prameni.
        if (hops[n] === hops[i]! + 1) tileBed[n] = Math.min(tileBed[n]!, tileBed[i]! - 1e-4);
      }
    }
  }
}
