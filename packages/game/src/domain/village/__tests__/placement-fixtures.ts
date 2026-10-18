import { SURFACE_CODES, type Landscape, type Surface } from '../../landscape';
import type { TileCell } from '../types';

// Ručně vyrobená krajina pro testy umisťování: políčka 15 m, střed krajiny v počátku.
// Při velikosti 16 leží hranice políček na násobcích 15 m (…, −15, 0, 15, …).

export interface LandscapeSpec {
  size?: number;
  surface?: (x: number, y: number) => Surface;
  height?: (x: number, y: number) => number;
  fertility?: (x: number, y: number) => number;
}

export function makeLandscape(spec: LandscapeSpec = {}): Landscape {
  const size = spec.size ?? 16;
  const heights = new Float32Array(size * size);
  const surface = new Uint8Array(size * size);
  const fertility = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      heights[i] = spec.height?.(x, y) ?? 0;
      surface[i] = SURFACE_CODES[spec.surface?.(x, y) ?? 'meadow'];
      fertility[i] = spec.fertility?.(x, y) ?? 50;
    }
  }
  return {
    size,
    cellSizeM: 15,
    heights,
    surface,
    fertility,
    villageSite: { x: size / 2, y: size / 2 },
    stream: [],
    obstacleLayer: null,
  };
}

/** Obdélník čtverců (políček) s levým horním čtvercem (x, y), po řádcích. */
export function block(x: number, y: number, width: number, height: number): TileCell[] {
  const cells: TileCell[] = [];
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) cells.push({ x: x + i, y: y + j });
  return cells;
}
