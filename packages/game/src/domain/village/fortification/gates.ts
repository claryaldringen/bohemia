import { length2 } from '../../landscape';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { RoadPoint } from '../types';
import type { FortOutline } from './outline';
import { fortSegments, type FortSegmentShape } from './segments';

// Brány opevnění (fortifications.md – Brány): vzniknou samy, kde obvod protne cestu (pevnou,
// vozovou cestu a zemskou stezku – vybírá volající), hráč přidá další kliknutím na obvod; nejvýš
// jedna na úsek. Obvod bez cesty má jednu bránu v úseku nejblíž kotvě (dvorec, bez něj střed
// obydlí). Brána je 4 m široká a stojí celá na rovné části úseku (návrh Clauda).

/** Brána na obvodu. */
export interface FortGate {
  /** Úsek (`FortSegmentShape.index`). */
  segment: number;
  /** Střed brány na rovné části úseku – vzdálenost od jejího začátku (m). */
  offsetM: number;
  /** Střed brány ve světě (m). */
  x: number;
  z: number;
}

/** Proč bránu nejde přidat: klik daleko od obvodu, úsek už bránu má. */
export interface GateError {
  error: 'off-outline' | 'segment-taken';
}

/** Lomená čára ve světě (osa cesty). */
export type GatePolyline = readonly RoadPoint[];

/** Tolerance průsečíku na konci úsečky (m). */
const HIT_EPSILON_M = 1e-9;

/** Brána úseku nejblíž polohy `along` na rovné části – celá na rovné části, když se vejde. */
function gateAt(segment: FortSegmentShape, along: number): FortGate {
  const half = FORTIFICATIONS.gate.widthM / 2;
  const { line } = segment;
  const offsetM =
    line.length <= 2 * half ? line.length / 2 : Math.min(line.length - half, Math.max(half, along));
  return {
    segment: segment.index,
    offsetM,
    x: line.x + line.dx * offsetM,
    z: line.z + line.dz * offsetM,
  };
}

/** Poloha bodu promítnutá na rovnou část úseku (m od začátku, nezkrácená). */
function along(segment: FortSegmentShape, x: number, z: number): number {
  return (x - segment.line.x) * segment.line.dx + (z - segment.line.z) * segment.line.dz;
}

/** Průsečíky úsečky p → q s úsekem (rovná část a oblouk) – body ve světě. */
function crossings(segment: FortSegmentShape, p: RoadPoint, q: RoadPoint): [number, number][] {
  const hits: [number, number][] = [];
  const ex = q.x - p.x;
  const ez = q.z - p.z;
  const { line, arc } = segment;
  // rovná část: line + d·a = p + e·b, a ∈ [0, délka], b ∈ [0, 1]
  const denom = line.dx * ez - line.dz * ex;
  if (denom !== 0) {
    const wx = p.x - line.x;
    const wz = p.z - line.z;
    const a = (wx * ez - wz * ex) / denom;
    const b = (wx * line.dz - wz * line.dx) / denom;
    if (
      a >= -HIT_EPSILON_M &&
      a <= line.length + HIT_EPSILON_M &&
      b >= -HIT_EPSILON_M &&
      b <= 1 + HIT_EPSILON_M
    ) {
      hits.push([line.x + line.dx * a, line.z + line.dz * a]);
    }
  }
  if (arc && arc.r > 0) {
    // |p + e·b − střed|² = r², bod ve čtvrtkruhu mezi směry u a v
    const fx = p.x - arc.x;
    const fz = p.z - arc.z;
    const qa = ex * ex + ez * ez;
    const qb = 2 * (fx * ex + fz * ez);
    const qc = fx * fx + fz * fz - arc.r * arc.r;
    const disc = qb * qb - 4 * qa * qc;
    if (qa > 0 && disc >= 0) {
      const root = Math.sqrt(disc);
      for (const b of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
        if (b < -HIT_EPSILON_M || b > 1 + HIT_EPSILON_M) continue;
        const dx = fx + ex * b;
        const dz = fz + ez * b;
        if (dx * arc.ux + dz * arc.uz < 0 || dx * arc.vx + dz * arc.vz < 0) continue;
        hits.push([p.x + ex * b, p.z + ez * b]);
      }
    }
  }
  return hits;
}

/** Vzdálenost bodu od úseku – rovné části a oblouku (m). */
function distanceTo(segment: FortSegmentShape, x: number, z: number): number {
  const { line, arc } = segment;
  const a = Math.min(line.length, Math.max(0, along(segment, x, z)));
  let best = length2(x - (line.x + line.dx * a), z - (line.z + line.dz * a));
  if (arc && arc.r > 0) {
    const dx = x - arc.x;
    const dz = z - arc.z;
    if (dx * arc.ux + dz * arc.uz >= 0 && dx * arc.vx + dz * arc.vz >= 0) {
      best = Math.min(best, Math.abs(length2(dx, dz) - arc.r));
    }
  }
  return best;
}

/**
 * Brány, které vzniknou samy (fortifications.md – Brány): průsečíky obvodu s cestami `roads`,
 * nejvýš jedna na úsek (první po směru hodin); obvod bez průsečíku dostane jednu bránu uprostřed
 * úseku nejblíž kotvě `anchor` (při shodě úsek s menším pořadím). Seřazené podle úseku.
 */
export function autoGates(
  outline: FortOutline,
  roads: readonly GatePolyline[],
  anchor: RoadPoint,
): FortGate[] {
  const segments = fortSegments(outline);
  const gates: FortGate[] = [];
  for (const segment of segments) {
    let first = Infinity;
    for (const road of roads) {
      for (let k = 0; k + 1 < road.length; k++) {
        for (const [x, z] of crossings(segment, road[k]!, road[k + 1]!)) {
          first = Math.min(first, along(segment, x, z));
        }
      }
    }
    if (first !== Infinity) gates.push(gateAt(segment, first));
  }
  if (gates.length > 0) return gates;
  let nearest = segments[0];
  let best = Infinity;
  for (const segment of segments) {
    const d = distanceTo(segment, anchor.x, anchor.z);
    if (d < best) {
      best = d;
      nearest = segment;
    }
  }
  return nearest ? [gateAt(nearest, nearest.line.length / 2)] : [];
}

/**
 * Hráč přidá bránu kliknutím na obvod (fortifications.md – Brány): úsek nejblíž bodu `pos`,
 * nejvýš do šířky pásu (nejméně půl brány) od vnějšího okraje (návrh Clauda); úsek s bránou ji
 * druhou nedostane. Vrátí nové brány seřazené podle úseku.
 */
export function addGate(
  outline: FortOutline,
  gates: readonly FortGate[],
  pos: RoadPoint,
): FortGate[] | GateError {
  const reach = Math.max(outline.bandM, FORTIFICATIONS.gate.widthM / 2);
  let nearest: FortSegmentShape | null = null;
  let best = Infinity;
  for (const segment of fortSegments(outline)) {
    const d = distanceTo(segment, pos.x, pos.z);
    if (d < best) {
      best = d;
      nearest = segment;
    }
  }
  if (!nearest || best > reach) return { error: 'off-outline' };
  const index = nearest.index;
  if (gates.some((g) => g.segment === index)) return { error: 'segment-taken' };
  return [...gates, gateAt(nearest, along(nearest, pos.x, pos.z))].sort(
    (a, b) => a.segment - b.segment,
  );
}
