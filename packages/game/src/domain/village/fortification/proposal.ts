import type { Point } from '../placement/polygon';
import { FORTIFICATIONS } from '../rules/rules-fortifications';

// Návrh obvodu (fortifications.md – Obvod; Martin 7. 11. 2026 – „ano“): nejkratší hladký obvod
// kolem jádra vsi = vypouklý obal jádra odsunutý o odstup – rovné kusy a oblouky kolem krajních
// staveb (návrh Clauda). Body leží na tečnách a středech oblouků (delší oblouk po nejvýš 45°)
// a po nejvýš 15 m na rovných kusech. Čistá geometrie – kontroly a jádro vsi jsou ve
// `fortification-proposal.ts`.

/** cos 45° – oblouk delší než tento úhel se rozpůlí. */
const COS_45 = 0.7071067811865476;

/** Tolerance (m). */
const EPSILON = 1e-9;

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Vypouklý obal bodů (Andrewův algoritmus) po směru hodin (x východ, z sever), bez bodů na
 * přímce; méně než tři různé body – ty, které jsou.
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points]
    .map((p): Point => [p[0], p[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);
  if (sorted.length < 3) return sorted;
  // dolní a horní řetěz proti směru hodin, pak obrátit
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  const ccw = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return ccw.reverse();
}

function normalize(x: number, z: number): Point {
  const len = Math.sqrt(x * x + z * z);
  return len > EPSILON ? [x / len, z / len] : [0, 0];
}

/** Směr v půli oblouku od u k v po směru hodin (u a v jednotkové). */
function bisect(u: Point, v: Point): Point {
  const sx = u[0] + v[0];
  const sz = u[1] + v[1];
  if (sx * sx + sz * sz <= EPSILON) return [u[1], -u[0]];
  return normalize(sx, sz);
}

/**
 * Směry vnitřních bodů oblouku poloměru `r` od u k v (po směru hodin): střed vždy, delší
 * polovina se dál půlí, dokud nemá nejvýš 45° a tětivu nejvýš `gap`.
 */
function arcDirections(u: Point, v: Point, r: number, gap: number, top: boolean): Point[] {
  const dot = u[0] * v[0] + u[1] * v[1];
  const ex = u[0] - v[0];
  const ez = u[1] - v[1];
  const chord = r * Math.sqrt(ex * ex + ez * ez);
  if (dot >= 1 - EPSILON) return [];
  if (!top && dot >= COS_45 && chord <= gap) return [];
  const m = bisect(u, v);
  return [...arcDirections(u, m, r, gap, false), m, ...arcDirections(m, v, r, gap, false)];
}

/** Body úsečky a → b po nejvýš `gap` – bez obou konců. */
function between(a: Point, b: Point, gap: number): Point[] {
  const len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
  const parts = Math.max(1, Math.ceil(len / gap - EPSILON));
  const out: Point[] = [];
  for (let k = 1; k < parts; k++) {
    const t = k / parts;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Kruh o poloměru `r` kolem `center` – body po nejvýš 15 m, aspoň 8, po směru hodin od severu. */
export function circlePoints(center: Point, r: number): Point[] {
  const gap = FORTIFICATIONS.outline.pointGapM;
  const quarters: Point[] = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  const out: Point[] = [];
  quarters.forEach((u, k) => {
    const v = quarters[(k + 1) % 4]!;
    for (const d of [u, ...arcDirections(u, v, r, gap, true)]) {
      out.push([center[0] + d[0] * r, center[1] + d[1] * r]);
    }
  });
  return out;
}

/**
 * Body návrhu obvodu kolem mnohoúhelníků jádra `polygons`: vypouklý obal všech rohů odsunutý
 * o `offsetM` – u každého rohu obalu oblouk poloměru `offsetM` (tečny a střed), mezi nimi rovný
 * kus s body po nejvýš 15 m. Jádro z jediného bodu – kruh. Bez jádra prázdné.
 */
export function hullOffsetPoints(
  polygons: readonly (readonly Point[])[],
  offsetM: number,
): Point[] {
  const hull = convexHull(polygons.flat());
  if (hull.length === 0) return [];
  if (hull.length === 1) return circlePoints(hull[0]!, offsetM);
  const gap = FORTIFICATIONS.outline.pointGapM;
  const n = hull.length;
  // vnější normála hrany i → i + 1 (po směru hodin vlevo od směru)
  const normals = hull.map((p, i): Point => {
    const q = hull[(i + 1) % n]!;
    const d = normalize(q[0] - p[0], q[1] - p[1]);
    return [-d[1], d[0]];
  });
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const v = hull[i]!;
    const nIn = normals[(i + n - 1) % n]!;
    const nOut = normals[i]!;
    const at = (d: Point): Point => [v[0] + d[0] * offsetM, v[1] + d[1] * offsetM];
    out.push(at(nIn));
    for (const d of arcDirections(nIn, nOut, offsetM, gap, true)) out.push(at(d));
    const start = at(nOut);
    out.push(start);
    const w = hull[(i + 1) % n]!;
    out.push(...between(start, [w[0] + nOut[0] * offsetM, w[1] + nOut[1] * offsetM], gap));
  }
  return out;
}
