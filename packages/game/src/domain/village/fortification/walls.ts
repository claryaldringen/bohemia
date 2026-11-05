import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import type { FortKind, SquareGrid, TileCell } from '../types';
import { fortBandPieces } from './band';
import type { FortGate } from './gates';
import { fortificationArea, fortificationOutline, type FortOutline } from './outline';

// Stěny opevnění pro síť cest (fortifications.md – Brány, Pro implementaci – Chůze a cesty): pás
// stojících úseků jako obdélníky (`fortBandPieces`) bez otvorů bran – chodec, vůz ani stádo pásem
// neprojde, jen branou. Rozestavěný úsek (staveniště), mezera po zrušené stavbě a průlom stojící
// nejsou – jsou průchozí. Server i prohlížeč počítají stěny touto funkcí (jen sčítání a násobení).

/** Stěny a brány opevnění ve světě – podklad mřížek chodců a vozů (`PathVillage.fortifications`). */
export interface FortWalls {
  /** Pás stojících úseků bez otvorů bran – konvexní čtyřúhelníky (rohy po obvodu). */
  walls: Point[][];
  /** Otvory bran ve stojících úsecích – obdélník brány přes celou šířku pásu. */
  gates: Point[][];
}

/** Co stěny potřebují znát (`Fortification` ze stavu vsi). */
export interface WallFortification {
  readonly grid: SquareGrid | null;
  readonly cells: readonly TileCell[];
  readonly kind: FortKind;
  readonly segments: readonly {
    readonly index: number;
    readonly builtDay: number | null;
    readonly breachedDay?: number;
    readonly kind?: FortKind;
  }[];
  readonly gates: readonly FortGate[];
}

/** Bod úsečky a → b v poměru t. */
function lerp(a: Point, b: Point, t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Stěny opevnění: pás každého stojícího úseku (hotový, neprolomený – `builtDay` a bez
 * `breachedDay`) se šířkou druhu, který na úseku stojí (rozdělané vylepšení na palisádu); brána
 * vyřízne z pásu strany obdélník šířky brány (`FORTIFICATIONS.gate.widthM`) kolem svého středu.
 * Plocha mimo mřížku nebo bez stojícího úseku – žádné stěny.
 */
export function fortWalls(geo: GridGeometry, fort: WallFortification): FortWalls {
  const area = fortificationArea(fort.cells, fort.grid, geo);
  if ('error' in area) return { walls: [], gates: [] };
  const standing = fort.segments.filter((s) => s.builtDay !== null && s.breachedDay === undefined);
  if (standing.length === 0) return { walls: [], gates: [] };
  // tvar podle druhu opevnění – poloha bran (`offsetM`) se měří od začátku jeho rovné části
  const outline = fortificationOutline(area, fort.kind);
  const outlines = new Map<FortKind, FortOutline>([[fort.kind, outline]]);
  const outlineFor = (kind: FortKind): FortOutline => {
    let known = outlines.get(kind);
    if (!known) {
      known = fortificationOutline(area, kind);
      outlines.set(kind, known);
    }
    return known;
  };
  const size = area.geo.cellSizeM;
  const sides = outline.sides;
  const half = FORTIFICATIONS.gate.widthM / 2;
  const walls: Point[][] = [];
  const gates: Point[][] = [];
  for (const segment of standing) {
    const index = segment.index;
    const prev = sides[(index + sides.length - 1) % sides.length];
    if (!prev || !sides[index]) continue;
    const pieces = fortBandPieces(outlineFor(segment.kind ?? fort.kind)).filter(
      (p) => p.index === index,
    );
    const gate = fort.gates.find((g) => g.segment === index);
    pieces.forEach((piece, k) => {
      // první kus je pás strany (rohy A, B na vnějším okraji, C, D na vnitřním), další roh tvaru L
      if (k > 0 || !gate) {
        walls.push(piece.corners);
        return;
      }
      const [a, b, c, d] = piece.corners as [Point, Point, Point, Point];
      const at = prev.endRadius + gate.offsetM;
      const t0 = Math.max(0, (at - half) / size);
      const t1 = Math.min(1, (at + half) / size);
      if (t0 > 0) walls.push([a, lerp(a, b, t0), lerp(d, c, t0), d]);
      if (t1 < 1) walls.push([lerp(a, b, t1), b, c, lerp(d, c, t1)]);
      gates.push([lerp(a, b, t0), lerp(a, b, t1), lerp(d, c, t1), lerp(d, c, t0)]);
    });
  }
  return { walls, gates };
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
