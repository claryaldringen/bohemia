import type { Point } from '../placement/polygon';
import { FORTIFICATIONS } from '../rules/rules-fortifications';
import type { GridGeometry } from '../placement/square-grid';
import { fortOutlineOf, type FortShapeSource } from './convert';
import { gatePartView, GATE_PARTS, hasGateParts } from './gate-parts';
import { segmentBuilt, segmentKind, segmentWall } from './life';
import { runOn, runTarget, type FortRuns, type FortSegmentRun } from './runs';
import { runEnd, type FortOutline } from './outline';
import type { FortGatePart, FortSegment, Fortification } from './types';

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
 * Kus pásu mezi okraji ve vzdálenostech `outerM` (záporná – vně křivky) a `innerM` od křivky (dovnitř
 * kladně) – val doplněný vně hradby. Kde se boční hrany zkříží (ohyb ostřejší, než pás dovolí),
 * zbude trojúhelník u okraje blíž křivce: průsečík dovnitř od křivky – vnitřní okraj se sejde do
 * rohu, vně – vnější okraj (vydutý ohyb).
 */
function spanPiece(
  a: Point,
  na: Point,
  b: Point,
  nb: Point,
  outerM: number,
  innerM: number,
): Point[] {
  const oa: Point = [a[0] + na[0] * outerM, a[1] + na[1] * outerM];
  const ob: Point = [b[0] + nb[0] * outerM, b[1] + nb[1] * outerM];
  const ia: Point = [a[0] + na[0] * innerM, a[1] + na[1] * innerM];
  const ib: Point = [b[0] + nb[0] * innerM, b[1] + nb[1] * innerM];
  const d1 = cross(ob, ib, oa);
  const d2 = cross(ob, ib, ia);
  const d3 = cross(oa, ia, ob);
  const d4 = cross(oa, ia, ib);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2);
    const x: Point = [oa[0] + (ia[0] - oa[0]) * t, oa[1] + (ia[1] - oa[1]) * t];
    return outerM + (innerM - outerM) * t > 0 ? [oa, ob, x] : [x, ib, ia];
  }
  return [oa, ob, ib, ia];
}

/**
 * Pás úseku `index` mezi okraji `outerM` a `innerM` od křivky (m; dovnitř kladně, vně záporně) a mezi
 * polohami `fromM` a `toM` na obvodu (m od začátku obvodu; bez nich celý úsek) – kusy po kusech
 * lomené čáry, oříznuté na okno. Pás od křivky (`outerM` 0) je `bandPieces`.
 */
export function spanPieces(
  outline: FortOutline,
  outerM: number,
  innerM: number,
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
    // pás od křivky beze změny (zlaté otisky stěn), jinak pás posunutý přes křivku
    const corners =
      outerM === 0 ? piece(a, na, b, nb, innerM) : spanPiece(a, na, b, nb, outerM, innerM);
    pieces.push({ index, corners });
  }
  return pieces;
}

/**
 * Pás úseku `index` šířky `band` dovnitř od křivky mezi polohami `fromM` a `toM` na obvodu (m od
 * začátku obvodu; bez nich celý úsek) – kusy po kusech lomené čáry, oříznuté na okno.
 */
export function bandPieces(
  outline: FortOutline,
  band: number,
  index: number,
  fromM = -Infinity,
  toM = Infinity,
): FortBandPiece[] {
  return spanPieces(outline, 0, band, index, fromM, toM);
}

/**
 * Čára rovnoběžná s křivkou ve vzdálenosti `offsetM` (dovnitř kladně, vně záporně) podél úseku
 * `index` – body na ose ohybu u každého bodu lomené čáry úseku i na jeho konci (osa příkopu).
 */
export function bandLine(outline: FortOutline, index: number, offsetM: number): Point[] {
  const first = outline.segmentStarts[index];
  const end = outline.segmentStarts[index + 1];
  if (first === undefined || end === undefined) return [];
  const n = outline.polyline.length;
  const line: Point[] = [];
  for (let k = first; k <= end; k++) {
    const p = outline.polyline[k % n]!;
    const v = vertexNormal(outline, k);
    line.push([p[0] + v[0] * offsetM, p[1] + v[1] * offsetM]);
  }
  return line;
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
  readonly top?: Fortification['top'];
  readonly segments: readonly {
    readonly index: number;
    readonly builtDay: number | null;
    readonly topBuiltDay?: number | null;
    readonly demolishedDay?: number;
    readonly kind?: FortSegment['kind'];
    readonly top?: FortSegment['top'];
    readonly rampartOutside?: true;
    readonly demolishedBeforeGate?: number;
    readonly demolishedAfterGate?: number;
    readonly beforeGate?: FortGatePart;
    readonly afterGate?: FortGatePart;
  }[];
}

/**
 * Pás, který díl zabírá uvnitř křivky (m): stojící díl podle svých vrstev (`segmentBand`), nejméně
 * pás druhu opevnění (val vně hradby jen šířkou hradby – ven sahá `segmentBand.outM`); díl, na kterém stavba vylepšení staví vyšší hradbu, pás cílové hradby (na valu
 * s valem – `wallOnRampartBandM`); mezera stavěná znovu pás cílové hradby bez valu.
 */
function bandWidthOf(
  fort: BandFortification,
  outline: FortOutline,
  segment: BandFortification['segments'][number],
  run: FortSegmentRun | null,
): number {
  const target = runTarget(run);
  // mezera (zbořená či nedostavěná), kterou vylepšení staví znovu – hradba bez valu
  const gap = !segmentBuilt(segment) || segment.demolishedDay !== undefined;
  if (gap && target !== null) return FORTIFICATIONS.bandM[target];
  const band = segmentBand(fort, segment);
  if (band.outM > 0) {
    // val vně hradby: dovnitř jen hradba (nejméně `minInM`), i cílová hradba vylepšení
    return target === null ? band.inM : Math.max(band.inM, FORTIFICATIONS.bandM[target]);
  }
  const width = Math.max(outline.bandM, band.inM);
  if (target === null) return width;
  const onRampart = segmentKind(fort, segment) === 'rampart';
  return Math.max(
    width,
    onRampart ? FORTIFICATIONS.wallOnRampartBandM[target] : FORTIFICATIONS.bandM[target],
  );
}

/**
 * Pás opevnění, který zabírá místo jiným stavbám: hotové nezbořené díly, a díly, na kterých běží
 * stavba (`building` – práce staveb po dílech `fortRuns`; `true` – celý obvod, jen „staví se“
 * bez dílů, pohled na ves) – nedostavěný díl po zrušení stavby i zbořený díl je mezera
 * (fortifications.md – Cena a stavba; demolition.md – Opevnění). Šířka po dílech (`bandWidthOf`).
 */
export function fortificationBand(
  geo: GridGeometry,
  fort: BandFortification,
  building: boolean | FortRuns | null,
): Point[][] {
  const outline = fortOutlineOf(geo, fort);
  if (!outline) return [];
  const pieces: Point[][] = [];
  for (const s of fort.segments) {
    const run = building === true || building === false ? null : runOn(building, s.index);
    const taken =
      building === true || run !== null || (segmentBuilt(s) && s.demolishedDay === undefined);
    if (!taken) continue;
    let width = bandWidthOf(fort, outline, s, run);
    // val vně hradby sahá přes křivku ven (mezera stavěná znovu ne – staví se hradba bez valu)
    const gapRebuilt =
      (!segmentBuilt(s) || s.demolishedDay !== undefined) && runTarget(run) !== null;
    let out = gapRebuilt ? 0 : segmentBand(fort, s).outM;
    // díl s branou: kus s vlastní hradbou nebo prací – pás dílu podle nejširšího kusu
    if (building !== true && building !== false) {
      for (const part of GATE_PARTS) {
        const own = runOn(building, s.index, part);
        if (own === run && !hasGateParts(s)) continue;
        const view = gatePartView(s, part);
        if (own === run && view.demolishedDay !== undefined) continue;
        width = Math.max(width, bandWidthOf(fort, outline, view, own));
        const rebuilt =
          (!segmentBuilt(view) || view.demolishedDay !== undefined) && runTarget(own) !== null;
        if (!rebuilt && view.demolishedDay === undefined) {
          out = Math.max(out, segmentBand(fort, view).outM);
        }
      }
    }
    for (const p of spanPieces(outline, -out, width, s.index)) pieces.push(p.corners);
  }
  return pieces;
}

/**
 * Pás úseku od křivky obvodu (fortifications.md – Hradby a obrana, Druhy): dovnitř (`inM`) a ven
 * (`outM`), m. Hradba bez valu má pás druhu (`bandM`), hradba na valu pás s valem
 * (`wallOnRampartBandM`), holý val 10 m; val doplněný vně hradby (`rampartOutside`) sahá 7 m ven
 * a dovnitř šířkou hradby, nejméně 3 m. Hradba se počítá i rozestavěná – pás, jak bude postaven.
 */
export function segmentBand(
  fort: Pick<Fortification, 'kind' | 'top'>,
  segment: Pick<FortSegment, 'kind' | 'top' | 'builtDay' | 'topBuiltDay' | 'rampartOutside'>,
): { inM: number; outM: number } {
  const kind = segmentKind(fort, segment);
  if (kind !== 'rampart') return { inM: FORTIFICATIONS.bandM[kind], outM: 0 };
  const wall = segmentWall(fort, segment);
  if (segment.rampartOutside) {
    const out = FORTIFICATIONS.rampartOutside;
    return {
      inM: Math.max(wall ? FORTIFICATIONS.bandM[wall.kind] : 0, out.minInM),
      outM: out.outM,
    };
  }
  return {
    inM: wall ? FORTIFICATIONS.wallOnRampartBandM[wall.kind] : FORTIFICATIONS.bandM.rampart,
    outM: 0,
  };
}

/**
 * Čára hradby od křivky dovnitř (m; fortifications.md – Hradby a obrana, Druhy – Pás s valem):
 * hradba na valu stojí na koruně valu (Martin 9. 11. 2026: „Pokud se jedná o palisádu nebo polský
 * plot, má stát na koruně valu“). Val na křivce (opevnění druhu val) má korunu za příkopem
 * a polovinou paty valu – 4 + 3 = 7 m; val doplněný vně hradby korunu na křivce – 0, jako hradba
 * bez valu. Návrh Clauda: celé opevnění s valem na křivce má čáru na koruně, i díl postavený
 * znovu bez valu.
 */
export function wallLineInM(fort: Pick<Fortification, 'kind'>): number {
  const r = FORTIFICATIONS.rampartBand;
  return fort.kind === 'rampart' ? r.ditchM + r.footM / 2 : 0;
}
