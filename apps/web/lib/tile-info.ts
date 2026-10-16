import type { Surface } from '@bohemia/game';

export interface TileInfo {
  x: number;
  y: number;
  surface: Surface;
  fertility: number;
  heightM: number;
}

const SURFACE_NAMES: Record<Surface, string> = { water: 'Voda', forest: 'Les', meadow: 'Louka' };

export function formatTileInfo(tile: TileInfo): string {
  return `${SURFACE_NAMES[tile.surface]} · úrodnost ${tile.fertility}`;
}
