import { FORTIFICATIONS } from '../rules/rules-fortifications';
import type { FortGate } from './gates';

// Úseky opevnění na obvodu, jak je hráč vidí (fortifications.md – Rozhraní, Úseky; Martin
// 8. 11. 2026: „Žluté označení nesedí s tvarem označené hradby.“): úsek je hradba mezi okraji
// dvou bran po obvodu. Brána leží uvnitř svého dílu (`FortGate.offsetM`), takže úsek nezačíná na
// začátku dílu s branou – díly na koncích úseku patří napůl k sousednímu úseku (návrh Clauda).
// Úsek pro zboření (jádro – `fortSections`) se pozná podle dílu brány na jeho začátku. Čistá doména: počítá
// ho server (zboření úseku, panel) i scéna (výběr kliknutím, obrys) stejně (návrh Clauda).

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

/** Kus dílu v úseku – celý díl, nebo část dílu s branou před bránou či za ní. */
export interface SectionPiece {
  /** Díl (`FortSegment.index`). */
  index: number;
  /** Část dílu s branou; chybí = celý díl. */
  part?: 'before' | 'after';
  /** Délka kusu (m) po obvodu. */
  lengthM: number;
}

/** Kratší kus dílu u brány (m) se nepočítá – po zboření by z něj zbyl jen pahýl. */
export const PIECE_MIN_M = 0.05;

/**
 * Kusy dílů, ze kterých se skládá úsek s dílem brány `gateSegment` na začátku (obvod bez brány
 * null) – přesně hradba mezi okraji bran, jak ji zvýrazňuje scéna (`fortSectionSpans`): celé díly
 * mezi dílem s branou na začátku a dílem s branou na konci a z těch dvou dílů jen kus od okraje
 * brány do úseku. S jedinou branou má její díl kus před bránou i za ní. V pořadí po obvodu od
 * začátku úseku.
 */
export function sectionPieces(
  lengths: readonly number[],
  gates: readonly Pick<FortGate, 'segment' | 'offsetM'>[],
  gateSegment: number | null,
): SectionPiece[] {
  const span = fortSectionSpans(lengths, gates).find((x) => x.gateSegment === gateSegment);
  if (!span || span.lengthM <= EPSILON_M) return [];
  const { starts, total } = fortPerimeter(lengths);
  const whole = span.lengthM >= total - EPSILON_M;
  const found: { at: number; piece: SectionPiece }[] = [];
  for (let i = 0; i < lengths.length; i++) {
    const start = starts[i]!;
    const length = lengths[i]!;
    // úsek smí přejít přes konec obvodu – druhý průchod posunutý o délku obvodu
    for (const shift of [0, -total]) {
      const a = Math.max(start, span.fromM + shift) - start;
      const b = Math.min(start + length, span.fromM + shift + span.lengthM) - start;
      if (b - a <= EPSILON_M) continue;
      const at = alongFrom(span.fromM, start + a, total);
      const gate = gates.find((g) => g.segment === i);
      if (whole || !gate || (a <= EPSILON_M && b >= length - EPSILON_M)) {
        found.push({ at, piece: { index: i, lengthM: b - a } });
      } else if (b - a >= PIECE_MIN_M) {
        const part = b <= gate.offsetM + EPSILON_M ? 'before' : 'after';
        found.push({ at, piece: { index: i, part, lengthM: b - a } });
      }
    }
  }
  return found.sort((p, q) => p.at - q.at).map((x) => x.piece);
}
