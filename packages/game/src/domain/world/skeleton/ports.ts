import { LANDSCAPE_SIZE } from '../../landscape/types';
import type { MapSide } from '../../landscape/skeleton/types';
import type { GridCell } from '../../village/world-grid';
import { cellUnit, SKELETON_SALT, skeletonBase } from './hash';
import { SKELETON } from './rules-skeleton';

// Body na okraji mapy (world-skeleton.md – Body na okraji): poloha bodu na hraně mezi dvěma
// políčky je z hashe hrany – obě mapy počítají stejnou hranu, proto stejný bod. Políčko podél
// strany se počítá od západu (strany N, S) a od jihu (E, W).

/** Strana mapy `from`, za kterou leží sousední políčko `to` (sever = +y mřížky světa). */
export function sideTowards(from: GridCell, to: GridCell): MapSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 1) return 'N';
  if (dx === 1 && dy === 0) return 'E';
  if (dx === 0 && dy === -1) return 'S';
  if (dx === -1 && dy === 0) return 'W';
  throw new RangeError(`Políčka ${from.x},${from.y} a ${to.x},${to.y} nesousedí stranou.`);
}

/**
 * Hash hrany mezi sousedními políčky v [0, 1) – stejný pro (a, b) i (b, a). Hrana ve sloupci
 * (sever–jih) a v řádku (východ–západ) mají vlastní sůl.
 */
export function edgeUnit(
  base: number,
  salts: { readonly ns: number; readonly ew: number },
  a: GridCell,
  b: GridCell,
): number {
  const side = sideTowards(a, b);
  if (side === 'N' || side === 'S') return cellUnit(base, salts.ns, a.x, Math.min(a.y, b.y));
  return cellUnit(base, salts.ew, Math.min(a.x, b.x), a.y);
}

/** Políčko podél strany z čísla v [0, 1): `margin` … `LANDSCAPE_SIZE` − 1 − `margin`. */
export function portFromUnit(unit: number): number {
  const { margin } = SKELETON.port;
  return margin + Math.floor(unit * (LANDSCAPE_SIZE - 2 * margin));
}

const RIVER_PORT_SALTS = { ns: SKELETON_SALT.riverPortNS, ew: SKELETON_SALT.riverPortEW };

/** Bod řeky na hraně mezi políčky – základ hashů už spočítaný (`skeletonBase`). */
export function riverPortAtBase(base: number, a: GridCell, b: GridCell): number {
  return portFromUnit(edgeUnit(base, RIVER_PORT_SALTS, a, b));
}

/** Bod řeky na hraně mezi sousedními políčky a a b (24–103), stejný z obou stran. */
export function riverPortAt(worldSeed: number, a: GridCell, b: GridCell): number {
  return riverPortAtBase(skeletonBase(worldSeed), a, b);
}
