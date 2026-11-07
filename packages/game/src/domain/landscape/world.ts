import type { Landscape } from './types';

// Svět scény v metrech: osa X = sloupec políčka (x), osa Z = řádek (y), střed krajiny v počátku.
// Stejné převody používá scéna (apps/web/lib/scene/tile-at.ts).

/** Rozměr mřížky políček – stačí k převodům mezi políčky a světem. */
export type TileGrid = Pick<Landscape, 'size' | 'cellSizeM'>;

function halfExtent(l: TileGrid): number {
  return (l.size * l.cellSizeM) / 2;
}

/** Políčko, do kterého padne bod světa; mimo krajinu null. */
export function tileOfWorldPoint(
  l: Landscape,
  x: number,
  z: number,
): { x: number; y: number } | null {
  const half = halfExtent(l);
  const tileX = Math.floor((x + half) / l.cellSizeM);
  const tileY = Math.floor((z + half) / l.cellSizeM);
  if (tileX < 0 || tileY < 0 || tileX >= l.size || tileY >= l.size) return null;
  return { x: tileX, y: tileY };
}

/** Střed políčka ve světě. */
export function tileCenterWorld(l: Landscape, x: number, y: number): { x: number; z: number } {
  const half = halfExtent(l);
  return { x: -half + (x + 0.5) * l.cellSizeM, z: -half + (y + 0.5) * l.cellSizeM };
}

/** Výška terénu (m, bez převýšení scény) v bodě světa – bilineárně mezi středy políček. */
export function heightAtWorld(l: Landscape, x: number, z: number): number {
  return sampleTilesAtWorld(l, l.heights, x, z);
}

/** Hodnota pole po políčkách (index y * size + x) v bodě světa – bilineárně mezi středy políček. */
export function sampleTilesAtWorld(
  l: TileGrid,
  values: ArrayLike<number>,
  x: number,
  z: number,
): number {
  const half = halfExtent(l);
  const fx = Math.min(l.size - 1, Math.max(0, (x + half) / l.cellSizeM - 0.5));
  const fz = Math.min(l.size - 1, Math.max(0, (z + half) / l.cellSizeM - 0.5));
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(l.size - 1, x0 + 1);
  const z1 = Math.min(l.size - 1, z0 + 1);
  const v = (tx: number, tz: number): number => values[tz * l.size + tx]!;
  const top = v(x0, z0) + (v(x1, z0) - v(x0, z0)) * (fx - x0);
  const bottom = v(x0, z1) + (v(x1, z1) - v(x0, z1)) * (fx - x0);
  return top + (bottom - top) * (fz - z0);
}
