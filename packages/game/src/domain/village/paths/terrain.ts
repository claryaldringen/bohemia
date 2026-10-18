import {
  BANK_REACH_M,
  SURFACE_CODES,
  buildForestField,
  length2,
  obstacleIndex,
  obstaclesNear,
  streamCenterline,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '../../landscape';
import { obstacleStatus, type ObstacleChanges } from '../obstacles';
import { OUTCROP_RADIUS_M } from '../rules';
import { isWoodTreeId } from '../woods';

// Terén pro vyšlapané pěšiny (docs/design/paths.md) – cena chůze po buňkách hrubé mřížky kolem
// vsi. Mřížka sedí na body sítě vykreslení scény (střed políčka + k × čtvrtina políčka, ≈ 3,75 m),
// výška je bilineárně z políček, voda z osy potoka, les z pole lesa. Pěšiny počítá server (cesta
// na pole – práce, fields.md – Vzdálenost) i prohlížeč (vzhled) a musí jim vyjít stejně – jen
// přesná aritmetika (det-math, hlídá ESLint). Ves (domy, pole, hroby) přidá až network.ts.

/** Buňka je suchý břeh u vody – sem se chodí pro vodu. */
export const PATH_WATER_SPOT = 1;
/** Buňka je na okraji lesa – sem se chodí pro dřevo na otop. */
export const PATH_FOREST_EDGE = 2;
/** Buňka je brod – mělký úzký potok, kudy se dá přejít. */
export const PATH_FORD = 4;
/** Buňka je v lese nebo u jeho okraje (WOODLAND_M) – stromy u pevných cest tu nerostou (roads.md). */
export const PATH_WOODLAND = 8;
/**
 * Buňka je mokřina – rovina podél potoka (roads.md – Rychlejší chůze): suchá buňka nejvýš
 * WETLAND.cells buněk od vody se sklonem nejvýš WETLAND.slope. Chodí se tu pomalu (bahno), hať
 * pomůže.
 */
export const PATH_WETLAND = 16;
/** Buňka je voda – potok (i brod); kdo jde rovně, musí se brodit (roads.md – brod + 30 m). */
export const PATH_WATER = 32;

/** Bodů mřížky na políčko (jako síť vykreslení scény – RENDER_SUBDIVISION). */
export const PATH_GRID_PER_TILE = 4;
/**
 * Sklon (m/m), při kterém je chůze dvakrát dražší než po rovině – cena roste se čtvercem sklonu:
 * mírné svahy (do 0,05) skoro nevadí, prudší pěšina obchází po vrstevnici.
 */
const SLOPE_REF = 0.1;
/** Prudší svah (m/m) je neprůchodný. */
const SLOPE_MAX = 0.45;
/** Brodit se je dražší než jít po louce (mokro, kluzké kameny). */
const FORD_COST = 5;
/** Brod: mělký (0–1) a úzký úsek potoka (poloviční šířka vody v m). */
const FORD = { shallow: 0.55, halfWidthM: 2.4 } as const;
/** Les: kolikrát dražší je chůze uvnitř lesa (podrost, kořeny) – stromy přidají překážky zvlášť. */
const FOREST_COST = 1.35;
/** Okraj lesa, kam se chodí pro dřevo: znaménková vzdálenost od hranice (m, záporná v louce). */
const FOREST_EDGE_M = { from: -4, to: 1 } as const;
/** Les a jeho okraj pro stromy u cest – znaménková vzdálenost od hranice lesa nad tuto (m). */
const WOODLAND_M = -6;
/**
 * Mokřina (návrh Clauda): rovina (sklon do 0,04 – 4 m na 100 m) do 3 buněk (≈ 11 m) od vody –
 * podmáčený břeh a niva potoka.
 */
const WETLAND = { cells: 3, slope: 0.04 } as const;
/** U okraje krajiny se nechodí (m). */
const EDGE_MARGIN_M = 10;
/** Okno terénu v mezipaměti je o tolik (m) větší než potřebné – ves roste a nepočítá se znovu. */
const CACHE_MARGIN_M = 300;

/**
 * Překážky krajiny pro pěšiny: poloměr (m na jednotku velikosti, 0 = jen buňka kmene) a cena
 * navíc (Infinity = neprůchodné) – pěšina se kmenům a keřům vyhne, přes balvan a skálu nevede.
 */
const OBSTACLE_COST: Record<ObstacleKind, { radius: number; extra: number }> = {
  tree: { radius: 0, extra: 3 },
  youngTree: { radius: 0, extra: 1.5 },
  snag: { radius: 0, extra: 2 },
  fallenTree: { radius: 1.5, extra: 4 },
  stump: { radius: 0, extra: 0.8 },
  shrub: { radius: 0, extra: 2.5 },
  stone: { radius: 0, extra: 1 },
  boulder: { radius: 1.2, extra: Infinity },
  outcrop: { radius: OUTCROP_RADIUS_M, extra: Infinity },
};

/** Okno mřížky – rozsah bodů (včetně) v mřížce celé krajiny. */
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
  window: PathWindow;
  /** Násobek ceny chůze po rovné louce (1); Infinity = neprůchodné (voda, sráz, okraj). */
  cost: Float32Array;
  /** PATH_WATER_SPOT | PATH_FOREST_EDGE | PATH_FORD | PATH_WOODLAND | PATH_WETLAND | PATH_WATER. */
  flags: Uint8Array;
}

/** Mřížka celé krajiny: bodů na stranu, bod (0, 0) ve světě a krok (m). */
function gridOf(l: Landscape): { n: number; originX: number; originZ: number; step: number } {
  const half = (l.size * l.cellSizeM) / 2;
  return {
    n: (l.size - 1) * PATH_GRID_PER_TILE + 1,
    originX: -half + l.cellSizeM / 2,
    originZ: -half + l.cellSizeM / 2,
    step: l.cellSizeM / PATH_GRID_PER_TILE,
  };
}

/** Okno mřížky, které pokryje obdélník světa (m) – oříznuté na krajinu. */
export function pathWindowFor(
  l: Landscape,
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): PathWindow {
  const { n, originX, originZ, step } = gridOf(l);
  return {
    i0: Math.max(0, Math.floor((bounds.minX - originX) / step)),
    j0: Math.max(0, Math.floor((bounds.minZ - originZ) / step)),
    i1: Math.min(n - 1, Math.ceil((bounds.maxX - originX) / step)),
    j1: Math.min(n - 1, Math.ceil((bounds.maxZ - originZ) / step)),
  };
}

/** Okno `inner` leží celé v okně `outer`. */
export function windowContains(outer: PathWindow, inner: PathWindow): boolean {
  return (
    inner.i0 >= outer.i0 && inner.j0 >= outer.j0 && inner.i1 <= outer.i1 && inner.j1 <= outer.j1
  );
}

/**
 * Terén pěšin v okně: rovina 1, sklon zdražuje se čtvercem (sráz neprůchodný), les o třetinu
 * dražší, voda neprůchodná kromě brodů. Příznaky: suchý břeh u vody (pro vodu), okraj lesa (pro
 * dřevo), brod. Bez osy potoka (ručně vyrobená krajina) je voda celé vodní políčko.
 */
export function buildPathTerrain(l: Landscape, window: PathWindow): PathTerrain {
  const { originX, originZ, step } = gridOf(l);
  const per = PATH_GRID_PER_TILE;
  const width = window.i1 - window.i0 + 1;
  const height = window.j1 - window.j0 + 1;
  const cost = new Float32Array(width * height);
  const flags = new Uint8Array(width * height);
  const wet = new Uint8Array(width * height);
  /** Rovina pro mokřinu (sklon do WETLAND.slope). */
  const flat = new Uint8Array(width * height);
  const edge = (l.size * l.cellSizeM) / 2 - EDGE_MARGIN_M;
  const stream = l.stream.length >= 2 ? streamCenterline(l) : null;
  const field = buildForestField(l, { remember: false });
  const tile = (tx: number, ty: number): number =>
    Math.min(l.size - 1, Math.max(0, ty)) * l.size + Math.min(l.size - 1, Math.max(0, tx));
  // výška bodu mřížky – bilineárně mezi středy políček (zlomky po čtvrtinách – přesně)
  const h = (gi: number, gj: number): number => {
    const ci = Math.min((l.size - 1) * per, Math.max(0, gi));
    const cj = Math.min((l.size - 1) * per, Math.max(0, gj));
    const tx = Math.min(l.size - 2, Math.floor(ci / per));
    const ty = Math.min(l.size - 2, Math.floor(cj / per));
    const fx = (ci - tx * per) / per;
    const fy = (cj - ty * per) / per;
    const v = (x: number, y: number): number => l.heights[tile(x, y)]!;
    const top = v(tx, ty) + (v(tx + 1, ty) - v(tx, ty)) * fx;
    const bottom = v(tx, ty + 1) + (v(tx + 1, ty + 1) - v(tx, ty + 1)) * fx;
    return top + (bottom - top) * fy;
  };
  // vodní políčka a jejich sousedé – jen tam se ptá osy potoka (dotaz je drahý)
  const nearWater = (gi: number, gj: number): { water: boolean; near: boolean } => {
    const tx = Math.round(gi / per);
    const ty = Math.round(gj / per);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (l.surface[tile(tx + dx, ty + dy)] === SURFACE_CODES.water) {
          near = true;
          break;
        }
      }
    }
    return { water: l.surface[tile(tx, ty)] === SURFACE_CODES.water, near };
  };
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const gi = window.i0 + i;
      const gj = window.j0 + j;
      const c = j * width + i;
      const x = originX + gi * step;
      const z = originZ + gj * step;
      if (x > edge || x < -edge || z > edge || z < -edge) {
        cost[c] = Infinity;
        continue;
      }
      const water = nearWater(gi, gj);
      if (water.near) {
        if (stream) {
          const sample = stream.nearest(x, z, BANK_REACH_M);
          if (sample.bankDistance < 0) {
            wet[c] = 1;
            const ford = sample.shallow >= FORD.shallow && sample.halfWidth <= FORD.halfWidthM;
            cost[c] = ford ? FORD_COST : Infinity;
            if (ford) flags[c] = flags[c]! | PATH_FORD;
            continue;
          }
        } else if (water.water) {
          wet[c] = 1;
          cost[c] = Infinity;
          continue;
        }
      }
      const gx = (h(gi + 1, gj) - h(gi - 1, gj)) / (2 * step);
      const gz = (h(gi, gj + 1) - h(gi, gj - 1)) / (2 * step);
      const slope = length2(gx, gz);
      if (slope <= WETLAND.slope) flat[c] = 1;
      if (slope > SLOPE_MAX) {
        cost[c] = Infinity;
        continue;
      }
      const forest = field.distanceAt(x, z);
      const s = slope / SLOPE_REF;
      let k = 1 + s * s;
      if (forest > 0) k *= FOREST_COST;
      if (forest >= FOREST_EDGE_M.from && forest <= FOREST_EDGE_M.to) {
        flags[c] = flags[c]! | PATH_FOREST_EDGE;
      }
      if (forest > WOODLAND_M) flags[c] = flags[c]! | PATH_WOODLAND;
      cost[c] = k;
    }
  }
  // suchý průchodný břeh vedle vody – tam se nabírá voda
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const c = j * width + i;
      if (wet[c] || cost[c] === Infinity) continue;
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
  for (let c = 0; c < width * height; c++) if (wet[c]) flags[c] = flags[c]! | PATH_WATER;
  // mokřina – suchá rovina kousek od vody
  const reach = WETLAND.cells;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const c = j * width + i;
      if (!wet[c]) continue;
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue;
          if (di * di + dj * dj > reach * reach) continue;
          const n = jj * width + ii;
          if (!wet[n] && flat[n] && cost[n] !== Infinity) flags[n] = flags[n]! | PATH_WETLAND;
        }
      }
    }
  }
  return {
    width,
    height,
    originX: originX + window.i0 * step,
    originZ: originZ + window.j0 * step,
    cellM: step,
    window,
    cost,
    flags,
  };
}

/** Výřez terénu – okno `inner` musí ležet v okně terénu. */
export function cropPathTerrain(terrain: PathTerrain, inner: PathWindow): PathTerrain {
  const width = inner.i1 - inner.i0 + 1;
  const height = inner.j1 - inner.j0 + 1;
  const cost = new Float32Array(width * height);
  const flags = new Uint8Array(width * height);
  const di = inner.i0 - terrain.window.i0;
  const dj = inner.j0 - terrain.window.j0;
  for (let j = 0; j < height; j++) {
    const from = (j + dj) * terrain.width + di;
    cost.set(terrain.cost.subarray(from, from + width), j * width);
    flags.set(terrain.flags.subarray(from, from + width), j * width);
  }
  return {
    width,
    height,
    originX: terrain.originX + di * terrain.cellM,
    originZ: terrain.originZ + dj * terrain.cellM,
    cellM: terrain.cellM,
    window: inner,
    cost,
    flags,
  };
}

/** Terén v mezipaměti podle krajiny – větší okno, ze kterého se vyřízne to potřebné. */
const terrainCache = new WeakMap<Landscape, PathTerrain>();

/**
 * Terén pěšin v okně `window`: výřez z terénu v mezipaměti (s rezervou CACHE_MARGIN_M kolem).
 * Výsledek nezávisí na tom, co v mezipaměti je – výřez je vždy přesně `window`.
 */
export function pathTerrainOf(l: Landscape, window: PathWindow): PathTerrain {
  let cached = terrainCache.get(l);
  if (!cached || !windowContains(cached.window, window)) {
    const reach = Math.ceil(CACHE_MARGIN_M / (l.cellSizeM / PATH_GRID_PER_TILE));
    const n = (l.size - 1) * PATH_GRID_PER_TILE + 1;
    const grown: PathWindow = {
      i0: Math.max(0, Math.min(window.i0, cached?.window.i0 ?? window.i0) - reach),
      j0: Math.max(0, Math.min(window.j0, cached?.window.j0 ?? window.j0) - reach),
      i1: Math.min(n - 1, Math.max(window.i1, cached?.window.i1 ?? window.i1) + reach),
      j1: Math.min(n - 1, Math.max(window.j1, cached?.window.j1 ?? window.j1) + reach),
    };
    cached = buildPathTerrain(l, grown);
    terrainCache.set(l, cached);
  }
  return cropPathTerrain(cached, window);
}

/**
 * Terén s překážkami krajiny (vrstva překážek a změny vsi): buňce s kmenem nebo keřem se přičte
 * cena, balvan a výchoz (do poloměru) jsou neprůchodné. Nový objekt – původní terén zůstane.
 */
export function withObstacles(
  terrain: PathTerrain,
  layer: ObstacleLayer,
  changes?: ObstacleChanges,
): PathTerrain {
  const cost = new Float32Array(terrain.cost);
  const { width, height, originX, originZ, cellM } = terrain;
  const half = cellM / 2;
  const status = obstacleStatus(changes);
  const maxX = originX + (width - 1) * cellM;
  const maxZ = originZ + (height - 1) * cellM;
  const add = (x: number, z: number, radius: number, extra: number): void => {
    const reach = Math.max(radius, half);
    const i0 = Math.max(0, Math.ceil((x - reach - originX) / cellM - 1e-6));
    const j0 = Math.max(0, Math.ceil((z - reach - originZ) / cellM - 1e-6));
    const i1 = Math.min(width - 1, Math.floor((x + reach - originX) / cellM + 1e-6));
    const j1 = Math.min(height - 1, Math.floor((z + reach - originZ) / cellM + 1e-6));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = originX + i * cellM;
        const cz = originZ + j * cellM;
        if (radius > half && length2(cx - x, cz - z) > radius) continue;
        const c = j * width + i;
        cost[c] = cost[c]! + extra;
      }
    }
  };
  for (const index of obstaclesNear(layer, originX, originZ, maxX, maxZ)) {
    const kind = status.kindOf(layer, index);
    if (kind === null) continue;
    const { radius: unit, extra } = OBSTACLE_COST[kind];
    add(layer.x[index]!, layer.z[index]!, unit * layer.scale[index]!, extra);
  }
  // stromy lesa vsi (fields.md – Les vsi) jsou les jako stromy krajiny – pěšina je obchází
  // (stromy u cest ne – stojí mimo osu cesty, roads.md)
  for (const o of changes?.added ?? []) {
    if (!isWoodTreeId(o.id)) continue;
    if (o.x < originX - half || o.x > maxX + half || o.z < originZ - half || o.z > maxZ + half) {
      continue;
    }
    const { radius, extra } = OBSTACLE_COST[o.kind];
    add(o.x, o.z, radius, extra);
  }
  return { ...terrain, cost };
}

/** Poloha stromu z vrstvy překážek (kácení pro stavbu), nebo null. */
export function obstaclePosition(
  layer: ObstacleLayer,
  id: number,
): { x: number; z: number } | null {
  const i = obstacleIndex(layer, id);
  return i >= 0 ? { x: layer.x[i]!, z: layer.z[i]! } : null;
}
