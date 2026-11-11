import { createNoise2D } from 'simplex-noise';
import { smoothstep } from './grid';
import type { Random } from './random';

/** Bod osy potoka během generování (bez hladiny – tu určí až vyhloubení koryta). */
export interface ChannelSample {
  x: number;
  y: number;
  /** Vzdálenost podél osy od pramene (políčka). */
  s: number;
  /** Jednotkový směr toku. */
  tx: number;
  ty: number;
  /** Poloviční šířky vody vlevo a vpravo od osy (políčka). */
  left: number;
  right: number;
  shallow: boolean;
  /** Tůň – hlubší místo (pro vykreslení). */
  pool: boolean;
}

/** Rozteč bodů osy (políčka). */
export const SAMPLE_STEP = 0.5;
/** Meandry podle paintRiver z 0 A.D.: dlouhá a krátká vlna (políčka) a amplituda. */
const LONG_WAVE: readonly [number, number] = [16, 24];
const SHORT_WAVE: readonly [number, number] = [7, 10];
const SHORT_SHARE = 0.35;
const AMPLITUDE: readonly [number, number] = [3.5, 5];
/** Meandry slábnou ve svazích – na rovině plná amplituda, ve strmém úseku tato část. */
const STEEP_AMPLITUDE = 0.6;
/** U okrajů mapy osa plynule přejde do původní trasy (políčka). */
const EDGE_TAPER = 8;
/** Poloviční šířka: ve svahu úzký potok, na rovině širší, každý břeh vlastní odchylka. */
const HALF_WIDTH_STEEP = 0.42;
const HALF_WIDTH_FLAT = 0.72;
const BANK_WOBBLE = 0.32;
const MIN_HALF_WIDTH = 0.32;
/** Tůně: počet, poloměr (políčka) a nejmenší rozestup podél toku. */
const POOLS: readonly [number, number] = [2, 4];
const POOL_RADIUS: readonly [number, number] = [1.5, 2.5];
const POOL_SPACING = 24;
/** Mělčiny (brody): počet, šířka a délka úseku (políčka). */
const SHALLOWS: readonly [number, number] = [1, 3];
const SHALLOW_HALF_WIDTH: readonly [number, number] = [0.9, 1.15];
const SHALLOW_LENGTH = 3;
/** Rezerva mezi dvěma částmi koryta, které se k sobě přiblíží v meandru (políčka). */
const CHANNEL_GAP = 2;
/**
 * Strmá vlásenka: dva úseky s rozdílem hladin nad NECK_DROP_M (m), které jsou přímo blíž než
 * NECK_CHORD × délka toku mezi nimi, musí být od sebe aspoň součet šířek + NECK_GAP políček –
 * v přírodě by se taková šíje protrhla. Zbylé mírnější šíje prolne vykreslení.
 */
const NECK_DROP_M = 0.8;
const NECK_GAP = 3.5;
const NECK_CHORD = 0.6;
/** Kolem příliš blízkých úseků se meandr zmírní v okně ± tolik políček podél toku. */
const CALM_WINDOW = 15;

/**
 * Vylosované vlastnosti potoka nad trasou – náhoda se čerpá jen tady, osu z nich staví
 * `buildStream` (terén 2 ji staví podruhé se smyčkou zaříznutého meandru, se stejnou náhodou).
 */
export interface StreamPlan {
  /** Vyhlazená trasa po proudu (políčka) a vzdálenost podél ní od pramene. */
  readonly base: readonly { x: number; y: number }[];
  readonly along: readonly number[];
  /** Rovinatost toku 0–1 podél trasy. */
  readonly flat: readonly number[];
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly pool: readonly boolean[];
  readonly shallow: readonly boolean[];
  readonly longWave: number;
  readonly shortWave: number;
  readonly longPhase: number;
  readonly shortPhase: number;
  readonly amplitude: number;
}

/**
 * Smyčka zaříznutého meandru (ostrožna – terén 2): úsek základní trasy `from`–`to` (podél
 * `along`, políčka) nahradí body `points` (od začátku úseku do konce, po proudu). Meandry kolem
 * úseku plynule utichnou, aby osa navázala bez zlomu.
 */
export interface StreamLoop {
  readonly from: number;
  readonly to: number;
  readonly points: readonly { x: number; y: number }[];
}

/** Meandry kolem smyčky utichnou na tolika políčkách před a za ní. */
export const LOOP_CALM = 8;

/**
 * Vylosuje vlastnosti potoka nad trasou (šířky, tůně, mělčiny, vlny meandrů). Tvar z nich postaví
 * `buildStream`: vyhlazená osa, meandry jako součet dvou sinusovek (víc v rovině, míň ve svahu),
 * každý břeh s vlastní odchylkou šířky, tůně v rovinách a mělčiny ve strmějších úsecích.
 */
export function planStream(
  path: readonly number[],
  heights: Float32Array,
  size: number,
  random: Random,
): StreamPlan {
  const noise = createNoise2D(() => random.next());
  const base = smoothPolyline(
    path.map((i) => ({ x: i % size, y: Math.floor(i / size) })),
    size,
  );
  // Po proudu: od vyššího konce.
  if (heightAt(heights, size, base[0]!) < heightAt(heights, size, base.at(-1)!)) base.reverse();
  const along = arcLengths(base);
  const flat = flatness(heights, size, base);

  const left: number[] = [];
  const right: number[] = [];
  base.forEach((_, k) => {
    const width = HALF_WIDTH_STEEP + (HALF_WIDTH_FLAT - HALF_WIDTH_STEEP) * flat[k]!;
    left.push(Math.max(MIN_HALF_WIDTH, width + BANK_WOBBLE * noise(along[k]! / 13, 3.7)));
    right.push(Math.max(MIN_HALF_WIDTH, width + BANK_WOBBLE * noise(along[k]! / 13, -8.1)));
  });
  const pool = new Array<boolean>(base.length).fill(false);
  for (const center of pickSpots(
    along,
    flat,
    random,
    rangeInt(random, POOLS),
    POOL_SPACING,
    true,
  )) {
    const radius = range(random, POOL_RADIUS);
    // Tůň je mírně vyosená – jeden břeh se vyklene víc.
    const skew = (random.next() - 0.5) * 0.4;
    base.forEach((_, k) => {
      const t = Math.abs(along[k]! - along[center]!) / (radius * 1.4);
      if (t >= 1) return;
      const bump = 0.5 + 0.5 * Math.cos(Math.PI * t);
      left[k] = Math.max(left[k]!, radius * (1 + skew) * bump);
      right[k] = Math.max(right[k]!, radius * (1 - skew) * bump);
      if (t < 0.6) pool[k] = true;
    });
  }
  const shallow = new Array<boolean>(base.length).fill(false);
  const shallowSpots = pickSpots(
    along,
    flat,
    random,
    rangeInt(random, SHALLOWS),
    POOL_SPACING / 2,
    false,
  );
  for (const center of shallowSpots) {
    const halfWidth = range(random, SHALLOW_HALF_WIDTH);
    base.forEach((_, k) => {
      if (pool[k] || Math.abs(along[k]! - along[center]!) > SHALLOW_LENGTH) return;
      shallow[k] = true;
      left[k] = Math.max(left[k]!, halfWidth);
      right[k] = Math.max(right[k]!, halfWidth);
    });
  }
  // Mělčina nesmí sahat do tůně (ani do jejího náběhu).
  base.forEach((_, k) => {
    if ((left[k]! + right[k]!) / 2 >= 1.35) shallow[k] = false;
  });

  const longWave = range(random, LONG_WAVE);
  const shortWave = range(random, SHORT_WAVE);
  const longPhase = random.next() * Math.PI * 2;
  const shortPhase = random.next() * Math.PI * 2;
  const amplitude = range(random, AMPLITUDE);
  return {
    base,
    along,
    flat,
    left,
    right,
    pool,
    shallow,
    longWave,
    shortWave,
    longPhase,
    shortPhase,
    amplitude,
  };
}

/** Osa potoka jako lomená čára s vlastnostmi bodů (po vložení smyčky delší než trasa). */
interface ChannelLine {
  points: readonly { x: number; y: number }[];
  left: readonly number[];
  right: readonly number[];
  shallow: readonly boolean[];
  pool: readonly boolean[];
  /** Index bodu trasy, ze kterého bod vznikl; bod smyčky −1. */
  baseIndex: readonly number[] | null;
  /** 1 = bod smyčky (vzájemné přiblížení bodů smyčky je záměr – šíje ostrožny). */
  inLoop: Uint8Array | null;
}

/**
 * Osa potoka z plánu: meandry nad trasou (kde by se přiblížily k sobě, zkřížily nebo vytvořily
 * strmou šíji, meandr se tam zmírní) a se smyčkou `loop` místo jejího úseku. Smyčka, která by se
 * dotkla zbytku potoka, se nepoužije – vrací null.
 */
export function buildStream(
  plan: StreamPlan,
  heights: Float32Array,
  size: number,
  loop: StreamLoop | null,
): { samples: ChannelSample[]; water: Uint8Array } | null {
  const { base, along, flat } = plan;
  const { longWave, shortWave, longPhase, shortPhase, amplitude } = plan;
  const total = along.at(-1)!;
  const normals = base.map((_, k) => tangent(base, k));
  // Kolem smyčky meandry utichnou (bez smyčky násobí 1 – osa je bit po bitu jako dřív).
  const calm = along.map((s) => (loop ? loopCalm(loop, s) : 1));
  // Kde by se meandry přiblížily k sobě, zkřížily nebo vytvořily strmou šíji, meandr se tam
  // zmírní – jen lokálně, zbytek potoka meandruje dál.
  const scale = new Float64Array(base.length).fill(1);
  let line = channelLine(base, plan, loop);
  for (let attempt = 0; attempt < 10; attempt++) {
    const axis = base.map((p, k) => {
      const s = along[k]!;
      const taper = smoothstep(s / EDGE_TAPER) * smoothstep((total - s) / EDGE_TAPER);
      const envelope = (STEEP_AMPLITUDE + (1 - STEEP_AMPLITUDE) * flat[k]!) * taper * calm[k]!;
      const offset =
        amplitude *
        scale[k]! *
        envelope *
        (Math.sin((2 * Math.PI * s) / longWave + longPhase) +
          SHORT_SHARE * Math.sin((2 * Math.PI * s) / shortWave + shortPhase));
      const { tx, ty } = normals[k]!;
      return {
        x: Math.min(size - 1, Math.max(0, p.x - ty * offset)),
        y: Math.min(size - 1, Math.max(0, p.y + tx * offset)),
      };
    });
    line = channelLine(axis, plan, loop);
    const conflicts = conflictingPoints(
      line.points,
      line.left,
      line.right,
      estimateLevels(heights, size, line.points),
      line.inLoop,
    );
    if (conflicts.length === 0) break;
    if (attempt === 9) {
      if (loop) return null;
      scale.fill(0);
      line = channelLine(base, plan, loop);
      break;
    }
    const window = CALM_WINDOW / SAMPLE_STEP;
    const calmDown = new Float64Array(base.length).fill(1);
    for (const point of conflicts) {
      const c = line.baseIndex ? line.baseIndex[point]! : point;
      if (c < 0) continue;
      for (let k = Math.max(0, c - window); k <= Math.min(base.length - 1, c + window); k++) {
        const t = Math.abs(k - c) / window;
        calmDown[k] = Math.min(calmDown[k]!, 1 - 0.5 * (0.5 + 0.5 * Math.cos(Math.PI * t)));
      }
    }
    calmDown.forEach((factor, k) => (scale[k] = scale[k]! * factor));
  }

  // Po posunutí do meandrů se body v obloucích roztáhnou – znovu rovnoměrně po SAMPLE_STEP,
  // jinak by osa mezi sousedními body přeskočila políčko.
  const axis = line.points;
  const axisAlong = arcLengths(axis);
  const count = Math.max(2, Math.round(axisAlong.at(-1)! / SAMPLE_STEP) + 1);
  const points: {
    x: number;
    y: number;
    left: number;
    right: number;
    shallow: boolean;
    pool: boolean;
  }[] = [];
  let segment = 0;
  for (let j = 0; j < count; j++) {
    const target = (axisAlong.at(-1)! * j) / (count - 1);
    while (segment < axis.length - 2 && axisAlong[segment + 1]! < target) segment++;
    const length = axisAlong[segment + 1]! - axisAlong[segment]!;
    const t = length > 0 ? (target - axisAlong[segment]!) / length : 0;
    const a = segment;
    const b = segment + 1;
    const near = t < 0.5 ? a : b;
    points.push({
      x: axis[a]!.x + (axis[b]!.x - axis[a]!.x) * t,
      y: axis[a]!.y + (axis[b]!.y - axis[a]!.y) * t,
      left: line.left[a]! + (line.left[b]! - line.left[a]!) * t,
      right: line.right[a]! + (line.right[b]! - line.right[a]!) * t,
      shallow: line.shallow[near]!,
      pool: line.pool[near]!,
    });
  }
  const samples: ChannelSample[] = points.map((p, k) => {
    const { tx, ty } = tangent(points, k);
    return { ...p, s: (axisAlong.at(-1)! * k) / (count - 1), tx, ty };
  });
  return { samples, water: rasterize(samples, heights, size) };
}

/** Utišení meandrů kolem smyčky: v jejím úseku 0, do LOOP_CALM políček plynule zpět na 1. */
function loopCalm(loop: StreamLoop, s: number): number {
  if (s < loop.from) return smoothstep((loop.from - s) / LOOP_CALM);
  if (s > loop.to) return smoothstep((s - loop.to) / LOOP_CALM);
  return 0;
}

/**
 * Osa s vlastnostmi bodů; se smyčkou se úsek trasy nahradí jejími body (šířky plynule mezi
 * konci úseku, bez tůní a mělčin). Bez smyčky vrací přímo pole plánu.
 */
function channelLine(
  axis: readonly { x: number; y: number }[],
  plan: StreamPlan,
  loop: StreamLoop | null,
): ChannelLine {
  if (!loop) {
    return {
      points: axis,
      left: plan.left,
      right: plan.right,
      shallow: plan.shallow,
      pool: plan.pool,
      baseIndex: null,
      inLoop: null,
    };
  }
  const first = plan.along.findIndex((s) => s >= loop.from);
  const after = plan.along.findIndex((s) => s > loop.to);
  const before = Math.max(0, first - 1);
  const points: { x: number; y: number }[] = [];
  const left: number[] = [];
  const right: number[] = [];
  const shallow: boolean[] = [];
  const pool: boolean[] = [];
  const baseIndex: number[] = [];
  const inLoop: number[] = [];
  const push = (
    p: { x: number; y: number },
    k: number,
    l: number,
    r: number,
    own: boolean,
  ): void => {
    points.push(p);
    left.push(l);
    right.push(r);
    shallow.push(own ? false : plan.shallow[k]!);
    pool.push(own ? false : plan.pool[k]!);
    baseIndex.push(own ? -1 : k);
    inLoop.push(own ? 1 : 0);
  };
  for (let k = 0; k < first; k++) push(axis[k]!, k, plan.left[k]!, plan.right[k]!, false);
  loop.points.forEach((p, j) => {
    const t = loop.points.length > 1 ? j / (loop.points.length - 1) : 0;
    const l = plan.left[before]! + (plan.left[after]! - plan.left[before]!) * t;
    const r = plan.right[before]! + (plan.right[after]! - plan.right[before]!) * t;
    push(p, -1, l, r, true);
  });
  for (let k = after; k < axis.length; k++) push(axis[k]!, k, plan.left[k]!, plan.right[k]!, false);
  return { points, left, right, shallow, pool, baseIndex, inLoop: Uint8Array.from(inLoop) };
}

/** Body trasy → hladká osa s rovnoměrnými rozestupy SAMPLE_STEP (konce zůstávají na okrajích). */
export function smoothPolyline(
  points: readonly { x: number; y: number }[],
  size: number,
): { x: number; y: number }[] {
  let line = points.filter((_, k) => k % 3 === 0 || k === points.length - 1);
  for (let pass = 0; pass < 4; pass++) line = chaikin(line);
  line = resample(line, SAMPLE_STEP);
  // Klouzavý průměr – trasa po mřížce má ostré lomy, osa pro meandry potřebuje velké oblouky.
  for (let pass = 0; pass < 3; pass++) {
    line = line.map((p, k) => {
      if (k === 0 || k === line.length - 1) return p;
      const from = Math.max(0, k - 6);
      const to = Math.min(line.length - 1, k + 6);
      let x = 0;
      let y = 0;
      for (let j = from; j <= to; j++) {
        x += line[j]!.x;
        y += line[j]!.y;
      }
      const n = to - from + 1;
      return { x: Math.min(size - 1, x / n), y: Math.min(size - 1, y / n) };
    });
  }
  return resample(line, SAMPLE_STEP);
}

function chaikin(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [...points];
  const result = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (i > 0) result.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    if (i < points.length - 2)
      result.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  result.push(points.at(-1)!);
  return result;
}

function resample(
  points: readonly { x: number; y: number }[],
  step: number,
): { x: number; y: number }[] {
  const along = arcLengths(points);
  const total = along.at(-1)!;
  const count = Math.max(2, Math.round(total / step) + 1);
  const result: { x: number; y: number }[] = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    while (segment < points.length - 2 && along[segment + 1]! < s) segment++;
    const a = points[segment]!;
    const b = points[segment + 1]!;
    const length = along[segment + 1]! - along[segment]!;
    const t = length > 0 ? (s - along[segment]!) / length : 0;
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return result;
}

export function arcLengths(points: readonly { x: number; y: number }[]): number[] {
  const along = [0];
  for (let k = 1; k < points.length; k++) {
    along.push(
      along[k - 1]! + Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.y - points[k - 1]!.y),
    );
  }
  return along;
}

function tangent(
  points: readonly { x: number; y: number }[],
  k: number,
): { tx: number; ty: number } {
  const a = points[Math.max(0, k - 1)]!;
  const b = points[Math.min(points.length - 1, k + 1)]!;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { tx: (b.x - a.x) / length, ty: (b.y - a.y) / length };
}

/** Výška (m) v bodě – bilineárně mezi středy políček. */
export function heightAt(heights: Float32Array, size: number, p: { x: number; y: number }): number {
  const x = Math.min(size - 1, Math.max(0, p.x));
  const y = Math.min(size - 1, Math.max(0, p.y));
  const x0 = Math.min(size - 2, Math.floor(x));
  const y0 = Math.min(size - 2, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const h = (i: number, j: number): number => heights[j * size + i]!;
  const top = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const bottom = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Rovinatost toku 0–1 (1 = rovina) podle podélného spádu terénu pod osou – v rovinách potok
 * meandruje a rozlévá se, ve spádu je rovnější a užší. Vyhlazená podél toku.
 */
function flatness(
  heights: Float32Array,
  size: number,
  points: readonly { x: number; y: number }[],
): number[] {
  const span = 8; // bodů osy na každou stranu = 4 políčka
  const raw = points.map((_, k) => {
    const a = points[Math.max(0, k - span)]!;
    const b = points[Math.min(points.length - 1, k + span)]!;
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const slope = Math.abs(heightAt(heights, size, a) - heightAt(heights, size, b)) / distance;
    return 1 - smoothstep((slope - 0.06) / (0.4 - 0.06));
  });
  return raw.map((_, k) => {
    const from = Math.max(0, k - 10);
    const to = Math.min(raw.length - 1, k + 10);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += raw[j]!;
    return sum / (to - from + 1);
  });
}

/**
 * Místa podél toku pro tůně (nejrovnější) nebo mělčiny (nejstrmější) – s rozestupem, mimo
 * konce u okrajů mapy.
 */
function pickSpots(
  along: readonly number[],
  flat: readonly number[],
  random: Random,
  count: number,
  spacing: number,
  preferFlat: boolean,
): number[] {
  const total = along.at(-1)!;
  const candidates = along
    .map((s, k) => ({ k, s, score: (preferFlat ? flat[k]! : 1 - flat[k]!) + random.next() * 0.35 }))
    .filter((c) => c.s > EDGE_TAPER + 4 && c.s < total - EDGE_TAPER - 4)
    .sort((a, b) => b.score - a.score);
  const chosen: { k: number; s: number }[] = [];
  for (let gap = spacing; chosen.length < count && gap >= spacing / 4; gap /= 2) {
    for (const c of candidates) {
      if (chosen.length >= count) break;
      if (chosen.every((o) => Math.abs(o.s - c.s) >= gap)) chosen.push(c);
    }
  }
  return chosen.map((c) => c.k);
}

/** Odhad hladiny podél osy: klesající minimum terénu pod osou (koryto se vyhloubí později). */
function estimateLevels(
  heights: Float32Array,
  size: number,
  axis: readonly { x: number; y: number }[],
): number[] {
  let level = Infinity;
  return axis.map((p) => (level = Math.min(level, heightAt(heights, size, p))));
}

/**
 * Body osy, kde se dvě části koryta přiblíží víc, než dovolí jejich šířky (daleko od sebe
 * podél toku), nebo kde vznikne strmá šíje (vlásenka s velkým rozdílem hladin).
 */
function conflictingPoints(
  axis: readonly { x: number; y: number }[],
  left: readonly number[],
  right: readonly number[],
  levels: readonly number[],
  inLoop: Uint8Array | null = null,
): number[] {
  const along = arcLengths(axis);
  const width = (k: number): number => Math.max(left[k]!, right[k]!);
  const cell = 4;
  const buckets = new Map<number, number[]>();
  const key = (bx: number, by: number): number => bx * 1000 + by;
  axis.forEach((p, k) => {
    const id = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
    const list = buckets.get(id);
    if (list) list.push(k);
    else buckets.set(id, [k]);
  });
  const conflicts = new Set<number>();
  for (let a = 0; a < axis.length; a++) {
    const pa = axis[a]!;
    const bx = Math.floor(pa.x / cell);
    const by = Math.floor(pa.y / cell);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (const b of buckets.get(key(bx + dx, by + dy)) ?? []) {
          if (b <= a || (inLoop && inLoop[a] && inLoop[b])) continue;
          const apart = along[b]! - along[a]!;
          const distance = Math.hypot(pa.x - axis[b]!.x, pa.y - axis[b]!.y);
          const gap = width(a) + width(b) + CHANNEL_GAP;
          const touching = apart >= gap * 3 && distance < gap;
          const steepNeck =
            Math.abs(levels[a]! - levels[b]!) > NECK_DROP_M &&
            distance < Math.min(width(a) + width(b) + NECK_GAP, NECK_CHORD * apart);
          if (touching || steepNeck) {
            conflicts.add(a);
            conflicts.add(b);
          }
        }
      }
    }
  }
  return [...conflicts];
}

/**
 * Vodní políčka: střed políčka leží mezi levým a pravým okrajem vody u nejbližšího bodu osy,
 * navíc políčka, kterými osa prochází (potok je souvislý i tam, kde je užší než políčko).
 */
export function rasterize(
  samples: readonly ChannelSample[],
  heights: Float32Array,
  size: number,
): Uint8Array {
  const water = new Uint8Array(size * size);
  const best = new Float32Array(size * size).fill(Infinity);
  const inside = new Uint8Array(size * size);
  for (const p of samples) {
    const reach = Math.ceil(Math.max(p.left, p.right)) + 1;
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
        if (d >= best[i]!) continue;
        best[i] = d;
        // Kladně vlevo od směru toku.
        const lateral = -(x - p.x) * p.ty + (y - p.y) * p.tx;
        inside[i] = Math.abs(lateral) <= (lateral >= 0 ? p.left : p.right) ? 1 : 0;
      }
    }
  }
  for (let i = 0; i < water.length; i++) water[i] = inside[i]!;

  let previous = -1;
  for (const p of samples) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const i = y * size + x;
    water[i] = 1;
    if (previous !== -1 && previous !== i) {
      const px = previous % size;
      const py = Math.floor(previous / size);
      // Diagonální krok doplníme o nižší z rohových políček – potok je souvislý i po hranách.
      if (px !== x && py !== y) {
        const a = py * size + x;
        const b = y * size + px;
        water[heights[a]! <= heights[b]! ? a : b] = 1;
      }
    }
    previous = i;
  }
  return water;
}

function range(random: Random, [min, max]: readonly [number, number]): number {
  return min + random.next() * (max - min);
}

function rangeInt(random: Random, [min, max]: readonly [number, number]): number {
  return min + Math.floor(random.next() * (max - min + 1));
}
