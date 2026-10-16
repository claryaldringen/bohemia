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
