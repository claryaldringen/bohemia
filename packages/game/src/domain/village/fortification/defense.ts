import { FORTIFICATIONS } from '../rules-fortifications';
import { pointInPolygon } from '../polygon';
import type { GridGeometry } from '../square-grid';
import type { RoadPoint, WallKind } from '../types';
import { distanceTo, gateChord, type FortGate } from './gates';
import { layerBuilt, segmentIsOpen, segmentRampart, segmentState, segmentWall } from './life';
import { fortOutlineOf } from './convert';
import { outlinePointAt, type FortOutline } from './outline';
import { fortSegments } from './segments';
import type { Fortification, FortSegment } from './types';

// Obrana opevnění (fortifications.md – Obrana): násobek síly obránců podle stavu úseku, jeho
// kombinace se „zná místo“ a mezery v obvodu. Čistá doména pro válku – žádná simulace.

/** Co funkce obrany potřebují znát z úseku (`FortSegment` ze stavu vsi). */
type SegmentLike = Pick<
  FortSegment,
  | 'kind'
  | 'builtDay'
  | 'topBuiltDay'
  | 'breachedDay'
  | 'demolishedDay'
  | 'top'
  | 'rampartHeight'
  | 'rampartOutside'
  | 'moatDay'
>;
type FortLike = Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>;

/**
 * Úsek, kterým se prochází bez prolamování: nedostavěný, prolomený, zbořený nebo – bez
 * dostavěného valu – hradba shnilá na nulu.
 */
export function segmentIsGap(fort: FortLike, seg: SegmentLike, day: number): boolean {
  if (segmentIsOpen(seg)) return true;
  return !layerBuilt(segmentRampart(fort, seg)) && segmentState(fort, seg, day) <= 0;
}

/** Násobek hradby bez valu – nové stupně zatím jako palisáda (násobek ruší další úloha). */
function wallMultiplier(kind: WallKind): number {
  return kind === 'fence' ? FORTIFICATIONS.multiplier.fence : FORTIFICATIONS.multiplier.palisade;
}

/** Násobek hradby na valu (druh hradby → násobek celku valu s ní; nové stupně jako palisáda). */
function topMultiplier(top: WallKind): number {
  return top === 'fence'
    ? FORTIFICATIONS.multiplier.rampartFence
    : FORTIFICATIONS.multiplier.rampartPalisade;
}

/**
 * Násobek opevnění úseku ke dni `day` (Obrana – Násobek podle stavu): plot a palisáda
 * `1 + (m − 1) × stav`; val `v × (1 + (m ÷ 1,5 − 1) × stav nástavby)`, `v = 1 + 0,5 × výška` (m =
 * násobek valu s nástavbou, bez ní jen `v`). Mezera má 1. Bez „zná místo“ × 1,5 – to přidává
 * `defenderMultiplier`.
 */
export function segmentMultiplier(fort: FortLike, seg: SegmentLike, day: number): number {
  if (segmentIsGap(fort, seg, day)) return 1;
  const wall = segmentWall(fort, seg);
  const rampart = segmentRampart(fort, seg);
  if (rampart === null || rampart.builtDay === null) {
    // hradba bez valu (i na valu, který se teprve staví)
    return wall ? 1 + (wallMultiplier(wall.kind) - 1) * segmentState(fort, seg, day) : 1;
  }
  const v = 1 + FORTIFICATIONS.rampartHeightBonus * rampart.height;
  if (!wall || wall.builtDay === null) return v;
  const topState = segmentState(fort, seg, day);
  return v * (1 + (topMultiplier(wall.kind) / FORTIFICATIONS.multiplier.rampart - 1) * topState);
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
 * Násobek obránce vůči útočníkovi (Obrana – Jak násobek působí). Obránce uvnitř obvodu proti
 * útočníkovi vně, v bráně / průlomu nebo na pásu (zdolává ho) má `1,5 × násobek` nejbližšího
 * úseku; mezeru nahradí slabší z jejích sousedů. Útočník dál uvnitř než šířka pásu (už je
 * uvnitř) a obránce mimo všechna opevnění mají jen 1,5 (u domu).
 */
export function defenderMultiplier(
  geo: GridGeometry,
  forts: readonly Fortification[],
  defender: RoadPoint,
  attacker: RoadPoint,
  day: number,
): number {
  const home = FORTIFICATIONS.defenderKnowsPlace;
  for (const fort of forts) {
    const outline = fortOutlineOf(geo, fort);
    if (!outline || !insideArea(outline, defender)) continue;
    const shapes = fortSegments(outline);
    const nearest = (p: RoadPoint): number => {
      let best = 0;
      let bestD = Infinity;
      for (const shape of shapes) {
        const d = distanceTo(shape, p.x, p.z);
        if (d < bestD) {
          bestD = d;
          best = shape.index;
        }
      }
      return best;
    };
    if (insideArea(outline, attacker)) {
      // útočník v ploše: za pásem už mu opevnění nepřekáží
      const shape = shapes[nearest(attacker)];
      if (shape && distanceTo(shape, attacker.x, attacker.z) > outline.bandM) return home;
    }
    const n = fort.segments.length;
    const mult = (index: number): number => {
      const seg = fort.segments.find((s) => s.index === index);
      return seg ? segmentMultiplier(fort, seg, day) : 1;
    };
    const near = nearest(defender);
    const nearSeg = fort.segments.find((s) => s.index === near);
    let m = mult(near);
    if (nearSeg && segmentIsGap(fort, nearSeg, day)) {
      m = Math.min(mult((near + n - 1) % n), mult((near + 1) % n));
    }
    return home * m;
  }
  return home;
}
