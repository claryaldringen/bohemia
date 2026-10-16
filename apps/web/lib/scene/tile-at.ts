import type { Landscape } from '@bohemia/game';

// Souřadnice světa: osa X = sloupec políčka (x), osa Z = řádek (y), střed krajiny v počátku.

export function tileAt(
  l: Landscape,
  worldX: number,
  worldZ: number,
): { x: number; y: number } | null {
  const half = (l.size * l.cellSizeM) / 2;
  const x = Math.floor((worldX + half) / l.cellSizeM);
  const y = Math.floor((worldZ + half) / l.cellSizeM);
  if (x < 0 || y < 0 || x >= l.size || y >= l.size) return null;
  return { x, y };
}

export function tileCenter(l: Landscape, x: number, y: number): { worldX: number; worldZ: number } {
  const half = (l.size * l.cellSizeM) / 2;
  return {
    worldX: -half + (x + 0.5) * l.cellSizeM,
    worldZ: -half + (y + 0.5) * l.cellSizeM,
  };
}

/** Výška terénu (m, bez převýšení) v bodě světa – bilineárně mezi středy políček. */
export function heightAt(l: Landscape, worldX: number, worldZ: number): number {
  const half = (l.size * l.cellSizeM) / 2;
  const fx = Math.min(l.size - 1, Math.max(0, (worldX + half) / l.cellSizeM - 0.5));
  const fz = Math.min(l.size - 1, Math.max(0, (worldZ + half) / l.cellSizeM - 0.5));
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(l.size - 1, x0 + 1);
  const z1 = Math.min(l.size - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const h = (x: number, z: number): number => l.heights[z * l.size + x]!;
  const top = h(x0, z0) + (h(x1, z0) - h(x0, z0)) * tx;
  const bottom = h(x0, z1) + (h(x1, z1) - h(x0, z1)) * tx;
  return top + (bottom - top) * tz;
}
