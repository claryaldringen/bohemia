import type { Landscape, ObstacleLayer } from '../../../landscape';
import { circlePoints, fortOutlineOf, hullOffsetPoints, type FortShapeSource } from '..';
import {
  checkFortificationPlacement,
  type FortPlacementCheck,
} from '../../placement/placement-fortifications';
import type { PlacementVillage } from '../../placement/placement-types';
import { placementVillageOf } from '../../placement/placement-village';
import { pointInPolygon, type Point } from '../../placement/polygon';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import {
  rotatedSquareCorners,
  squareCorners,
  type GridGeometry,
} from '../../placement/square-grid';
import { threshingFloorFootprint } from '../../fields/threshing-floors';
import type { FortKind, Position, RoadPoint, VillageState } from '../../types';

// Návrh obvodu opevnění (fortifications.md – Obvod, Správce – Obvod správce): jádro vsi = obrysy
// obydlí s pozemky (i dvorce a dílny), hum, obilných jam a ohrad; pole a sady zůstanou venku.
// Návrh = vypouklý obal jádra odsunutý o šířku pásu + 3 m (`hullOffsetPoints`); neprojde-li
// kontrolou, odstup roste po 1 m. Druhé opevnění obejme jen stavby jádra mimo jiná opevnění,
// bez nich kruh 20 m u kurzoru. Správce stejně, ale útočiště musí pojmout lidi a dobytek + 20 %.

/** Strana čtverce kolem domu bez pozemku a kolem obilné jámy (m) – přibližný obrys. */
const HOUSE_SQUARE_M = 10;
const PIT_SQUARE_M = 2;

/** Návrh obvodu – body a jejich kontrola (neprošlá s důvodem a místem problému). */
export interface FortProposal {
  points: Point[];
  check: FortPlacementCheck;
  /** Odstup od jádra (m); kruh bez jádra – poloměr. */
  offsetM: number;
}

/**
 * Stavby jádra vsi – stav vsi i ves pro kontrolu umístění v prohlížeči (`PlacementVillage`
 * s obilnými jamami ze scény) mají tytéž údaje.
 */
export interface FortCoreSource {
  readonly dwellings: PlacementVillage['dwellings'];
  readonly threshingFloors?: readonly { readonly position: Position }[];
  readonly grainPits?: readonly { readonly x: number; readonly z: number }[];
  readonly pens?: PlacementVillage['pens'];
  readonly fortifications?: readonly FortShapeSource[];
}

/** Obrysy staveb jádra vsi ve světě – v pevném pořadí stavu vsi. */
export function fortificationCore(state: FortCoreSource, geo: GridGeometry): Point[][] {
  const out: Point[][] = [];
  for (const d of state.dwellings) {
    if (d.plot?.square) {
      const sq = d.plot.square;
      out.push(rotatedSquareCorners(sq.x, sq.z, geo.cellSizeM, sq.rotation));
    } else if (d.plot) {
      out.push(squareCorners(geo, undefined, d.plot.cell));
    } else {
      out.push(
        rotatedSquareCorners(d.position.x, d.position.z, HOUSE_SQUARE_M, d.position.rotation ?? 0),
      );
    }
  }
  for (const f of state.threshingFloors ?? []) out.push(threshingFloorFootprint(f.position));
  for (const p of state.grainPits ?? []) out.push(rotatedSquareCorners(p.x, p.z, PIT_SQUARE_M, 0));
  for (const pen of state.pens ?? []) {
    out.push(squareCorners(geo, pen.grid, pen.cell));
    for (const s of pen.extraSquares ?? []) out.push(squareCorners(geo, pen.grid, s.cell));
  }
  return out;
}

/** Těžiště rohů mnohoúhelníku. */
function centroid(polygon: readonly Point[]): Point {
  let x = 0;
  let z = 0;
  for (const p of polygon) {
    x += p[0];
    z += p[1];
  }
  return [x / polygon.length, z / polygon.length];
}

/** Jádro bez staveb, které už leží uvnitř stojícího opevnění vsi. */
function freeCore(state: FortCoreSource, geo: GridGeometry): Point[][] {
  const lines = (state.fortifications ?? []).flatMap((f) => {
    const outline = fortOutlineOf(geo, f);
    return outline ? [outline.polyline] : [];
  });
  return fortificationCore(state, geo).filter((polygon) => {
    const c = centroid(polygon);
    return !lines.some((line) => pointInPolygon(c, line));
  });
}

/** Výchozí odstup návrhu od jádra – šířka pásu + 3 m. */
function baseOffset(kind: FortKind): number {
  return FORTIFICATIONS.bandM[kind] + FORTIFICATIONS.proposal.clearanceM;
}

/**
 * Návrh obvodu druhu `kind` pro hráče (fortifications.md – Obvod): kolem staveb jádra mimo jiná
 * opevnění; neprojde-li kontrolou, odstup po 1 m víc (nejvýš o 20 m) – žádný neprojde, vrátí se
 * návrh s výchozím odstupem a jeho důvodem. Bez jádra kruh 20 m kolem `at` (kurzor). Stav nemění.
 */
export function proposeFortification(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  kind: FortKind,
  at: RoadPoint,
): FortProposal {
  return proposeFortificationIn(landscape, placementVillageOf(state, day), obstacles, kind, at);
}

/**
 * Návrh obvodu nad vsí pro kontrolu umístění (`PlacementVillage` + obilné jámy) – totéž co
 * `proposeFortification`; prohlížeč tak návrh spočte sám ze stejné funkce jako server.
 */
export function proposeFortificationIn(
  landscape: Landscape,
  village: PlacementVillage & Pick<FortCoreSource, 'grainPits'>,
  obstacles: ObstacleLayer,
  kind: FortKind,
  at: RoadPoint,
): FortProposal {
  const core = freeCore(village, landscape);
  const check = (points: Point[]): FortPlacementCheck =>
    checkFortificationPlacement(landscape, village, obstacles, points, kind);
  if (core.length === 0) {
    const r = FORTIFICATIONS.proposal.circleRadiusM;
    const points = circlePoints([at.x, at.z], r);
    return { points, check: check(points), offsetM: r };
  }
  const p = FORTIFICATIONS.proposal;
  let first: FortProposal | null = null;
  for (let extra = 0; extra <= p.maxGrowM; extra += p.growStepM) {
    const offsetM = baseOffset(kind) + extra;
    const points = hullOffsetPoints(core, offsetM);
    const result = { points, check: check(points), offsetM };
    if (result.check.ok) return result;
    first ??= result;
  }
  return first!;
}

/**
 * Obvod správce druhu `kind` (fortifications.md – Správce – Obvod správce): stejný návrh kolem
 * celého jádra, útočiště musí pojmout lidi a dobytek + 20 % (`needM2`), jinak odstup po 5 m víc;
 * návrh musí projít kontrolou. Nejvýš `maxSteps` kroků; nic nevyhoví nebo ves jádro nemá – null.
 */
export function stewardFortificationProposal(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  kind: FortKind,
  needM2: number,
  maxSteps: number,
): { points: Point[]; lengthM: number } | null {
  const core = fortificationCore(state, landscape);
  if (core.length === 0) return null;
  const village = placementVillageOf(state, day);
  for (let step = 0; step <= maxSteps; step++) {
    const points = hullOffsetPoints(
      core,
      baseOffset(kind) + step * FORTIFICATIONS.proposal.stewardGrowStepM,
    );
    const check = checkFortificationPlacement(landscape, village, obstacles, points, kind);
    if (!check.ok || !check.outline) continue;
    if (check.outline.innerAreaM2 >= needM2) {
      return { points: check.outline.points, lengthM: check.outline.lengthM };
    }
  }
  return null;
}
