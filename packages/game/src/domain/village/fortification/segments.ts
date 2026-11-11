import type { FenceArc, FenceSegment } from '../paths/entrances';
import type { Point } from '../placement/polygon';
import { outlinePointAt, type FortOutline } from './outline';

// Úseky opevnění (fortifications.md – Obvod, Úseky): obvod se dělí na stejně dlouhé úseky ≈ 15 m
// (délka ÷ zaokrouhlený počet – `fortificationOutline`). Úsek je jednotka stavby, stáří, přestavby
// i průlomu. Pořadí po směru hodin od nejsevernějšího bodu je pevné – nezávisí na pořadí bodů.

/** Tvar úseku ve světě. */
export interface FortSegmentShape {
  /** Pořadí po směru hodin od severu (0, 1, …). */
  index: number;
  /** Začátek úseku na obvodu (m od začátku obvodu). */
  startM: number;
  /** Délka úseku po vnějším okraji (m). */
  lengthM: number;
  /** Lomená čára úseku po vnějším okraji – od začátku po konec (oba body). */
  path: Point[];
  /** Tětiva úseku od začátku po konec (tvar nese `path`; scéna zatím kreslí tětivu). */
  line: FenceSegment;
  /** Oblouk – obvod z bodů žádný nemá (tvar nese `path`). */
  arc: FenceArc | null;
  /** Střed úseku na křivce. */
  mid: Point;
}

/** Úseky obvodu v pevném pořadí – součet délek = délka obvodu. */
export function fortSegments(outline: FortOutline): FortSegmentShape[] {
  const { polyline, stations, segmentStarts, lengthM } = outline;
  const shapes: FortSegmentShape[] = [];
  for (let index = 0; index + 1 < segmentStarts.length; index++) {
    const from = segmentStarts[index]!;
    const to = segmentStarts[index + 1]!;
    const startM = stations[from]!;
    const endM = to < stations.length ? stations[to]! : lengthM;
    const path: Point[] = [];
    for (let k = from; k <= to; k++) path.push(polyline[k % polyline.length]!);
    const a = path[0]!;
    const b = path[path.length - 1]!;
    const chord = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    shapes.push({
      index,
      startM,
      lengthM: endM - startM,
      path,
      line: {
        x: a[0],
        z: a[1],
        dx: chord > 0 ? (b[0] - a[0]) / chord : 1,
        dz: chord > 0 ? (b[1] - a[1]) / chord : 0,
        length: chord,
      },
      arc: null,
      mid: outlinePointAt(outline, (startM + endM) / 2),
    });
  }
  return shapes;
}

/** Nejbližší bod úseku k bodu (x, z): vzdálenost (m) a poloha na úseku (m od jeho začátku). */
export function nearestOnSegment(
  segment: FortSegmentShape,
  x: number,
  z: number,
): { distance: number; along: number } {
  return nearestOnPath(segment.path, x, z);
}

/** Nejbližší bod lomené čáry `path` k bodu (x, z): vzdálenost a poloha po čáře od začátku (m). */
export function nearestOnPath(
  path: readonly Point[],
  x: number,
  z: number,
): { distance: number; along: number } {
  let best = Infinity;
  let along = 0;
  let at = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k]!;
    const b = path[k + 1]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len2 = ex * ex + ez * ez;
    const len = Math.sqrt(len2);
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * ex + (z - a[1]) * ez) / len2)) : 0;
    const px = a[0] + ex * t - x;
    const pz = a[1] + ez * t - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) {
      best = d;
      along = at + len * t;
    }
    at += len;
  }
  return { distance: best, along };
}
