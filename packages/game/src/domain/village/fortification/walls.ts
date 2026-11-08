import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import type { FortKind } from '../types';
import { bandPieces } from './band';
import { fortPointsOf, type FortShapeSource } from './convert';
import { gateChord, type FortGate } from './gates';
import { segmentBuilt, segmentKind, segmentStands } from './life';
import { fortificationOutline, outlinePointAt, type FortOutline } from './outline';
import { fortSegments } from './segments';
import { fortRuns, runOn, runTarget, type FortRunRef, type FortRuns } from './runs';
import type { FortBuildWork } from './types';

// Stěny opevnění pro síť cest (fortifications.md – Obvod, Brány, Pro implementaci – Chůze a cesty):
// pás blokujících úseků jako obdélníky (`fortBandPieces`) bez otvorů bran – chodec, vůz ani stádo
// pásem neprojde, jen branou. Blokuje celý obvod od položení stavby (Martin 6. 11. 2026) – stojící
// úsek i staveniště běžící stavby; mezera po zrušené stavbě, shnilý úsek na nule a průlom jsou
// průchozí. Stěny tak nemění dokončení úseku, jen obvod, pás, brány, mezery a průlomy. Server
// i prohlížeč počítají stěny touto funkcí (jen sčítání a násobení).

/** Stěny a brány opevnění ve světě – podklad mřížek chodců a vozů (`PathVillage.fortifications`). */
export interface FortWalls {
  /** Pás stojících úseků bez otvorů bran – konvexní čtyřúhelníky (rohy po obvodu). */
  walls: Point[][];
  /** Otvory bran ve stojících úsecích – obdélník brány přes celou šířku pásu. */
  gates: Point[][];
  /**
   * Body objížďky vně hladkého obvodu (po ≈ 10 m, 1 m za vnějším okrajem) – chůze kolem stěny
   * (`wallDetour`); obvod nemá ostré rohy, kolem kterých by se objížďka lámala.
   */
  detour?: Point[];
}

/** Rozestup a odstup bodů objížďky vně obvodu (m). */
const DETOUR_STEP_M = 10;
const DETOUR_OFFSET_M = 1;

/** Nejmenší rozestup bodů objížďky po půlení (m). */
const DETOUR_MIN_STEP_M = 2.5;

/** Řízne úsečka p → q vnitřek konvexního čtyřúhelníku? (ořez podle hran, jen sčítání a násobení) */
export function segmentCutsQuad(p: Point, q: Point, quad: readonly Point[]): boolean {
  const n = quad.length;
  let sign = 0;
  for (let k = 0; k < n && sign === 0; k++) {
    const a = quad[k]!;
    const b = quad[(k + 1) % n]!;
    const c = quad[(k + 2) % n]!;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) sign = cross > 0 ? 1 : -1;
  }
  if (sign === 0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  for (let k = 0; k < n; k++) {
    const a = quad[k]!;
    const b = quad[(k + 1) % n]!;
    // vnitřek: sign * ((b - a) × (x - a)) > 0
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const f0 = sign * (ex * (p[1] - a[1]) - ez * (p[0] - a[0]));
    const df = sign * (ex * dz - ez * dx);
    if (df === 0) {
      if (f0 <= 0) return false;
    } else {
      const t = -f0 / df;
      if (df > 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (t0 >= t1) return false;
  }
  return t1 - t0 > 1e-9;
}

/**
 * Body objížďky vně obvodu – základ po `DETOUR_STEP_M`, `DETOUR_OFFSET_M` za vnějším okrajem.
 * Kde úsečka mezi sousedními body řízne stěnu (ostrý ohyb), vloží se bod doprostřed; půlí se
 * nejvýš na `DETOUR_MIN_STEP_M` (návrh Clauda 8. 11. 2026, hrubší objížďka po 10 m). Před každou
 * bránou (`gateAtM` – střed otvoru po obvodu) stojí bod vždy, aby se k ní dalo dojít přímo.
 */
function detourPoints(
  outline: FortOutline,
  walls: readonly Point[][],
  gateAtM: readonly number[],
): Point[] {
  const count = Math.max(4, Math.ceil(outline.lengthM / DETOUR_STEP_M));
  const step = outline.lengthM / count;
  const at = (s: number): Point | null => {
    const p = outlinePointAt(outline, s);
    const a = outlinePointAt(outline, s - DETOUR_MIN_STEP_M);
    const b = outlinePointAt(outline, s + DETOUR_MIN_STEP_M);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (!(len > 0)) return null;
    // ven = vlevo od směru po směru hodin
    return [p[0] - (dz / len) * DETOUR_OFFSET_M, p[1] + (dx / len) * DETOUR_OFFSET_M];
  };
  const cuts = (p: Point, q: Point): boolean => walls.some((w) => segmentCutsQuad(p, q, w));
  const out: Point[] = [];
  const refine = (s0: number, p0: Point, s1: number, p1: Point): void => {
    if (s1 - s0 <= DETOUR_MIN_STEP_M * 1.5 || !cuts(p0, p1)) return;
    const sm = (s0 + s1) / 2;
    const pm = at(sm);
    if (pm === null) return;
    refine(s0, p0, sm, pm);
    out.push(pm);
    refine(sm, pm, s1, p1);
  };
  const base: { s: number; p: Point }[] = [];
  for (let k = 0; k < count; k++) {
    const s = k * step;
    // bod těsně vedle brány by jen zdvojil bod před bránou
    if (gateAtM.some((g) => Math.abs(g - s) < DETOUR_MIN_STEP_M)) continue;
    const p = at(s);
    if (p !== null) base.push({ s, p });
  }
  for (const s of gateAtM) {
    const p = at(s);
    if (p !== null) base.push({ s, p });
  }
  base.sort((x, y) => x.s - y.s);
  for (let k = 0; k < base.length; k++) {
    const cur = base[k]!;
    const nxt = base[(k + 1) % base.length]!;
    out.push(cur.p);
    refine(cur.s, cur.p, k + 1 < base.length ? nxt.s : outline.lengthM, nxt.p);
  }
  return out;
}

/** Co stěny potřebují znát (`Fortification` ze stavu vsi). */
export interface WallFortification extends FortShapeSource {
  readonly segments: readonly {
    readonly index: number;
    readonly builtDay: number | null;
    readonly topBuiltDay?: number | null;
    readonly breachedDay?: number;
    readonly demolishedDay?: number;
    readonly demolishedBeforeGate?: number;
    readonly demolishedAfterGate?: number;
    readonly state?: number;
    readonly kind?: FortKind;
  }[];
  readonly gates: readonly FortGate[];
}

/** Stavba ve vsi, jak ji zná `fortRunningWork` (`Construction`). */
export type FortWorkRef = FortRunRef & { readonly kind: string };

/**
 * Práce staveb, které na opevnění `id` běží, po dílech (`fortRuns`), bez stavby null – staveniště
 * blokuje jen se stavbou (`segmentBlockKind`). Na opevnění smí běžet víc staveb, každá na svých
 * dílech (Martin 8. 11. 2026 – „B“).
 */
export function fortRunningWork(
  state: { readonly constructions: readonly FortWorkRef[] },
  id: number,
): FortRuns | null {
  return fortRuns(state.constructions, id);
}

/** Úsek, jak ho stěny potřebují znát. */
type WallSegment = WallFortification['segments'][number];

/**
 * Druh pásu, kterým úsek blokuje chůzi, vozy i stáda, nebo null – průchozí (fortifications.md –
 * Obvod; Martin 6. 11. 2026: „Ať celý obvod blokuje už od zahájení.“). `work` je práce staveb, které
 * na opevnění běží (`fortRunningWork` po dílech, nebo jedna práce pro celý obvod), bez stavby null.
 * Nehotový úsek blokuje jen při stavbě nebo vylepšení (staveniště) – po zrušení stavby je to
 * mezera; hotový, když stojí (`segmentStands`; zbořený díl je mezera). Vylepšení blokuje od zahájení
 * pásem cílové hradby (`runTarget`) – jen na dílech své stavby; nástavba valu pásem valu. Zbořený
 * díl, který vylepšení úseku staví znovu (`fortTarget`), blokuje pásem cílové hradby.
 */
export function segmentBlockKind(
  fort: Pick<WallFortification, 'kind'>,
  segment: WallSegment,
  work: FortBuildWork | FortRuns | null,
): FortKind | null {
  const run = runOn(work, segment.index);
  const target = runTarget(run);
  if (segment.breachedDay !== undefined || segment.demolishedDay !== undefined) {
    return segment.demolishedDay !== undefined && run?.target != null ? target : null;
  }
  if (!segmentBuilt(segment)) {
    if (run?.work === 'build') return fort.kind;
    return target;
  }
  if (!segmentStands(fort, segment)) return null;
  const kind = segmentKind(fort, segment);
  return target !== null && kind !== 'rampart' ? target : kind;
}

/** Blokující úseky opevnění – index a druh pásu (`segmentBlockKind`), v pořadí obvodu. */
export function fortBlockingSegments(
  fort: Pick<WallFortification, 'kind' | 'segments'>,
  work: FortBuildWork | FortRuns | null,
): { index: number; kind: FortKind; gone?: string }[] {
  return fort.segments.flatMap((s) => {
    const kind = segmentBlockKind(fort, s, work);
    if (kind === null) return [];
    // zbořená část dílu u brány mění stěny – dostane se do klíče (`fortLayoutKey`)
    const gone = `${s.demolishedBeforeGate === undefined ? '' : 'b'}${s.demolishedAfterGate === undefined ? '' : 'a'}`;
    return [{ index: s.index, kind, ...(gone === '' ? {} : { gone }) }];
  });
}

/**
 * Stěny opevnění: pás každého blokujícího úseku (`segmentBlockKind` – stojící úsek i staveniště
 * běžící stavby `work`) se šířkou druhu, jak bude postaven; brána vyřízne z pásu úseku kus pod svou
 * tětivou (`gateChord`) a otvor brány je čtyřúhelník tětiva × šířka pásu. Bez bodů nebo bez
 * blokujícího úseku – žádné stěny.
 */
export function fortWalls(
  geo: GridGeometry,
  fort: WallFortification,
  work: FortBuildWork | FortRuns | null = null,
): FortWalls {
  const blocking = fortBlockingSegments(fort, work);
  if (blocking.length === 0) return { walls: [], gates: [], detour: [] };
  const points = fortPointsOf(geo, fort);
  const outline = points ? fortificationOutline(points, fort.kind) : null;
  if (!outline) return { walls: [], gates: [], detour: [] };
  const shapes = fortSegments(outline);
  const walls: Point[][] = [];
  const gates: Point[][] = [];
  const gateAtM: number[] = [];
  for (const segment of blocking) {
    const shape = shapes[segment.index];
    if (!shape) continue;
    const band = FORTIFICATIONS.bandM[segment.kind];
    const gate = fort.gates.find((g) => g.segment === segment.index);
    if (!gate) {
      for (const p of bandPieces(outline, band, segment.index)) walls.push(p.corners);
      continue;
    }
    const chord = gateChord(outline, shape, gate);
    // část dílu zbořená se zbořeným sousedním úsekem je mezera, brána stojí (demolition.md)
    const part = fort.segments.find((x) => x.index === segment.index);
    if (part?.demolishedBeforeGate === undefined) {
      for (const p of bandPieces(outline, band, segment.index, -Infinity, chord.fromM)) {
        walls.push(p.corners);
      }
    }
    if (part?.demolishedAfterGate === undefined) {
      for (const p of bandPieces(outline, band, segment.index, chord.toM, Infinity)) {
        walls.push(p.corners);
      }
    }
    gateAtM.push((chord.fromM + chord.toM) / 2);
    const [ax, az] = chord.a;
    const [bx, bz] = chord.b;
    const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    if (!(len > 0)) continue;
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    gates.push([
      [ax, az],
      [bx, bz],
      [bx + nx * band, bz + nz * band],
      [ax + nx * band, az + nz * band],
    ]);
  }
  return { walls, gates, detour: detourPoints(outline, walls, gateAtM) };
}

/**
 * Dotýká se konvexní čtyřúhelník `quad` čtverce os se středem (x, z) a polovinou strany `half`?
 * Oddělující osy – osy čtverce a normály stran čtyřúhelníku; dotyk hranou se počítá. Buňka
 * mřížky (čtverec kolem středu), které se stěna dotkne, je neprůchodná – krok mezi středy
 * sousedních buněk (i úhlopříčný) tak stěnu nepřekročí, ani když je stěna užší než buňka.
 */
export function quadTouchesSquare(
  quad: readonly Point[],
  x: number,
  z: number,
  half: number,
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [px, pz] of quad) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  if (maxX < x - half || minX > x + half || maxZ < z - half || minZ > z + half) return false;
  for (let k = 0; k < quad.length; k++) {
    const p = quad[k]!;
    const q = quad[(k + 1) % quad.length]!;
    const nx = p[1] - q[1];
    const nz = q[0] - p[0];
    let lo = Infinity;
    let hi = -Infinity;
    for (const [px, pz] of quad) {
      const s = px * nx + pz * nz;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    const center = x * nx + z * nz;
    const reach = half * (Math.abs(nx) + Math.abs(nz));
    if (hi < center - reach || lo > center + reach) return false;
  }
  return true;
}

/** Leží bod uvnitř konvexního čtyřúhelníku (i na hraně)? Rohy po obvodu v libovolném směru. */
export function insideQuad(quad: readonly Point[], x: number, z: number): boolean {
  let sign = 0;
  for (let k = 0; k < quad.length; k++) {
    const p = quad[k]!;
    const q = quad[(k + 1) % quad.length]!;
    const cross = (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
