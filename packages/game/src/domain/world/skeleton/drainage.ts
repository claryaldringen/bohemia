import type { GridCell } from '../../village/world-grid';
import { cellUnit, SKELETON_SALT, skeletonBase } from './hash';
import { SKELETON } from './rules-skeleton';

// Odvodnění po políčkách (world-skeleton.md – Řeky – odvodnění po políčkách): každé políčko
// světa odtéká na jih, nebo bokem k sousedovi v řádku s nižším číslem klidu – kruh proto
// nevznikne. Povodí = kolik políček do políčka odtéká (i nepřímo), počítá se proti proudu
// a končí na `upstreamCap`. Vše je funkce seedu světa a souřadnic; mezipaměť jen zrychluje.

/** Směr odtoku políčka – na jih, na východ, na západ. */
export const Drain = { S: 0, E: 1, W: 2 } as const;
export type Drain = (typeof Drain)[keyof typeof Drain];

/**
 * Mezipaměť kostry jednoho seedu světa – odtoky a povodí podle políčka. Smí jen zrychlit:
 * výsledek je stejný s ní i bez ní, v jakémkoli pořadí dotazů. Jiný seed světa odmítne.
 */
export interface SkeletonCache {
  readonly worldSeed: number;
  /** Základ hashů kostry (`skeletonBase`). */
  readonly base: number;
  readonly drain: Map<number, Drain>;
  readonly upstream: Map<number, number>;
}

/** Strop položek jedné mapy mezipaměti – pak se vyprázdní (výsledky se nezmění, jen zpomalí). */
const MAX_CACHE_ENTRIES = 2_000_000;

/** Souřadnice klíče mezipaměti jsou v ±2^24 – klíč pak přesně padne do 2^53. */
const KEY_LIMIT = 16_777_216;
const KEY_SPAN = 2 * KEY_LIMIT + 1;

export function createSkeletonCache(worldSeed: number): SkeletonCache {
  return { worldSeed, base: skeletonBase(worldSeed), drain: new Map(), upstream: new Map() };
}

/** Mezipaměť pro dotaz – předaná (jen se stejným seedem světa), jinak nová. */
export function skeletonContext(worldSeed: number, cache?: SkeletonCache): SkeletonCache {
  if (cache === undefined) return createSkeletonCache(worldSeed);
  if (cache.worldSeed !== worldSeed) {
    throw new RangeError(
      `Mezipaměť kostry patří seedu světa ${cache.worldSeed}, dotaz je pro ${worldSeed}.`,
    );
  }
  return cache;
}

function cellKey(x: number, y: number): number {
  if (!(Math.abs(x) <= KEY_LIMIT && Math.abs(y) <= KEY_LIMIT)) {
    throw new RangeError(`Políčko ${x},${y} je mimo rozsah kostry světa.`);
  }
  return (x + KEY_LIMIT) * KEY_SPAN + (y + KEY_LIMIT);
}

function remember<V>(map: Map<number, V>, key: number, value: V): void {
  if (map.size >= MAX_CACHE_ENTRIES) map.clear();
  map.set(key, value);
}

/** Přechod hladký na obou koncích (smoothstep na [0, 1]). */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Pomalý sklon východ/západ v [0, 1) – hodnotový šum mřížky s vlnou `biasWavelength` map,
 * bilineárně se smoothstep (jen + − × /).
 */
export function biasNoise(base: number, x: number, y: number): number {
  const w = SKELETON.river.biasWavelength;
  const gx = Math.floor(x / w);
  const gy = Math.floor(y / w);
  const tx = fade((x - gx * w) / w);
  const ty = fade((y - gy * w) / w);
  const v00 = cellUnit(base, SKELETON_SALT.bias, gx, gy);
  const v10 = cellUnit(base, SKELETON_SALT.bias, gx + 1, gy);
  const v01 = cellUnit(base, SKELETON_SALT.bias, gx, gy + 1);
  const v11 = cellUnit(base, SKELETON_SALT.bias, gx + 1, gy + 1);
  const south = v00 + (v10 - v00) * tx;
  const north = v01 + (v11 - v01) * tx;
  return south + (north - south) * ty;
}

function computeDrain(base: number, x: number, y: number): Drain {
  const calm = cellUnit(base, SKELETON_SALT.calm, x, y);
  const lowerE = cellUnit(base, SKELETON_SALT.calm, x + 1, y) < calm;
  const lowerW = cellUnit(base, SKELETON_SALT.calm, x - 1, y) < calm;
  if (!lowerE && !lowerW) return Drain.S;
  const bias = 2 * biasNoise(base, x, y) - 1;
  const share = SKELETON.river.lateralShare;
  const pE = lowerE ? share * (1 + bias) : 0;
  const pW = lowerW ? share * (1 - bias) : 0;
  const roll = cellUnit(base, SKELETON_SALT.drain, x, y);
  if (roll < pE) return Drain.E;
  if (roll < pE + pW) return Drain.W;
  return Drain.S;
}

/** Směr odtoku políčka (x, y) – z mezipaměti, nebo spočítaný a zapamatovaný. */
export function drainOf(ctx: SkeletonCache, x: number, y: number): Drain {
  const key = cellKey(x, y);
  const known = ctx.drain.get(key);
  if (known !== undefined) return known;
  const drain = computeDrain(ctx.base, x, y);
  remember(ctx.drain, key, drain);
  return drain;
}

/** Políčko, do kterého (x, y) odtéká. */
export function drainTargetOf(ctx: SkeletonCache, x: number, y: number): GridCell {
  const drain = drainOf(ctx, x, y);
  if (drain === Drain.E) return { x: x + 1, y };
  if (drain === Drain.W) return { x: x - 1, y };
  return { x, y: y - 1 };
}

/** Políčko, do kterého `cell` odtéká – jižní soused, nebo východní či západní s nižším klidem. */
export function drainTarget(worldSeed: number, cell: GridCell): GridCell {
  return drainTargetOf(createSkeletonCache(worldSeed), cell.x, cell.y);
}

/**
 * Povodí políčka (x, y): ono samo a všechna políčka, která do něj odtékají, nejvýš `upstreamCap`.
 * Procházení proti proudu (sever, východ, západ – kdo sem odtéká) zásobníkem; políčko se známým
 * povodím přičte celé (povodí sousedů se nepřekrývají – odtok vede vždy jen jedním směrem).
 * Výsledek = min(skutečné povodí, strop) bez ohledu na obsah mezipaměti.
 */
export function upstreamOf(ctx: SkeletonCache, x: number, y: number): number {
  const key = cellKey(x, y);
  const known = ctx.upstream.get(key);
  if (known !== undefined) return known;
  const cap = SKELETON.river.upstreamCap;
  let total = 0;
  const stack: number[] = [x, y];
  let root = true;
  while (stack.length > 0 && total < cap) {
    const ny = stack.pop() as number;
    const nx = stack.pop() as number;
    const cached = root ? undefined : ctx.upstream.get(cellKey(nx, ny));
    root = false;
    if (cached !== undefined) {
      total += cached;
      continue;
    }
    total += 1;
    if (drainOf(ctx, nx, ny + 1) === Drain.S) stack.push(nx, ny + 1);
    if (drainOf(ctx, nx + 1, ny) === Drain.W) stack.push(nx + 1, ny);
    if (drainOf(ctx, nx - 1, ny) === Drain.E) stack.push(nx - 1, ny);
  }
  const size = Math.min(total, cap);
  remember(ctx.upstream, key, size);
  return size;
}

/** Povodí políčka v mapách, nejvýš `upstreamCap`. */
export function upstreamSize(worldSeed: number, cell: GridCell, cache?: SkeletonCache): number {
  return upstreamOf(skeletonContext(worldSeed, cache), cell.x, cell.y);
}

/** Šířka řeky v metrech podle povodí, null pod `minUpstream` (políčkem řeka neteče). */
export function riverWidthM(upstream: number): number | null {
  let width: number | null = null;
  for (const [from, widthM] of SKELETON.river.widths) {
    if (upstream >= from) width = widthM;
  }
  return width;
}
