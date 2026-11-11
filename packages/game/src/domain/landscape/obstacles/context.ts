import { deriveSeed } from '../random';
import type { ForestField } from '../forest-field';
import type { Relief } from '../relief';
import type { StreamCenterline } from '../stream-geometry';
import { SURFACE_CODES, type Landscape } from '../types';
import { tileOfWorldPoint } from '../world';
import { scatterHash, type ScatterHash } from '../det-math';

/** Co rozmisťovače překážek potřebují znát o krajině. */
export interface ScatterContext {
  /** Krajina s přesností prohlížeče (`transferPrecision`). */
  landscape: Landscape;
  field: ForestField;
  stream: StreamCenterline;
  relief: Relief;
  /** Seed vrstvy překážek – každý rozmisťovač si z něj odvodí vlastní (`ctx.seedFor`). */
  seed: number;
  /** Nejvyšší políčko krajiny (m) – pro skladbu lesa podle výšky. */
  maxHeight: number;
  /** Verze vrstvy překážek – 2 přidává skály a suť na stěnách u potoka. */
  version: 1 | 2;
}

/** Bez stromů, keřů a kamenů mimo les do této vzdálenosti (políčka) od místa pro vesnici. */
const VILLAGE_CLEARING_TILES = 2;

export function seedFor(ctx: ScatterContext, label: string): number {
  return deriveSeed(ctx.seed, label);
}

export function hashFor(ctx: ScatterContext, label: string): ScatterHash {
  return scatterHash(seedFor(ctx, label));
}

/** Kód povrchu políčka pod bodem světa, mimo krajinu null. */
export function surfaceCodeAt(l: Landscape, x: number, z: number): number | null {
  const tile = tileOfWorldPoint(l, x, z);
  return tile ? l.surface[tile.y * l.size + tile.x]! : null;
}

/** Políčko bodu leží do VILLAGE_CLEARING_TILES od místa pro vesnici (Čebyševova vzdálenost). */
export function nearVillageSite(l: Landscape, x: number, z: number): boolean {
  const tile = tileOfWorldPoint(l, x, z);
  if (!tile) return false;
  const site = l.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES;
}

/** Na souši (ne ve vodě, uvnitř krajiny) a mimo místo pro vesnici. */
export function onLandAwayFromVillage(l: Landscape, x: number, z: number): boolean {
  const code = surfaceCodeAt(l, x, z);
  return code !== null && code !== SURFACE_CODES.water && !nearVillageSite(l, x, z);
}
