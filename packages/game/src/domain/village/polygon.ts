// Rovinná geometrie pro umisťování staveb a polí – body [x, z] ve světě scény (metry).

export type Point = readonly [number, number];

/** Tolerance vzdálenosti (m), pod kterou se bod bere jako ležící na hraně. */
const BOUNDARY_EPSILON_M = 1e-6;
/** Odsazení sondy dovnitř mnohoúhelníku od středu hrany (m) – větší než BOUNDARY_EPSILON_M. */
const PROBE_OFFSET_M = 1e-3;

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

/** Úsečky se kříží uvnitř obou (dotyk koncovým bodem nebo překryv na přímce se nepočítá). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
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
 * Průnik mnohoúhelníku `subject` s konvexním mnohoúhelníkem `clip` (Sutherland–Hodgman) – oba
 * libovolně obíhané; bez průniku prázdné pole. Jen sčítání a násobení – v prohlížeči i na serveru
 * vyjde totéž.
 */
export function clipToConvex(subject: readonly Point[], clip: readonly Point[]): Point[] {
  const orientation = Math.sign(signedDoubleArea(clip));
  if (orientation === 0) return [];
  let output: Point[] = [...subject];
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = at(clip, i);
    const b = at(clip, i + 1);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = at(input, j + 1);
      const sp = cross(a, b, p) * orientation;
      const sq = cross(a, b, q) * orientation;
      if (sp >= 0) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return output;
}

/**
 * Plocha části konvexního mnohoúhelníku `within`, kterou pokrývá sjednocení konvexních
 * mnohoúhelníků `polygons` (princip inkluze a exkluze – pro pár mnohoúhelníků jedné stavby).
 */
export function coveredArea(
  polygons: readonly (readonly Point[])[],
  within: readonly Point[],
): number {
  let area = 0;
  const visit = (start: number, piece: readonly Point[], count: number): void => {
    for (let i = start; i < polygons.length; i++) {
      const next = clipToConvex(piece, polygons[i]!);
      const size = polygonArea(next);
      if (size <= 0) continue;
      area += count % 2 === 0 ? size : -size;
      visit(i + 1, next, count + 1);
    }
  };
  visit(0, within, 0);
  return area;
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

/** Vzdálenost bodu od úsečky a–b (m) – jen přesně zaokrouhlované operace. */
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0
      ? 0
      : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2));
  const ex = p[0] - (a[0] + t * dx);
  const ez = p[1] - (a[1] + t * dz);
  return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Nejkratší vzdálenost dvou konvexních mnohoúhelníků (m) – překrývají-li se, 0 (dotyk hranou
 * dá 0 taky). Jen přesně zaokrouhlované operace.
 */
export function convexDistance(a: readonly Point[], b: readonly Point[]): number {
  if (polygonsOverlap(a, b)) return 0;
  let best = Infinity;
  const edges = (from: readonly Point[], to: readonly Point[]): void => {
    for (const p of from) {
      for (let j = 0; j < to.length; j++) {
        best = Math.min(best, pointSegmentDistance(p, at(to, j), at(to, j + 1)));
      }
    }
  };
  edges(a, b);
  edges(b, a);
  return best;
}
