import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';

// Křivka obvodu opevnění (fortifications.md – Obvod, Pro implementaci – Obvod z bodů): hladká
// uzavřená křivka přes body – centripetální Catmull-Rom (uzly po odmocnině vzdáleností), jen
// sčítání, násobení a odmocnina, takže ji server i prohlížeč spočítají stejně. Navzorkuje se do
// lomené čáry, z ní se počítá délka, plocha, pás, úseky i brány.

/** Kubika jednoho kusu křivky mezi dvěma body: C(u) = a·u³ + b·u² + c·u + d, u ∈ [0, 1]. */
interface Span {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  dx: number;
  dz: number;
  /** Tětiva kusu (m). */
  chord: number;
}

/** Ohyb křivky – nejmenší poloměr (m) a kde je. */
export interface CurveBend {
  radiusM: number;
  at: Point;
}

/** Tolerance porovnání poloh (m). */
const EPSILON = 1e-9;

function dist(a: Point, b: Point): number {
  const x = b[0] - a[0];
  const z = b[1] - a[1];
  return Math.sqrt(x * x + z * z);
}

/** Dvojnásobná znaménková plocha mnohoúhelníku (kladná = proti směru hodin; x východ, z sever). */
function signedArea2(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum;
}

/**
 * Body obvodu v pevném pořadí: po směru hodin (plocha vpravo), začátek v nejsevernějším bodě (sever
 * = +z, při shodě nejzápadnější); body bližší než `minPointGapM` k předchozímu se vynechají. Výsledek
 * nezávisí na tom, kterým bodem a kterým směrem hráč obvod zadal.
 */
export function normalizeFortPoints(points: readonly Point[]): Point[] {
  const gap = FORTIFICATIONS.outline.minPointGapM;
  const kept: Point[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (!last || dist(last, p) >= gap) kept.push([p[0], p[1]]);
  }
  while (kept.length > 1 && dist(kept[0]!, kept[kept.length - 1]!) < gap) kept.pop();
  if (kept.length < 3) return kept;
  const ordered = signedArea2(kept) > 0 ? [...kept].reverse() : kept;
  let north = 0;
  ordered.forEach((p, k) => {
    const best = ordered[north]!;
    if (p[1] > best[1] + EPSILON || (Math.abs(p[1] - best[1]) <= EPSILON && p[0] < best[0])) {
      north = k;
    }
  });
  return [...ordered.slice(north), ...ordered.slice(0, north)];
}

/** Kusy křivky přes uzavřenou řadu bodů (centripetální Catmull-Rom jako Hermitova kubika). */
function curveSpans(points: readonly Point[]): Span[] {
  const n = points.length;
  const spans: Span[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const chord = dist(p1, p2);
    const d01 = Math.sqrt(dist(p0, p1));
    const d12 = Math.sqrt(chord);
    const d23 = Math.sqrt(dist(p2, p3));
    // tečny na začátku a na konci kusu (u ∈ [0, 1])
    const m1x = p2[0] - p1[0] + d12 * ((p1[0] - p0[0]) / d01 - (p2[0] - p0[0]) / (d01 + d12));
    const m1z = p2[1] - p1[1] + d12 * ((p1[1] - p0[1]) / d01 - (p2[1] - p0[1]) / (d01 + d12));
    const m2x = p2[0] - p1[0] + d12 * ((p3[0] - p2[0]) / d23 - (p3[0] - p1[0]) / (d12 + d23));
    const m2z = p2[1] - p1[1] + d12 * ((p3[1] - p2[1]) / d23 - (p3[1] - p1[1]) / (d12 + d23));
    spans.push({
      ax: 2 * p1[0] - 2 * p2[0] + m1x + m2x,
      az: 2 * p1[1] - 2 * p2[1] + m1z + m2z,
      bx: -3 * p1[0] + 3 * p2[0] - 2 * m1x - m2x,
      bz: -3 * p1[1] + 3 * p2[1] - 2 * m1z - m2z,
      cx: m1x,
      cz: m1z,
      dx: p1[0],
      dz: p1[1],
      chord,
    });
  }
  return spans;
}

function spanAt(s: Span, u: number): Point {
  return [((s.ax * u + s.bx) * u + s.cx) * u + s.dx, ((s.az * u + s.bz) * u + s.cz) * u + s.dz];
}

/** Poloměr ohybu kusu v bodě u: |v|³ ÷ |x′z″ − z′x″|; rovný kus Infinity. */
function spanRadius(s: Span, u: number): number {
  const vx = (3 * s.ax * u + 2 * s.bx) * u + s.cx;
  const vz = (3 * s.az * u + 2 * s.bz) * u + s.cz;
  const ax = 6 * s.ax * u + 2 * s.bx;
  const az = 6 * s.az * u + 2 * s.bz;
  const cross = Math.abs(vx * az - vz * ax);
  const speed = Math.sqrt(vx * vx + vz * vz);
  if (cross <= EPSILON) return Infinity;
  return (speed * speed * speed) / cross;
}

/** Počet vzorků kusu – krok ≈ `sampleStepM`, nejméně 2. */
function spanSamples(s: Span, step: number): number {
  return Math.max(2, Math.ceil(s.chord / step - EPSILON));
}

/**
 * Navzorkovaná křivka přes body `points` (už v pevném pořadí – `normalizeFortPoints`): uzavřená
 * lomená čára bez opakovaného prvního bodu, začíná v prvním bodě, krok ≈ `sampleStepM`.
 */
export function sampleCurve(
  points: readonly Point[],
  step: number = FORTIFICATIONS.outline.sampleStepM,
): Point[] {
  const out: Point[] = [];
  for (const s of curveSpans(points)) {
    const k = spanSamples(s, step);
    for (let j = 0; j < k; j++) out.push(spanAt(s, j / k));
  }
  return out;
}

/** Nejostřejší ohyb křivky přes body `points` – poloměr ve vzorcích a mezi nimi (m). */
export function curveBend(
  points: readonly Point[],
  step: number = FORTIFICATIONS.outline.sampleStepM,
): CurveBend {
  let best: CurveBend = { radiusM: Infinity, at: points[0] ?? [0, 0] };
  for (const s of curveSpans(points)) {
    const k = 2 * spanSamples(s, step);
    for (let j = 0; j <= k; j++) {
      const u = j / k;
      const r = spanRadius(s, u);
      if (r < best.radiusM) best = { radiusM: r, at: spanAt(s, u) };
    }
  }
  return best;
}

/** Délka uzavřené lomené čáry (m). */
export function polylineLength(polyline: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < polyline.length; i++) {
    sum += dist(polyline[i]!, polyline[(i + 1) % polyline.length]!);
  }
  return sum;
}

/** Plocha uvnitř uzavřené lomené čáry (shoelace, m²). */
export function polylineArea(polyline: readonly Point[]): number {
  return Math.abs(signedArea2(polyline)) / 2;
}

/**
 * Plocha uvnitř vnitřního okraje pásu šířky `band` (Steinerův vzorec A − L·b + π·b², oříznutý na
 * ≥ 0) – přesný pro kruh i obdélník se zakulacenými rohy s poloměrem aspoň `band`.
 */
export function steinerInnerArea(areaM2: number, lengthM: number, band: number): number {
  return Math.max(0, areaM2 - lengthM * band + Math.PI * band * band);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Kříží se úsečky ab a cd ve vnitřních bodech (dotyk koncem se nepočítá)? Průsečík, nebo null. */
function segmentHit(a: Point, b: Point, c: Point, d: Point): Point | null {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return null;
}

/** Místo, kde se uzavřená lomená čára kříží sama se sebou, nebo null. */
export function selfCrossing(polyline: readonly Point[]): Point | null {
  const n = polyline.length;
  const box = polyline.map((p, i) => {
    const q = polyline[(i + 1) % n]!;
    return [
      Math.min(p[0], q[0]),
      Math.min(p[1], q[1]),
      Math.max(p[0], q[0]),
      Math.max(p[1], q[1]),
    ] as const;
  });
  for (let i = 0; i < n; i++) {
    const bi = box[i]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const bj = box[j]!;
      if (bi[2] < bj[0] || bj[2] < bi[0] || bi[3] < bj[1] || bj[3] < bi[1]) continue;
      const hit = segmentHit(
        polyline[i]!,
        polyline[(i + 1) % n]!,
        polyline[j]!,
        polyline[(j + 1) % n]!,
      );
      if (hit) return hit;
    }
  }
  return null;
}
