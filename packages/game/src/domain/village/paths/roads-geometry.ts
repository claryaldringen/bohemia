// Geometrie os pevných cest, mokřina a brody na ose a meze sdílené celým rozdělením (roads.md).

import { length2 } from '../../landscape';
import { type Road, type RoadGround, type RoadPoint } from '../types';
import { PATH_FORD, PATH_WETLAND, type PathTerrain } from './terrain';

export const DAYS_PER_YEAR = 365.25;
/** Krok vzorkování os sítě (m) – úseky nad prahem a porovnání s loňskem. */
export const SAMPLE_M = 2;
/** Loňské úseky nad prahem se ukládají po tolika metrech (na decimetry). */
export const CANDIDATE_STEP_M = 4;
/** Letošní úsek nad prahem leží „tam, kde loni“, když je od loňského nejvýš tak daleko (m). */
export const MATCH_M = 6;
/** Trasa vede po pevné cestě, když je od její osy nejvýš tak daleko (m) – buňka sítě 3,75 m. */
export const ON_ROAD_M = 5;
/** Konec nové cesty u pevné cesty se k ní připojí, když je od ní nejvýš tak daleko (m). */
export const ATTACH_M = 10;
/** Připojení blíž konci pevné cesty jde přímo do konce (cesta se nedělí) (m). */
export const END_SNAP_M = 4;
/**
 * Nejmenší odstup bodu osy od přichycení (konec, křižovatka), aby do něj napojení obešlo plochu
 * staveb (`joinTarget`, D93) – blíž by rozdělení dalo kousek cesty bez délky (m).
 */
export const JOIN_AROUND_MIN_M = 1;
/** Kratší úsek se pevnou cestou nestane (m). */
export const MIN_ROAD_M = 15;
/** Zjednodušení osy nové cesty (m) – body po 2 m by stav zbytečně nafoukly. */
export const SIMPLIFY_M = 0.25;
/** Provoz cesty se měří v bodech po tolika metrech (medián – jedno místo ho nezkreslí). */
export const MEASURE_STEP_M = 3;
/** Strom nestojí blíž ose žádné pevné cesty (m) ani blíž konci cesty (rozcestí, brána). */
export const ROAD_CLEAR_M = 2.2;
export const END_CLEAR_M = 6;
/** Krok procházení osy při hledání míst na stromy (m). */
export const SPOT_WALK_M = 1;
/** Strom u cesty nestojí kousek od překážky krajiny (kmen, keř, kámen) (m). */
export const LAYER_CLEAR_M = 2.5;
/** Kolem čtverců (pole, sad, hřbitov, pozemek, háj) se nesází – jen podél okraje (m). */
export const SQUARE_MARGIN_M = 1.5;
/** Ves: kolem obydlí se nesází (m od středu), kolem modly a svatyně, milíře a posvátného dubu. */
export const HOMESTEAD_M = 16;
export const SACRED_MARGIN_M = 3;
export const MILIR_MARGIN_M = 1.5;
export const SACRED_OAK_M = 6;
/** Kyblíky prostorového indexu os (m). */
const BUCKET_M = 10;
/** Krok vzorkování osy pro mokřinu a brody (m), slití mezer (m) a nejkratší mokřina (m). */
const GROUND_STEP_M = 1;
export const GROUND_GAP_M = 2;
const GROUND_MIN_WET_M = 2;
/** Body brodu bližší než tolik metrů jsou jeden brod. */
export const FORD_GAP_M = 4;

/**
 * Kudy osa vede (roads.md – Vylepšení cesty): úseky v mokřině (rovina podél potoka) a brody přes
 * potok – po metru osy podle příznaků terénu pěšin; mezery do 2 m se slijí, kratší mokřina se
 * nepočítá, brod je uprostřed souvislé řady bodů v brodu. Vzdálenosti od začátku osy na dm.
 */
export function roadGroundOf(points: readonly RoadPoint[], terrain: PathTerrain): RoadGround {
  const ground: RoadGround = { wet: [], fords: [] };
  if (points.length < 2) return ground;
  const { points: samples } = resample(points, null, GROUND_STEP_M);
  const at = lengthsAlong(samples);
  const length = at[at.length - 1]!;
  const flagAt = (p: RoadPoint): number => {
    const i = Math.round((p.x - terrain.originX) / terrain.cellM);
    const j = Math.round((p.z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return 0;
    return terrain.flags[j * terrain.width + i]!;
  };
  const runs = (flag: number, gap: number): [number, number][] => {
    const out: [number, number][] = [];
    samples.forEach((p, k) => {
      if (!(flagAt(p) & flag)) return;
      const from = Math.max(0, at[k]! - GROUND_STEP_M / 2);
      const to = Math.min(length, at[k]! + GROUND_STEP_M / 2);
      const last = out[out.length - 1];
      if (last && from - last[1] <= gap) last[1] = to;
      else out.push([from, to]);
    });
    return out;
  };
  ground.wet = runs(PATH_WETLAND, GROUND_GAP_M)
    .filter(([a, b]) => b - a >= GROUND_MIN_WET_M)
    .map(([a, b]) => [dm(a), dm(b)]);
  ground.fords = runs(PATH_FORD, FORD_GAP_M).map(([a, b]) => dm((a + b) / 2));
  return ground;
}

/** Délka mokřiny na ose (m). */
export function roadWetM(ground: RoadGround | undefined): number {
  return (ground?.wet ?? []).reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Mokřina a brody na ose od `from` do `to` (m) posunuté na začátek úseku. */
export function groundPart(ground: RoadGround | undefined, from: number, to: number): RoadGround {
  if (!ground) return { wet: [], fords: [] };
  return {
    wet: ground.wet
      .filter(([a, b]) => b > from && a < to)
      .map(([a, b]): [number, number] => [dm(Math.max(a, from) - from), dm(Math.min(b, to) - from)])
      .filter(([a, b]) => b > a),
    fords: ground.fords.filter((f) => f >= from && f < to).map((f) => dm(f - from)),
  };
}

/** Délka osy úseku (m). */
export function roadLengthM(road: Pick<Road, 'points'>): number {
  const at = lengthsAlong(road.points);
  return at[at.length - 1] ?? 0;
}

export function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

export function dm(v: number): number {
  return Math.round(v * 10) / 10;
}

// --- geometrie os ------------------------------------------------------------------------------

/** Délky po lomené čáře (kumulativně od začátku). */
export function lengthsAlong(points: readonly RoadPoint[]): number[] {
  const at = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    at.push(at[k - 1]! + length2(b.x - a.x, b.z - a.z));
  }
  return at;
}

/** Body lomené čáry po `step` m (s koncem) a hodnoty v nich (lineárně mezi body). */
export function resample(
  points: readonly RoadPoint[],
  values: readonly number[] | null,
  step: number,
): { points: RoadPoint[]; values: number[] } {
  const out: RoadPoint[] = [];
  const outValues: number[] = [];
  if (points.length === 0) return { points: out, values: outValues };
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const n = Math.max(1, Math.ceil(length / step - 1e-9));
  let segment = 1;
  for (let s = 0; s <= n; s++) {
    const d = s === n ? length : s * step;
    while (segment < points.length - 1 && at[segment]! < d) segment++;
    if (points.length === 1) {
      out.push({ ...points[0]! });
      outValues.push(values?.[0] ?? 0);
      break;
    }
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = at[segment]! - at[segment - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[segment - 1]!) / span)) : 1;
    out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
    if (values) {
      outValues.push(values[segment - 1]! + (values[segment]! - values[segment - 1]!) * u);
    }
  }
  return { points: out, values: outValues };
}

/** Vzdálenost bodu od úsečky a–b a parametr nejbližšího bodu (0–1). */
export function toSegment(
  x: number,
  z: number,
  a: RoadPoint,
  b: RoadPoint,
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return { distance: length2(x - (a.x + dx * t), z - (a.z + dz * t)), t };
}

/** Vzdálenost bodu od úsečky a–b – týž výpočet jako `toSegment`, bez objektu výsledku. */
function segmentDistance(x: number, z: number, a: RoadPoint, b: RoadPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return length2(x - (a.x + dx * t), z - (a.z + dz * t));
}

/** Číslo kyblíku (souřadnice kyblíku do ±32 767 – mapa do ±327 km). */
function bucketKey(bx: number, bz: number): number {
  return (bx + 0x8000) * 0x10000 + (bz + 0x8000);
}

/** Vzdálenost od nejbližší osy (přesně do BUCKET_M, dál Infinity) – úsečky po kyblících. */
export function axisDistance(
  polylines: readonly (readonly RoadPoint[])[],
): (x: number, z: number) => number {
  // kyblík jako číslo (bez skládání řetězců – dotaz je v měsíční kontrole cest nejčastější)
  const buckets = new Map<number, [RoadPoint, RoadPoint][]>();
  for (const line of polylines) {
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1]!;
      const b = line[k]!;
      const x0 = Math.floor(Math.min(a.x, b.x) / BUCKET_M);
      const x1 = Math.floor(Math.max(a.x, b.x) / BUCKET_M);
      const z0 = Math.floor(Math.min(a.z, b.z) / BUCKET_M);
      const z1 = Math.floor(Math.max(a.z, b.z) / BUCKET_M);
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const key = bucketKey(bx, bz);
          const list = buckets.get(key);
          if (list) list.push([a, b]);
          else buckets.set(key, [[a, b]]);
        }
      }
    }
  }
  return (x, z) => {
    let best = Infinity;
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = buckets.get(bucketKey(bx + dx, bz + dz));
        if (!list) continue;
        for (const [a, b] of list) best = Math.min(best, segmentDistance(x, z, a, b));
      }
    }
    return best;
  };
}

/** Nejbližší bod na pevných cestách: index cesty, úsek, bod a vzdálenost. */
export interface RoadHit {
  road: number;
  segment: number;
  point: RoadPoint;
  distance: number;
}

export function nearestOnRoads(roads: readonly Road[], x: number, z: number): RoadHit | null {
  let best: RoadHit | null = null;
  roads.forEach((road, r) => {
    // opuštěný kus (pod stavbou) není ve vsi cestou, ke které se napojuje (paths.md)
    if (road.abandoned) return;
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const { distance, t } = toSegment(x, z, a, b);
      if (best === null || distance < best.distance) {
        best = {
          road: r,
          segment: k - 1,
          point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
          distance,
        };
      }
    }
  });
  return best;
}

/**
 * Souběžná cesta (Martin: „Pokud už cesta vede tím směrem, lidé by měli použít tu, ne si
 * prošlapat vlastní souběžnou.“): bod osy do PARALLEL_M od jiné pevné cesty, jejíž směr se od
 * směru osy liší nejvýš o úhel s kosinem PARALLEL_COS (≈ 37°). Souběžný kus aspoň PARALLEL_MIN_M
 * dlouhý se z mladší / slabší cesty odstraní.
 */
export const PARALLEL_M = 12;
const PARALLEL_COS = 0.8;
export const PARALLEL_MIN_M = 25;
/** Krok vzorkování osy při hledání souběžných kusů (m). */
export const PARALLEL_STEP_M = 2;
/** Vede bod `p` (směr osy od `before` k `after`) souběžně s některou z cest `roads`? */
export function alongsideRoad(
  roads: readonly Road[],
  p: RoadPoint,
  before: RoadPoint,
  after: RoadPoint,
): boolean {
  const tx = after.x - before.x;
  const tz = after.z - before.z;
  const tl = length2(tx, tz);
  if (tl < 1e-9) return false;
  for (const road of roads) {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      if (toSegment(p.x, p.z, a, b).distance > PARALLEL_M) continue;
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const sl = length2(sx, sz);
      if (sl < 1e-9) continue;
      if (Math.abs(tx * sx + tz * sz) / (tl * sl) >= PARALLEL_COS) return true;
    }
  }
  return false;
}

/** Kus osy od `from` do `to` m (body zlomu mezi tím, konce na cm). */
export function axisSlice(points: readonly RoadPoint[], from: number, to: number): RoadPoint[] {
  const at = lengthsAlong(points);
  const pointAt = (d: number): RoadPoint => {
    let k = 1;
    while (k < points.length - 1 && at[k]! < d) k++;
    const a = points[k - 1]!;
    const b = points[k]!;
    const span = at[k]! - at[k - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[k - 1]!) / span)) : 0;
    return { x: cm(a.x + (b.x - a.x) * u), z: cm(a.z + (b.z - a.z) * u) };
  };
  const out = [pointAt(from)];
  points.forEach((p, k) => {
    if (at[k]! > from + 1e-6 && at[k]! < to - 1e-6) out.push({ x: p.x, z: p.z });
  });
  out.push(pointAt(to));
  return out.filter((p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z);
}
