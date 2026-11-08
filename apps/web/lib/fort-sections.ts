import { FORTIFICATIONS, type FortGate } from '@bohemia/game';

// Úseky opevnění na obvodu, jak je hráč vidí (fortifications.md – Rozhraní, Úseky; Martin
// 8. 11. 2026: „Žluté označení nesedí s tvarem označené hradby.“): úsek je hradba mezi okraji
// dvou bran po obvodu. Brána leží uvnitř svého dílu (`FortGate.offsetM`), takže úsek nezačíná na
// začátku dílu s branou – díly na koncích úseku patří napůl k sousednímu úseku (návrh Clauda).
// Úsek pro zboření (jádro – `fortSections`) se pozná podle dílu brány na jeho začátku. Čistý
// modul: čte ho server (panel úseku) i scéna (výběr kliknutím, obrys).

/** Polovina šířky brány (m) – brána je rovná tětiva se středem v `FortGate`. */
export const FORT_GATE_HALF_M = FORTIFICATIONS.gate.widthM / 2;

/** Tolerance poloh na obvodu (m). */
const EPSILON_M = 1e-6;

/** Začátky dílů po obvodu (m od začátku dílu 0) a délka obvodu. */
export interface FortPerimeter {
  starts: number[];
  total: number;
}

/** Začátky dílů z jejich délek (v pořadí obvodu). */
export function fortPerimeter(lengths: readonly number[]): FortPerimeter {
  const starts: number[] = [];
  let total = 0;
  for (const length of lengths) {
    starts.push(total);
    total += length;
  }
  return { starts, total };
}

/** Vzdálenost z `fromM` do `s` po směru obvodu délky `total` (0 až `total`). */
export function alongFrom(fromM: number, s: number, total: number): number {
  if (total <= 0) return 0;
  return (((s - fromM) % total) + total) % total;
}

/** Vzdálenost dvou bodů obvodu (kratší cestou). */
export function loopDistanceM(a: number, b: number, total: number): number {
  const d = alongFrom(a, b, total);
  return Math.min(d, total - d);
}

/** Střed brány na obvodu (m od začátku dílu 0). */
export function gateCenterM(
  perimeter: FortPerimeter,
  gate: Pick<FortGate, 'segment' | 'offsetM'>,
): number {
  const s = (perimeter.starts[gate.segment] ?? 0) + gate.offsetM;
  return perimeter.total > 0 ? alongFrom(0, s, perimeter.total) : 0;
}

/** Díl, ve kterém leží bod `s` obvodu. */
function segmentAtM(starts: readonly number[], s: number): number {
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1]! <= s + EPSILON_M) k++;
  return k;
}

/** Díly, kterých se kus obvodu od `fromM` délky `lengthM` dotkne, po směru obvodu. */
export function segmentsAlong(perimeter: FortPerimeter, fromM: number, lengthM: number): number[] {
  const { starts, total } = perimeter;
  const n = starts.length;
  if (n === 0 || total <= 0) return [];
  if (lengthM >= total - EPSILON_M) {
    const first = segmentAtM(starts, alongFrom(0, fromM, total));
    return Array.from({ length: n }, (_, k) => (first + k) % n);
  }
  const from = alongFrom(0, fromM, total);
  const first = segmentAtM(starts, from);
  const result = [first];
  for (let k = 1; k < n; k++) {
    const index = (first + k) % n;
    // začátek dílu za začátkem úseku po směru obvodu
    const start = from + alongFrom(from, starts[index]!, total);
    if (start >= from + lengthM - EPSILON_M) break;
    result.push(index);
  }
  return result;
}

/** Úsek hradby mezi okraji dvou bran po obvodu. */
export interface FortSectionSpan {
  /** Díl brány na začátku úseku (jádro – `FortSection.gateSegment`); obvod bez brány null. */
  gateSegment: number | null;
  /** Začátek úseku – okraj brány (m od začátku dílu 0, 0 až délka obvodu). */
  fromM: number;
  /** Délka hradby úseku (m) – bez bran. */
  lengthM: number;
  /** Díly, kterých se úsek dotkne, po směru obvodu (i díly bran na koncích). */
  segments: number[];
}

/**
 * Úseky hradby mezi branami v pořadí bran po obvodu: od okraje brány po okraj další brány. Obvod
 * bez brány je jeden úsek přes celý obvod od dílu 0, s jedinou branou jeden úsek od jejího okraje
 * kolem dokola po její druhý okraj.
 */
export function fortSectionSpans(
  lengths: readonly number[],
  gates: readonly Pick<FortGate, 'segment' | 'offsetM'>[],
): FortSectionSpan[] {
  const perimeter = fortPerimeter(lengths);
  const { total } = perimeter;
  if (total <= 0) return [];
  const seen = new Set<number>();
  const centers = gates
    .filter((g) => g.segment >= 0 && g.segment < lengths.length)
    .filter((g) => (seen.has(g.segment) ? false : (seen.add(g.segment), true)))
    .map((g) => ({ segment: g.segment, at: gateCenterM(perimeter, g) }))
    .sort((a, b) => a.at - b.at);
  if (centers.length === 0) {
    return [
      { gateSegment: null, fromM: 0, lengthM: total, segments: segmentsAlong(perimeter, 0, total) },
    ];
  }
  return centers.map((gate, k) => {
    const next = centers[(k + 1) % centers.length]!;
    // s jedinou branou je další brána ta samá – úsek obejde celý obvod
    const gap = centers.length === 1 ? total : alongFrom(gate.at, next.at, total);
    const fromM = alongFrom(0, gate.at + FORT_GATE_HALF_M, total);
    const lengthM = Math.max(0, gap - 2 * FORT_GATE_HALF_M);
    return {
      gateSegment: gate.segment,
      fromM,
      lengthM,
      segments: segmentsAlong(perimeter, fromM, Math.max(lengthM, EPSILON_M)),
    };
  });
}

/** Úsek, ve kterém leží bod `s` obvodu délky `total`; v bráně null. */
export function spanAt(
  spans: readonly FortSectionSpan[],
  s: number,
  total: number,
): FortSectionSpan | null {
  return spans.find((span) => alongFrom(span.fromM, s, total) <= span.lengthM + EPSILON_M) ?? null;
}

/** Bod obvodu nejblíž bodu `point`: poloha po obvodu (m od začátku dílu 0) a vzdálenost (m). */
export function perimeterPosition(
  shapes: readonly { lengthM: number; path: readonly (readonly [number, number])[] }[],
  point: { x: number; z: number },
): { s: number; distance: number } | null {
  let best: { s: number; distance: number } | null = null;
  let start = 0;
  for (const shape of shapes) {
    let along = 0;
    for (let i = 0; i + 1 < shape.path.length; i++) {
      const [ax, az] = shape.path[i]!;
      const [bx, bz] = shape.path[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const len = Math.sqrt(l2);
      const t =
        l2 > 0 ? Math.min(1, Math.max(0, ((point.x - ax) * dx + (point.z - az) * dz) / l2)) : 0;
      const distance = Math.hypot(point.x - (ax + dx * t), point.z - (az + dz * t));
      if (!best || distance < best.distance) best = { s: start + along + len * t, distance };
      along += len;
    }
    // začátky dílů podle jejich délek – stejně jako `fortPerimeter`
    start += shape.lengthM;
  }
  return best;
}
