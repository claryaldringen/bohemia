import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import type { FortKind, FortTop } from '../types';
import { spanPieces } from './band';
import { fortPointsOf, type FortShapeSource } from './convert';
import { gatePartView, hasGateParts, type GatePart } from './gate-parts';
import { gateChord, type FortGate } from './gates';
import { segmentBuilt, segmentKind, segmentStands, segmentWall } from './life';
import { fortificationOutline, outlinePointAt, type FortOutline } from './outline';
import { fortSegments } from './segments';
import { fortRuns, partKey, runOn, runTarget, type FortRunRef, type FortRuns } from './runs';
import type { FortBuildWork, FortGatePart } from './types';

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
 * Nejširší val vně hradby (m) v dílu na poloze `s` obvodu a v obou sousedních dílech – bod
 * objížďky u konce dílu s valem vně tak neleží v jeho pásu.
 */
function outsideNear(outline: FortOutline, outBy: ReadonlyMap<number, number>, s: number): number {
  const count = outline.segmentStarts.length - 1;
  const total = outline.lengthM;
  const pos = ((s % total) + total) % total;
  let index = 0;
  while (index + 1 < count && outline.stations[outline.segmentStarts[index + 1]!]! <= pos) index++;
  let out = 0;
  for (const i of [index - 1, index, index + 1]) {
    out = Math.max(out, outBy.get(((i % count) + count) % count) ?? 0);
  }
  return out;
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
  outBy: ReadonlyMap<number, number> = new Map(),
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
    // ven = vlevo od směru po směru hodin; za valem vně hradby o jeho šířku dál
    const off = DETOUR_OFFSET_M + (outBy.size > 0 ? outsideNear(outline, outBy, s) : 0);
    return [p[0] - (dz / len) * off, p[1] + (dx / len) * off];
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
  /** Nástavba valu opevnění (šířka hradby na valu vně – `rampartOutside`). */
  readonly top?: FortTop;
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
    readonly beforeGate?: FortGatePart;
    readonly afterGate?: FortGatePart;
    readonly top?: FortTop | 'none';
    readonly rampartOutside?: true;
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
  part?: GatePart,
): FortKind | null {
  const run = runOn(work, segment.index, part);
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

/** Blokující úsek opevnění (`fortBlockingSegments`). */
export interface FortBlockingSegment {
  index: number;
  /** Druh pásu (`segmentBlockKind`; u dílu s branou pás otvoru brány). */
  kind: FortKind;
  /** Zbořené části dílu s branou (`b` před bránou, `a` za ní); chybí – obě stojí. */
  gone?: string;
  /**
   * Val doplněný vně hradby (fortifications.md – Hradby a obrana, Druhy): pás od `outM` vně křivky
   * po `inM` dovnitř (m); chybí – pás druhu dovnitř od křivky.
   */
  outside?: { outM: number; inM: number };
  /**
   * Pás kusů dílu s branou, které mají vlastní hradbu nebo vlastní práci (`gatePartView`; null –
   * kus neblokuje); chybí – kusy podle dílu a zboření kusů (hradba je hradba, brána je brána).
   */
  parts?: { before: FortPartBand | null; after: FortPartBand | null };
}

/** Pás kusu dílu s branou – druh a val vně hradby (`FortBlockingSegment.parts`). */
export interface FortPartBand {
  kind: FortKind;
  outside?: { outM: number; inM: number };
}

/**
 * Pás valu vně hradby (`rampartOutside`): 7 m ven a dovnitř šířka hradby, nejméně 3 m – při
 * vylepšení cílové hradby (`segmentBand`, `bandWidthOf`); jinak null. `part` – práce kusu dílu
 * s branou.
 */
function outsideSpan(
  fort: Pick<WallFortification, 'kind' | 'top'>,
  segment: WallSegment,
  work: FortBuildWork | FortRuns | null,
  part?: GatePart,
): { outM: number; inM: number } | null {
  if (!segment.rampartOutside || segmentKind(fort, segment) !== 'rampart') return null;
  const target = runTarget(runOn(work, segment.index, part));
  const wall = target ?? segmentWall(fort, segment)?.kind ?? null;
  const out = FORTIFICATIONS.rampartOutside;
  return { outM: out.outM, inM: Math.max(wall ? FORTIFICATIONS.bandM[wall] : 0, out.minInM) };
}

/** Má díl s branou kus s vlastní hradbou nebo s vlastní prací stavby? */
function ownParts(segment: WallSegment, work: FortBuildWork | FortRuns | null): boolean {
  if (hasGateParts(segment)) return true;
  if (work === null || typeof work === 'string') return false;
  return (
    work.byPart.has(partKey(segment.index, 'before')) ||
    work.byPart.has(partKey(segment.index, 'after'))
  );
}

/** Pás kusu `part` dílu s branou (`gatePartView`), nebo null – kus neblokuje. */
function partBand(
  fort: Pick<WallFortification, 'kind' | 'top'>,
  segment: WallSegment,
  work: FortBuildWork | FortRuns | null,
  part: GatePart,
): FortPartBand | null {
  const view = gatePartView(segment, part);
  const kind = segmentBlockKind(fort, view, work, part);
  if (kind === null) return null;
  const outside = kind === 'rampart' ? outsideSpan(fort, view, work, part) : null;
  return { kind, ...(outside ? { outside } : {}) };
}

/**
 * Blokující úseky opevnění – index a druh pásu (`segmentBlockKind`), v pořadí obvodu. Díl s branou,
 * jehož kus má vlastní hradbu či práci, blokuje po kusech (`parts`) – kus hradby úseku mezi okraji
 * bran (Martin 8. 11. 2026: „Hradba je hradba, brána je brána.“).
 */
export function fortBlockingSegments(
  fort: Pick<WallFortification, 'kind' | 'top' | 'segments'>,
  work: FortBuildWork | FortRuns | null,
): FortBlockingSegment[] {
  return fort.segments.flatMap((s) => {
    let kind = segmentBlockKind(fort, s, work);
    let parts: FortBlockingSegment['parts'];
    if (ownParts(s, work)) {
      parts = {
        before: partBand(fort, s, work, 'before'),
        after: partBand(fort, s, work, 'after'),
      };
      kind ??= parts.before?.kind ?? parts.after?.kind ?? null;
    }
    if (kind === null) return [];
    // zbořená část dílu u brány mění stěny – dostane se do klíče (`fortLayoutKey`)
    const gone = `${s.demolishedBeforeGate === undefined ? '' : 'b'}${s.demolishedAfterGate === undefined ? '' : 'a'}`;
    const outside = kind === 'rampart' ? outsideSpan(fort, s, work) : null;
    return [
      {
        index: s.index,
        kind,
        ...(gone === '' ? {} : { gone }),
        ...(outside ? { outside } : {}),
        ...(parts ? { parts } : {}),
      },
    ];
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
  // val vně hradby posune vnější okraj pásu ven – objížďka ho obejde (`detourPoints`)
  const outBy = new Map<number, number>();
  for (const segment of blocking) {
    const shape = shapes[segment.index];
    if (!shape) continue;
    // pás od křivky dovnitř (druh), nebo val vně hradby od `outM` vně po `inM` dovnitř
    const outM = segment.outside?.outM ?? 0;
    const band = segment.outside?.inM ?? FORTIFICATIONS.bandM[segment.kind];
    if (outM > 0) outBy.set(segment.index, outM);
    const gate = fort.gates.find((g) => g.segment === segment.index);
    if (!gate) {
      for (const p of spanPieces(outline, -outM, band, segment.index)) walls.push(p.corners);
      continue;
    }
    const chord = gateChord(outline, shape, gate);
    // část dílu zbořená se zbořeným sousedním úsekem je mezera, brána stojí (demolition.md);
    // kus s vlastní hradbou má pás svého druhu (`FortBlockingSegment.parts`)
    const part = fort.segments.find((x) => x.index === segment.index);
    // kus s vlastní hradbou má pás svého druhu a valu (`FortBlockingSegment.parts`)
    const whole = { outM, inM: band };
    const spanOf = (p: FortPartBand | null): { outM: number; inM: number } | null =>
      p === null
        ? null
        : { outM: p.outside?.outM ?? 0, inM: p.outside?.inM ?? FORTIFICATIONS.bandM[p.kind] };
    const before = segment.parts
      ? spanOf(segment.parts.before)
      : part?.demolishedBeforeGate === undefined
        ? whole
        : null;
    const after = segment.parts
      ? spanOf(segment.parts.after)
      : part?.demolishedAfterGate === undefined
        ? whole
        : null;
    const partOut = Math.max(before?.outM ?? 0, after?.outM ?? 0);
    if (partOut > outM) outBy.set(segment.index, partOut);
    if (before !== null) {
      const at = spanPieces(
        outline,
        -before.outM,
        before.inM,
        segment.index,
        -Infinity,
        chord.fromM,
      );
      for (const p of at) walls.push(p.corners);
    }
    if (after !== null) {
      for (const p of spanPieces(
        outline,
        -after.outM,
        after.inM,
        segment.index,
        chord.toM,
        Infinity,
      )) {
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
    if (outM > 0) {
      // otvor brány přes celý pás i s valem vně (hráz přes příkop)
      gates.push([
        [ax - nx * outM, az - nz * outM],
        [bx - nx * outM, bz - nz * outM],
        [bx + nx * band, bz + nz * band],
        [ax + nx * band, az + nz * band],
      ]);
      continue;
    }
    gates.push([
      [ax, az],
      [bx, bz],
      [bx + nx * band, bz + nz * band],
      [ax + nx * band, az + nz * band],
    ]);
  }
  return { walls, gates, detour: detourPoints(outline, walls, gateAtM, outBy) };
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
