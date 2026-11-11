import type { FenceArc, FenceSegment } from '../paths/entrances';
import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import type { Construction, FortKind, SquareGrid, TileCell, VillageState } from '../types';
import { fortificationOutline, outlinePointAt, type FortOutline } from './outline';
import { fortSegments, nearestOnPath, nearestOnSegment } from './segments';
import { fortificationArea, squareOutline, type FortArea } from './squares-outline';
import { squareSegments } from './squares-segments';
import type { Fortification, FortSegment, FortSegmentWork } from './types';
import type { FortGate } from './gates';

// Převod opevnění nakreslených po čtvercích na body (fortifications.md – Pro implementaci – Obvod
// z bodů; návrh Clauda): body z jejich okraje se zakulacenými rohy – tečny a středy oblouků a po
// nejvýš 15 m na rovných kusech –, tvar zůstane. Nový úsek převezme stav starého úseku, ve kterém
// leží jeho střed; brány se převezmou podle polohy. Jednou a idempotentně (`withFortPoints`).

/** Bod úsečky a → b v poměru t. */
function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Bod oblouku rohu v poměru w (0 = začátek u, 1 = konec v) – směr normalizovaný mezi u a v. */
function arcPoint(arc: FenceArc, w: number): Point {
  const x = arc.ux * (1 - w) + arc.vx * w;
  const z = arc.uz * (1 - w) + arc.vz * w;
  const len = Math.sqrt(x * x + z * z);
  return len > 0 ? [arc.x + (arc.r * x) / len, arc.z + (arc.r * z) / len] : [arc.x, arc.z];
}

/** Konec rovného kusu. */
function lineEnd(line: FenceSegment): Point {
  return [line.x + line.dx * line.length, line.z + line.dz * line.length];
}

/**
 * Body obvodu starého opevnění po čtvercích `cells` (mřížka `grid`, null = krajina) druhu `kind`:
 * začátky a konce rovných kusů (tečny oblouků), mezi nimi po nejvýš 15 m, a středy oblouků rohů.
 * Neplatná plocha – null.
 */
export function squarePoints(
  cells: readonly TileCell[],
  grid: SquareGrid | null,
  geo: GridGeometry,
  kind: FortKind,
): Point[] | null {
  const area = fortificationArea(cells, grid, geo);
  if ('error' in area) return null;
  const gap = FORTIFICATIONS.outline.pointGapM;
  const points: Point[] = [];
  for (const run of squareOutline(area, kind).runs) {
    const a: Point = [run.line.x, run.line.z];
    const b = lineEnd(run.line);
    const parts = Math.max(1, Math.ceil(run.line.length / gap - 1e-9));
    for (let k = 0; k < parts; k++) points.push(lerp(a, b, k / parts));
    points.push(b);
    if (run.arc.r > 0) points.push(arcPoint(run.arc, 0.5));
  }
  return points;
}

/** Co tvar opevnění potřebuje znát – body, nebo u nepřevedeného opevnění čtverce. */
export interface FortShapeSource {
  readonly points?: readonly Point[];
  readonly grid?: SquareGrid | null;
  readonly cells?: readonly TileCell[];
  readonly kind: FortKind;
}

/** Body obvodu opevnění – uložené, nebo u nepřevedeného opevnění z jeho čtverců; jinak null. */
export function fortPointsOf(geo: GridGeometry, fort: FortShapeSource): readonly Point[] | null {
  if (fort.points) return fort.points;
  if (fort.cells) return squarePoints(fort.cells, fort.grid ?? null, geo, fort.kind);
  return null;
}

/** Lomená čára starého úseku (rovná část a oblouk rohu) – pro hledání, kam bod patří. */
function squareSegmentPath(line: FenceSegment, arc: FenceArc | null): Point[] {
  const path: Point[] = [[line.x, line.z], lineEnd(line)];
  if (arc && arc.r > 0) for (let k = 1; k <= 8; k++) path.push(arcPoint(arc, k / 8));
  return path;
}

/** Index nejbližší lomené čáry k bodu p (při shodě menší index). */
function nearestPath(paths: readonly Point[][], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  paths.forEach((path, index) => {
    const d = nearestOnPath(path, p[0], p[1]).distance;
    if (d < bestD - 1e-9) {
      bestD = d;
      best = index;
    }
  });
  return best;
}

/** Převedené opevnění a mapa nový úsek → starý úsek (index). */
interface Converted {
  fort: Fortification;
  oldOf: number[];
}

/** Převede jedno opevnění po čtvercích; neplatná plocha – null (opevnění zůstane, jak je). */
function convertFortification(geo: GridGeometry, fort: Fortification): Converted | null {
  if (!fort.cells) return null;
  const grid = fort.grid ?? null;
  const area = fortificationArea(fort.cells, grid, geo);
  if ('error' in area) return null;
  const points = squarePoints(fort.cells, grid, geo, fort.kind);
  const outline = points ? fortificationOutline(points, fort.kind) : null;
  if (!outline) return null;
  const oldShapes = squareSegments(squareOutline(area, fort.kind));
  const oldPaths = oldShapes.map((s) => squareSegmentPath(s.line, s.arc));
  const shapes = fortSegments(outline);
  const oldOf = shapes.map((s) => oldShapes[nearestPath(oldPaths, s.mid)]?.index ?? 0);
  const segments: FortSegment[] = shapes.map((s, k) => {
    const old = fort.segments.find((x) => x.index === oldOf[k]);
    return old ? { ...old, index: s.index } : { index: s.index, builtDay: null, state: 1 };
  });
  const gates: FortGate[] = [];
  for (const g of fort.gates) {
    let best = { distance: Infinity, along: 0 };
    let segment = shapes[0];
    for (const s of shapes) {
      const hit = nearestOnSegment(s, g.x, g.z);
      if (hit.distance < best.distance) {
        best = hit;
        segment = s;
      }
    }
    if (!segment || gates.some((x) => x.segment === segment.index)) continue;
    const [x, z] = outlinePointAt(outline, segment.startM + best.along);
    gates.push({ segment: segment.index, offsetM: best.along, x, z });
  }
  gates.sort((a, b) => a.segment - b.segment);
  const next: Fortification = {
    ...fort,
    points: outline.points.map((p): Point => [p[0], p[1]]),
    segments,
    gates,
  };
  delete next.grid;
  delete next.cells;
  return {
    fort: next,
    oldOf,
  };
}

/**
 * Plán úseků rozestavěné stavby po převodu: práce starého úseku se rozdělí mezi nové úseky, jejichž
 * střed v něm leží (podle délky), v pořadí starého plánu; práce starého úseku bez nového přejde na
 * další (na konci na poslední) – součet práce zůstane.
 */
function convertWork(
  work: readonly FortSegmentWork[],
  oldOf: readonly number[],
  lengths: readonly number[],
): FortSegmentWork[] {
  const out: FortSegmentWork[] = [];
  let carry = 0;
  for (const w of work) {
    const mine = oldOf.flatMap((old, index) => (old === w.index ? [index] : []));
    const total = mine.reduce((sum, i) => sum + (lengths[i] ?? 0), 0);
    if (mine.length === 0 || !(total > 0)) {
      carry += w.cost;
      continue;
    }
    const cost = w.cost + carry;
    carry = 0;
    for (const i of mine) out.push({ index: i, cost: (cost * (lengths[i] ?? 0)) / total });
  }
  const last = out[out.length - 1];
  if (carry > 0 && last) last.cost += carry;
  return out;
}

/**
 * Převod opevnění po čtvercích na body při načtení vsi (mutuje stav; Ves – nové části stavu jsou
 * volitelné, starší vsi se převedou jednou a idempotentně): opevnění s body se nemění, rozestavěná
 * stavba na převedeném opevnění dostane plán nových úseků. Ves bez opevnění po čtvercích beze změny.
 */
export function withFortPoints(
  state: Pick<VillageState, 'fortifications'> & { constructions: Construction[] },
  geo: GridGeometry,
): void {
  const forts = state.fortifications;
  if (!forts || !needsFortPoints(state)) return;
  state.fortifications = forts.map((fort) => {
    if (fort.points !== undefined || fort.cells === undefined) return fort;
    const converted = convertFortification(geo, fort);
    if (!converted) return fort;
    const outline = fortificationOutline(converted.fort.points!, fort.kind);
    const lengths = outline ? fortSegments(outline).map((s) => s.lengthM) : [];
    for (const c of state.constructions) {
      if (c.kind !== 'fortification' || c.fortificationId !== fort.id || !c.fortSegments) continue;
      c.fortSegments = convertWork(c.fortSegments, converted.oldOf, lengths);
    }
    return converted.fort;
  });
}

/** Ves má opevnění po čtvercích k převodu na body (`withFortPoints`) – seznam převodů podle toho klonuje. */
export function needsFortPoints(state: Pick<VillageState, 'fortifications'>): boolean {
  return (
    state.fortifications?.some((f) => f.points === undefined && f.cells !== undefined) ?? false
  );
}

/** Obvod opevnění druhu `kind` (bez údaje druh opevnění) – z bodů, u nepřevedeného ze čtverců. */
export function fortOutlineOf(
  geo: GridGeometry,
  fort: FortShapeSource,
  kind: FortKind = fort.kind,
): FortOutline | null {
  const points = fortPointsOf(geo, fort);
  return points ? fortificationOutline(points, kind) : null;
}

/**
 * Obvod z bodů starého opevnění po čtvercích s plochou `area` (`fortificationArea`) – tentýž,
 * jaký dostane po převodu. Plocha bez obvodu vyhodí RangeError.
 */
export function areaOutline(area: FortArea, kind: FortKind): FortOutline {
  const outline = fortificationOutline(
    squarePoints(area.cells, area.grid, area.geo, kind) ?? [],
    kind,
  );
  if (!outline) throw new RangeError('Plocha opevnění nemá obvod.');
  return outline;
}
