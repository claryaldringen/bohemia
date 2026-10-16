export const LANDSCAPE_SIZE = 128;
export const CELL_SIZE_M = 15;

export type Surface = 'water' | 'forest' | 'meadow';
export const SURFACE_CODES = { water: 0, forest: 1, meadow: 2 } as const;
const SURFACES_BY_CODE: readonly Surface[] = ['water', 'forest', 'meadow'];

/** Verze vrstev generátoru – ukládají se u sídla, aby změna generátoru nepřepsala jeho krajinu. */
export interface LayerVersions {
  terrain: 1;
  vegetation: 1;
  fertility: 1;
}
export const CURRENT_LAYER_VERSIONS: LayerVersions = { terrain: 1, vegetation: 1, fertility: 1 };

/** Krajina sídla – mřížka size × size, index políčka y * size + x. */
export interface Landscape {
  readonly size: number;
  readonly cellSizeM: number;
  /** Metry nad nejnižším políčkem krajiny. */
  readonly heights: Float32Array;
  /** Kódy povrchu podle SURFACE_CODES. */
  readonly surface: Uint8Array;
  /** Úrodnost půdy 0–100. */
  readonly fertility: Uint8Array;
  /** Střed místa, kde se dá založit vesnice. */
  readonly villageSite: { x: number; y: number };
}

export function surfaceAt(landscape: Landscape, x: number, y: number): Surface {
  return SURFACES_BY_CODE[landscape.surface[y * landscape.size + x]!]!;
}
