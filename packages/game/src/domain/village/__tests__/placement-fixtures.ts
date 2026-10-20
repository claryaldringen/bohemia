import { SURFACE_CODES, type Landscape, type Surface } from '../../landscape';
import { dwellingFrame, shapeRect } from '../dwelling-shape';
import { DWELLING_CLEARING_M } from '../rules';
import type { DwellingType, TileCell } from '../types';

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

/**
 * Vyklízená plocha obydlí bez natočení ve světě i s variantou rozměrů podle polohy (population.md
 * – Varianty rozměrů), rozšířená o `margin` – jako `dwellingClearing`, jen obdélník s rozměry.
 */
export function clearingRect(
  type: DwellingType,
  position: { x: number; z: number },
  margin = 0,
): { minX: number; maxX: number; minZ: number; maxZ: number; width: number; depth: number } {
  const c = shapeRect(dwellingFrame({ type, position }), DWELLING_CLEARING_M[type]);
  const minX = position.x + c.minX - margin;
  const maxX = position.x + c.maxX + margin;
  const minZ = position.z + c.minZ - margin;
  const maxZ = position.z + c.maxZ + margin;
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}
