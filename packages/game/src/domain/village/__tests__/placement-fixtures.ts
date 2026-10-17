import { SURFACE_CODES, type Landscape, type Surface } from '../../landscape';

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
  };
}

/** Osový čtverec s levým horním rohem (x, z). */
export function square(x: number, z: number, side: number): [number, number][] {
  return [
    [x, z],
    [x + side, z],
    [x + side, z + side],
    [x, z + side],
  ];
}
