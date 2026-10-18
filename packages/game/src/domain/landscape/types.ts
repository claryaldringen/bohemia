export const LANDSCAPE_SIZE = 128;
export const CELL_SIZE_M = 15;

export type Surface = 'water' | 'forest' | 'meadow';
export const SURFACE_CODES = { water: 0, forest: 1, meadow: 2 } as const;
const SURFACES_BY_CODE: readonly Surface[] = ['water', 'forest', 'meadow'];

/** Verze vrstev generátoru – ukládají se u sídla, aby změna generátoru nepřepsala jeho krajinu. */
export interface LayerVersions {
  terrain: 1;
  /** 2 = víc kvalitní louky kolem vsi (18. 10. 2026). */
  vegetation: 1 | 2;
  /** 2 = úrodná niva a mírné svahy (18. 10. 2026). */
  fertility: 1 | 2;
  /**
   * Vrstva překážek (stromy, keře, kameny – `generateObstacles`). Chybí u sídel založených před
   * jejím vznikem – nová vrstva platí pro všechna sídla, takže u nich je to verze 1.
   */
  obstacles?: 1;
}
/** Verze vrstev pro nová sídla. */
export const CURRENT_LAYER_VERSIONS: LayerVersions = {
  terrain: 1,
  vegetation: 2,
  fertility: 2,
  obstacles: 1,
};
/** Verze vrstev sídel založených do 18. 10. 2026 – jejich krajina se generuje dál stejně. */
export const INITIAL_LAYER_VERSIONS: LayerVersions = {
  terrain: 1,
  vegetation: 1,
  fertility: 1,
  obstacles: 1,
};

/** Seed a verze vrstvy překážek, ze kterých ji `generateObstacles` vygeneruje (líně). */
export interface ObstacleLayerSeed {
  readonly seed: number;
  readonly version: 1;
}

/**
 * Bod osy potoka, seřazené po proudu. Souřadnice v políčkách (celé číslo = střed políčka),
 * šířky v políčkách: levý břeh leží ve směru (−ty, tx) od směru toku (tx, ty).
 */
export interface StreamPoint {
  readonly x: number;
  readonly y: number;
  /** Vzdálenost levého a pravého okraje vody od osy (políčka) – břehy meandrují každý jinak. */
  readonly halfWidthLeft: number;
  readonly halfWidthRight: number;
  /** Hladina (m nad nejnižším políčkem krajiny); po proudu nestoupá. */
  readonly level: number;
  /** Mělčina nebo brod – široký mělký úsek (rákos, štěrk), ne tůň. */
  readonly shallow: boolean;
}

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
  /** Osa potoka s šířkou břehů a hladinou (pro vykreslení koryta). */
  readonly stream: readonly StreamPoint[];
  /**
   * Vrstva překážek se negeneruje s krajinou (stovky ms) – až když je potřeba, ze seedu a verze
   * (`obstaclesOf`). null = krajina bez překážek (ručně vyrobená krajina v testech).
   */
  readonly obstacleLayer: ObstacleLayerSeed | null;
}

export function surfaceAt(landscape: Landscape, x: number, y: number): Surface {
  return SURFACES_BY_CODE[landscape.surface[y * landscape.size + x]!]!;
}
