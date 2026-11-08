import type { Point } from '../polygon';
import type { GridGeometry } from '../square-grid';
import { fortOutlineOf, type FortShapeSource } from './convert';
import { runEnd, type FortOutline } from './outline';

// Pás opevnění (fortifications.md – Obvod): leží uvnitř obvodu podél křivky, křivka je jeho vnější
// okraj. Pás každého kusu lomené čáry je čtyřúhelník kus × šířka pásu dovnitř (plocha vpravo od
// směru obvodu) s vnitřními rohy na ose ohybu – sousední kusy sdílejí hranu, takže pás nemá mezery.
// Kde je ohyb ostřejší, než šířka pásu dovolí, sejde se vnitřní okraj do rohu (trojúhelník – návrh
// Clauda). Deterministická vrstva – jen sčítání, násobení a odmocnina.

/** Kus pásu úseku `index` – konvexní čtyřúhelník nebo trojúhelník (rohy po obvodu). */
export interface FortBandPiece {
  /** Úsek (`FortSegmentShape.index`). */
  index: number;
  corners: Point[];
}

/** Nejdelší posun vnitřního rohu na ose ohybu – násobek šířky pásu (ostrý ohyb). */
const MITER_MAX = 2;

/** Tolerance poloh na obvodu (m). */
const EPSILON_M = 1e-9;

/**
 * Přesah kusu pásu přes konec kusu lomené čáry (m) – sousední kusy se překryjí, takže ani úsečka
 * přesně po jejich společné hraně neprojde mezi nimi (chůze – `cutsWall` dotyk nepočítá).
 */
const OVERLAP_M = 0.05;

/** Normála kusu `k` dovnitř plochy (vpravo od směru po směru hodin). */
function runNormal(outline: FortOutline, k: number): Point {
  const n = outline.runs.length;
  const line = outline.runs[((k % n) + n) % n]!.line;
  return [line.dz, -line.dx];
}

/** Směr k vnitřnímu rohu v bodě `k` lomené čáry – na ose ohybu, kolmá vzdálenost 1 od obou kusů. */
function vertexNormal(outline: FortOutline, k: number): Point {
  const a = runNormal(outline, k - 1);
  const b = runNormal(outline, k);
  const sx = a[0] + b[0];
  const sz = a[1] + b[1];
  const len = Math.sqrt(sx * sx + sz * sz);
  if (len <= EPSILON_M) return b;
  // osa ohybu (a + b) ÷ (1 + a·b), délka 2 ÷ |a + b| – nejvýš MITER_MAX
  const f = Math.min(2 / (len * len), MITER_MAX / len);
  return [sx * f, sz * f];
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Kus pásu mezi body a, b okraje se směry dovnitř na, nb (šířka `band`). */
function piece(a: Point, na: Point, b: Point, nb: Point, band: number): Point[] {
  const ia: Point = [a[0] + na[0] * band, a[1] + na[1] * band];
  const ib: Point = [b[0] + nb[0] * band, b[1] + nb[1] * band];
  const d1 = cross(b, ib, a);
  const d2 = cross(b, ib, ia);
  const d3 = cross(a, ia, b);
  const d4 = cross(a, ia, ib);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2);
    return [a, b, [a[0] + (ia[0] - a[0]) * t, a[1] + (ia[1] - a[1]) * t]];
  }
  return [a, b, ib, ia];
}

/** Bod přímky kusu `k` ve vzdálenosti `s` od začátku obvodu (za konci kusu prodloužený). */
function runPoint(outline: FortOutline, k: number, s: number): Point {
  const a = outline.polyline[k]!;
  const b = outline.polyline[(k + 1) % outline.polyline.length]!;
  const s0 = outline.stations[k]!;
  const len = runEnd(outline, k) - s0;
  const t = len > 0 ? (s - s0) / len : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Pás úseku `index` šířky `band` mezi polohami `fromM` a `toM` na obvodu (m od začátku obvodu;
 * bez nich celý úsek) – kusy po kusech lomené čáry, oříznuté na okno.
 */
export function bandPieces(
  outline: FortOutline,
  band: number,
  index: number,
  fromM = -Infinity,
  toM = Infinity,
): FortBandPiece[] {
  const first = outline.segmentStarts[index];
  const end = outline.segmentStarts[index + 1];
  if (first === undefined || end === undefined) return [];
  const pieces: FortBandPiece[] = [];
  for (let k = first; k < end; k++) {
    const s0 = outline.stations[k]!;
    const s1 = runEnd(outline, k);
    if (s1 <= fromM + EPSILON_M || s0 >= toM - EPSILON_M) continue;
    const n = runNormal(outline, k);
    const clipA = s0 - OVERLAP_M < fromM;
    const clipB = s1 + OVERLAP_M > toM;
    const a = runPoint(outline, k, clipA ? fromM : s0 - OVERLAP_M);
    const b = runPoint(outline, k, clipB ? toM : s1 + OVERLAP_M);
    const na = clipA ? n : vertexNormal(outline, k);
    const nb = clipB ? n : vertexNormal(outline, k + 1);
    pieces.push({ index, corners: piece(a, na, b, nb, band) });
  }
  return pieces;
}

/** Pás opevnění po úsecích (šířka `band`, bez údaje šířka druhu obvodu). */
export function fortBandPieces(
  outline: FortOutline,
  band: number = outline.bandM,
): FortBandPiece[] {
  const pieces: FortBandPiece[] = [];
  for (let index = 0; index + 1 < outline.segmentStarts.length; index++) {
    pieces.push(...bandPieces(outline, band, index));
  }
  return pieces;
}

/** Mnohoúhelníky celého pásu (bez rozlišení úseků). */
export function fortBandPolygons(outline: FortOutline): Point[][] {
  return fortBandPieces(outline).map((p) => p.corners);
}

/** Co pás stojícího opevnění potřebuje znát (`Fortification` ze stavu vsi i z pohledu na ves). */
export interface BandFortification extends FortShapeSource {
  readonly segments: readonly {
    readonly index: number;
    readonly builtDay: number | null;
    readonly demolishedDay?: number;
  }[];
}

/**
 * Pás opevnění, který zabírá místo jiným stavbám: hotové nezbořené úseky, a dokud se opevnění
 * staví (`building`), celý obvod – nedostavěný úsek po zrušení stavby i zbořený díl je mezera
 * (fortifications.md – Cena a stavba; demolition.md – Opevnění).
 */
export function fortificationBand(
  geo: GridGeometry,
  fort: BandFortification,
  building: boolean,
): Point[][] {
  const outline = fortOutlineOf(geo, fort);
  if (!outline) return [];
  const built = new Set(
    fort.segments
      .filter((s) => s.builtDay !== null && s.demolishedDay === undefined)
      .map((s) => s.index),
  );
  return fortBandPieces(outline)
    .filter((p) => building || built.has(p.index))
    .map((p) => p.corners);
}
