import { heightAtWorld, SURFACE_CODES, type Landscape } from '../../landscape';
import { gatePartView, GATE_PARTS, gonePartDay, ownGatePart } from './gate-parts';
import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import { bandLine, segmentBand, spanPieces } from './band';
import { fortOutlineOf } from './convert';
import { gateChord } from './gates';
import { layerBuilt, segmentRampart } from './life';
import type { FortOutline } from './outline';
import { sectionOf } from './sections';
import { fortSegments } from './segments';
import type { FortSegment, FortSegmentWork, Fortification } from './types';

// Vodní příkop (fortifications.md – Hradby a obrana, Druhy; Martin 8. 11. 2026: „Další možnost bude
// napojení příkopu na vodní zdroj. Pak nelze příkopem projít, pokud se nezasype.“). Návrh Clauda:
// příkop dílu valu, jehož osa je do 30 m od vody (potok, řeka, tůň – vodní políčko krajiny), jde
// napustit strouhou; hladina = výška terénu nejbližšího vodního políčka a voda se rozlije do
// souvislých dílů úseku, jejichž dno (terén na ose příkopu − hloubka příkopu) leží pod hladinou.
// Deterministicky z terénu – jen sčítání, násobení a odmocnina.

/** Zdroj vody příkopu dílu: hladina (m terénu krajiny) a vzdálenost vody od osy příkopu (m). */
export interface MoatSource {
  levelM: number;
  distanceM: number;
}

/**
 * Osa příkopu dílu od křivky (m; dovnitř kladně, vně záporně): příkop leží na vnějším okraji pásu
 * valu – u valu na křivce uvnitř, u valu vně hradby (`rampartOutside`) vně.
 */
export function moatAxisOffsetM(
  fort: Pick<Fortification, 'kind' | 'top'>,
  seg: Pick<FortSegment, 'kind' | 'top' | 'builtDay' | 'topBuiltDay' | 'rampartOutside'>,
): number {
  return -segmentBand(fort, seg).outM + FORTIFICATIONS.rampartBand.ditchM / 2;
}

/** Čtverec vzdálenosti bodu (x, z) od lomené čáry `line`. */
function distance2ToLine(line: readonly Point[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k]!;
    const [bx, bz] = line[k + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return best;
}

/**
 * Nejbližší vodní políčko do `moat.reachM` od osy `line` (střed políčka; při shodě menší index
 * políčka) – hladina je výška jeho terénu. Bez vody null.
 */
function sourceNear(landscape: Landscape, line: readonly Point[]): MoatSource | null {
  if (line.length < 2) return null;
  const reach = FORTIFICATIONS.moat.reachM;
  const cell = landscape.cellSizeM;
  const half = (landscape.size * cell) / 2;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of line) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const x0 = Math.max(0, Math.floor((minX - reach + half) / cell));
  const x1 = Math.min(landscape.size - 1, Math.floor((maxX + reach + half) / cell));
  const y0 = Math.max(0, Math.floor((minZ - reach + half) / cell));
  const y1 = Math.min(landscape.size - 1, Math.floor((maxZ + reach + half) / cell));
  let best = reach * reach;
  let tile = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * landscape.size + x;
      if (landscape.surface[i] !== SURFACE_CODES.water) continue;
      const d = distance2ToLine(line, -half + (x + 0.5) * cell, -half + (y + 0.5) * cell);
      if (d < best || (d === best && tile < 0)) {
        best = d;
        tile = i;
      }
    }
  }
  if (tile < 0) return null;
  return { levelM: landscape.heights[tile]!, distanceM: Math.sqrt(best) };
}

/** Dno příkopu na ose `line` (m): nejvyšší terén osy − hloubka příkopu. */
function bottomOf(landscape: Landscape, line: readonly Point[]): number {
  let top = -Infinity;
  for (const [x, z] of line) top = Math.max(top, heightAtWorld(landscape, x, z));
  return top - FORTIFICATIONS.rampartBand.ditchDepthM;
}

/** Osa příkopu dílu `seg` na obvodu `outline`; díl bez valu prázdná. */
function moatLine(outline: FortOutline, fort: Fortification, seg: FortSegment): Point[] {
  if (segmentRampart(fort, seg) === null) return [];
  return bandLine(outline, seg.index, moatAxisOffsetM(fort, seg));
}

/**
 * Zdroj vody příkopu dílu `segment` (fortifications.md – Hradby a obrana, Druhy): nejbližší vodní
 * políčko do 30 m od osy příkopu (`moat.reachM`), hladina = výška jeho terénu. Díl bez valu, bez
 * obvodu nebo bez vody null.
 */
export function moatSource(
  landscape: Landscape,
  fort: Fortification,
  segment: number,
): MoatSource | null {
  const outline = fortOutlineOf(landscape, fort);
  const seg = fort.segments.find((s) => s.index === segment);
  if (!outline || !seg) return null;
  return sourceNear(landscape, moatLine(outline, fort, seg));
}

/** Díl s hotovým nezbořeným valem – jeho příkop jde napustit. */
function hasDitch(fort: Fortification, seg: FortSegment): boolean {
  return seg.demolishedDay === undefined && layerBuilt(segmentRampart(fort, seg));
}

/**
 * Díly úseku s dílem `segment`, do kterých se voda rozlije (fortifications.md – Hradby a obrana,
 * Druhy): díly úseku od brány po bránu (i díl s branou na konci – brána má hráz či most) s hotovým
 * valem. Zdrojem je díl nejblíž vodě, jehož dno leží pod hladinou (při shodě první v úseku); voda
 * zaplní souvislé díly kolem něj s dnem pod hladinou. Bez takového dílu prázdné. Seřazené podle
 * pořadí v úseku.
 */
export function moatSegments(landscape: Landscape, fort: Fortification, segment: number): number[] {
  const outline = fortOutlineOf(landscape, fort);
  const section = sectionOf(fort, segment);
  if (!outline || !section) return [];
  const n = fort.segments.length;
  const order = [...section.segments];
  if (section.gateSegment !== null) {
    const end = (order[order.length - 1]! + 1) % n;
    if (!order.includes(end)) order.push(end);
  }
  const info = new Map<number, { bottom: number; source: MoatSource | null }>();
  for (const index of order) {
    const seg = fort.segments.find((s) => s.index === index);
    if (!seg || !hasDitch(fort, seg)) continue;
    const line = moatLine(outline, fort, seg);
    if (line.length < 2) continue;
    info.set(index, { bottom: bottomOf(landscape, line), source: sourceNear(landscape, line) });
  }
  let start = -1;
  let level = 0;
  let nearest = Infinity;
  for (const index of order) {
    const d = info.get(index);
    if (!d?.source || !(d.bottom < d.source.levelM)) continue;
    if (d.source.distanceM < nearest) {
      nearest = d.source.distanceM;
      start = index;
      level = d.source.levelM;
    }
  }
  if (start < 0) return [];
  const wet = new Set<number>([start]);
  const flows = (i: number): boolean => {
    const d = info.get(i);
    return d !== undefined && !wet.has(i) && d.bottom < level;
  };
  for (const step of [1, n - 1]) {
    let i = (start + step) % n;
    while (flows(i)) {
      wet.add(i);
      i = (i + step) % n;
    }
  }
  return order.filter((i) => wet.has(i));
}

/**
 * Pás příkopu s vodou (fortifications.md – Hradby a obrana, Druhy): příkop 4 m na vnějším okraji
 * pásu valu u dílů s napuštěným příkopem (`moatDay`) a hotovým nezbořeným valem – bez kusu pod
 * tětivou brány (hráz či most) a bez zbořených částí dílu s branou. Zamrznutí v zimě řeší volající
 * (`moatFrozen`). Kusy jako `spanPieces`.
 */
export function moatDitchPieces(geo: GridGeometry, fort: Fortification): Point[][] {
  if (!fort.segments.some((s) => s.moatDay !== undefined)) return [];
  const outline = fortOutlineOf(geo, fort);
  if (!outline) return [];
  const shapes = fortSegments(outline);
  const pieces: Point[][] = [];
  for (const seg of fort.segments) {
    if (seg.moatDay === undefined || !hasDitch(fort, seg)) continue;
    const outer = -segmentBand(fort, seg).outM;
    const inner = outer + FORTIFICATIONS.rampartBand.ditchM;
    const gate = fort.gates.find((g) => g.segment === seg.index);
    const shape = shapes[seg.index];
    if (!gate || !shape) {
      for (const p of spanPieces(outline, outer, inner, seg.index)) pieces.push(p.corners);
      continue;
    }
    const chord = gateChord(outline, shape, gate);
    if (seg.demolishedBeforeGate === undefined) {
      for (const p of spanPieces(outline, outer, inner, seg.index, -Infinity, chord.fromM)) {
        pieces.push(p.corners);
      }
    }
    if (seg.demolishedAfterGate === undefined) {
      for (const p of spanPieces(outline, outer, inner, seg.index, chord.toM, Infinity)) {
        pieces.push(p.corners);
      }
    }
  }
  return pieces;
}

/**
 * Konec napuštění příkopu (mutuje opevnění): díly stavby s hotovým nezbořeným valem dostanou den
 * napuštění `day`.
 */
export function finishMoatFill(
  fort: Fortification,
  c: { readonly fortSegments?: readonly Pick<FortSegmentWork, 'index'>[] },
  day: number,
): void {
  for (const w of c.fortSegments ?? []) {
    const seg = fort.segments.find((s) => s.index === w.index);
    if (!seg || seg.demolishedDay !== undefined) continue;
    if (layerBuilt(segmentRampart(fort, seg))) seg.moatDay ??= day;
    // kus dílu s branou s vlastním valem (hradba je hradba, brána je brána)
    for (const part of GATE_PARTS) {
      const own = ownGatePart(seg, part);
      if (!own || gonePartDay(seg, part) !== undefined) continue;
      if (layerBuilt(segmentRampart(fort, gatePartView(seg, part)))) own.moatDay ??= day;
    }
  }
}
