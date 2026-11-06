import { FORTIFICATIONS } from '../rules-fortifications';
import { squareCorners, type GridGeometry } from '../square-grid';
import type { FortKind, RoadPoint } from '../types';
import { distanceTo, type FortGate } from './gates';
import { segmentState } from './life';
import { fortificationArea, fortificationOutline, type FortArea } from './outline';
import { fortSegments } from './segments';
import type { Fortification, FortSegment } from './types';
import { insideQuad } from './walls';

// Obrana opevnění (fortifications.md – Obrana): násobek síly obránců podle stavu úseku, jeho
// kombinace se „zná místo“ a mezery v obvodu. Čistá doména pro válku – žádná simulace.

/** Co funkce obrany potřebují znát z úseku (`FortSegment` ze stavu vsi). */
type SegmentLike = Pick<FortSegment, 'kind' | 'builtDay' | 'topBuiltDay' | 'breachedDay'>;
type FortLike = Pick<Fortification, 'kind' | 'top' | 'rampartHeight'>;

/** Druh, který na úseku stojí. */
function kindOf(fort: Pick<Fortification, 'kind'>, seg: Pick<FortSegment, 'kind'>): FortKind {
  return seg.kind ?? fort.kind;
}

/** Úsek, kterým se prochází bez prolamování: nedostavěný, prolomený nebo plot/palisáda shnilé na nulu. */
export function segmentIsGap(fort: FortLike, seg: SegmentLike, day: number): boolean {
  if (seg.builtDay === null || seg.breachedDay !== undefined) return true;
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
  if (!fort.top || !topBuilt) return v;
  const topState = segmentState(fort, seg, day);
  return v * (1 + (topMultiplier(fort.top) / FORTIFICATIONS.multiplier.rampart - 1) * topState);
}

/** Mezera v obvodu: otevřená brána, nedostavěný / shnilý úsek nebo průlom. */
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
 * `closedGates` – indexy úseků), a celé úseky, které nestojí – rozestavěné či shnilé (`gap`)
 * a prolomené (`breach`, šířka průlomu 4 m).
 */
export function fortGaps(
  geo: GridGeometry,
  fort: Fortification,
  day: number,
  closedGates: ReadonlySet<number> = new Set(),
): Gap[] {
  const area = fortificationArea(fort.cells, fort.grid, geo);
  if ('error' in area) return [];
  const shapes = fortSegments(fortificationOutline(area, fort.kind));
  const gaps: Gap[] = [];
  for (const seg of fort.segments) {
    const shape = shapes[seg.index];
    if (!shape) continue;
    if (segmentIsGap(fort, seg, day)) {
      const half = shape.line.length / 2;
      const breached = seg.breachedDay !== undefined;
      gaps.push({
        kind: breached ? 'breach' : 'gap',
        segment: seg.index,
        x: shape.line.x + shape.line.dx * half,
        z: shape.line.z + shape.line.dz * half,
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

/** Leží bod uvnitř plochy opevnění (čtverce po zaplnění děr)? */
function insideArea(geo: GridGeometry, area: FortArea, p: RoadPoint): boolean {
  const grid = area.grid ?? undefined;
  return area.cells.some((cell) => insideQuad(squareCorners(geo, grid, cell), p.x, p.z));
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
    const area = fortificationArea(fort.cells, fort.grid, geo);
    if ('error' in area || !insideArea(geo, area, defender)) continue;
    const outline = fortificationOutline(area, fort.kind);
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
    if (insideArea(geo, area, attacker)) {
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
