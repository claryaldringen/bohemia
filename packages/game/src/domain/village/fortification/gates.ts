import type { Point } from '../placement/polygon';
import { FORTIFICATIONS } from '../rules/rules-fortifications';
import type { RoadPoint } from '../types';
import { outlinePointAt, type FortOutline } from './outline';
import { fortSegments, nearestOnSegment, type FortSegmentShape } from './segments';
import type { Fortification } from './types';

// Brány opevnění (fortifications.md – Brány): vzniknou samy, kde obvod protne cestu (pevnou,
// vozovou cestu a zemskou stezku – vybírá volající), hráč přidá další kliknutím na obvod; nejvýš
// jedna na úsek. Obvod bez cesty má jednu bránu v úseku nejblíž kotvě (dvorec, bez něj střed
// obydlí). Brána je rovná 4 m tětiva křivky se středem v průsečíku s cestou, celá v úseku (návrh
// Clauda).

/** Brána na obvodu. */
export interface FortGate {
  /** Úsek (`FortSegmentShape.index`). */
  segment: number;
  /** Střed brány na křivce – vzdálenost od začátku úseku po obvodu (m). */
  offsetM: number;
  /** Střed brány ve světě (m) – bod křivky. */
  x: number;
  z: number;
  /**
   * Klešťová brána (fortifications.md – Hradby a obrana, Brány): den dokončení ramen, null = staví
   * se. Chybí = prostá brána.
   */
  pincerDay?: number | null;
  /** Věž nad branou (Hradby a obrana – Brány): den dokončení, null = staví se. Chybí = bez věže. */
  towerDay?: number | null;
  /** Stárnutí věže navíc za nedodělanou údržbu (dny; Životnost a údržba); chybí = 0. */
  towerExtraAgeDays?: number;
  /**
   * Den, kdy hráč bránu opustil (demolition.md – Rozhodnutí, Martin 14. 11. 2026): obyvatelé díl
   * brány ani věž nepřestaví, brána shnije a zbyde mezera (`demolishedDay`). Chybí = udržovaná.
   */
  abandonedDay?: number;
  /**
   * Den, kdy brána zmizela – zbořená hráčem, nebo opuštěná shnilá: mezera šířky brány, průchod,
   * který nejde zavřít, bez klešťové brány a věže. Hradba dílu kolem stojí dál a úseky dělí dál.
   * Chybí = brána stojí.
   */
  demolishedDay?: number;
}

/** Stojí brána (není zbořená ani shnilá na mezeru)? */
export function gateStands(gate: Pick<FortGate, 'demolishedDay'>): boolean {
  return gate.demolishedDay === undefined;
}

/**
 * Brána zmizí (mutuje bránu): zbyde mezera šířky brány, klešťová brána a věž padnou s ní
 * (demolition.md – Rozhodnutí; návrh Clauda).
 */
export function removeGate(gate: FortGate, day: number): void {
  gate.demolishedDay = day;
  delete gate.abandonedDay;
  delete gate.pincerDay;
  delete gate.towerDay;
  delete gate.towerExtraAgeDays;
}

/**
 * Otvor po zbořené bráně je zastavený hradbou (mutuje opevnění; demolition.md – Rozhodnutí, D45):
 * brána zmizí z `gates`, úseky kolem splynou a díl je zase celý díl hradby, ve které brána stála –
 * kusy u brány neměly jinou hradbu (`gateGapFill`), jen jiné stáří; díl převezme stáří své hradby
 * (návrh Clauda).
 */
export function closeGateGap(
  fort: Pick<Fortification, 'gates' | 'segments'>,
  gate: FortGate,
): void {
  fort.gates = fort.gates.filter((g) => g !== gate);
  const seg = fort.segments.find((s) => s.index === gate.segment);
  if (!seg) return;
  delete seg.beforeGate;
  delete seg.afterGate;
  delete seg.demolishedBeforeGate;
  delete seg.demolishedAfterGate;
}

/** Proč bránu nejde přidat: klik daleko od obvodu, úsek už bránu má. */
export interface GateError {
  error: 'off-outline' | 'segment-taken';
}

/** Lomená čára ve světě (osa cesty). */
export type GatePolyline = readonly RoadPoint[];

/** Tětiva brány: konce na křivce a jejich poloha na obvodu (m od začátku obvodu). */
export interface GateChord {
  a: Point;
  b: Point;
  fromM: number;
  toM: number;
}

/** Tolerance průsečíku na konci úsečky (m). */
const HIT_EPSILON_M = 1e-9;
/** Rezerva obalu úseku při hledání průsečíků s cestami (m) – jen zrychlení (`firstCrossing`). */
const CROSSING_BOX_M = 1;

/** Kolikrát se zpřesní poloviční délka oblouku, aby tětiva měřila šířku brány. */
const CHORD_STEPS = 3;

/** Poloha středu brány v úseku – brána se celá vejde do úseku, kratší úsek než brána – střed. */
function clampOffset(segment: FortSegmentShape, along: number): number {
  const half = FORTIFICATIONS.gate.widthM / 2;
  const len = segment.lengthM;
  return len <= 2 * half ? len / 2 : Math.min(len - half, Math.max(half, along));
}

/**
 * Brána úseku nejblíž polohy `along` (m od začátku úseku) – celá v úseku (`clampOffset`); i převzetí
 * brány na nový tvar obvodu (`rerouteFortification`).
 */
export function gateAt(outline: FortOutline, segment: FortSegmentShape, along: number): FortGate {
  const offsetM = clampOffset(segment, along);
  const [x, z] = outlinePointAt(outline, segment.startM + offsetM);
  return { segment: segment.index, offsetM, x, z };
}

/**
 * Tětiva brány šířky `FORTIFICATIONS.gate.widthM` se středem v bodě křivky brány: konce na křivce
 * stejně daleko po obvodu na obě strany, vzdálenost zpřesněná na šířku brány; nepřesáhne úsek.
 */
export function gateChord(
  outline: FortOutline,
  segment: FortSegmentShape,
  gate: FortGate,
): GateChord {
  const width = FORTIFICATIONS.gate.widthM;
  const center = segment.startM + gate.offsetM;
  const lo = segment.startM;
  const hi = segment.startM + segment.lengthM;
  let half = width / 2;
  let fromM = Math.max(lo, center - half);
  let toM = Math.min(hi, center + half);
  for (let k = 0; k < CHORD_STEPS; k++) {
    const a = outlinePointAt(outline, fromM);
    const b = outlinePointAt(outline, toM);
    const chord = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    if (!(chord > 0)) break;
    half = (half * width) / chord;
    fromM = Math.max(lo, center - half);
    toM = Math.min(hi, center + half);
  }
  return { a: outlinePointAt(outline, fromM), b: outlinePointAt(outline, toM), fromM, toM };
}

/** Průsečíky úsečky p → q s lomenou čárou úseku – polohy na úseku (m od jeho začátku). */
function crossings(segment: FortSegmentShape, p: RoadPoint, q: RoadPoint): number[] {
  const hits: number[] = [];
  const ex = q.x - p.x;
  const ez = q.z - p.z;
  let at = 0;
  const path = segment.path;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k]!;
    const b = path[k + 1]!;
    const lx = b[0] - a[0];
    const lz = b[1] - a[1];
    const len = Math.sqrt(lx * lx + lz * lz);
    const denom = lx * ez - lz * ex;
    if (denom !== 0) {
      const wx = p.x - a[0];
      const wz = p.z - a[1];
      const s = (wx * ez - wz * ex) / denom;
      const t = (wx * lz - wz * lx) / denom;
      if (
        s >= -HIT_EPSILON_M &&
        s <= 1 + HIT_EPSILON_M &&
        t >= -HIT_EPSILON_M &&
        t <= 1 + HIT_EPSILON_M
      ) {
        hits.push(at + len * Math.min(1, Math.max(0, s)));
      }
    }
    at += len;
  }
  return hits;
}

/** Vzdálenost bodu od úseku – od jeho lomené čáry (m). */
export function distanceTo(segment: FortSegmentShape, x: number, z: number): number {
  return nearestOnSegment(segment, x, z).distance;
}

/** První průsečík cest `roads` s úsekem – poloha na úseku (m); bez průsečíku Infinity. */
function firstCrossing(segment: FortSegmentShape, roads: readonly GatePolyline[]): number {
  // obal úseku s rezervou – úsečka cesty mimo něj ho neprotne (tolerance HIT_EPSILON_M je
  // zlomek délky, u úseček kratších než 1000 km pod 1 mm); jen zrychlení, výsledek týž
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of segment.path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  minX -= CROSSING_BOX_M;
  maxX += CROSSING_BOX_M;
  minZ -= CROSSING_BOX_M;
  maxZ += CROSSING_BOX_M;
  let first = Infinity;
  for (const road of roads) {
    for (let k = 0; k + 1 < road.length; k++) {
      const p = road[k]!;
      const q = road[k + 1]!;
      if (
        Math.max(p.x, q.x) < minX ||
        Math.min(p.x, q.x) > maxX ||
        Math.max(p.z, q.z) < minZ ||
        Math.min(p.z, q.z) > maxZ
      ) {
        continue;
      }
      for (const along of crossings(segment, p, q)) {
        first = Math.min(first, along);
      }
    }
  }
  return first;
}

/**
 * Brány, které vzniknou samy (fortifications.md – Brány): průsečíky obvodu s cestami `roads`,
 * nejvýš jedna na úsek (první po směru hodin); obvod bez průsečíku dostane jednu bránu uprostřed
 * úseku nejblíž kotvě `anchor` (při shodě úsek s menším pořadím). Seřazené podle úseku.
 */
export function autoGates(
  outline: FortOutline,
  roads: readonly GatePolyline[],
  anchor: RoadPoint,
): FortGate[] {
  const segments = fortSegments(outline);
  const gates: FortGate[] = [];
  for (const segment of segments) {
    const first = firstCrossing(segment, roads);
    if (first !== Infinity) gates.push(gateAt(outline, segment, first));
  }
  if (gates.length > 0) return gates;
  let nearest = segments[0];
  let best = Infinity;
  for (const segment of segments) {
    const d = distanceTo(segment, anchor.x, anchor.z);
    if (d < best) {
      best = d;
      nearest = segment;
    }
  }
  return nearest ? [gateAt(outline, nearest, nearest.lengthM / 2)] : [];
}

/**
 * Hráč přidá bránu kliknutím na obvod (fortifications.md – Brány): úsek nejblíž bodu `pos`,
 * nejvýš do šířky pásu (nejméně půl brány) od vnějšího okraje (návrh Clauda); úsek s bránou ji
 * druhou nedostane. Vrátí nové brány seřazené podle úseku.
 */
export function addGate(
  outline: FortOutline,
  gates: readonly FortGate[],
  pos: RoadPoint,
): FortGate[] | GateError {
  const reach = Math.max(outline.bandM, FORTIFICATIONS.gate.widthM / 2);
  let nearest: FortSegmentShape | null = null;
  let best = { distance: Infinity, along: 0 };
  for (const segment of fortSegments(outline)) {
    const hit = nearestOnSegment(segment, pos.x, pos.z);
    if (hit.distance < best.distance) {
      best = hit;
      nearest = segment;
    }
  }
  if (!nearest || best.distance > reach) return { error: 'off-outline' };
  const index = nearest.index;
  if (gates.some((g) => g.segment === index)) return { error: 'segment-taken' };
  return [...gates, gateAt(outline, nearest, best.along)].sort((a, b) => a.segment - b.segment);
}

/**
 * Brány pro cesty přes stojící opevnění (fortifications.md – Brány: cesta postavená přes hotové
 * opevnění dostane bránu taky – návrh Clauda): stojící úsek (`standing`) bez brány, který cesta
 * z `roads` protne, dostane bránu u prvního průsečíku jako v `autoGates`; nejvýš jedna na úsek.
 * Bez nové brány vrátí totéž pole `gates`, jinak nové seřazené podle úseku.
 */
export function roadGates(
  outline: FortOutline,
  gates: readonly FortGate[],
  roads: readonly GatePolyline[],
  standing: (segment: number) => boolean,
): readonly FortGate[] {
  const taken = new Set(gates.map((g) => g.segment));
  const added: FortGate[] = [];
  for (const segment of fortSegments(outline)) {
    if (taken.has(segment.index) || !standing(segment.index)) continue;
    const first = firstCrossing(segment, roads);
    if (first !== Infinity) added.push(gateAt(outline, segment, first));
  }
  if (added.length === 0) return gates;
  return [...gates, ...added].sort((a, b) => a.segment - b.segment);
}
