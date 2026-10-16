import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { tileCenter } from './tile-at';

/** Hladina nad dnem koryta v datech krajiny (m). */
export const WATER_DEPTH_M = 0.6;
/** Do jaké vzdálenosti od osy (m) umí `nearest` odpovídat. */
export const STREAM_REACH_M = 60;
const BUCKET_M = 30;
const SMOOTHING_PASSES = 4;
/** Z cesty po políčkách se bere každý n-tý bod – schodovitý průběh se tím vyhladí v meandry. */
const SAMPLE_EVERY = 3;

export interface StreamPoint {
  x: number;
  z: number;
  /** Hladina (m, herní výška bez převýšení). */
  level: number;
}

export interface StreamCenterline {
  /** Vyhlazená osa potoka od pramene (vyšší konec) k ústí. */
  points: StreamPoint[];
  /** Nejbližší bod osy: vzdálenost (m) a hladina; dál než maxDistance → Infinity. */
  nearest(x: number, z: number, maxDistance?: number): { distance: number; level: number };
}

/**
 * Osa potoka z vodních políček: projde je v pořadí toku, zaoblí rohy (Chaikin) a prodlouží
 * k okrajům mapy. Hladina podél osy nikdy nestoupá.
 */
export function streamCenterline(l: Landscape): StreamCenterline {
  const tiles = traceStreamTiles(l);
  let points: StreamPoint[] = tiles.map((i) => {
    const { worldX, worldZ } = tileCenter(l, i % l.size, Math.floor(i / l.size));
    return { x: worldX, z: worldZ, level: l.heights[i]! + WATER_DEPTH_M };
  });
  for (let k = 1; k < points.length; k++) {
    points[k]!.level = Math.min(points[k]!.level, points[k - 1]!.level);
  }
  points = points.filter((_, k) => k % SAMPLE_EVERY === 0 || k === points.length - 1);
  if (points.length >= 2) points = extendToEdges(points, l.cellSizeM);
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) points = chaikin(points);
  return withNearestQuery(points);
}

/** Vodní políčka seřazená po toku: start na okraji v nejvyšším místě, dál k sousedům. */
function traceStreamTiles(l: Landscape): number[] {
  const { size } = l;
  const isWater = (i: number): boolean => l.surface[i] === SURFACE_CODES.water;
  let start = -1;
  for (let i = 0; i < l.surface.length; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (isWater(i) && onEdge && (start === -1 || l.heights[i]! > l.heights[start]!)) start = i;
  }
  if (start === -1) return [];

  const visited = new Uint8Array(l.surface.length);
  const order = [start];
  visited[start] = 1;
  for (let current = start; ;) {
    const x = current % size;
    const y = Math.floor(current / size);
    let next = -1;
    // Nejdřív přímí sousedé (potok je souvislý i po hranách), pak úhlopříčky.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (isWater(n) && !visited[n]) {
        next = n;
        break;
      }
    }
    if (next === -1) break;
    visited[next] = 1;
    order.push(next);
    current = next;
  }
  return order;
}

/** Prodlouží konce osy o políčko ven – voda pak sahá až za okraj mapy. */
function extendToEdges(points: StreamPoint[], cellSizeM: number): StreamPoint[] {
  const extend = (end: StreamPoint, inner: StreamPoint): StreamPoint => {
    const dx = end.x - inner.x;
    const dz = end.z - inner.z;
    const length = Math.hypot(dx, dz) || 1;
    return {
      x: end.x + (dx / length) * cellSizeM,
      z: end.z + (dz / length) * cellSizeM,
      level: end.level,
    };
  };
  return [extend(points[0]!, points[1]!), ...points, extend(points.at(-1)!, points.at(-2)!)];
}

/** Jeden průchod Chaikinova zaoblení; krajní body zůstávají. */
function chaikin(points: StreamPoint[]): StreamPoint[] {
  if (points.length < 3) return points;
  const result: StreamPoint[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const mix = (t: number): StreamPoint => ({
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      level: a.level + (b.level - a.level) * t,
    });
    if (i > 0) result.push(mix(0.25));
    if (i < points.length - 2) result.push(mix(0.75));
  }
  result.push(points.at(-1)!);
  return result;
}

function withNearestQuery(points: StreamPoint[]): StreamCenterline {
  const buckets = new Map<string, number[]>();
  const key = (bx: number, bz: number): string => `${bx},${bz}`;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s]!;
    const b = points[s + 1]!;
    const minX = Math.floor((Math.min(a.x, b.x) - STREAM_REACH_M) / BUCKET_M);
    const maxX = Math.floor((Math.max(a.x, b.x) + STREAM_REACH_M) / BUCKET_M);
    const minZ = Math.floor((Math.min(a.z, b.z) - STREAM_REACH_M) / BUCKET_M);
    const maxZ = Math.floor((Math.max(a.z, b.z) + STREAM_REACH_M) / BUCKET_M);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        const k = key(bx, bz);
        const list = buckets.get(k);
        if (list) list.push(s);
        else buckets.set(k, [s]);
      }
    }
  }

  return {
    points,
    nearest(x, z, maxDistance = STREAM_REACH_M) {
      const segments = buckets.get(key(Math.floor(x / BUCKET_M), Math.floor(z / BUCKET_M)));
      let best = Infinity;
      let level = 0;
      for (const s of segments ?? []) {
        const a = points[s]!;
        const b = points[s + 1]!;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lengthSq = abx * abx + abz * abz || 1;
        const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / lengthSq));
        const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
        if (d < best) {
          best = d;
          level = a.level + (b.level - a.level) * t;
        }
      }
      return best <= Math.min(maxDistance, STREAM_REACH_M)
        ? { distance: best, level }
        : { distance: Infinity, level: 0 };
    },
  };
}
