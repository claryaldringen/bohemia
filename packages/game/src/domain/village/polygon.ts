// Rovinná geometrie pro umisťování staveb a polí – body [x, z] ve světě scény (metry).

export type Point = readonly [number, number];

/** Tolerance vzdálenosti (m), pod kterou se bod bere jako ležící na hraně. */
const BOUNDARY_EPSILON_M = 1e-6;
/** Odsazení sondy dovnitř mnohoúhelníku od středu hrany (m) – větší než BOUNDARY_EPSILON_M. */
const PROBE_OFFSET_M = 1e-3;
/** Dva body blíž než tohle (m) jsou jeden bod obrysu. */
const SAME_POINT_M = 0.01;

function at(points: readonly Point[], i: number): Point {
  return points[((i % points.length) + points.length) % points.length]!;
}

/** Dvojnásobek orientované plochy (kladná = proti směru hodinových ručiček v osách x, z). */
function signedDoubleArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = at(points, i);
    const [x2, z2] = at(points, i + 1);
    sum += x1 * z2 - x2 * z1;
  }
  return sum;
}

/** Plocha mnohoúhelníku (shoelace), bez ohledu na směr obíhání; méně než 3 body = 0. */
export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  return Math.abs(signedDoubleArea(points)) / 2;
}

/** Ořez mnohoúhelníku jednou osovou polorovinou (krok Sutherland–Hodgman). */
function clipAxis(
  points: readonly Point[],
  axis: 0 | 1,
  bound: number,
  keepAbove: boolean,
): Point[] {
  const inside = (p: Point): boolean => (keepAbove ? p[axis] >= bound : p[axis] <= bound);
  const cut = (a: Point, b: Point): Point => {
    const t = (bound - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const previous = at(points, i - 1);
    const current = at(points, i);
    if (inside(current)) {
      if (!inside(previous)) out.push(cut(previous, current));
      out.push(current);
    } else if (inside(previous)) {
      out.push(cut(previous, current));
    }
  }
  return out;
}

/**
 * Průnik mnohoúhelníku s osovým obdélníkem (Sutherland–Hodgman). U nekonvexního tvaru může
 * výsledek obsahovat hrany nulové šířky, plocha (polygonArea) je ale přesná.
 */
export function clipToRect(
  points: readonly Point[],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): Point[] {
  let clipped = clipAxis(points, 0, minX, true);
  clipped = clipAxis(clipped, 0, maxX, false);
  clipped = clipAxis(clipped, 1, minZ, true);
  return clipAxis(clipped, 1, maxZ, false);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Strana bodu p vůči přímce o→a: 1 vlevo, −1 vpravo, 0 na přímce (v toleranci). */
function side(o: Point, a: Point, p: Point): number {
  const value = cross(o, a, p);
  const tolerance = BOUNDARY_EPSILON_M * Math.hypot(a[0] - o[0], a[1] - o[1]);
  if (value > tolerance) return 1;
  if (value < -tolerance) return -1;
  return 0;
}

/** Vzdálenost bodu od úsečky a–b. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  return distanceToSegment(p, a, b) <= BOUNDARY_EPSILON_M;
}

/** Úsečky se protínají nebo dotýkají (i koncovým bodem). */
function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}

/** Úsečky se kříží uvnitř obou (dotyk koncovým bodem nebo překryv na přímce se nepočítá). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
}

/** Jednoduchý mnohoúhelník: aspoň 3 body a hrany se navzájem nekříží ani nedotýkají. */
export function isSimplePolygon(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = at(points, i);
    const b = at(points, i + 1);
    for (let j = i + 1; j < n; j++) {
      const c = at(points, j);
      const d = at(points, j + 1);
      if (j === i + 1) {
        // sousední hrany sdílejí vrchol b = c – nesmí se vracet po sobě
        if (onSegment(d, a, b) || onSegment(a, c, d)) return false;
      } else if (i === 0 && j === n - 1) {
        // první a poslední hrana sdílejí vrchol a = d
        if (onSegment(c, a, b) || onSegment(b, c, d)) return false;
      } else if (segmentsTouch(a, b, c, d)) {
        return false;
      }
    }
  }
  return true;
}

/** Obrys bez bodů na sobě (dvojklik) a bez uzavírajícího opakování prvního bodu. */
export function normalizeOutline(outline: readonly Point[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [x, z] of outline) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - z) < SAME_POINT_M) continue;
    out.push([x, z]);
  }
  while (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) >= SAME_POINT_M) break;
    out.pop();
  }
  return out;
}

/** Bod leží uvnitř mnohoúhelníku; bod na hraně (v toleranci) uvnitř není. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = at(polygon, i);
    const b = at(polygon, i + 1);
    if (onSegment(p, a, b)) return false;
    const crosses = a[1] > p[1] !== b[1] > p[1];
    if (crosses && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

/** Body těsně uvnitř mnohoúhelníku u středu každé hrany (sondy překryvu po hranách). */
function innerProbes(polygon: readonly Point[]): Point[] {
  const orientation = Math.sign(signedDoubleArea(polygon));
  const probes: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = at(polygon, i);
    const b = at(polygon, i + 1);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    // normála doleva od směru hrany míří dovnitř u obíhání proti směru hodinových ručiček
    const nx = (-(b[1] - a[1]) / length) * orientation;
    const nz = ((b[0] - a[0]) / length) * orientation;
    probes.push([(a[0] + b[0]) / 2 + nx * PROBE_OFFSET_M, (a[1] + b[1]) / 2 + nz * PROBE_OFFSET_M]);
  }
  return probes;
}

function boundingBoxesApart(a: readonly Point[], b: readonly Point[]): boolean {
  const box = (ps: readonly Point[]): [number, number, number, number] => [
    Math.min(...ps.map((p) => p[0])),
    Math.min(...ps.map((p) => p[1])),
    Math.max(...ps.map((p) => p[0])),
    Math.max(...ps.map((p) => p[1])),
  ];
  const [ax0, az0, ax1, az1] = box(a);
  const [bx0, bz0, bx1, bz1] = box(b);
  return ax1 < bx0 || bx1 < ax0 || az1 < bz0 || bz1 < az0;
}

/**
 * Vnitřky dvou jednoduchých mnohoúhelníků se překrývají. Společná hrana nebo dotyk vrcholem
 * překryv není. Hledá křížení hran, vrchol uvnitř druhého a sondy těsně uvnitř u hran (shodné
 * tvary, tvar vepsaný vrcholy do hran druhého).
 */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length < 3 || b.length < 3 || boundingBoxesApart(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(at(a, i), at(a, i + 1), at(b, j), at(b, j + 1))) return true;
    }
  }
  const inside = (points: readonly Point[], polygon: readonly Point[]): boolean =>
    points.some((p) => pointInPolygon(p, polygon));
  return inside(a, b) || inside(b, a) || inside(innerProbes(a), b) || inside(innerProbes(b), a);
}

/**
 * Rohy obdélníku width × depth se středem (x, z), otočeného o `rotation` (rad) kolem svislé osy
 * jako `rotation.y` v Babylonu: místní (lx, lz) → (x + lx·cos + lz·sin, z − lx·sin + lz·cos).
 */
export function rectangleCorners(
  x: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
): Point[] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const local: Point[] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  return local.map(([lx, lz]) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos]);
}
