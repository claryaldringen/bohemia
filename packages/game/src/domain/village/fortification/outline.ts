import type { FenceArc, FenceCorners, FenceSegment } from '../paths/entrances';
import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { FortKind } from '../types';
import {
  normalizeFortPoints,
  polylineArea,
  polylineLength,
  sampleCurve,
  selfCrossing,
  steinerInnerArea,
  type CurveBend,
} from './curve';

// Obvod opevnění (fortifications.md – Obvod; Martin 7. 11. 2026 – obvod z bodů místo čtverců):
// hladká uzavřená křivka přes body (`curve.ts`) je vnější okraj, pás leží uvnitř podél ní.
// Deterministická vrstva – tvar počítá server i prohlížeč ze stejné funkce.

/** Kus vnějšího okraje – krátká rovná úsečka navzorkované křivky (oblouky obvod z bodů nemá). */
export interface FortRun {
  line: FenceSegment;
  arc: FenceArc | null;
}

/** Obvod opevnění z bodů. */
export interface FortOutline {
  kind: FortKind;
  /** Body obvodu v pevném pořadí – po směru hodin od nejsevernějšího (`normalizeFortPoints`). */
  points: Point[];
  /** Navzorkovaná křivka – uzavřená lomená čára bez opakovaného prvního bodu, po směru hodin. */
  polyline: Point[];
  /** Poloha každého bodu lomené čáry na obvodu – m od začátku (první 0). */
  stations: number[];
  /** Kusy vnějšího okraje – kus k vede z bodu k do bodu k + 1 lomené čáry. */
  runs: FortRun[];
  /** Nejmenší poloměr ohybu druhu – pro scénu jako poloměry rohů (vnější i vnitřní). */
  corners: FenceCorners;
  /** Délka křivky (m) – jedno číslo pro všechny druhy. */
  lengthM: number;
  /** Plocha uvnitř křivky (m²). */
  areaM2: number;
  /** Šířka pásu uvnitř podél křivky (m). */
  bandM: number;
  /** Útočiště – plocha uvnitř vnitřního okraje pásu (Steinerův vzorec, m²). */
  innerAreaM2: number;
  /** Bod lomené čáry, kde začíná úsek k; poslední prvek = počet bodů (konec obvodu). */
  segmentStarts: number[];
}

/** Proč tvar obvodu neprojde (místo problému u ohybu a křížení). */
export interface FortShapeError {
  error: 'too-few' | 'sharp' | 'crossing' | 'too-small';
  at?: Point;
}

/** Tolerance poloh na obvodu (m). */
const EPSILON_M = 1e-6;

function dist(a: Point, b: Point): number {
  const x = b[0] - a[0];
  const z = b[1] - a[1];
  return Math.sqrt(x * x + z * z);
}

/**
 * Obvod druhu `kind` přes body `points` (libovolné pořadí a začátek): křivka navzorkovaná do
 * lomené čáry, na ní hranice stejně dlouhých úseků ≈ 15 m (délka ÷ zaokrouhlený počet), délka,
 * plocha, pás a útočiště. Méně než tři různé body – null. Z paměti podle druhu a bodů (číslo po
 * čísle) – obvod je zmrazený a sdílený mezi voláními, jen ke čtení (jen zrychlení: úbytek
 * hradeb, průsečíky cest s úseky a údržba ho počítají každý den pro tatáž opevnění znovu).
 */
export function fortificationOutline(points: readonly Point[], kind: FortKind): FortOutline | null {
  for (let k = 0; k < outlineMemo.length; k++) {
    const known = outlineMemo[k]!;
    if (known.kind !== kind || !samePoints(known.points, points)) continue;
    if (k > 0) {
      outlineMemo.splice(k, 1);
      outlineMemo.unshift(known);
    }
    return known.outline;
  }
  const outline = computeOutline(points, kind);
  const flat = new Float64Array(points.length * 2);
  points.forEach((p, k) => {
    flat[k * 2] = p[0];
    flat[k * 2 + 1] = p[1];
  });
  outlineMemo.unshift({ kind, points: flat, outline: outline && freezeOutline(outline) });
  if (outlineMemo.length > OUTLINE_MEMO) outlineMemo.pop();
  return outlineMemo[0]!.outline;
}

/** Kolik posledních obvodů drží paměť `fortificationOutline` (nejdéle nepoužitý vypadne). */
const OUTLINE_MEMO = 16;
const outlineMemo: { kind: FortKind; points: Float64Array; outline: FortOutline | null }[] = [];

/** Body jsou tytéž jako v paměti – i znaménko nuly (`Object.is`), ať je výsledek bit po bitu týž. */
function samePoints(flat: Float64Array, points: readonly Point[]): boolean {
  if (flat.length !== points.length * 2) return false;
  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    if (!Object.is(flat[k * 2], p[0]) || !Object.is(flat[k * 2 + 1], p[1])) return false;
  }
  return true;
}

/** Zmrazí obvod i s poli a body (sdílený z paměti – změna by vyhodila TypeError, ne tichou chybu). */
function freezeOutline(outline: FortOutline): FortOutline {
  for (const p of outline.points) Object.freeze(p);
  for (const p of outline.polyline) Object.freeze(p);
  for (const run of outline.runs) {
    Object.freeze(run.line);
    Object.freeze(run);
  }
  Object.freeze(outline.points);
  Object.freeze(outline.polyline);
  Object.freeze(outline.stations);
  Object.freeze(outline.runs);
  Object.freeze(outline.corners);
  Object.freeze(outline.segmentStarts);
  return Object.freeze(outline);
}

function computeOutline(points: readonly Point[], kind: FortKind): FortOutline | null {
  const pts = normalizeFortPoints(points);
  if (pts.length < 3) return null;
  const raw = sampleCurve(pts);
  const lengthM = polylineLength(raw);
  if (!(lengthM > 0)) return null;
  const count = Math.max(1, Math.round(lengthM / FORTIFICATIONS.outline.segmentM));
  const segM = lengthM / count;
  const polyline: Point[] = [];
  const stations: number[] = [];
  const segmentStarts: number[] = [0];
  let s0 = 0;
  let next = 1;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    const b = raw[(i + 1) % raw.length]!;
    const len = dist(a, b);
    const s1 = s0 + len;
    if (next < count && Math.abs(s0 - next * segM) <= EPSILON_M && i > 0) {
      segmentStarts.push(polyline.length);
      next++;
    }
    polyline.push(a);
    stations.push(s0);
    while (next < count && next * segM < s1 - EPSILON_M) {
      const t = (next * segM - s0) / len;
      segmentStarts.push(polyline.length);
      polyline.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      stations.push(next * segM);
      next++;
    }
    s0 = s1;
  }
  segmentStarts.push(polyline.length);
  const runs: FortRun[] = polyline.map((a, k) => {
    const b = polyline[(k + 1) % polyline.length]!;
    const length = dist(a, b);
    return {
      line: {
        x: a[0],
        z: a[1],
        dx: length > 0 ? (b[0] - a[0]) / length : 1,
        dz: length > 0 ? (b[1] - a[1]) / length : 0,
        length,
      },
      arc: null,
    };
  });
  const bandM = FORTIFICATIONS.bandM[kind];
  const areaM2 = polylineArea(polyline);
  const bend = FORTIFICATIONS.minBendM[kind];
  return {
    kind,
    points: pts,
    polyline,
    stations,
    runs,
    corners: { outer: bend, inner: bend },
    lengthM,
    areaM2,
    bandM,
    innerAreaM2: steinerInnerArea(areaM2, lengthM, bandM),
    segmentStarts,
  };
}

/**
 * Ohyb obvodu v měřítku `reachM` (m): u každého bodu lomené čáry poloměr kružnice přes body
 * o `reachM` po obvodu před ním a za ním – nejmenší a kde. Krátké zakolísání křivky mezi body
 * (přechod z rovného kusu do oblouku) se tak nepočítá, roh ostřejší než poloměr ano.
 */
export function outlineBend(
  outline: FortOutline,
  reachM: number,
  only?: ReadonlySet<number>,
  ranges?: readonly (readonly [number, number])[],
): CurveBend {
  let best: CurveBend = { radiusM: Infinity, at: outline.polyline[0] ?? [0, 0] };
  // jen body lomené čáry v dílech `only` (vylepšení úseku – ohyb cílové hradby jen tam), s `ranges`
  // jen body v těchto kusech obvodu (m od začátku dílu 0 – kus dílu s branou bez brány)
  const inside = only ? pointsOfSegments(outline, only) : null;
  outline.polyline.forEach((b, k) => {
    if (inside && !inside.has(k)) return;
    const at = outline.stations[k]!;
    if (ranges && !ranges.some(([from, to]) => at >= from - EPSILON_M && at <= to + EPSILON_M)) {
      return;
    }
    const s = outline.stations[k]!;
    const a = outlinePointAt(outline, s - reachM);
    const c = outlinePointAt(outline, s + reachM);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area2 <= EPSILON_M * EPSILON_M) return;
    const r = (dist(a, b) * dist(b, c) * dist(c, a)) / (2 * area2);
    if (r < best.radiusM) best = { radiusM: r, at: b };
  });
  return best;
}

/** Indexy bodů lomené čáry, které leží v dílech `segments` (`segmentStarts`). */
function pointsOfSegments(outline: FortOutline, segments: ReadonlySet<number>): Set<number> {
  const result = new Set<number>();
  for (const index of segments) {
    const first = outline.segmentStarts[index];
    const end = outline.segmentStarts[index + 1];
    if (first === undefined || end === undefined) continue;
    for (let k = first; k < end; k++) result.add(k);
  }
  return result;
}

/**
 * Kontrola tvaru (fortifications.md – Obvod): nejméně 4 body, ohyb ne ostřejší než nejmenší
 * poloměr druhu (`outlineBend` v měřítku toho poloměru – návrh Clauda), křivka se nekříží, plocha
 * aspoň 900 m². Projde – null.
 */
export function fortShapeError(outline: FortOutline | null): FortShapeError | null {
  if (!outline || outline.points.length < FORTIFICATIONS.outline.minPoints) {
    return { error: 'too-few' };
  }
  const minBend = FORTIFICATIONS.minBendM[outline.kind];
  const bend = outlineBend(outline, minBend);
  if (bend.radiusM < minBend - EPSILON_M) {
    return { error: 'sharp', at: bend.at };
  }
  const hit = selfCrossing(outline.polyline);
  if (hit) return { error: 'crossing', at: hit };
  if (outline.areaM2 < FORTIFICATIONS.outline.minAreaM2) return { error: 'too-small' };
  return null;
}

/** Bod na obvodu ve vzdálenosti `s` od začátku (m, po směru hodin; mimo délku se zabalí). */
export function outlinePointAt(outline: FortOutline, s: number): Point {
  const { polyline, stations, lengthM } = outline;
  let at = s % lengthM;
  if (at < 0) at += lengthM;
  let lo = 0;
  let hi = stations.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (stations[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  const a = polyline[lo]!;
  const b = polyline[(lo + 1) % polyline.length]!;
  const end = lo + 1 < stations.length ? stations[lo + 1]! : lengthM;
  const len = end - stations[lo]!;
  const t = len > 0 ? (at - stations[lo]!) / len : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Poloha konce kusu `k` na obvodu (m od začátku). */
export function runEnd(outline: FortOutline, k: number): number {
  return k + 1 < outline.stations.length ? outline.stations[k + 1]! : outline.lengthM;
}
