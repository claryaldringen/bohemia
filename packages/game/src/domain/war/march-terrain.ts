import {
  BANK_REACH_M,
  heightAtWorld,
  length2,
  obstacleKind,
  riversOf,
  watersCenterline,
  type Landscape,
  type ObstacleLayer,
} from '../landscape';
import { obstacleBlockRadiusM, PATH_SLOPE_MAX } from '../village/paths/terrain';
import { ROAD_SWATH } from '../village/rules/rules-roads';
import { landscapeTrailLines } from '../village/trade/premium-route';
import type { MarchGeometry } from './march-grid';
import { WAR } from './rules-war';

// Terén mřížky pochodu jedné krajiny (war.md – Pohyb – Terén; plán 2026-11-16-dense-forest –
// Rozhodnutí 2 a 4): voda, brody, srázy, průsek stezky krajiny a skály vrstvy překážek. Závisí jen
// na krajině (a její vrstvě překážek), proto se počítá jednou – mřížka vsi a dne ho jen skládá
// (`marchGrid`). Hustý les je vlastní vrstva (`forestInterior` v `dense-forest.ts`). Počítá server
// i prohlížeč – jen det-math.

/** Voda – buňka do půl úhlopříčky od vody (krok mezi středy ji nepřeskočí). */
export const BASE_WATER = 1;
/** Brod – voda, kterou vojsko přejde (mělčina potoka či řeky). */
export const BASE_FORD = 2;
/** Sráz nad `PATH_SLOPE_MAX`. */
export const BASE_STEEP = 4;
/** Pás průseku stezky krajiny (do `ROAD_SWATH.halfM` od osy). */
export const BASE_TRAIL = 8;
/** Osa stezky krajiny (buňky, kterými prochází – supercover). */
export const BASE_AXIS = 16;

/** Terén pochodu krajiny po buňkách mřížky. */
export interface MarchTerrain extends MarchGeometry {
  /** `BASE_*` po buňkách. */
  readonly base: Uint8Array;
  /** Buňky průseku stezky krajiny (`BASE_TRAIL` nebo `BASE_AXIS`) vzestupně. */
  readonly trail: Int32Array;
}

/** Hrubé síto vody (m): přesný dotaz na vodu jen u buněk, jejichž vzorek sítě je blízko břehu. */
const WATER_SIEVE_M = 10;
/** Rezerva síta (m) – vzdálenost od břehu se mezi body osy mění o málo víc než poloha. */
const WATER_SIEVE_SLACK_M = 3;

const terrainCache = new WeakMap<Landscape, MarchTerrain>();

/**
 * Terén pochodu krajiny (jednou na krajinu – `WeakMap`): buňka do půl úhlopříčky od vody (potok
 * a všechny řeky – `watersCenterline`) je voda – krok mezi sousedními středy (i úhlopříčný) ji tak
 * nepřeskočí; brod je mělčina (`StreamSample.shallow ≥ WAR.march.fordShallow`). Sráz jako
 * u pěšin (`PATH_SLOPE_MAX`). Průsek stezky krajiny (`landscapeTrailLines`): pás
 * `ROAD_SWATH.halfM` kolem osy (`BASE_TRAIL`) a buňky osy (`BASE_AXIS`, supercover).
 *
 * Předběžná síta výsledek nemění (test „terén se sítem = terén bez síta“): voda se přesně počítá
 * jen u buněk, jejichž bod hrubé sítě po 10 m je blízko břehu; sráz jen tam, kde ho dovolí mez
 * spádu čtverců výšek kolem (výška je bilineární mezi středy políček). `exact` = bez sít a bez
 * paměti (jen pro test).
 */
export function marchTerrain(l: Landscape, exact = false): MarchTerrain {
  if (!exact) {
    const cached = terrainCache.get(l);
    if (cached) return cached;
  }
  const cellM = WAR.march.cellM;
  const extent = l.size * l.cellSizeM;
  const width = Math.round(extent / cellM);
  const originX = -extent / 2 + cellM / 2;
  const base = new Uint8Array(width * width);
  const geo: MarchGeometry = { width, height: width, originX, originZ: originX, cellM };
  markWater(l, geo, base, exact);
  markSteep(l, geo, base, exact);
  for (const line of landscapeTrailLines(l)) {
    for (let k = 0; k + 1 < line.length; k++) {
      const a = line[k]!;
      const b = line[k + 1]!;
      swathCells(geo, a, b, ROAD_SWATH.halfM, (c) => {
        base[c] = base[c]! | BASE_TRAIL;
      });
      supercover(geo, a, b, (c) => {
        base[c] = base[c]! | BASE_AXIS;
      });
    }
  }
  const trail: number[] = [];
  for (let c = 0; c < base.length; c++)
    if ((base[c]! & (BASE_TRAIL | BASE_AXIS)) !== 0) trail.push(c);
  const terrain: MarchTerrain = { ...geo, base, trail: Int32Array.from(trail) };
  if (!exact) terrainCache.set(l, terrain);
  return terrain;
}

/** Voda a brody (`BASE_WATER`, `BASE_FORD`); mapa bez potoka a řek žádné. */
function markWater(l: Landscape, geo: MarchGeometry, base: Uint8Array, exact: boolean): void {
  // potok a všechny řeky – řeky kostry i řeka prémie (`watersCenterline` – bez řeky přesně osa
  // potoka); mapa bez potoka s řekou má vodu jen z řek
  if (l.stream.length < 2 && riversOf(l).length === 0) return;
  const stream = watersCenterline(l);
  const { width, originX, cellM } = geo;
  const reach = (cellM * Math.SQRT2) / 2;
  const extent = l.size * l.cellSizeM;
  const mark = (c: number, x: number, z: number): void => {
    const sample = stream.nearest(x, z, BANK_REACH_M);
    if (sample.bankDistance < reach) {
      base[c] = sample.shallow >= WAR.march.fordShallow ? BASE_FORD : BASE_WATER;
    }
  };
  if (exact) {
    for (let j = 0; j < width; j++) {
      for (let i = 0; i < width; i++) mark(j * width + i, originX + i * cellM, originX + j * cellM);
    }
    return;
  }
  // síto: střed buňky je od nejbližšího bodu sítě nejvýš půl úhlopříčky oka – rezerva celá
  // úhlopříčka a pár metrů navíc
  const sieve = WATER_SIEVE_M;
  const side = Math.ceil(extent / sieve) + 1;
  const near = new Uint8Array(side * side);
  const margin = reach + sieve * Math.SQRT2 + WATER_SIEVE_SLACK_M;
  for (let sj = 0; sj < side; sj++) {
    for (let si = 0; si < side; si++) {
      const sample = stream.nearest(
        -extent / 2 + si * sieve,
        -extent / 2 + sj * sieve,
        BANK_REACH_M,
      );
      if (sample.bankDistance < margin) near[sj * side + si] = 1;
    }
  }
  for (let j = 0; j < width; j++) {
    const z = originX + j * cellM;
    const row = Math.round((z + extent / 2) / sieve) * side;
    for (let i = 0; i < width; i++) {
      const x = originX + i * cellM;
      if (near[row + Math.round((x + extent / 2) / sieve)] === 1) mark(j * width + i, x, z);
    }
  }
}

/**
 * Sráz (`BASE_STEEP`) mimo vodu: spád ze středových rozdílů výšky přes buňku nad `PATH_SLOPE_MAX`.
 * Mez: výška je bilineární mezi středy políček, takže rozdílový podíl napříč (podél) nepřesáhne
 * větší z rozdílů vodorovných (svislých) hran čtverců výšek, kterými úsečka vede – buňka, kde ani
 * mez čtverců 3 × 3 kolem nepřesáhne `PATH_SLOPE_MAX`, srázem být nemůže.
 */
function markSteep(l: Landscape, geo: MarchGeometry, base: Uint8Array, exact: boolean): void {
  const { width, originX, cellM } = geo;
  const size = l.size;
  const tile = l.cellSizeM;
  const heights = l.heights;
  const quads = size - 1;
  const maybe = new Uint8Array(quads * quads);
  if (!exact) {
    const bx = new Float64Array(quads * quads);
    const bz = new Float64Array(quads * quads);
    for (let qj = 0; qj < quads; qj++) {
      for (let qi = 0; qi < quads; qi++) {
        const h00 = heights[qj * size + qi]!;
        const h10 = heights[qj * size + qi + 1]!;
        const h01 = heights[(qj + 1) * size + qi]!;
        const h11 = heights[(qj + 1) * size + qi + 1]!;
        bx[qj * quads + qi] = Math.max(Math.abs(h10 - h00), Math.abs(h11 - h01)) / tile;
        bz[qj * quads + qi] = Math.max(Math.abs(h01 - h00), Math.abs(h11 - h10)) / tile;
      }
    }
    for (let qj = 0; qj < quads; qj++) {
      for (let qi = 0; qi < quads; qi++) {
        let mx = 0;
        let mz = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = qi + di;
            const jj = qj + dj;
            if (ii < 0 || jj < 0 || ii >= quads || jj >= quads) continue;
            mx = Math.max(mx, bx[jj * quads + ii]!);
            mz = Math.max(mz, bz[jj * quads + ii]!);
          }
        }
        if (length2(mx, mz) > PATH_SLOPE_MAX * (1 - 1e-6)) maybe[qj * quads + qi] = 1;
      }
    }
  }
  const half = (size * tile) / 2;
  const quadOf = (v: number): number =>
    Math.min(quads - 1, Math.floor(Math.min(size - 1, Math.max(0, (v + half) / tile - 0.5))));
  const d = cellM / 2;
  for (let j = 0; j < width; j++) {
    const z = originX + j * cellM;
    const row = quadOf(z) * quads;
    for (let i = 0; i < width; i++) {
      const c = j * width + i;
      if (base[c] !== 0) continue;
      const x = originX + i * cellM;
      if (!exact && maybe[row + quadOf(x)] === 0) continue;
      const gx = (heightAtWorld(l, x + d, z) - heightAtWorld(l, x - d, z)) / cellM;
      const gz = (heightAtWorld(l, x, z + d) - heightAtWorld(l, x, z - d)) / cellM;
      if (length2(gx, gz) > PATH_SLOPE_MAX) base[c] = BASE_STEEP;
    }
  }
}

/** Bod ve světě mapy (m). */
interface Point {
  readonly x: number;
  readonly z: number;
}

/**
 * Buňky, kterými prochází úsečka a → b (supercover – po stranách souvislé; prochází-li přesně
 * rohem, obě buňky u rohu). Mimo mřížku nic.
 */
export function supercover(
  geo: MarchGeometry,
  a: Point,
  b: Point,
  visit: (c: number) => void,
): void {
  const { width: w, height: h, cellM } = geo;
  // souřadnice v buňkách: buňka i pokrývá [i − 0,5; i + 0,5) kolem svého středu
  const fx0 = (a.x - geo.originX) / cellM + 0.5;
  const fz0 = (a.z - geo.originZ) / cellM + 0.5;
  const fx1 = (b.x - geo.originX) / cellM + 0.5;
  const fz1 = (b.z - geo.originZ) / cellM + 0.5;
  if (!Number.isFinite(fx0 + fz0 + fx1 + fz1)) return;
  let i = Math.floor(fx0);
  let j = Math.floor(fz0);
  const i1 = Math.floor(fx1);
  const j1 = Math.floor(fz1);
  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const si = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = si !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdz = sj !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = si > 0 ? (i + 1 - fx0) * tdx : si < 0 ? (fx0 - i) * tdx : Infinity;
  let tz = sj > 0 ? (j + 1 - fz0) * tdz : sj < 0 ? (fz0 - j) * tdz : Infinity;
  const emit = (ii: number, jj: number): void => {
    if (ii >= 0 && jj >= 0 && ii < w && jj < h) visit(jj * w + ii);
  };
  emit(i, j);
  // každý krok posune i nebo j k cíli – víc kroků, než je rozdíl buněk, být nemůže
  let guard = Math.abs(i1 - i) + Math.abs(j1 - j) + 2;
  while ((i !== i1 || j !== j1) && guard-- > 0) {
    if (Math.abs(tx - tz) < 1e-12) {
      // přesně rohem – obě buňky u rohu, pak úhlopříčně
      emit(i + si, j);
      emit(i, j + sj);
      i += si;
      j += sj;
      tx += tdx;
      tz += tdz;
    } else if (tx < tz) {
      i += si;
      tx += tdx;
    } else {
      j += sj;
      tz += tdz;
    }
    emit(i, j);
  }
}

/** Buňky se středem do `half` m od úsečky a → b. */
export function swathCells(
  geo: MarchGeometry,
  a: Point,
  b: Point,
  half: number,
  visit: (c: number) => void,
): void {
  const { width: w, height: h, cellM, originX, originZ } = geo;
  const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - half - originX) / cellM - 1e-9));
  const i1 = Math.min(w - 1, Math.floor((Math.max(a.x, b.x) + half - originX) / cellM + 1e-9));
  const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - half - originZ) / cellM - 1e-9));
  const j1 = Math.min(h - 1, Math.floor((Math.max(a.z, b.z) + half - originZ) / cellM + 1e-9));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const half2 = half * half;
  for (let j = j0; j <= j1; j++) {
    const z = originZ + j * cellM;
    for (let i = i0; i <= i1; i++) {
      const x = originX + i * cellM;
      const t =
        len2 <= 1e-12 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const qx = a.x + dx * t - x;
      const qz = a.z + dz * t - z;
      if (qx * qx + qz * qz <= half2) visit(j * w + i);
    }
  }
}

/**
 * Skály vrstvy překážek na mřížce terénu (Rozhodnutí 4): balvan a skalní výchoz s poloměrem jako
 * u pěšin (`obstacleBlockRadiusM`) – buňky se středem do poloměru a vždy buňka, ve které
 * překážka stojí (`marchCellAt`; i poloměr mezi půlí strany a půlí úhlopříčky buňky, 1,25–1,77 m,
 * kdy střed vlastní buňky může ležet za poloměrem – jako `withObstacles`). Po skalách: index překážky ve vrstvě a jejích buněk `cells[start[r] …
 * start[r + 1])`. Mřížka vsi a dne vynechá skály, které ves odstranila.
 */
export interface MarchRocks {
  readonly index: Int32Array;
  readonly start: Int32Array;
  readonly cells: Int32Array;
}

const rockCache = new WeakMap<MarchTerrain, WeakMap<ObstacleLayer, MarchRocks>>();

/** Skály vrstvy `layer` na mřížce terénu `t` – jednou na terén a vrstvu (`WeakMap`). */
export function marchRocks(t: MarchTerrain, layer: ObstacleLayer): MarchRocks {
  let byLayer = rockCache.get(t);
  if (!byLayer) {
    byLayer = new WeakMap();
    rockCache.set(t, byLayer);
  }
  const known = byLayer.get(layer);
  if (known) return known;
  const { width, height, originX, originZ, cellM } = t;
  const half = cellM / 2;
  const index: number[] = [];
  const start: number[] = [0];
  const cells: number[] = [];
  for (let k = 0; k < layer.count; k++) {
    const radius = obstacleBlockRadiusM(obstacleKind(layer, k), layer.scale[k]!);
    if (radius === null) continue;
    const x = layer.x[k]!;
    const z = layer.z[k]!;
    const reach = Math.max(radius, half);
    // buňka, ve které překážka stojí – zahrnutá vždy
    const oi = Math.round((x - originX) / cellM);
    const oj = Math.round((z - originZ) / cellM);
    const own = oi >= 0 && oj >= 0 && oi < width && oj < height ? oj * width + oi : -1;
    const i0 = Math.max(0, Math.ceil((x - reach - originX) / cellM - 1e-6));
    const j0 = Math.max(0, Math.ceil((z - reach - originZ) / cellM - 1e-6));
    const i1 = Math.min(width - 1, Math.floor((x + reach - originX) / cellM + 1e-6));
    const j1 = Math.min(height - 1, Math.floor((z + reach - originZ) / cellM + 1e-6));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * width + i;
        if (
          c !== own &&
          radius > half &&
          length2(originX + i * cellM - x, originZ + j * cellM - z) > radius
        ) {
          continue;
        }
        cells.push(c);
      }
    }
    if (cells.length === start[start.length - 1]) continue;
    index.push(k);
    start.push(cells.length);
  }
  const rocks: MarchRocks = {
    index: Int32Array.from(index),
    start: Int32Array.from(start),
    cells: Int32Array.from(cells),
  };
  byLayer.set(layer, rocks);
  return rocks;
}
