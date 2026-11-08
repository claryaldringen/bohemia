import { FORTIFICATIONS } from '../rules-fortifications';
import { pointInPolygon } from '../polygon';
import type { GridGeometry } from '../square-grid';
import type { FortKind, RoadPoint } from '../types';
import { distanceTo, type FortGate } from './gates';
import { segmentIsOpen, segmentState, segmentTop } from './life';
import { fortOutlineOf } from './convert';
import type { FortOutline } from './outline';
import { fortSegments } from './segments';
import type { Fortification, FortSegment } from './types';

// Obrana opevnění (fortifications.md – Obrana): násobek síly obránců podle stavu úseku, jeho
// kombinace se „zná místo“ a mezery v obvodu. Čistá doména pro válku – žádná simulace.

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

/** Násobek nástavby valu (druh nástavby → násobek celku valu s ní). */
function topMultiplier(top: 'fence' | 'palisade'): number {
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
  const kind = kindOf(fort, seg);
  if (kind !== 'rampart') {
    return 1 + (FORTIFICATIONS.multiplier[kind] - 1) * segmentState(fort, seg, day);
  }
  const v = 1 + FORTIFICATIONS.rampartHeightBonus * (fort.rampartHeight ?? 1);
  const topBuilt = seg.topBuiltDay !== undefined && seg.topBuiltDay !== null;
  const top = segmentTop(fort, seg);
  if (!top || !topBuilt) return v;
  const topState = segmentState(fort, seg, day);
  return v * (1 + (topMultiplier(top) / FORTIFICATIONS.multiplier.rampart - 1) * topState);
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
