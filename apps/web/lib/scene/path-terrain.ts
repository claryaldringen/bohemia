// Terén pro vyšlapané pěšiny (docs/design/paths.md) – cena chůze po buňkách hrubé mřížky
// kolem vsi. Mřížka sedí na body sítě vykreslení (render-surface.ts, krok ≈ 3,75 m): výška
// a hladina potoka se jen přečtou, les se vzorkuje z pole lesa. Jen terén krajiny – ves (domy,
// pole, hroby) a překážky přidá až path-network.ts. Čisté funkce, bez Babylonu.

/** Buňka je suchý břeh u vody – sem se chodí pro vodu. */
export const PATH_WATER_SPOT = 1;
/** Buňka je na okraji lesa – sem se chodí pro dřevo na otop. */
export const PATH_FOREST_EDGE = 2;
/** Buňka je brod – mělký úzký potok, kudy se dá přejít. */
export const PATH_FORD = 4;

/**
 * Sklon (m/m), při kterém je chůze dvakrát dražší než po rovině – cena roste se čtvercem sklonu:
 * mírné svahy (do 0,05) skoro nevadí, prudší pěšina obchází po vrstevnici.
 */
const SLOPE_REF = 0.1;
/** Prudší svah (m/m) je neprůchodný. */
const SLOPE_MAX = 0.45;
/** Voda hlubší než tolik (m) je potok (mělčí je mokrý břeh). */
const WATER_DEPTH_M = 0.03;
/** Brodit se je dražší než jít po louce (mokro, kluzké kameny). */
const FORD_COST = 5;
/** Les: kolikrát dražší je chůze uvnitř lesa (podrost, kořeny) – stromy přidají překážky zvlášť. */
const FOREST_COST = 1.35;
/** Okraj lesa, kam se chodí pro dřevo: znaménková vzdálenost od hranice (m, záporná v louce). */
const FOREST_EDGE_M = { from: -4, to: 1 };
/** U okraje krajiny se nechodí (m). */
const EDGE_MARGIN_M = 10;

/** Zdroj terénu – síť vykreslení (RenderSurface) a pole lesa. */
export interface PathTerrainSource {
  /** Bodů sítě na stranu. */
  resolution: number;
  /** Světové souřadnice bodu (0, 0) a krok sítě (m). */
  originX: number;
  originZ: number;
  step: number;
  /** Výška terénu v bodech sítě (m, bez převýšení). */
  heights: ArrayLike<number>;
  /** Hladina potoka v bodech sítě (m), −Infinity daleko od potoka. */
  waterLevel: ArrayLike<number>;
  /** Znaménková vzdálenost od hranice lesa (m): kladná v lese. */
  forestDistance(x: number, z: number): number;
  /** Mělký úzký úsek potoka, kudy se dá přebrodit. */
  ford(x: number, z: number): boolean;
  /** Polovina strany krajiny (m) – okraj krajiny. */
  halfExtent: number;
}

/** Okno mřížky – rozsah bodů sítě (včetně). */
export interface PathWindow {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

/** Terén pěšin v okně: cena chůze a příznaky po buňkách (index j * width + i). */
export interface PathTerrain {
  width: number;
  height: number;
  /** Světové souřadnice středu buňky (0, 0) a strana buňky (m). */
  originX: number;
  originZ: number;
  cellM: number;
  /** Okno v síti vykreslení – podle něj se terén nepočítá znovu, dokud ho ves nepřeroste. */
  window: PathWindow;
  /** Násobek ceny chůze po rovné louce (1); Infinity = neprůchodné (voda, sráz, okraj). */
  cost: Float32Array;
  /** PATH_WATER_SPOT | PATH_FOREST_EDGE | PATH_FORD. */
  flags: Uint8Array;
}

/** Okno sítě, které pokryje obdélník světa (m) – oříznuté na krajinu. */
export function pathWindowFor(
  source: Pick<PathTerrainSource, 'resolution' | 'originX' | 'originZ' | 'step'>,
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): PathWindow {
  const n = source.resolution;
  const at = (v: number, origin: number): number => (v - origin) / source.step;
  return {
    i0: Math.max(0, Math.floor(at(bounds.minX, source.originX))),
    j0: Math.max(0, Math.floor(at(bounds.minZ, source.originZ))),
    i1: Math.min(n - 1, Math.ceil(at(bounds.maxX, source.originX))),
    j1: Math.min(n - 1, Math.ceil(at(bounds.maxZ, source.originZ))),
  };
}

/** Okno `inner` leží celé v okně `outer`. */
export function windowContains(outer: PathWindow, inner: PathWindow): boolean {
  return (
    inner.i0 >= outer.i0 && inner.j0 >= outer.j0 && inner.i1 <= outer.i1 && inner.j1 <= outer.j1
  );
}

/**
 * Terén pěšin v okně sítě: rovina 1, sklon zdražuje se čtvercem (sráz neprůchodný), les
 * o třetinu dražší, voda neprůchodná kromě brodů. Příznaky: suchý břeh u vody (pro vodu), okraj
 * lesa (pro dřevo), brod.
 */
export function buildPathTerrain(source: PathTerrainSource, window: PathWindow): PathTerrain {
  const n = source.resolution;
  const width = window.i1 - window.i0 + 1;
  const height = window.j1 - window.j0 + 1;
  const cost = new Float32Array(width * height);
  const flags = new Uint8Array(width * height);
  const wet = new Uint8Array(width * height);
  const step = source.step;
  const edge = source.halfExtent - EDGE_MARGIN_M;
  const h = (i: number, j: number): number =>
    source.heights[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const gi = window.i0 + i;
      const gj = window.j0 + j;
      const c = j * width + i;
      const x = source.originX + gi * step;
      const z = source.originZ + gj * step;
      if (Math.abs(x) > edge || Math.abs(z) > edge) {
        cost[c] = Infinity;
        continue;
      }
      const v = gj * n + gi;
      if (source.waterLevel[v]! > source.heights[v]! + WATER_DEPTH_M) {
        wet[c] = 1;
        if (source.ford(x, z)) {
          cost[c] = FORD_COST;
          flags[c] = flags[c]! | PATH_FORD;
        } else {
          cost[c] = Infinity;
        }
        continue;
      }
      const gx = (h(gi + 1, gj) - h(gi - 1, gj)) / (2 * step);
      const gz = (h(gi, gj + 1) - h(gi, gj - 1)) / (2 * step);
      const slope = Math.hypot(gx, gz);
      if (slope > SLOPE_MAX) {
        cost[c] = Infinity;
        continue;
      }
      const forest = source.forestDistance(x, z);
      let k = 1 + (slope / SLOPE_REF) ** 2;
      if (forest > 0) k *= FOREST_COST;
      if (forest >= FOREST_EDGE_M.from && forest <= FOREST_EDGE_M.to)
        flags[c] = flags[c]! | PATH_FOREST_EDGE;
      cost[c] = k;
    }
  }
  // suchý průchodný břeh vedle vody – tam se nabírá voda
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const c = j * width + i;
      if (wet[c] || !Number.isFinite(cost[c]!)) continue;
      let water = false;
      for (let dj = -1; dj <= 1 && !water; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue;
          if (wet[jj * width + ii]) {
            water = true;
            break;
          }
        }
      }
      if (water) flags[c] = flags[c]! | PATH_WATER_SPOT;
    }
  }
  return {
    width,
    height,
    originX: source.originX + window.i0 * step,
    originZ: source.originZ + window.j0 * step,
    cellM: step,
    window,
    cost,
    flags,
  };
}

/** Překážka krajiny pro pěšiny: střed, poloměr (m) a cena navíc (Infinity = neprůchodná). */
export type PathObstacleVisitor = (x: number, z: number, radius: number, extra: number) => void;

/**
 * Terén s překážkami krajiny (stromy, keře, kameny, výchozy): buňce s kmenem nebo keřem se
 * přičte cena, balvan a výchoz (do poloměru) jsou neprůchodné. `visitAll` projde překážky
 * v obdélníku okna. Nový objekt – původní terén zůstane.
 */
export function withObstacles(
  terrain: PathTerrain,
  visitAll: (
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: PathObstacleVisitor,
  ) => void,
): PathTerrain {
  const cost = new Float32Array(terrain.cost);
  const { width, height, originX, originZ, cellM } = terrain;
  const half = cellM / 2;
  visitAll(
    originX,
    originZ,
    originX + (width - 1) * cellM,
    originZ + (height - 1) * cellM,
    (x, z, radius, extra) => {
      const reach = Math.max(radius, half);
      const i0 = Math.max(0, Math.ceil((x - reach - originX) / cellM - 1e-6));
      const j0 = Math.max(0, Math.ceil((z - reach - originZ) / cellM - 1e-6));
      const i1 = Math.min(width - 1, Math.floor((x + reach - originX) / cellM + 1e-6));
      const j1 = Math.min(height - 1, Math.floor((z + reach - originZ) / cellM + 1e-6));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = originX + i * cellM;
          const cz = originZ + j * cellM;
          if (radius > half && Math.hypot(cx - x, cz - z) > radius) continue;
          const c = j * width + i;
          cost[c] = cost[c]! + extra;
        }
      }
    },
  );
  return { ...terrain, cost };
}
