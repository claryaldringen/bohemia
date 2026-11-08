import { FORTIFICATIONS } from '../rules-fortifications';
import { pointInPolygon } from '../polygon';
import type { GridGeometry } from '../square-grid';
import type { FortKind, RoadPoint } from '../types';
import { gateChord, type FortGate } from './gates';
import { segmentIsOpen, segmentState } from './life';
import { fortOutlineOf } from './convert';
import { outlinePointAt, type FortOutline } from './outline';
import { fortSegments } from './segments';
import type { Fortification, FortSegment } from './types';

// Obrana opevnění (fortifications.md – Obrana bez násobku): mezery v obvodu a kdo stojí uvnitř.
// Násobek obrany je zrušen (Martin 8. 11. 2026). Čistá doména pro válku – žádná simulace.

/** Co funkce obrany potřebují znát z úseku (`FortSegment` ze stavu vsi). */
type SegmentLike = Pick<
  FortSegment,
  'kind' | 'builtDay' | 'topBuiltDay' | 'breachedDay' | 'demolishedDay' | 'top'
>;
type FortLike = Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>;

/** Druh, který na úseku stojí. */
function kindOf(fort: Pick<Fortification, 'kind'>, seg: Pick<FortSegment, 'kind'>): FortKind {
  return seg.kind ?? fort.kind;
}

/**
 * Úsek, kterým se prochází bez prolamování: nedostavěný, prolomený, zbořený nebo plot/palisáda
 * shnilé na nulu.
 */
export function segmentIsGap(fort: FortLike, seg: SegmentLike, day: number): boolean {
  if (segmentIsOpen(seg)) return true;
  return kindOf(fort, seg) !== 'rampart' && segmentState(fort, seg, day) <= 0;
}

/**
 * Stojí z opevnění ke dni `day` aspoň jeden úsek (ne mezera)? Jen za takovým se dá schovat –
 * rozestavěné opevnění bez jediného hotového úseku je jen čára v plánu.
 */
export function fortHasWall(fort: Fortification, day: number): boolean {
  return fort.segments.some((seg) => !segmentIsGap(fort, seg, day));
}

/** Mezera v obvodu: otevřená brána, nedostavěný / shnilý / zbořený úsek nebo průlom. */
export interface Gap {
  kind: 'gate' | 'gap' | 'breach';
  segment: number;
  /** Střed průchodu ve světě (m). */
  x: number;
  z: number;
  widthM: number;
}

/**
 * Průchody obvodem (Obrana – Mezera): otevřené brány stojících úseků (zavřené jsou v
 * `closedGates` – indexy úseků), a celé úseky, které nestojí – rozestavěné, shnilé či zbořené
 * (`gap`, celou délkou úseku) a prolomené (`breach`, šířka průlomu 4 m).
 */
export function fortGaps(
  geo: GridGeometry,
  fort: Fortification,
  day: number,
  closedGates: ReadonlySet<number> = new Set(),
): Gap[] {
  const outline = fortOutlineOf(geo, fort);
  if (!outline) return [];
  const shapes = fortSegments(outline);
  const gaps: Gap[] = [];
  for (const seg of fort.segments) {
    const shape = shapes[seg.index];
    if (!shape) continue;
    if (segmentIsGap(fort, seg, day)) {
      const breached = seg.breachedDay !== undefined;
      gaps.push({
        kind: breached ? 'breach' : 'gap',
        segment: seg.index,
        x: shape.mid[0],
        z: shape.mid[1],
        widthM: breached ? FORTIFICATIONS.breach.widthM : shape.line.length,
      });
      continue;
    }
    const gate: FortGate | undefined = fort.gates.find((g) => g.segment === seg.index);
    if (gate && (seg.demolishedBeforeGate !== undefined || seg.demolishedAfterGate !== undefined)) {
      // část dílu zbořená se sousedním úsekem je mezera vedle brány
      const chord = gateChord(outline, shape, gate);
      const ends = shape.startM + shape.lengthM;
      const parts: [number, number][] = [];
      if (seg.demolishedBeforeGate !== undefined) parts.push([shape.startM, chord.fromM]);
      if (seg.demolishedAfterGate !== undefined) parts.push([chord.toM, ends]);
      for (const [from, to] of parts) {
        if (to - from <= 0) continue;
        const [x, z] = outlinePointAt(outline, (from + to) / 2);
        gaps.push({ kind: 'gap', segment: seg.index, x, z, widthM: to - from });
      }
    }
    if (gate && !closedGates.has(seg.index)) {
      gaps.push({
        kind: 'gate',
        segment: seg.index,
        x: gate.x,
        z: gate.z,
        widthM: FORTIFICATIONS.gate.widthM,
      });
    }
  }
  return gaps;
}

/** Leží bod uvnitř obvodu opevnění (uvnitř křivky)? */
function insideArea(outline: FortOutline, p: RoadPoint): boolean {
  return pointInPolygon([p.x, p.z], outline.polyline);
}

/**
 * Pro každý bod pořadí opevnění (v `forts`), uvnitř jehož obvodu (křivky) leží; null mimo všechna
 * (fortifications.md – Obrana bez násobku: za opevněním se skupina nevzdá, dokud útočník nestojí
 * uvnitř obvodu). Obvod každého opevnění se spočítá jednou.
 */
export function fortsContaining(
  geo: GridGeometry,
  forts: readonly Fortification[],
  points: readonly RoadPoint[],
): (number | null)[] {
  const outlines = forts.map((fort) => fortOutlineOf(geo, fort));
  return points.map((p) => {
    const i = outlines.findIndex((outline) => outline !== null && insideArea(outline, p));
    return i < 0 ? null : i;
  });
}
