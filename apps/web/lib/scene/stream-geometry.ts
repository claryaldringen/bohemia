import type { Landscape } from '@bohemia/game';

/** Do jaké vzdálenosti od osy (m) umí `nearest` odpovídat. */
export const STREAM_REACH_M = 60;
const BUCKET_M = 30;

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
 * Osa potoka ve světových souřadnicích z dat krajiny (meandry a hladinu určil generátor),
 * prodloužená k okrajům mapy. Hladina podél osy nikdy nestoupá.
 */
export function streamCenterline(l: Landscape): StreamCenterline {
  const half = (l.size * l.cellSizeM) / 2;
  let points: StreamPoint[] = l.stream.map((p) => ({
    x: -half + (p.x + 0.5) * l.cellSizeM,
    z: -half + (p.y + 0.5) * l.cellSizeM,
    level: p.level,
  }));
  for (let k = 1; k < points.length; k++) {
    points[k]!.level = Math.min(points[k]!.level, points[k - 1]!.level);
  }
  if (points.length >= 2) points = extendToEdges(points, l.cellSizeM);
  return withNearestQuery(points);
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
