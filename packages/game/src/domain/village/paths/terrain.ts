import {
  BANK_REACH_M,
  SURFACE_CODES,
  buildForestField,
  length2,
  obstacleIndex,
  obstaclesNear,
  watersCenterline,
  tileCenterWorld,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '../../landscape';
import { obstacleStatus, type ObstacleChanges } from '../core/obstacles';
import { OUTCROP_RADIUS_M } from '../rules';
import { isWoodTreeId } from '../forest/woods';

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
/** Buňka je v lese (uvnitř hranice lesa) – vůz tudy jede jen po pevné cestě (wagons.md). */
export const PATH_FOREST = 64;

/** Bodů mřížky na políčko (jako síť vykreslení scény – RENDER_SUBDIVISION). */
const PATH_GRID_PER_TILE = 4;
/**
 * Sklon (m/m), při kterém je chůze dvakrát dražší než po rovině – cena roste se čtvercem sklonu:
 * mírné svahy (do 0,05) skoro nevadí, prudší pěšina obchází po vrstevnici.
 */
const SLOPE_REF = 0.1;
/** Prudší svah (m/m) je neprůchodný. */
const SLOPE_MAX = 0.45;
/** Sklon a les pro úpravy terénu (earthworks.ts – cena chůze po úvozu a náspu jako tady). */
export const PATH_SLOPE_REF = SLOPE_REF;
export const PATH_SLOPE_MAX = SLOPE_MAX;
/** Brodit se je dražší než jít po louce (mokro, kluzké kameny). */
const FORD_COST = 5;
/**
 * Brod: mělčina potoka nebo řeky – místo osy aspoň z tolika mělké (0–1, `StreamPoint.shallow` –
 * landscape.md, Brod na každé mapě s potokem; jako brod pochodu války). Šířka nerozhoduje:
 * mělčina generátoru je široký mělký úsek a dřívější mez poloviční šířky 2,4 m nesplnila žádná.
 */
const FORD = { shallow: 0.55 } as const;
/** Les: kolikrát dražší je chůze uvnitř lesa (podrost, kořeny) – stromy přidají překážky zvlášť. */
const FOREST_COST = 1.35;
export const PATH_FOREST_COST = FOREST_COST;
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
export const EDGE_MARGIN_M = 10;
/**
 * Okno terénu v mezipaměti je o tolik (m) větší než potřebné – ves roste a nepočítá se znovu.
 * Síť pěšin vsi a půda chůze (`walkGroundOf`) chtějí okna posunutá proti sobě; s rezervou 600 m
 * je u sídla skutečné krajiny první terén celá krajina a druhý se nestaví (jen zrychlení – výřez
 * je vždy přesně potřebné okno).
 */
const CACHE_MARGIN_M = 600;

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

/**
 * Poloměr (m), do kterého překážka druhu `kind` velikosti `scale` pěšinu nepustí – balvan
 * a skalní výchoz (`OBSTACLE_COST` s cenou Infinity); ostatní druhy null. Skály mřížky pochodu
 * (plán 2026-11-16-dense-forest – Rozhodnutí 4).
 */
export function obstacleBlockRadiusM(kind: ObstacleKind, scale: number): number | null {
  const { radius, extra } = OBSTACLE_COST[kind];
  return extra === Infinity ? radius * scale : null;
}

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
  /**
   * PATH_WATER_SPOT | PATH_FOREST_EDGE | PATH_FORD | PATH_WOODLAND | PATH_WETLAND | PATH_WATER |
   * PATH_FOREST.
   */
  flags: Uint8Array;
  /**
   * Výška buňky (m, bilineárně z políček) – sklon ve směru jízdy vozu (wagons.md – Vozová síť).
   * Ručně vyrobený terén (testy) ji mít nemusí – pak je rovina.
   */
  heights?: Float32Array;
}

/** Mřížka celé krajiny: bodů na stranu, bod (0, 0) ve světě a krok (m). */
/** Strana buňky mřížky pěšin krajiny (m) – v ní jsou uložené trasy (`VillageState.routes`). */
export function pathCellM(l: Landscape): number {
  return l.cellSizeM / PATH_GRID_PER_TILE;
}

function gridOf(l: Landscape): { n: number; originX: number; originZ: number; step: number } {
  const half = (l.size * l.cellSizeM) / 2;
  return {
    n: (l.size - 1) * PATH_GRID_PER_TILE + 1,
    originX: -half + l.cellSizeM / 2,
    originZ: -half + l.cellSizeM / 2,
    step: pathCellM(l),
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

/** Index políčka krajiny (souřadnice oříznuté na krajinu). */
function tileIndex(l: Landscape, tx: number, ty: number): number {
  return Math.min(l.size - 1, Math.max(0, ty)) * l.size + Math.min(l.size - 1, Math.max(0, tx));
}

/** Výška políčka krajiny (souřadnice oříznuté na krajinu). */
function tileHeight(l: Landscape, x: number, y: number): number {
  return l.heights[tileIndex(l, x, y)]!;
}

/** Výška bodu mřížky pěšin – bilineárně mezi středy políček (zlomky po čtvrtinách – přesně). */
function gridHeight(l: Landscape, gi: number, gj: number): number {
  const per = PATH_GRID_PER_TILE;
  const ci = Math.min((l.size - 1) * per, Math.max(0, gi));
  const cj = Math.min((l.size - 1) * per, Math.max(0, gj));
  const tx = Math.min(l.size - 2, Math.floor(ci / per));
  const ty = Math.min(l.size - 2, Math.floor(cj / per));
  const fx = (ci - tx * per) / per;
  const fy = (cj - ty * per) / per;
  const top = tileHeight(l, tx, ty) + (tileHeight(l, tx + 1, ty) - tileHeight(l, tx, ty)) * fx;
  const bottom =
    tileHeight(l, tx, ty + 1) + (tileHeight(l, tx + 1, ty + 1) - tileHeight(l, tx, ty + 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Bod mřížky daleko od vody (`waterAround`). */
const WATER_NONE = 0;
/** Bod mřížky u vodního políčka, sám na suchém políčku. */
const WATER_NEAR = 1;
/** Bod mřížky na vodním políčku. */
const WATER_IN = 2;

/**
 * Vodní políčka a jejich sousedé – jen tam se ptá osy potoka (dotaz je drahý): WATER_IN, když
 * je vodní políčko bodu; WATER_NEAR, když je vodní jen některý soused; jinak WATER_NONE.
 */
function waterAround(l: Landscape, gi: number, gj: number): number {
  const per = PATH_GRID_PER_TILE;
  const tx = Math.round(gi / per);
  const ty = Math.round(gj / per);
  let near = false;
  for (let dy = -1; dy <= 1 && !near; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (l.surface[tileIndex(l, tx + dx, ty + dy)] === SURFACE_CODES.water) {
        near = true;
        break;
      }
    }
  }
  if (!near) return WATER_NONE;
  return l.surface[tileIndex(l, tx, ty)] === SURFACE_CODES.water ? WATER_IN : WATER_NEAR;
}

/**
 * Terén pěšin v okně: rovina 1, sklon zdražuje se čtvercem (sráz neprůchodný), les o třetinu
 * dražší, voda neprůchodná kromě brodů. Příznaky: suchý břeh u vody (pro vodu), okraj lesa (pro
 * dřevo), brod. Bez osy potoka (ručně vyrobená krajina) je voda celé vodní políčko.
 */
export function buildPathTerrain(l: Landscape, window: PathWindow): PathTerrain {
  const { originX, originZ, step } = gridOf(l);
  const width = window.i1 - window.i0 + 1;
  const height = window.j1 - window.j0 + 1;
  const cost = new Float32Array(width * height);
  const flags = new Uint8Array(width * height);
  const heights = new Float32Array(width * height);
  const wet = new Uint8Array(width * height);
  /** Rovina pro mokřinu (sklon do WETLAND.slope). */
  const flat = new Uint8Array(width * height);
  const edge = (l.size * l.cellSizeM) / 2 - EDGE_MARGIN_M;
  // Potok i řeka prémiové krajiny – voda obou je pro vesnici překážkou (brody jen mělké a úzké).
  const stream = l.stream.length >= 2 ? watersCenterline(l) : null;
  const field = buildForestField(l, { remember: false });
  // výška bodu mřížky a voda kolem – funkce mimo smyčku (`gridHeight`, `waterAround`): žádné
  // uzávěry vytvořené pro každou buňku (jen zrychlení – výpočet týž)
  const h = (gi: number, gj: number): number => gridHeight(l, gi, gj);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const gi = window.i0 + i;
      const gj = window.j0 + j;
      const c = j * width + i;
      const x = originX + gi * step;
      const z = originZ + gj * step;
      heights[c] = h(gi, gj);
      if (x > edge || x < -edge || z > edge || z < -edge) {
        cost[c] = Infinity;
        continue;
      }
      const water = waterAround(l, gi, gj);
      if (water !== WATER_NONE) {
        if (stream) {
          const sample = stream.nearest(x, z, BANK_REACH_M);
          if (sample.bankDistance < 0) {
            wet[c] = 1;
            const ford = sample.shallow >= FORD.shallow;
            cost[c] = ford ? FORD_COST : Infinity;
            if (ford) flags[c] = flags[c]! | PATH_FORD;
            continue;
          }
        } else if (water === WATER_IN) {
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
      if (forest > 0) {
        k *= FOREST_COST;
        flags[c] = flags[c]! | PATH_FOREST;
      }
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
    heights,
  };
}

/** Výřez terénu – okno `inner` musí ležet v okně terénu. */
export function cropPathTerrain(terrain: PathTerrain, inner: PathWindow): PathTerrain {
  const width = inner.i1 - inner.i0 + 1;
  const height = inner.j1 - inner.j0 + 1;
  const cost = new Float32Array(width * height);
  const flags = new Uint8Array(width * height);
  const heights = terrain.heights ? new Float32Array(width * height) : null;
  const di = inner.i0 - terrain.window.i0;
  const dj = inner.j0 - terrain.window.j0;
  for (let j = 0; j < height; j++) {
    const from = (j + dj) * terrain.width + di;
    cost.set(terrain.cost.subarray(from, from + width), j * width);
    flags.set(terrain.flags.subarray(from, from + width), j * width);
    heights?.set(terrain.heights!.subarray(from, from + width), j * width);
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
    ...(heights ? { heights } : {}),
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

const fordsCache = new WeakMap<Landscape, readonly { x: number; z: number }[]>();

/**
 * Brody celé krajiny – středy buněk PATH_FORD celé mřížky pěšin (paths.md – Odhad vzdáleností,
 * Jen brodem: objížďka přes vodu hledá brod na celé mapě, ne jen v okně). Po řádcích, v mezipaměti
 * podle krajiny.
 */
export function landscapeFordSpots(l: Landscape): readonly { x: number; z: number }[] {
  const cached = fordsCache.get(l);
  if (cached) return cached;
  const { n } = gridOf(l);
  const t = pathTerrainOf(l, { i0: 0, j0: 0, i1: n - 1, j1: n - 1 });
  const out: { x: number; z: number }[] = [];
  for (let j = 0; j < t.height; j++) {
    for (let i = 0; i < t.width; i++) {
      if (t.flags[j * t.width + i]! & PATH_FORD) {
        out.push({ x: t.originX + i * t.cellM, z: t.originZ + j * t.cellM });
      }
    }
  }
  fordsCache.set(l, out);
  return out;
}

/** Souvislé oblasti souše celé krajiny po buňkách mřížky pěšin (`landscapeLandAreas`). */
export interface LandAreas {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cellM: number;
  /** Číslo oblasti buňky; −1 = voda, která oblasti dělí, nebo pás u okraje krajiny. */
  readonly area: Int32Array;
}

const areasCache = new WeakMap<Landscape, { reach?: LandAreas; banks?: LandAreas }>();

/**
 * Souvislé oblasti souše celé krajiny (paths.md – Odhad vzdáleností, Jen brodem): buňky mřížky
 * pěšin ve 4-okolí mimo vodu a mimo pás u okraje krajiny (EDGE_MARGIN_M – tudy se potok neobejde).
 * `crossFords` – brod je souš (kam se dojde, i přes brod); jinak dělí i brod (břehy – co leží
 * za vodou). Sráz ani les oblasti nedělí – chůze rovně je jen zpomalí. Mezipaměť podle krajiny.
 */
export function landscapeLandAreas(l: Landscape, crossFords: boolean): LandAreas {
  const entry = areasCache.get(l) ?? {};
  areasCache.set(l, entry);
  const cached = crossFords ? entry.reach : entry.banks;
  if (cached) return cached;
  const { n } = gridOf(l);
  const t = pathTerrainOf(l, { i0: 0, j0: 0, i1: n - 1, j1: n - 1 });
  const w = t.width;
  const all = w * t.height;
  const edge = (l.size * l.cellSizeM) / 2 - EDGE_MARGIN_M;
  const open = new Uint8Array(all);
  for (let j = 0; j < t.height; j++) {
    for (let i = 0; i < w; i++) {
      const x = t.originX + i * t.cellM;
      const z = t.originZ + j * t.cellM;
      if (x > edge || x < -edge || z > edge || z < -edge) continue;
      const f = t.flags[j * w + i]!;
      if (f & PATH_WATER && !(crossFords && f & PATH_FORD)) continue;
      open[j * w + i] = 1;
    }
  }
  const area = new Int32Array(all).fill(-1);
  const stack = new Int32Array(all);
  let next = 0;
  for (let s = 0; s < all; s++) {
    if (!open[s] || area[s] !== -1) continue;
    let top = 0;
    stack[top++] = s;
    area[s] = next;
    while (top > 0) {
      const c = stack[--top]!;
      const i = c % w;
      const around = [i > 0 ? c - 1 : -1, i < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const m of around) {
        if (m < 0 || m >= all || !open[m] || area[m] !== -1) continue;
        area[m] = next;
        stack[top++] = m;
      }
    }
    next++;
  }
  const out: LandAreas = {
    width: w,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    area,
  };
  if (crossFords) entry.reach = out;
  else entry.banks = out;
  return out;
}

/** Hledání souše kolem bodu ve vodě nebo u okraje – nejvýš tolik buněk (`landAreaAt`). */
const LAND_SEARCH_CELLS = 3;

/**
 * Oblast souše v bodě (x, z) – nejbližší buňka mřížky; leží-li ve vodě nebo u okraje, nejbližší
 * souš po čtvercových kruzích do LAND_SEARCH_CELLS buněk (při shodě první po řádcích); jinak −1.
 */
export function landAreaAt(areas: LandAreas, x: number, z: number): number {
  const i = Math.round((x - areas.originX) / areas.cellM);
  const j = Math.round((z - areas.originZ) / areas.cellM);
  for (let r = 0; r <= LAND_SEARCH_CELLS; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= areas.width || jj >= areas.height) continue;
        const a = areas.area[jj * areas.width + ii]!;
        if (a >= 0) return a;
      }
    }
  }
  return -1;
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

/**
 * Překážky krajiny, přes které vůz neprojede (wagons.md – Kudy vůz projede): kmeny, mladé stromky,
 * souše, padlé stromy, keře, balvany a skalní výchozy – do poloměru jako u pěšin, aspoň buňka
 * překážky. Pařez a kámen vůz objede (nejsou v masce). Stromy lesa vsi taky.
 */
const CART_BLOCKING: ReadonlySet<ObstacleKind> = new Set<ObstacleKind>([
  'tree',
  'youngTree',
  'snag',
  'fallenTree',
  'shrub',
  'boulder',
  'outcrop',
]);

/** Maska buněk s překážkou pro vůz (1 = neprojede) v okně terénu – vrstva a změny vsi. */
export function cartObstacleMask(
  terrain: Pick<PathTerrain, 'width' | 'height' | 'originX' | 'originZ' | 'cellM'>,
  layer: ObstacleLayer,
  changes?: ObstacleChanges,
): Uint8Array {
  const { width, height, originX, originZ, cellM } = terrain;
  const mask = new Uint8Array(width * height);
  const half = cellM / 2;
  const status = obstacleStatus(changes);
  const maxX = originX + (width - 1) * cellM;
  const maxZ = originZ + (height - 1) * cellM;
  const mark = (x: number, z: number, radius: number): void => {
    const reach = Math.max(radius, half);
    const i0 = Math.max(0, Math.ceil((x - reach - originX) / cellM - 1e-6));
    const j0 = Math.max(0, Math.ceil((z - reach - originZ) / cellM - 1e-6));
    const i1 = Math.min(width - 1, Math.floor((x + reach - originX) / cellM + 1e-6));
    const j1 = Math.min(height - 1, Math.floor((z + reach - originZ) / cellM + 1e-6));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (radius > half && length2(originX + i * cellM - x, originZ + j * cellM - z) > radius) {
          continue;
        }
        mask[j * width + i] = 1;
      }
    }
  };
  for (const index of obstaclesNear(layer, originX, originZ, maxX, maxZ)) {
    const kind = status.kindOf(layer, index);
    if (kind === null || !CART_BLOCKING.has(kind)) continue;
    mark(layer.x[index]!, layer.z[index]!, OBSTACLE_COST[kind].radius * layer.scale[index]!);
  }
  for (const o of changes?.added ?? []) {
    if (!isWoodTreeId(o.id) || !CART_BLOCKING.has(o.kind)) continue;
    if (o.x < originX - half || o.x > maxX + half || o.z < originZ - half || o.z > maxZ + half) {
      continue;
    }
    mark(o.x, o.z, OBSTACLE_COST[o.kind].radius);
  }
  return mask;
}

/** Poloha stromu z vrstvy překážek (kácení pro stavbu), nebo null. */
export function obstaclePosition(
  layer: ObstacleLayer,
  id: number,
): { x: number; z: number } | null {
  const i = obstacleIndex(layer, id);
  return i >= 0 ? { x: layer.x[i]!, z: layer.z[i]! } : null;
}

/**
 * Terén pěšin přes celou krajinu s překážkami (bez změn vsi – trasa se nemění s kácením) – pro
 * zemské stezky (trade.md), vozy a průseky lesem (roads.md).
 */
const trailTerrainCache = new WeakMap<Landscape, Map<ObstacleLayer | null, PathTerrain>>();

/** Terén pro stezky – celá krajina, v mezipaměti podle krajiny a vrstvy překážek. */
export function trailTerrain(landscape: Landscape, obstacles: ObstacleLayer | null): PathTerrain {
  let byLayer = trailTerrainCache.get(landscape);
  if (!byLayer) {
    byLayer = new Map();
    trailTerrainCache.set(landscape, byLayer);
  }
  const cached = byLayer.get(obstacles);
  if (cached) return cached;
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const window = pathWindowFor(landscape, { minX: -half, minZ: -half, maxX: half, maxZ: half });
  const base = pathTerrainOf(landscape, window);
  const terrain = obstacles ? withObstacles(base, obstacles) : base;
  byLayer.set(obstacles, terrain);
  return terrain;
}

/**
 * Voda pro okno sítě pěšin dál než tolik od obydlí (m vzdušnou čarou) se nebere – výpočet zůstane
 * krátký i ve vsi úplně daleko od vody.
 */
const WATER_WINDOW_MAX_M = 1000;

const waterTilesCache = new WeakMap<Landscape, { x: number; z: number }[]>();

/** Středy vodních políček krajiny (po řádcích, v mezipaměti podle krajiny). */
function waterTiles(l: Landscape): { x: number; z: number }[] {
  const cached = waterTilesCache.get(l);
  if (cached) return cached;
  const out: { x: number; z: number }[] = [];
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      if (l.surface[y * l.size + x] === SURFACE_CODES.water) out.push(tileCenterWorld(l, x, y));
    }
  }
  waterTilesCache.set(l, out);
  return out;
}

/**
 * Nejbližší voda k bodům `from` (obydlí) pro okno sítě pěšin (paths.md – Pochůzky pro vodu): střed
 * vodního políčka nejblíž vzdušnou čarou, nejvýš WATER_WINDOW_MAX_M daleko; každé políčko jednou.
 * Suchý břeh, kam domácnost chodí pro vodu, leží u něj (voda je jen na vodních políčkách a kolem
 * nich). Jen políčka krajiny – levné, stejně na serveru i v prohlížeči.
 */
export function nearestWaterTiles(
  l: Landscape,
  from: readonly { x: number; z: number }[],
): { x: number; z: number }[] {
  const tiles = waterTiles(l);
  const max2 = WATER_WINDOW_MAX_M * WATER_WINDOW_MAX_M;
  const picked = new Set<number>();
  for (const p of from) {
    let best = -1;
    let bestD = Infinity;
    tiles.forEach((t, k) => {
      const d = (t.x - p.x) * (t.x - p.x) + (t.z - p.z) * (t.z - p.z);
      if (d < bestD) {
        best = k;
        bestD = d;
      }
    });
    if (best >= 0 && bestD <= max2) picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map((k) => tiles[k]!);
}
