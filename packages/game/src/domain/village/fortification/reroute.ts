import type { Point } from '../placement/polygon';
import { FORTIFICATIONS } from '../rules/rules-fortifications';
import type { GridGeometry } from '../placement/square-grid';
import { fortOutlineOf } from './convert';
import { selfCrossing } from './curve';
import { gatePartView } from './gate-parts';
import { gateAt, type FortGate } from './gates';
import { segmentBuilt, segmentWall } from './life';
import { fortificationOutline, outlinePointAt, type FortOutline } from './outline';
import {
  alongFrom,
  FORT_GATE_HALF_M,
  fortPerimeter,
  fortSectionSpans,
  gateCenterM,
  loopDistanceM,
  sectionPieces,
} from './section-spans';
import type { FortSection } from './sections';
import { fortSegments, nearestOnPath, type FortSegmentShape } from './segments';
import type { WallKind } from '../types';
import type { FortSegment, Fortification } from './types';

// Nový úsek od brány k bráně – i jinudy (demolition.md – Rozhodnutí; Martin 8. 11. 2026: „Můžu
// postavit jen část té zdi od brány k bráně. Hráč bude bourat, pokud zjistí, že potřebuje vést
// část hradby jinudy.“). Zbořený úsek mezi dvěma branami dostane novou trasu z bodů hráče: body
// obvodu mezi okraji bran se nahradí, brány drží konce (jejich okraje a střed jsou body nové
// křivky). Obvod se přepočítá a díly se rozdělí znovu – díl s branou převezme stav dílu, ve kterém
// brána ležela, díly nového úseku jsou mezera ke stavbě a ostatní díly převezmou stav starého dílu
// mimo úsek, na kterém leží jejich střed (jako převod po čtvercích – `convert.ts`; návrh Clauda).
// Čistá deterministická doména – stav vsi nemění.

/** Úsek ještě stojí – jinudy jde jen úsek celý zbořený. */
export const FORT_SECTION_STANDS = 'Úsek ještě stojí – napřed ho zbořte.';
/** Obvod bez brány nemá úsek od brány k bráně. */
const FORT_REROUTE_GATELESS = 'Jinudy jde postavit jen úsek mezi branami.';
/** Nová trasa kříží zbytek obvodu (nebo sama sebe). */
export const FORT_REROUTE_CROSSING = 'Nový úsek nesmí křížit obvod.';
/** Nová trasa obešla opevnění – vnitřek by byl venku. */
const FORT_REROUTE_AROUND = 'Nový úsek nesmí obejít opevnění.';
/** Plocha opevnění s novým úsekem pod nejmenší plochou. */
const FORT_REROUTE_SMALL = `Opevnění chce plochu aspoň ${FORTIFICATIONS.outline.minAreaM2} m².`;
/** Dvě brány by po novém dělení obvodu padly do jednoho dílu. */
const FORT_REROUTE_GATES = 'Brány by se sešly v jednom dílu – veďte úsek delší.';

/** Tolerance poloh na obvodu (m). */
const EPSILON_M = 1e-6;

/** Opevnění s novým úsekem a díl brány, kterou nový úsek začíná (`fortSections`). */
export interface FortReroute {
  fort: Fortification;
  gateSegment: number;
}

/** Poloha bodu `p` na obvodu (m od začátku) – nejbližší bod uzavřené lomené čáry. */
function stationOf(outline: FortOutline, p: Point): number {
  const closed = [...outline.polyline, outline.polyline[0]!];
  const along = nearestOnPath(closed, p[0], p[1]).along;
  return along >= outline.lengthM - EPSILON_M ? 0 : along;
}

/** Díl, ve kterém leží bod `s` obvodu (poslední díl se začátkem do `s`). */
function shapeAt(shapes: readonly FortSegmentShape[], s: number): FortSegmentShape {
  let found = shapes[0]!;
  for (const shape of shapes) if (shape.startM <= s + EPSILON_M) found = shape;
  return found;
}

/** Stojí kus dílu (celý díl, nebo jeho kus u brány s vlastními vrstvami – `gatePartView`)? */
function pieceStands(seg: FortSegment, part: 'before' | 'after' | undefined): boolean {
  const view = part === undefined ? seg : gatePartView(seg, part);
  return segmentBuilt(view) && view.demolishedDay === undefined;
}

/** Díl bez brány z dílu `seg` – kusy u brány pryč (díl má vrstvy kusu `part`, je-li dán). */
function withoutGate(seg: FortSegment, part: 'before' | 'after' | undefined): FortSegment {
  const copy = part === undefined ? { ...seg } : gatePartView(seg, part);
  delete copy.demolishedBeforeGate;
  delete copy.demolishedAfterGate;
  delete copy.beforeGate;
  delete copy.afterGate;
  return copy;
}

/**
 * Úsek `section` opevnění `fort` povede přes body `points` (v pořadí od brány na začátku úseku po
 * bránu na jeho konci, bez konců – ty drží brány). Jen úsek, ve kterém nic nestojí (zbořený či
 * nedostavěný – `FORT_SECTION_STANDS`). Body obvodu mimo úsek zůstanou, k nim přibudou okraje
 * a střed obou bran (brána zůstane na místě), mezi okraji body hráče. Nový obvod se nesmí křížit
 * ani obejít opevnění a musí mít plochu; díly nového úseku jsou mezera (`demolishedDay` = `day`),
 * kusy dílů s branou do úseku taky. Ohyb a pás nového úseku kontroluje volající
 * (`checkFortificationPlacement`). Vstup nemění.
 */
export function rerouteFortification(
  fort: Fortification,
  geo: GridGeometry,
  section: FortSection,
  points: readonly Point[],
  day: number,
): FortReroute | { reason: string } {
  if (section.gateSegment === null) return { reason: FORT_REROUTE_GATELESS };
  const old = fortOutlineOf(geo, fort, fort.kind);
  if (!old) return { reason: FORT_REROUTE_GATELESS };
  const oldShapes = fortSegments(old);
  const oldLengths = oldShapes.map((s) => s.lengthM);
  const perimeter = fortPerimeter(oldLengths);
  const total = perimeter.total;
  const span = fortSectionSpans(oldLengths, fort.gates).find(
    (x) => x.gateSegment === section.gateSegment,
  );
  const gateA = fort.gates.find((g) => g.segment === section.gateSegment);
  if (!span || !gateA) return { reason: FORT_REROUTE_GATELESS };
  // jinudy jen úsek, ve kterém nic nestojí
  for (const piece of sectionPieces(oldLengths, fort.gates, section.gateSegment)) {
    const seg = fort.segments.find((s) => s.index === piece.index);
    if (seg && pieceStands(seg, piece.part)) return { reason: FORT_SECTION_STANDS };
  }
  // brána na konci úseku – střed o půl brány za koncem úseku
  const endM = span.fromM + span.lengthM;
  const endCenter = endM + FORT_GATE_HALF_M;
  let gateB = gateA;
  let best = Infinity;
  for (const g of fort.gates) {
    const d = loopDistanceM(gateCenterM(perimeter, g), endCenter, total);
    if (d < best - EPSILON_M) {
      best = d;
      gateB = g;
    }
  }
  // body nové křivky po obvodu od konce úseku (poloha `at`), za ně body hráče
  const half = FORT_GATE_HALF_M;
  const rest = total - span.lengthM;
  const centerA = gateCenterM(perimeter, gateA);
  const centerB = gateCenterM(perimeter, gateB);
  const pin = (at: number, s: number): { at: number; p: Point } => ({
    at,
    p: outlinePointAt(old, s),
  });
  const kept: { at: number; p: Point }[] =
    gateA === gateB
      ? [pin(0, endM), pin(half, centerB), pin(rest, span.fromM)]
      : [
          pin(0, endM),
          pin(half, centerB),
          pin(2 * half, centerB + half),
          pin(rest - 2 * half, centerA - half),
          pin(rest - half, centerA),
          pin(rest, span.fromM),
        ];
  for (const p of old.points) {
    const at = alongFrom(endM, stationOf(old, p), total);
    if (at > EPSILON_M && at < rest - EPSILON_M) kept.push({ at, p });
  }
  kept.sort((a, b) => a.at - b.at);
  const route: Point[] = [...kept.map((k) => k.p), ...points.map((p): Point => [p[0], p[1]])];
  const outline = fortificationOutline(route, fort.kind);
  if (!outline || selfCrossing(outline.polyline)) return { reason: FORT_REROUTE_CROSSING };
  // od okraje brány na začátku po směru hodin napřed nový úsek, pak brána – jinak obešel opevnění
  const edgeA = stationOf(outline, outlinePointAt(old, span.fromM));
  const edgeB = stationOf(outline, outlinePointAt(old, endM));
  const pinA = stationOf(outline, outlinePointAt(old, centerA));
  const lengthM = outline.lengthM;
  if (alongFrom(edgeA, edgeB, lengthM) >= alongFrom(edgeA, pinA, lengthM)) {
    return { reason: FORT_REROUTE_AROUND };
  }
  if (outline.areaM2 < FORTIFICATIONS.outline.minAreaM2) return { reason: FORT_REROUTE_SMALL };
  const shapes = fortSegments(outline);
  // brány podle polohy – díl, ve kterém leží střed brány na nové křivce
  const moved = fort.gates.map((g) => {
    const s = stationOf(outline, [g.x, g.z]);
    const shape = shapeAt(shapes, s);
    const at = gateAt(outline, shape, s - shape.startM);
    return { from: g, gate: { ...g, segment: at.segment, offsetM: at.offsetM, x: at.x, z: at.z } };
  });
  const gateOf = new Map<number, FortGate>();
  for (const m of moved) {
    if (gateOf.has(m.gate.segment)) return { reason: FORT_REROUTE_GATES };
    gateOf.set(m.gate.segment, m.from);
  }
  const segA = moved.find((m) => m.from === gateA)!.gate.segment;
  const segB = moved.find((m) => m.from === gateB)!.gate.segment;
  const n = shapes.length;
  // díly nového úseku – mezi díly obou bran (s jedinou branou celý obvod kromě ní)
  const inner = new Set<number>();
  for (let k = (segA + 1) % n; k !== segB; k = (k + 1) % n) inner.add(k);
  // díly starého úseku (bez dílů s branou) svůj stav nepředají
  const oldInner = new Set(section.segments.filter((i) => i !== section.gateSegment));
  const oldSeg = (index: number): FortSegment | undefined =>
    fort.segments.find((s) => s.index === index);
  const segments = shapes.map((shape): FortSegment => {
    const gate = gateOf.get(shape.index);
    const from = gate ? oldSeg(gate.segment) : undefined;
    if (gate && from) return { ...from, index: shape.index };
    if (inner.has(shape.index)) {
      return { index: shape.index, builtDay: null, state: 0, demolishedDay: day };
    }
    let nearest: FortSegment | undefined;
    let along = 0;
    let distance = Infinity;
    for (const s of oldShapes) {
      if (oldInner.has(s.index)) continue;
      const hit = nearestOnPath(s.path, shape.mid[0], shape.mid[1]);
      if (hit.distance < distance - EPSILON_M) {
        distance = hit.distance;
        along = hit.along;
        nearest = oldSeg(s.index);
      }
    }
    if (!nearest) return { index: shape.index, builtDay: null, state: 0, demolishedDay: day };
    // střed na starém dílu s branou – hradba kusu na té straně brány, kde střed leží
    const near = fort.gates.find((g) => g.segment === nearest.index);
    const part = near ? (along < near.offsetM ? 'before' : 'after') : undefined;
    return { ...withoutGate(nearest, part), index: shape.index };
  });
  const gates = moved.map((m) => m.gate).sort((a, b) => a.segment - b.segment);
  // kusy dílů s branou do nového úseku jsou mezera, kratší kus (pahýl) se nepočítá
  const pieces = sectionPieces(
    shapes.map((s) => s.lengthM),
    gates,
    segA,
  );
  const startPiece = pieces.some((p) => p.index === segA && p.part === 'after');
  const endPiece = pieces.some((p) => p.index === segB && p.part === 'before');
  // vlastní vrstvy kusu do úseku patřily staré trase – kus se postaví znovu
  const first = segments[segA]!;
  delete first.afterGate;
  if (startPiece) first.demolishedAfterGate ??= day;
  else delete first.demolishedAfterGate;
  const last = segments[segB]!;
  delete last.beforeGate;
  if (endPiece) last.demolishedBeforeGate ??= day;
  else delete last.demolishedBeforeGate;
  const next: Fortification = {
    ...fort,
    points: outline.points.map((p): Point => [p[0], p[1]]),
    segments,
    gates,
  };
  delete next.grid;
  delete next.cells;
  return { fort: next, gateSegment: segA };
}

/**
 * Návrh trasy úseku `section` pro editor (konce pevně v branách): okraj brány na začátku úseku,
 * body obvodu uvnitř úseku v pořadí po obvodu (bez nich střed úseku – hráč má co táhnout) a okraj
 * brány na konci. Obvod bez brány null.
 */
export function rerouteProposal(
  fort: Fortification,
  geo: GridGeometry,
  section: FortSection,
): Point[] | null {
  if (section.gateSegment === null) return null;
  const old = fortOutlineOf(geo, fort, fort.kind);
  if (!old) return null;
  const lengths = fortSegments(old).map((s) => s.lengthM);
  const span = fortSectionSpans(lengths, fort.gates).find(
    (x) => x.gateSegment === section.gateSegment,
  );
  if (!span) return null;
  const total = old.lengthM;
  const inside = old.points
    .map((p) => ({ at: alongFrom(span.fromM, stationOf(old, p), total), p }))
    .filter((x) => x.at > EPSILON_M && x.at < span.lengthM - EPSILON_M)
    .sort((a, b) => a.at - b.at)
    .map((x): Point => [x.p[0], x.p[1]]);
  const middle = outlinePointAt(old, span.fromM + span.lengthM / 2);
  return [
    outlinePointAt(old, span.fromM),
    ...(inside.length > 0 ? inside : [middle]),
    outlinePointAt(old, span.fromM + span.lengthM),
  ];
}

/**
 * Hradba nového úseku jinudy (návrh Clauda): druh hradby na dílu brány, kterou úsek začíná – nový
 * úsek naváže na sousední hradbu; palisáda s ochozem a holý val dají palisádu (ochoz jen
 * vylepšením palisády, val se doplní potom).
 */
export function rerouteTarget(
  fort: Pick<Fortification, 'kind' | 'top' | 'segments'>,
  gateSegment: number,
): WallKind {
  const seg = fort.segments.find((s) => s.index === gateSegment);
  const wall = seg ? segmentWall(fort, seg)?.kind : undefined;
  return wall === undefined || wall === 'walkway' ? 'palisade' : wall;
}
