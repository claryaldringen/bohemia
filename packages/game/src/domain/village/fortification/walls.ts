import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import type { FortKind } from '../types';
import { bandPieces } from './band';
import { fortPointsOf, type FortShapeSource } from './convert';
import { gateChord, type FortGate } from './gates';
import { segmentStands } from './life';
import { fortificationOutline, outlinePointAt, type FortOutline } from './outline';
import { fortSegments } from './segments';
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
   * Body objížďky vně hladkého obvodu (po ≈ 5 m, 1 m za vnějším okrajem) – chůze kolem stěny
   * (`wallDetour`); obvod nemá ostré rohy, kolem kterých by se objížďka lámala.
   */
  detour: Point[];
}

/** Rozestup a odstup bodů objížďky vně obvodu (m). */
const DETOUR_STEP_M = 5;
const DETOUR_OFFSET_M = 1;

/** Body objížďky vně obvodu – po `DETOUR_STEP_M`, `DETOUR_OFFSET_M` za vnějším okrajem. */
function detourPoints(outline: FortOutline): Point[] {
  const count = Math.max(4, Math.ceil(outline.lengthM / DETOUR_STEP_M));
  const step = outline.lengthM / count;
  const out: Point[] = [];
  for (let k = 0; k < count; k++) {
    const s = k * step;
    const p = outlinePointAt(outline, s);
    const a = outlinePointAt(outline, s - step / 4);
    const b = outlinePointAt(outline, s + step / 4);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (!(len > 0)) continue;
    // ven = vlevo od směru po směru hodin
    out.push([p[0] - (dz / len) * DETOUR_OFFSET_M, p[1] + (dx / len) * DETOUR_OFFSET_M]);
  }
  return out;
}

/** Co stěny potřebují znát (`Fortification` ze stavu vsi). */
export interface WallFortification extends FortShapeSource {
  readonly segments: readonly {
    readonly index: number;
    readonly builtDay: number | null;
    readonly breachedDay?: number;
    readonly state?: number;
    readonly kind?: FortKind;
  }[];
  readonly gates: readonly FortGate[];
}

/** Stavba ve vsi, jak ji zná `fortRunningWork` (`Construction`). */
export interface FortWorkRef {
  readonly kind: string;
  readonly fortificationId?: number;
  readonly fortWork?: FortBuildWork;
}

/**
 * Práce stavby, která na opevnění `id` běží (`Construction.fortWork`, starší stavby bez údaje
 * stavějí), bez stavby null – staveniště blokuje jen s ní (`segmentBlockKind`).
 */
export function fortRunningWork(
  state: { readonly constructions: readonly FortWorkRef[] },
  id: number,
): FortBuildWork | null {
  const c = state.constructions.find((x) => x.kind === 'fortification' && x.fortificationId === id);
  return c ? (c.fortWork ?? 'build') : null;
}

/** Úsek, jak ho stěny potřebují znát. */
type WallSegment = WallFortification['segments'][number];

/**
 * Druh pásu, kterým úsek blokuje chůzi, vozy i stáda, nebo null – průchozí (fortifications.md –
 * Obvod; Martin 6. 11. 2026: „Ať celý obvod blokuje už od zahájení.“). `work` je práce stavby, která
 * na opevnění běží (`Construction.fortWork`), bez stavby null. Nehotový úsek blokuje jen při stavbě
 * nebo vylepšení (staveniště) – po zrušení stavby je to mezera; hotový, když stojí
 * (`segmentStands`). Vylepšení plotu na palisádu blokuje od zahájení pásem palisády.
 */
export function segmentBlockKind(
  fort: Pick<WallFortification, 'kind'>,
  segment: WallSegment,
  work: FortBuildWork | null,
): FortKind | null {
  if (segment.breachedDay !== undefined) return null;
  const upgrade = work === 'upgrade';
  if (segment.builtDay === null) {
    if (work !== 'build' && !upgrade) return null;
    return upgrade ? 'palisade' : fort.kind;
  }
  if (!segmentStands(fort, segment)) return null;
  return upgrade ? 'palisade' : (segment.kind ?? fort.kind);
}

/** Blokující úseky opevnění – index a druh pásu (`segmentBlockKind`), v pořadí obvodu. */
export function fortBlockingSegments(
  fort: Pick<WallFortification, 'kind' | 'segments'>,
  work: FortBuildWork | null,
): { index: number; kind: FortKind }[] {
  return fort.segments.flatMap((s) => {
    const kind = segmentBlockKind(fort, s, work);
    return kind === null ? [] : [{ index: s.index, kind }];
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
  work: FortBuildWork | null = null,
): FortWalls {
  const blocking = fortBlockingSegments(fort, work);
  if (blocking.length === 0) return { walls: [], gates: [], detour: [] };
  const points = fortPointsOf(geo, fort);
  const outline = points ? fortificationOutline(points, fort.kind) : null;
  if (!outline) return { walls: [], gates: [], detour: [] };
  const shapes = fortSegments(outline);
  const walls: Point[][] = [];
  const gates: Point[][] = [];
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
    for (const p of bandPieces(outline, band, segment.index, -Infinity, chord.fromM)) {
      walls.push(p.corners);
    }
    for (const p of bandPieces(outline, band, segment.index, chord.toM, Infinity)) {
      walls.push(p.corners);
    }
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
  return { walls, gates, detour: detourPoints(outline) };
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
