import { detCos, detSin, length2, smoothstep } from '../det-math';
import { distanceToMask, MinHeap } from '../grid';
import { createRandom, type Random } from '../random';
import {
  arcLengths,
  heightAt,
  rasterize,
  SAMPLE_STEP,
  smoothPolyline,
  type ChannelSample,
} from '../stream';
import type { Terrain } from '../terrain';
import { CELL_SIZE_M, type Promontory, type StreamPoint } from '../types';

// Řeka prémiových krajin (premium-landscapes.md – Typy krajin, Kostra světa): splavná řeka,
// vyvýšenina nad brodem a soutok. Řeka je nový tok vedle potoka – sdílená mřížka světa zatím
// není, proto vstupuje a vystupuje na náhodných okrajích (vývojová verze). Terén řeky počítá jen
// server při generování (výšky, voda a osa řeky jdou do prohlížeče hotové). Soubor hlídá ESLint
// jako deterministickou vrstvu (jen det-math), ale pomocné funkce osy potoka ze `stream.ts`
// (`arcLengths`, `smoothPolyline`, `rasterize`) používají `Math.hypot` – smí, protože je volá
// jen server při generování terénu. Čísla jsou návrh Clauda, doladí je kalibrace.

/** Řeka (spec: širší a hlubší než potok, brody jen na 1–2 místech). */
export const RIVER = {
  /**
   * Šířka vody mezi břehy (m): aspoň `streamFactor` × medián šířky potoka téže mapy, nikdy pod
   * `minM` ani nad `maxM` (ani v brodu); v tomto rozsahu ji určí seed řeky a podél toku se mění.
   */
  width: { streamFactor: 1.5, minM: 25, maxM: 45 },
  /** Počet brodů. */
  fords: [1, 2],
  /**
   * V brodu je řeka širší (násobek šířky, nejvýš `width.maxM`), mělký úsek ± tolik políček podél
   * toku.
   */
  fordWiden: 1.4,
  fordHalfCells: 1.5,
  /** Brody leží v této části délky toku, dva brody aspoň `fordSpacing` délky od sebe. */
  fordSpan: [0.2, 0.8],
  fordSpacing: 0.3,
  /** Osa řeky nejblíž k místu pro vesnici (políčka) – louky a les vsi zůstanou. */
  villageMinCells: 20,
  /** Od vody potoka (políčka) – řeka vede vlastním údolím a s potokem se nespojí. */
  streamGapCells: 9,
  /** Konce řeky aspoň takový podíl strany mapy od sebe. */
  minSpan: 0.6,
  /** Hladina nad dnem (m) – řeka je hlubší než potok (0,6 m). */
  depthM: 1.2,
  /** Meandry: dlouhá a krátká vlna (políčka), podíl krátké vlny, amplituda (políčka). */
  wave: [28, 40],
  shortWave: [11, 15],
  shortShare: 0.3,
  amplitude: [1.5, 3],
  /** Údolí: rovná niva podél vody (políčka) a její výška nad hladinou (m), dál svah jako potok. */
  floodplainCells: 2,
  floodplainM: 0.4,
  valleySlope: 0.9,
  /** Údolí ani ostrožna nezmění rovinu kolem místa pro vesnici (políčka), plně od druhé meze. */
  villageKeep: [17, 27],
  /** Přístaviště na břehu tolik metrů od okraje vody. */
  portBankM: 6,
} as const;

/** Splavná řeka má širší rovnou nivu (přístaviště, louky). */
export const NAVIGABLE_FLOODPLAIN_CELLS = 4;

/**
 * Ostrožna nad brodem a nad soutokem: plocha nahoře (elipsa – poloosa podél ostrožny a napříč,
 * políčka), šíje a hřbet do vnitrozemí, svahy (m na políčko) a výška nad hladinou (m).
 */
export const SPUR = {
  halfLength: 3,
  halfWidth: 2.2,
  neckHalfWidth: 1.1,
  ridgeLength: 3,
  fallM: 3.5,
  ridgeFallM: 1.2,
  /** Plocha ostrožny začíná tolik políček za okrajem vody (svah ke břehu). */
  bankGap: 1.2,
} as const;

/** Vyvýšenina nad brodem: aspoň 15 m nad hladinou brodu, kus od brodu podél řeky. */
export const FORD_HILL = {
  heightM: [16, 20],
  /** Střed ostrožny podél řeky od brodu (políčka) – stezka jde z brodu kolem ní. */
  alongCells: 7,
} as const;

/** Soutok: ostrožna mezi řekou a potokem nad soutokem, soutok za vsí (po proudu). */
export const CONFLUENCE = {
  heightM: [10, 14],
  /** Rameno řeky přitéká k potoku pod úhlem (stupně od směru proti proudu potoka). */
  angleDeg: [25, 80],
  /** Ústí ramene – v tomto okolí soutoku se řeka k potoku smí přiblížit (políčka). */
  funnelCells: 16,
  /** Délka ramene řeky aspoň (políčka). */
  minBranchCells: 25,
} as const;

/**
 * Trasa řeky: přirážka za blízkost okraje mapy (pás políček a cena na políčko pásu) a přitažení
 * ke vsi – dál než `drawFromCells` od vsi je krok dražší o 1 na `drawCells`, nejvýš `drawMax` ×.
 */
const RIVER_ROUTE = {
  edgeCells: 14,
  edgeCost: 0.4,
  drawFromCells: RIVER.villageMinCells + 10,
  drawCells: 15,
  drawMax: 3,
} as const;

const M = { maxBedDrop: 0.7 * RIVER.valleySlope, mapMargin: 4 } as const;

/**
 * Meandr smí od trasy do zakázaného okolí (ves, potok) nejvýš o tolik políček minus poloviční
 * šířka řeky – břeh pak zůstane, kde dovolí kontrola vodních políček (`riverWaterOk`).
 */
const MEANDER_SLACK_CELLS = 2.7;

type Cell = { x: number; y: number };

// ── Pomocné ──────────────────────────────────────────────────────────────────────────────────

function range(random: Random, [min, max]: readonly [number, number]): number {
  return min + random.next() * (max - min);
}

function cellDistance(a: Cell, b: Cell): number {
  return length2(a.x - b.x, a.y - b.y);
}

function clampCell(v: number, size: number): number {
  return Math.min(size - 1, Math.max(0, Math.round(v)));
}

function cellIndex(p: Cell, size: number): number {
  return clampCell(p.y, size) * size + clampCell(p.x, size);
}

/** Strany okraje mapy, na kterých políčko leží (bity: 1 nahoře, 2 dole, 4 vlevo, 8 vpravo). */
function borderSides(i: number, size: number): number {
  const x = i % size;
  const y = Math.floor(i / size);
  return (
    (y === 0 ? 1 : 0) | (y === size - 1 ? 2 : 0) | (x === 0 ? 4 : 0) | (x === size - 1 ? 8 : 0)
  );
}

function borderDistance(i: number, size: number): number {
  const x = i % size;
  const y = Math.floor(i / size);
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

/**
 * Trasa toku se drží dál od okraje mapy (od okraje odbočí, ne aby vedla podél něj) – přirážka
 * k ceně kroku v pásu `RIVER_ROUTE.edgeCells` u okraje.
 */
function edgePenalty(i: number, size: number): number {
  return Math.max(0, RIVER_ROUTE.edgeCells - borderDistance(i, size)) * RIVER_ROUTE.edgeCost;
}

/**
 * Řeka vede kolem vsi, ne daleko u okraje mapy: krok dál než `drawFromCells` od vsi je dražší
 * (nejvýš `drawMax` ×) – přístaviště a brod jsou pak ze vsi na dosah.
 */
function villageDraw(i: number, size: number, village: Cell): number {
  const d = length2((i % size) - village.x, Math.floor(i / size) - village.y);
  return Math.min(
    RIVER_ROUTE.drawMax,
    1 + Math.max(0, d - RIVER_ROUTE.drawFromCells) / RIVER_ROUTE.drawCells,
  );
}

/** Políčka souše dosažitelná z bodu po souši (4-sousedství) – strana vody s tímto bodem. */
export function landRegion(water: Uint8Array, size: number, from: Cell): Uint8Array {
  const region = new Uint8Array(size * size);
  const start = cellIndex(from, size);
  if (water[start]) return region;
  const queue = [start];
  region[start] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    const x = i % size;
    const y = Math.floor(i / size);
    if (x > 0) visit(i - 1);
    if (x < size - 1) visit(i + 1);
    if (y > 0) visit(i - size);
    if (y < size - 1) visit(i + size);
  }
  return region;

  function visit(n: number): void {
    if (region[n] || water[n]) return;
    region[n] = 1;
    queue.push(n);
  }
}

/**
 * Nejlevnější cesta po políčkách (Dijkstra, 8 směrů) z některého startu k prvnímu cíli. Cena
 * kroku Infinity = tudy nejde. Vrací políčka od startu k cíli, nebo null.
 */
export function cheapestPath(
  size: number,
  starts: readonly number[],
  stepCost: (from: number, to: number, length: number) => number,
  isGoal: (i: number) => boolean,
): number[] | null {
  const cost = new Float64Array(size * size).fill(Infinity);
  const previous = new Int32Array(size * size).fill(-1);
  const heap = new MinHeap();
  for (const s of starts) {
    cost[s] = 0;
    heap.push(s, 0);
  }
  while (heap.size > 0) {
    const i = heap.pop();
    if (isGoal(i)) {
      const path: number[] = [];
      for (let j = i; j !== -1; j = previous[j]!) path.push(j);
      return path.reverse();
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
        const step = stepCost(i, n, dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (step === Infinity) continue;
        const next = cost[i]! + step;
        if (next < cost[n]!) {
          cost[n] = next;
          previous[n] = i;
          heap.push(n, next);
        }
      }
    }
  }
  return null;
}

function reliefOf(heights: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { min, max };
}

/** Body lomené čáry znovu po krocích `step` (políčka). */
function resampleLine(points: readonly Cell[], step: number): Cell[] {
  const along = arcLengths(points);
  const total = along.at(-1)!;
  const count = Math.max(2, Math.round(total / step) + 1);
  const out: Cell[] = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    while (segment < points.length - 2 && along[segment + 1]! < s) segment++;
    const a = points[segment]!;
    const b = points[segment + 1]!;
    const length = along[segment + 1]! - along[segment]!;
    const t = length > 0 ? (s - along[segment]!) / length : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function tangentAt(points: readonly Cell[], k: number): { tx: number; ty: number } {
  const a = points[Math.max(0, k - 1)]!;
  const b = points[Math.min(points.length - 1, k + 1)]!;
  const length = length2(b.x - a.x, b.y - a.y) || 1;
  return { tx: (b.x - a.x) / length, ty: (b.y - a.y) / length };
}

// ── Tvar toku ────────────────────────────────────────────────────────────────────────────────

/** Vylosované vlastnosti řeky – vlny meandrů a šířky. */
interface RiverLook {
  readonly wave: number;
  readonly shortWave: number;
  readonly phase: number;
  readonly shortPhase: number;
  readonly amplitude: number;
  readonly widthPhase: number;
  readonly widthPhase2: number;
  readonly bankPhase: number;
  /** Nejmenší šířka řeky (m) – podle potoka téže mapy – a rozpětí nad ní až do `width.maxM`. */
  readonly minWidthM: number;
  readonly spanM: number;
  /** Střed šířky řeky v rozpětí (0,2–0,7) – ze seedu. */
  readonly widthShare: number;
}

/** Medián šířky vody potoka (m) z bodů osy. */
export function streamMedianWidthM(stream: readonly StreamPoint[]): number {
  const widths = stream
    .map((p) => (p.halfWidthLeft + p.halfWidthRight) * CELL_SIZE_M)
    .sort((a, b) => a - b);
  if (widths.length === 0) return 0;
  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 1 ? widths[mid]! : (widths[mid - 1]! + widths[mid]!) / 2;
}

/** Nejmenší šířka řeky (m) na mapě s tímto potokem – `RIVER.width`. */
export function riverMinWidthM(stream: readonly StreamPoint[]): number {
  const { streamFactor, minM, maxM } = RIVER.width;
  return Math.min(maxM, Math.max(minM, streamFactor * streamMedianWidthM(stream)));
}

function riverLook(random: Random, stream: readonly StreamPoint[]): RiverLook {
  const minWidthM = riverMinWidthM(stream);
  return {
    wave: range(random, RIVER.wave),
    shortWave: range(random, RIVER.shortWave),
    phase: random.next() * Math.PI * 2,
    shortPhase: random.next() * Math.PI * 2,
    amplitude: range(random, RIVER.amplitude),
    widthPhase: random.next() * Math.PI * 2,
    widthPhase2: random.next() * Math.PI * 2,
    bankPhase: random.next() * Math.PI * 2,
    minWidthM,
    spanM: RIVER.width.maxM - minWidthM,
    widthShare: 0.2 + 0.5 * random.next(),
  };
}

/**
 * Šířka vody (m) a podíl levého břehu ve vzdálenosti `s` (políčka) podél toku – v rozpětí
 * nejmenší šířky a `width.maxM` (střed ze seedu ± pětina rozpětí).
 */
function widthAt(look: RiverLook, s: number): { width: number; leftShare: number } {
  const wave =
    0.65 * detSin((2 * Math.PI * s) / 31 + look.widthPhase) +
    0.35 * detSin((2 * Math.PI * s) / 13 + look.widthPhase2);
  return {
    width: look.minWidthM + look.spanM * (look.widthShare + 0.2 * wave),
    leftShare: 0.5 + 0.08 * detSin((2 * Math.PI * s) / 17 + look.bankPhase),
  };
}

/** Největší poloviční šířka řeky (políčka) – místo kolem osy pro meandr. */
function maxHalfCells(look: RiverLook): number {
  return (look.minWidthM + look.spanM * (look.widthShare + 0.2)) / 2 / CELL_SIZE_M;
}

/**
 * Osa řeky nad trasou po políčkách: vyhlazená trasa, mírné meandry (kde je místo – `room`
 * v políčkách od zakázaných míst), šířka podle `widthAt`, každý břeh vlastní odchylkou. Konce zůstanou
 * na trase (u okrajů mapy, u soutoku) a meandry k nim utichnou.
 */
function shapeChannel(
  base: readonly Cell[],
  look: RiverLook,
  size: number,
  room: (p: Cell) => number,
  s0 = 0,
): ChannelSample[] {
  const along = arcLengths(base);
  const total = along.at(-1)!;
  const raw = base.map((p) => Math.min(look.amplitude, Math.max(0, room(p) - 0.5)));
  // Amplituda se podél toku mění plynule a nikde nepřesáhne místo kolem.
  const window = 16;
  const amp = raw.map((_, k) => {
    let low = Infinity;
    for (let j = Math.max(0, k - window); j <= Math.min(raw.length - 1, k + window); j++) {
      low = Math.min(low, raw[j]!);
    }
    return low;
  });
  const axis = base.map((p, k) => {
    const s = along[k]!;
    const taper = smoothstep(0, 8, s) * smoothstep(0, 8, total - s);
    const offset =
      (amp[k]! *
        taper *
        (detSin((2 * Math.PI * s) / look.wave + look.phase) +
          RIVER.shortShare * detSin((2 * Math.PI * s) / look.shortWave + look.shortPhase))) /
      (1 + RIVER.shortShare);
    const { tx, ty } = tangentAt(base, k);
    return {
      x: Math.min(size - 1, Math.max(0, p.x - ty * offset)),
      y: Math.min(size - 1, Math.max(0, p.y + tx * offset)),
    };
  });
  const points = resampleLine(axis, SAMPLE_STEP);
  const length = arcLengths(points).at(-1)!;
  return points.map((p, k) => {
    const s = (length * k) / (points.length - 1);
    const { width, leftShare } = widthAt(look, s0 + s);
    const { tx, ty } = tangentAt(points, k);
    return {
      x: p.x,
      y: p.y,
      s,
      tx,
      ty,
      left: (width * leftShare) / CELL_SIZE_M,
      right: (width * (1 - leftShare)) / CELL_SIZE_M,
      shallow: false,
      pool: false,
    };
  });
}

/** Dvě části toku daleko od sebe podél osy, ale blízko vzdušně (meandr by se spojil)? */
function selfTouching(samples: readonly ChannelSample[]): boolean {
  for (let a = 0; a < samples.length; a += 2) {
    for (let b = a + 2; b < samples.length; b += 2) {
      const pa = samples[a]!;
      const pb = samples[b]!;
      const gap = pa.left + pa.right + pb.left + pb.right + 2;
      if (pb.s - pa.s < gap * 3) continue;
      if (length2(pa.x - pb.x, pa.y - pb.y) < gap) return true;
    }
  }
  return false;
}

/** Brody v daných bodech osy: mělký a širší úsek ± `fordHalfCells` podél toku. */
function placeFords(samples: ChannelSample[], centers: readonly number[]): void {
  for (const c of centers) {
    const sc = samples[c]!.s;
    for (const p of samples) {
      const t = Math.abs(p.s - sc) / RIVER.fordHalfCells;
      if (t > 1) continue;
      p.shallow = true;
      const wanted = 1 + (RIVER.fordWiden - 1) * (0.5 + 0.5 * detCos(Math.PI * t));
      const width = (p.left + p.right) * CELL_SIZE_M;
      const widen = Math.max(1, Math.min(wanted, RIVER.width.maxM / width));
      p.left *= widen;
      p.right *= widen;
    }
  }
}

/**
 * Body osy pro brody: 1–2 v prostřední části toku (`fordSpan`), druhý aspoň `fordSpacing` délky
 * od prvního, mimo zakázané úseky (`allowed`). První může být předem dán (brod pod vyvýšeninou).
 */
function chooseFords(
  samples: readonly ChannelSample[],
  random: Random,
  allowed: (k: number) => boolean,
  first: number | null = null,
): number[] {
  const total = samples.at(-1)!.s;
  const count = random.next() < 0.5 ? 1 : 2;
  const candidates = samples
    .map((p, k) => ({ k, s: p.s }))
    .filter(
      ({ k, s }) => s >= RIVER.fordSpan[0] * total && s <= RIVER.fordSpan[1] * total && allowed(k),
    );
  const fords: number[] = first === null ? [] : [first];
  for (let attempt = 0; fords.length < count && attempt < 24 && candidates.length > 0; attempt++) {
    const pick = candidates[Math.floor(random.next() * candidates.length)]!;
    if (fords.every((f) => Math.abs(samples[f]!.s - pick.s) >= RIVER.fordSpacing * total)) {
      fords.push(pick.k);
    }
  }
  return fords.sort((a, b) => a - b);
}

// ── Vyhloubení údolí ─────────────────────────────────────────────────────────────────────────

/** Nejnižší výška políček v kruhu (políčka) kolem bodu. */
function lowestAround(heights: Float32Array, size: number, p: Cell, radius: number): number {
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
      if (length2(x - p.x, y - p.y) <= radius) lowest = Math.min(lowest, heights[y * size + x]!);
    }
  }
  return lowest;
}

/**
 * Voda teče z kopce i po políčkách: od nejvyššího vodního políčka řeky na okraji mapy nemá žádné
 * políčko dno výš než soused blíž prameni (jako u potoka).
 */
function enforceDownhill(tileBed: Float32Array, water: Uint8Array, size: number): void {
  let source = -1;
  for (let i = 0; i < water.length; i++) {
    if (water[i] && borderSides(i, size) !== 0 && (source === -1 || tileBed[i]! > tileBed[source]!))
      source = i;
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
        if (hops[n] === hops[i]! + 1) tileBed[n] = Math.min(tileBed[n]!, tileBed[i]! - 1e-4);
      }
    }
  }
}

interface CarveInput {
  readonly terrain: Terrain;
  readonly samples: readonly ChannelSample[];
  /** Vodní políčka řeky. */
  readonly water: Uint8Array;
  /** Vodní políčka řeky, od kterých se vyhloubí údolí (u soutoku jen rameno). */
  readonly valleyFrom: Uint8Array;
  /** Dno bodu osy daného předem (dolní tok soutoku = koryto potoka), jinak null. */
  readonly fixedBed: (k: number) => number | null;
  /** Dno ramene nesmí klesnout pod tuto mez (soutok – dno pod soutokem). */
  readonly bedFloor: number;
  readonly floodplainCells: number;
}

/**
 * Koryto a údolí řeky: dno podél osy jako klesající minimum terénu (prořízne sedla), vodní
 * políčka dostanou dno nejbližšího bodu osy, souš kolem se ke korytu svažuje – rovná niva
 * podél vody, pak svah jako u potoka. Rovinu kolem místa pro vesnici údolí nemění a voda potoka
 * zůstane. Vrací hladinu v bodech osy (m).
 */
function carveRiver(input: CarveInput): number[] {
  const { terrain, samples, water, valleyFrom } = input;
  const { size, heights } = terrain;
  const bed: number[] = [];
  let level = Infinity;
  samples.forEach((p, k) => {
    const fixed = input.fixedBed(k);
    if (fixed !== null) {
      level = Math.min(level, fixed);
      bed.push(fixed);
      return;
    }
    level = Math.min(
      level,
      lowestAround(heights, size, p, Math.max(p.left, p.right) + 1.5) - RIVER.depthM,
    );
    bed.push(Math.max(level, input.bedFloor));
  });
  for (let k = bed.length - 2; k >= 0; k--) {
    if (input.fixedBed(k) !== null) continue;
    bed[k] = Math.min(bed[k]!, bed[k + 1]! + M.maxBedDrop * SAMPLE_STEP);
  }

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
        const d = length2(x - p.x, y - p.y);
        if (!water[i] || d >= nearest[i]!) continue;
        nearest[i] = d;
        tileBed[i] = bed[k]!;
      }
    }
  });
  enforceDownhill(tileBed, water, size);

  // Údolí: vzdálenost od vody ramene po mřížce a hladina nejbližšího vodního políčka.
  const distance = new Float64Array(size * size).fill(Infinity);
  const near = new Float32Array(size * size);
  const heap = new MinHeap();
  for (let i = 0; i < water.length; i++) {
    if (!valleyFrom[i]) continue;
    distance[i] = 0;
    near[i] = tileBed[i]! + RIVER.depthM;
    heap.push(i, 0);
  }
  const { max } = reliefOf(heights);
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
        const d = distance[i]! + (dx && dy ? Math.SQRT2 : 1);
        if (d >= distance[n]!) continue;
        // Dál, než kam svah údolí sahá nad nejvyšší terén, se nehledá.
        if (near[i]! + RIVER.valleySlope * (d - input.floodplainCells) > max + 1) continue;
        distance[n] = d;
        near[n] = near[i]!;
        heap.push(n, d);
      }
    }
  }
  const village = terrain.villageSite;
  for (let i = 0; i < heights.length; i++) {
    if (water[i]) {
      heights[i] = tileBed[i]!;
      continue;
    }
    if (terrain.water[i] || distance[i] === Infinity) continue;
    const top =
      near[i]! +
      RIVER.floodplainM +
      RIVER.valleySlope * Math.max(0, distance[i]! - input.floodplainCells);
    const h = heights[i]!;
    if (top >= h) continue;
    const keep = villageKeep(i % size, Math.floor(i / size), village);
    heights[i] = h + (top - h) * keep;
  }
  return bed.map((b) => b + RIVER.depthM);
}

/** Jak moc smí úpravy řeky měnit terén políčka (0 = rovina kolem vsi zůstane). */
function villageKeep(x: number, y: number, village: Cell): number {
  return smoothstep(
    RIVER.villageKeep[0],
    RIVER.villageKeep[1],
    length2(x - village.x, y - village.y),
  );
}

// ── Ostrožna ─────────────────────────────────────────────────────────────────────────────────

/** Naplánovaná ostrožna nad vodou – plocha nahoře, šíje a hřbet do vnitrozemí. */
interface SpurPlan {
  readonly kind: 'ford-hill' | 'confluence';
  readonly center: Cell;
  /** Jednotkový směr od vody do vnitrozemí (k šíji). */
  readonly dir: Cell;
  /** Výška plochy (m) a hladina, nad kterou se měří. */
  readonly top: number;
  readonly reference: number;
}

/** Výška tvaru ostrožny v bodě (m) – plocha, svahy, hřbet k šíji. */
function spurHeight(spur: SpurPlan, x: number, y: number): number {
  const dx = x - spur.center.x;
  const dy = y - spur.center.y;
  const u = dx * spur.dir.x + dy * spur.dir.y;
  const v = -dx * spur.dir.y + dy * spur.dir.x;
  const e = length2(u / SPUR.halfLength, v / SPUR.halfWidth);
  const outside = Math.max(0, e - 1) * Math.min(SPUR.halfLength, SPUR.halfWidth);
  let shape = spur.top - SPUR.fallM * outside;
  if (u > 0) {
    const du = Math.max(0, u - SPUR.halfLength - SPUR.ridgeLength);
    const dv = Math.max(0, Math.abs(v) - SPUR.neckHalfWidth);
    shape = Math.max(shape, spur.top - SPUR.fallM * dv - SPUR.ridgeFallM * du);
  }
  return shape;
}

/** Dosah tvaru ostrožny od středu (políčka) – dál terén nezvedá. */
function spurReach(spur: SpurPlan, ground: number): number {
  const rise = Math.max(0, spur.top - ground);
  return SPUR.halfLength + SPUR.ridgeLength + rise / SPUR.ridgeFallM + 1;
}

/** Zvedne souš do tvaru ostrožny (terén nikdy nesníží, vodu nemění, rovinu vsi ne). */
function sculptSpur(terrain: Terrain, water: Uint8Array, spur: SpurPlan): void {
  const { size, heights, villageSite } = terrain;
  const { min } = reliefOf(heights);
  const reach = Math.ceil(spurReach(spur, min));
  for (
    let y = Math.max(0, Math.floor(spur.center.y) - reach);
    y <= Math.min(size - 1, Math.ceil(spur.center.y) + reach);
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(spur.center.x) - reach);
      x <= Math.min(size - 1, Math.ceil(spur.center.x) + reach);
      x++
    ) {
      const i = y * size + x;
      if (water[i]) continue;
      const shape = spurHeight(spur, x, y);
      const h = heights[i]!;
      if (shape <= h) continue;
      heights[i] = h + (shape - h) * villageKeep(x, y, villageSite);
    }
  }
}

/**
 * Plocha ostrožny leží za rovinou kolem vsi (tam, kde ji úpravy terénu mění naplno) – hřbet
 * k vesnici smí, rovina vsi ho utlumí.
 */
function spurClearOfVillage(center: Cell, terrain: Terrain): boolean {
  return cellDistance(center, terrain.villageSite) >= RIVER.villageKeep[1] + 1;
}

/** Obrys plochy ostrožny z upraveného terénu (32 paprsků), šíje a plocha. */
function describeSpur(terrain: Terrain, spur: SpurPlan): Promontory {
  const { heights, size } = terrain;
  const edge = spur.top - 2;
  const outline: Cell[] = [];
  const RAYS = 32;
  const limit = Math.max(SPUR.halfLength, SPUR.halfWidth) + 2;
  for (let j = 0; j < RAYS; j++) {
    const a = (2 * Math.PI * j) / RAYS;
    const cx = detCos(a);
    const cy = detSin(a);
    let r = 0;
    for (; r < limit; r += 0.1) {
      const p = { x: spur.center.x + cx * (r + 0.1), y: spur.center.y + cy * (r + 0.1) };
      const u = (p.x - spur.center.x) * spur.dir.x + (p.y - spur.center.y) * spur.dir.y;
      if (heightAt(heights, size, p) < edge || u > SPUR.halfLength) break;
    }
    outline.push({ x: spur.center.x + cx * r, y: spur.center.y + cy * r });
  }
  let area = 0;
  outline.forEach((p, j) => {
    const q = outline[(j + 1) % outline.length]!;
    area += p.x * q.y - q.x * p.y;
  });
  const neckAt = {
    x: spur.center.x + spur.dir.x * SPUR.halfLength,
    y: spur.center.y + spur.dir.y * SPUR.halfLength,
  };
  const across = { x: -spur.dir.y, y: spur.dir.x };
  return {
    kind: spur.kind,
    outline,
    neck: [
      {
        x: neckAt.x + across.x * SPUR.neckHalfWidth,
        y: neckAt.y + across.y * SPUR.neckHalfWidth,
      },
      {
        x: neckAt.x - across.x * SPUR.neckHalfWidth,
        y: neckAt.y - across.y * SPUR.neckHalfWidth,
      },
    ],
    center: { x: spur.center.x, y: spur.center.y },
    heightM: spur.top - spur.reference,
    areaHa: (Math.abs(area) / 2) * ((CELL_SIZE_M * CELL_SIZE_M) / 10_000),
  };
}

/**
 * Výšky stěn u bodů osy, kde ostrožna spadá k vodě – terén za okrajem vody (`SPUR.bankGap`)
 * nad hladinou, stěna od 1,5 m. Ostatní body beze stěny (0).
 */
function spurBanks(
  terrain: Terrain,
  points: readonly { x: number; y: number; left: number; right: number; tx: number; ty: number }[],
  levels: readonly number[],
  spurs: readonly SpurPlan[],
): { left: Float64Array; right: Float64Array } {
  const left = new Float64Array(points.length);
  const right = new Float64Array(points.length);
  const reach = SPUR.halfLength + SPUR.halfWidth + 4;
  points.forEach((p, k) => {
    if (!spurs.some((s) => cellDistance(p, s.center) <= reach)) return;
    for (const side of [1, -1] as const) {
      const half = side > 0 ? p.left : p.right;
      const probe = {
        x: p.x - p.ty * side * (half + SPUR.bankGap),
        y: p.y + p.tx * side * (half + SPUR.bankGap),
      };
      const wall = heightAt(terrain.heights, terrain.size, probe) - levels[k]!;
      if (wall > 1.5) (side > 0 ? left : right)[k] = wall;
    }
  });
  return { left, right };
}

// ── Řeka vedle potoka (splavná řeka, vyvýšenina nad brodem) ─────────────────────────────────────

/** Zakázaná políčka a místo kolem pro trasu řeky. */
interface Constraints {
  readonly streamDistance: Float32Array;
  readonly side: Uint8Array;
}

function constraintsOf(terrain: Terrain): Constraints {
  return {
    streamDistance: distanceToMask(terrain.water, terrain.size),
    side: landRegion(terrain.water, terrain.size, terrain.villageSite),
  };
}

/** Místo kolem bodu pro meandr (políčka) – od vsi, od potoka a od ostrožny potoka. */
function roomAt(terrain: Terrain, c: Constraints, p: Cell): number {
  const i = cellIndex(p, terrain.size);
  let room = Math.min(
    cellDistance(p, terrain.villageSite) - RIVER.villageMinCells,
    c.streamDistance[i]! - RIVER.streamGapCells,
  );
  for (const promontory of terrain.promontories ?? []) {
    room = Math.min(room, cellDistance(p, promontory.center) - promontoryRadius(promontory) - 6);
  }
  return room;
}

function promontoryRadius(p: Promontory): number {
  let r = 0;
  for (const q of p.outline) r = Math.max(r, cellDistance(q, p.center));
  return r;
}

/**
 * Trasa řeky po straně potoka s místem pro vesnici: od náhodného okraje k jinému okraji mapy,
 * nízko položenými místy (údolími), daleko od vsi i od potoka. Vrací políčka trasy, nebo null.
 */
function routeSideRiver(terrain: Terrain, c: Constraints, random: Random): Cell[] | null {
  const { size, heights } = terrain;
  const { min, max } = reliefOf(heights);
  const relief = Math.max(1, max - min);
  const allowed = new Uint8Array(size * size);
  for (let i = 0; i < allowed.length; i++) {
    const p = { x: i % size, y: Math.floor(i / size) };
    allowed[i] = c.side[i] && roomAt(terrain, c, p) >= 0 ? 1 : 0;
  }
  const entries: number[] = [];
  for (let i = 0; i < allowed.length; i++) {
    if (allowed[i] && borderSides(i, size) !== 0) entries.push(i);
  }
  const span = RIVER.minSpan * size;
  for (let attempt = 0; attempt < 8 && entries.length > 0; attempt++) {
    const entry = entries[Math.floor(random.next() * entries.length)]!;
    const entrySides = borderSides(entry, size);
    const ex = entry % size;
    const ey = Math.floor(entry / size);
    const path = cheapestPath(
      size,
      [entry],
      (from, to, length) => {
        if (!allowed[to]) return Infinity;
        const near = Math.max(0, 2 * RIVER.streamGapCells - c.streamDistance[to]!);
        return (
          length *
            (1 +
              (4 * (heights[to]! - min)) / relief +
              edgePenalty(to, size) +
              (1.5 * near) / RIVER.streamGapCells) *
            villageDraw(to, size, terrain.villageSite) +
          4 * Math.abs(heights[to]! - heights[from]!)
        );
      },
      (i) =>
        allowed[i] === 1 &&
        (borderSides(i, size) & entrySides) === 0 &&
        borderSides(i, size) !== 0 &&
        length2((i % size) - ex, Math.floor(i / size) - ey) >= span,
    );
    if (path) return path.map((i) => ({ x: i % size, y: Math.floor(i / size) }));
  }
  return null;
}

/**
 * Řeka se nedotkne potoka (kromě ústí u soutoku) a vsi se vyhne – vodní políčka i osa aspoň
 * `villageMinCells − 2` od místa pro vesnici (meandry a vyhlazení trasy smí kousek blíž).
 */
function riverWaterOk(
  terrain: Terrain,
  c: Constraints,
  water: Uint8Array,
  samples: readonly ChannelSample[],
  except: (i: number) => boolean = () => false,
): boolean {
  const { size, villageSite } = terrain;
  for (const p of samples) {
    if (cellDistance(p, villageSite) < RIVER.villageMinCells - 2) return false;
  }
  for (let i = 0; i < water.length; i++) {
    if (!water[i] || except(i)) continue;
    if (c.streamDistance[i]! < 3) return false;
    const p = { x: i % size, y: Math.floor(i / size) };
    if (cellDistance(p, villageSite) < RIVER.villageMinCells - 2) return false;
  }
  return true;
}

/** Osa řeky po proudu – od vyššího konce. */
function downstream(base: Cell[], terrain: Terrain): Cell[] {
  const { heights, size } = terrain;
  if (heightAt(heights, size, base[0]!) < heightAt(heights, size, base.at(-1)!)) base.reverse();
  return base;
}

/** Vyvýšenina nad brodem: brod na řece a ostrožna kus od něj na břehu, kde se vejde. */
interface FordHill {
  readonly ford: number;
  readonly spur: Omit<SpurPlan, 'top' | 'reference'>;
}

function planFordHill(
  terrain: Terrain,
  c: Constraints,
  samples: readonly ChannelSample[],
  water: Uint8Array,
  random: Random,
): FordHill | null {
  const { size, heights } = terrain;
  const total = samples.at(-1)!.s;
  const allWater = new Uint8Array(size * size);
  for (let i = 0; i < allWater.length; i++) allWater[i] = terrain.water[i] || water[i] ? 1 : 0;
  const waterDistance = distanceToMask(allWater, size);
  const offset = FORD_HILL.alongCells;
  let best: (FordHill & { score: number }) | null = null;
  for (let f = 0; f < samples.length; f += 4) {
    const sf = samples[f]!.s;
    if (sf < RIVER.fordSpan[0] * total || sf > RIVER.fordSpan[1] * total) continue;
    for (const along of [offset, -offset]) {
      const k = samples.findIndex((p) => p.s >= sf + along);
      if (k < 0) continue;
      const p = samples[k]!;
      for (const side of [1, -1] as const) {
        const half = side > 0 ? p.left : p.right;
        const n = { x: -p.ty * side, y: p.tx * side };
        const d = half + SPUR.bankGap + SPUR.halfLength;
        const center = { x: p.x + n.x * d, y: p.y + n.y * d };
        const plan = { kind: 'ford-hill' as const, center, dir: n };
        const margin = SPUR.halfLength + M.mapMargin;
        if (
          center.x < margin ||
          center.y < margin ||
          center.x > size - 1 - margin ||
          center.y > size - 1 - margin
        ) {
          continue;
        }
        // Plocha na souši daleko od potoka i jiných částí řeky (jen tento břeh).
        if (waterDistance[cellIndex(center, size)]! < SPUR.halfLength + SPUR.bankGap - 0.5) {
          continue;
        }
        if (c.streamDistance[cellIndex(center, size)]! < SPUR.halfLength + 6) continue;
        if (!spurClearOfVillage(center, terrain)) continue;
        let otherPart = false;
        for (const q of samples) {
          if (Math.abs(q.s - p.s) > 12 && cellDistance(q, center) < SPUR.halfLength + 6) {
            otherPart = true;
            break;
          }
        }
        if (otherPart) continue;
        const score =
          heightAt(heights, size, center) -
          heightAt(heights, size, samples[f]!) +
          random.next() * 2;
        if (!best || score > best.score) best = { ford: f, spur: plan, score };
      }
    }
  }
  return best ? { ford: best.ford, spur: best.spur } : null;
}

/**
 * Splavná řeka nebo řeka s vyvýšeninou nad brodem: nový tok vedle potoka na straně vsi, od
 * okraje k okraji. Mění terén na místě (výšky, voda) a vrací ho s osou řeky (a ostrožnou nad
 * brodem); když se řeka nevejde, vrací terén beze změny bez řeky – pokus pak neprojde
 * kontrolou typu.
 */
export function addSideRiver(
  terrain: Terrain,
  seed: number,
  options: { readonly floodplainCells: number; readonly fordHill: boolean },
): Terrain {
  const random = createRandom(seed);
  const look = riverLook(random, terrain.stream);
  const heightM = range(random, FORD_HILL.heightM);
  const c = constraintsOf(terrain);
  const path = routeSideRiver(terrain, c, random);
  if (!path) return terrain;
  const base = downstream(smoothPolyline(path, terrain.size), terrain);
  // Meandr jen do místa, které zbude kolem břehů širší řeky.
  const slack = MEANDER_SLACK_CELLS - maxHalfCells(look);
  const samples = shapeChannel(base, look, terrain.size, (p) => roomAt(terrain, c, p) + slack);
  if (selfTouching(samples)) return terrain;
  let hill: FordHill | null = null;
  if (options.fordHill) {
    hill = planFordHill(
      terrain,
      c,
      samples,
      rasterize(samples, terrain.heights, terrain.size),
      random,
    );
    if (!hill) return terrain;
  }
  const fords = chooseFords(samples, random, () => true, hill ? hill.ford : null);
  placeFords(samples, fords);
  const water = rasterize(samples, terrain.heights, terrain.size);
  if (!riverWaterOk(terrain, c, water, samples)) return terrain;
  const levels = carveRiver({
    terrain,
    samples,
    water,
    valleyFrom: water,
    fixedBed: () => null,
    bedFloor: -Infinity,
    floodplainCells: options.floodplainCells,
  });
  const spurs: SpurPlan[] = [];
  if (hill) {
    spurs.push({ ...hill.spur, top: levels[hill.ford]! + heightM, reference: levels[hill.ford]! });
  }
  return finishRiver(terrain, samples, water, levels, spurs, terrain.stream);
}

/**
 * Dokončení řeky: voda do terénu, ostrožny, stěny u vody, výšky znovu od nejnižšího políčka
 * (dno řeky bývá pod potokem) a ostrožny do dat krajiny.
 */
function finishRiver(
  terrain: Terrain,
  samples: readonly ChannelSample[],
  water: Uint8Array,
  levels: number[],
  spurs: readonly SpurPlan[],
  stream: readonly StreamPoint[],
  baseBank: (k: number) => { left: number; right: number } = () => ({ left: 0, right: 0 }),
): Terrain {
  const { heights } = terrain;
  for (let i = 0; i < water.length; i++) if (water[i]) terrain.water[i] = 1;
  for (const spur of spurs) sculptSpur(terrain, terrain.water, spur);
  const banks = spurBanks(terrain, samples, levels, spurs);
  const streamSamples = stream.map((p, k) => ({
    x: p.x,
    y: p.y,
    left: p.halfWidthLeft,
    right: p.halfWidthRight,
    ...tangentAt(stream, k),
  }));
  const streamBanks = spurBanks(
    terrain,
    streamSamples,
    stream.map((p) => p.level),
    spurs,
  );
  const { min } = reliefOf(heights);
  const shift = Math.min(0, min);
  for (let i = 0; i < heights.length; i++) heights[i] = heights[i]! - shift;
  terrain.stream = stream.map((p, k) => {
    const point: StreamPoint = { ...p, level: p.level - shift };
    if (streamBanks.left[k]! === 0 && streamBanks.right[k]! === 0) return point;
    return {
      ...point,
      bankLeft: Math.max(p.bankLeft ?? 0, streamBanks.left[k]!),
      bankRight: Math.max(p.bankRight ?? 0, streamBanks.right[k]!),
    };
  });
  terrain.river = samples.map((p, k) => ({
    x: p.x,
    y: p.y,
    halfWidthLeft: p.left,
    halfWidthRight: p.right,
    level: levels[k]! - shift,
    shallow: p.shallow,
    bankLeft: Math.max(baseBank(k).left, banks.left[k]!),
    bankRight: Math.max(baseBank(k).right, banks.right[k]!),
  }));
  const described = spurs.map((spur) =>
    describeSpur(terrain, { ...spur, top: spur.top - shift, reference: spur.reference - shift }),
  );
  if (described.length > 0) {
    terrain.promontories = [...(terrain.promontories ?? []), ...described];
  }
  return terrain;
}

// ── Soutok ───────────────────────────────────────────────────────────────────────────────────

/** Směr osy toku od bodu `k` o `cells` políček podél osy (dopředu kladně, dozadu záporně). */
function directionAlong(points: readonly Cell[], k: number, cells: number): Cell {
  const steps = Math.round(Math.abs(cells) / SAMPLE_STEP);
  const j = Math.min(points.length - 1, Math.max(0, k + Math.sign(cells) * steps));
  const dx = points[j]!.x - points[k]!.x;
  const dy = points[j]!.y - points[k]!.y;
  const length = length2(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

/**
 * Soutok: rameno řeky přitéká od okraje mapy k potoku pod vsí (po proudu) a řeka dál teče
 * dolním tokem potoka (koryto rozšířené na řeku). Potok nad soutokem zůstane jako přítok
 * a v úhlu mezi ním a ramenem vznikne ostrožna. Mění terén na místě; když se soutok nevejde,
 * vrací terén beze změny bez řeky.
 */
export function addConfluence(terrain: Terrain, seed: number): Terrain {
  const random = createRandom(seed);
  const look = riverLook(random, terrain.stream);
  const heightM = range(random, CONFLUENCE.heightM);
  const { size, villageSite } = terrain;
  const stream = terrain.stream;
  const c = constraintsOf(terrain);
  let nearestToVillage = 0;
  stream.forEach((p, k) => {
    if (cellDistance(p, villageSite) < cellDistance(stream[nearestToVillage]!, villageSite)) {
      nearestToVillage = k;
    }
  });
  const loopEnd = promontoryLoopEnd(terrain);
  const candidates: number[] = [];
  for (let k = nearestToVillage + 1; k < stream.length - 20; k += 2) {
    const p = stream[k]!;
    if (cellDistance(p, villageSite) < RIVER.villageMinCells + 4) continue;
    if (Math.min(p.x, p.y, size - 1 - p.x, size - 1 - p.y) < 14) continue;
    if (k <= loopEnd + 12) continue;
    let clear = true;
    for (let j = k; j < stream.length && clear; j++) {
      if (cellDistance(stream[j]!, villageSite) < RIVER.villageMinCells - 2) clear = false;
    }
    if (clear) candidates.push(k);
  }
  for (let attempt = 0; attempt < 6 && candidates.length > 0; attempt++) {
    const pick = Math.floor(random.next() * candidates.length);
    const junction = candidates.splice(pick, 1)[0]!;
    const result = tryConfluence(terrain, c, junction, look, heightM, random);
    if (result) return result;
  }
  return terrain;
}

/**
 * Voda potoka pod soutokem mimo koryto řeky (tůně potoka širší než řeka – nad `width.maxM`) je
 * zase souš: břeh těsně nad hladinou (rovná niva). Voda potoka nad soutokem (přítok) zůstane.
 */
function narrowLowerCourse(
  terrain: Terrain,
  stream: readonly StreamPoint[],
  junction: number,
  riverWater: Uint8Array,
): void {
  const { size, heights, water } = terrain;
  for (let i = 0; i < water.length; i++) {
    if (!water[i] || riverWater[i]) continue;
    const p = { x: i % size, y: Math.floor(i / size) };
    let nearest = 0;
    let best = Infinity;
    stream.forEach((q, k) => {
      const d = cellDistance(p, q);
      if (d < best) {
        best = d;
        nearest = k;
      }
    });
    if (nearest < junction) continue;
    water[i] = 0;
    heights[i] = Math.max(heights[i]!, stream[nearest]!.level + RIVER.floodplainM);
  }
}

/** Poslední bod osy potoka u smyčky ostrožny (−1 = potok bez ostrožny). */
function promontoryLoopEnd(terrain: Terrain): number {
  let end = -1;
  for (const promontory of terrain.promontories ?? []) {
    const radius = promontoryRadius(promontory) + 4;
    terrain.stream.forEach((p, k) => {
      if (cellDistance(p, promontory.center) <= radius) end = Math.max(end, k);
    });
  }
  return end;
}

function tryConfluence(
  terrain: Terrain,
  c: Constraints,
  junction: number,
  look: RiverLook,
  heightM: number,
  random: Random,
): Terrain | null {
  const { size, heights, villageSite } = terrain;
  const stream = terrain.stream;
  const j = stream[junction]!;
  const start = cellIndex(j, size);
  // Řeka vtéká a vytéká na různých okrajích – rameno ne tam, kde potok mapu opouští.
  const exit = stream.at(-1)!;
  const exitSides = borderSides(cellIndex(exit, size), size);
  const up = directionAlong(stream, junction, -8);
  const [a0, a1] = CONFLUENCE.angleDeg;
  const cosMax = detCos((a0 * Math.PI) / 180);
  const cosMin = detCos((a1 * Math.PI) / 180);
  const { min, max } = reliefOf(heights);
  const relief = Math.max(1, max - min);
  // Ústí ramene: kolem soutoku se řeka k potoku smí přiblížit – v klínu od směru proti proudu.
  const funnel = (i: number): boolean => {
    const p = { x: i % size, y: Math.floor(i / size) };
    const d = cellDistance(p, j);
    if (d > CONFLUENCE.funnelCells) return false;
    if (d <= 1.5) return true;
    const cos = ((p.x - j.x) * up.x + (p.y - j.y) * up.y) / d;
    return cos >= cosMin && cos <= cosMax && c.streamDistance[i]! >= 0.3 * d;
  };
  const allowed = (i: number): boolean => {
    if (i === start) return true;
    if (!c.side[i]) return false;
    const p = { x: i % size, y: Math.floor(i / size) };
    if (cellDistance(p, villageSite) < RIVER.villageMinCells) return false;
    return roomAt(terrain, c, p) >= 0 || funnel(i);
  };
  const path = cheapestPath(
    size,
    [start],
    (from, to, length) => {
      if (!allowed(to)) return Infinity;
      // Od soutoku proti proudu ramene: terén má stoupat (voda teče k soutoku).
      return (
        length * (1 + (4 * (heights[to]! - min)) / relief + edgePenalty(to, size)) +
        6 * Math.max(0, heights[from]! - heights[to]!)
      );
    },
    (i) => {
      const sides = borderSides(i, size);
      if (sides === 0 || (sides & exitSides) !== 0 || !allowed(i)) return false;
      const p = { x: i % size, y: Math.floor(i / size) };
      return (
        cellDistance(p, j) >= CONFLUENCE.minBranchCells &&
        cellDistance(p, exit) >= RIVER.minSpan * size
      );
    },
  );
  if (!path) return null;
  // Rameno po proudu: od okraje k soutoku, poslední bod přesně v ose potoka.
  const cells = path.map((i) => ({ x: i % size, y: Math.floor(i / size) })).reverse();
  cells[cells.length - 1] = { x: j.x, y: j.y };
  const branchBase = smoothPolyline(cells, size);
  branchBase[branchBase.length - 1] = { x: j.x, y: j.y };
  const slack = MEANDER_SLACK_CELLS - maxHalfCells(look);
  const branch = shapeChannel(branchBase, look, size, (p) => {
    const room = roomAt(terrain, c, p);
    return (cellDistance(p, j) < CONFLUENCE.funnelCells ? Math.min(room, 0) : room) + slack;
  });
  const branchEnd = branch.at(-1)!.s;
  // Dolní tok: body potoka od soutoku, koryto na šířku řeky (širší tůně potoka se zúží).
  const lower: ChannelSample[] = [];
  for (let k = junction; k < stream.length; k++) {
    const p = stream[k]!;
    const s = branchEnd + (k - junction) * SAMPLE_STEP;
    const { width, leftShare } = widthAt(look, s);
    lower.push({
      x: p.x,
      y: p.y,
      s,
      ...tangentAt(stream, k),
      left: (width * leftShare) / CELL_SIZE_M,
      right: (width * (1 - leftShare)) / CELL_SIZE_M,
      shallow: false,
      pool: false,
    });
  }
  const samples = [...branch.slice(0, -1), ...lower];
  samples.forEach((p, k) => {
    const t = tangentAt(samples, k);
    p.tx = t.tx;
    p.ty = t.ty;
  });
  if (selfTouching(branch)) return null;
  const junctionIndex = branch.length - 1;
  const junctionS = samples[junctionIndex]!.s;
  const fords = chooseFords(samples, random, (k) => Math.abs(samples[k]!.s - junctionS) > 10);
  placeFords(samples, fords);
  const water = rasterize(samples, heights, size);
  const branchWater = rasterize(branch, heights, size);
  const nearJunction = (i: number): boolean =>
    cellDistance({ x: i % size, y: Math.floor(i / size) }, j) <= CONFLUENCE.funnelCells;
  // Rameno se potoka nad soutokem nedotkne (kromě ústí) a vsi se vyhne.
  const ownBranch = new Uint8Array(size * size);
  for (let i = 0; i < ownBranch.length; i++) {
    ownBranch[i] = branchWater[i] && !terrain.water[i] ? 1 : 0;
  }
  if (!riverWaterOk(terrain, c, ownBranch, branch, nearJunction)) return null;
  const lowerBed = (k: number): number | null =>
    k >= junctionIndex ? stream[junction + (k - junctionIndex)]!.level - RIVER.depthM : null;
  const bedFloor = stream[junction]!.level - RIVER.depthM;
  // Ostrožna v úhlu mezi potokem nad soutokem a ramenem řeky.
  const along = directionAlong(
    samples.map((p) => ({ x: p.x, y: p.y })),
    junctionIndex,
    -8,
  );
  const bisector = { x: up.x + along.x, y: up.y + along.y };
  const length = length2(bisector.x, bisector.y);
  if (length < 0.2) return null;
  const dir = { x: bisector.x / length, y: bisector.y / length };
  const allWater = new Uint8Array(size * size);
  for (let i = 0; i < allWater.length; i++) allWater[i] = terrain.water[i] || water[i] ? 1 : 0;
  const waterDistance = distanceToMask(allWater, size);
  let center: Cell | null = null;
  for (let d = 4; d <= 16; d += 0.5) {
    const p = { x: j.x + dir.x * d, y: j.y + dir.y * d };
    if (waterDistance[cellIndex(p, size)]! >= SPUR.halfWidth + SPUR.bankGap) {
      center = p;
      break;
    }
  }
  if (!center) return null;
  const spurPlan = { kind: 'confluence' as const, center, dir };
  if (!spurClearOfVillage(center, terrain)) return null;
  narrowLowerCourse(terrain, stream, junction, water);
  const levels = carveRiver({
    terrain,
    samples,
    water,
    valleyFrom: ownBranch,
    fixedBed: lowerBed,
    bedFloor,
    floodplainCells: RIVER.floodplainCells,
  });
  const reference = levels[junctionIndex]!;
  const spur: SpurPlan = { ...spurPlan, top: reference + heightM, reference };
  // Potok končí v soutoku (přítok), řeka teče dál jeho dolním tokem i se stěnami u něj.
  const lowerBank = (k: number): { left: number; right: number } => {
    const p = k >= junctionIndex ? stream[junction + (k - junctionIndex)] : undefined;
    return { left: p?.bankLeft ?? 0, right: p?.bankRight ?? 0 };
  };
  return finishRiver(
    terrain,
    samples,
    water,
    levels,
    [spur],
    stream.slice(0, junction + 1),
    lowerBank,
  );
}
