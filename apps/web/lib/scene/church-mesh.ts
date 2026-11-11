// Model kostela jako sítě bez Babylonu (churches.md – Scéna): zdi jako tlusté stěny kolem částí
// z `churchParts` (jádro), střechy podle druhu části (sedlová, kuželová, koncha, pultová),
// okna a vchod jako tmavé obdélníky s obloukem těsně před vnější plochou zdi a lešení z tyčí.
// Místní souřadnice jako v jádře: x = osa vstup → kněžiště, z = napříč, y = nahoru; y = 0 je
// terén pod kostelem. Rozměry se nikde nedefinují znovu – vše se odvozuje z `parts`.
import type { ChurchPart } from '@bohemia/game';

/** Pole vrcholů sítě: polohy, normály, barvy (RGBA), UV a trojúhelníky. */
export interface ChurchMeshArrays {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

export interface ChurchMeshData {
  /** Zdi a štíty (omítka nebo holý kámen podle výzdoby). */
  walls: ChurchMeshArrays;
  roofs: ChurchMeshArrays;
  /** Okna a vchod – tmavé obdélníky s obloukem na vnější ploše zdi. */
  openings: ChurchMeshArrays;
}

/** Postup stavby po fázích (0–1): základy, zdi, střecha, výzdoba. */
export interface ChurchProgress {
  foundation: number;
  walls: number;
  roof: number;
  decor: number;
}

/** Základy vyčnívají nad terén (m). */
export const FOUNDATION_LIFT_M = 0.3;
/** Zdi sahají pod terén, aby na svahu nevisely (m). */
const SKIRT_M = 1.5;
/** Přesah střechy přes zeď (m). */
const EAVE_M = 0.25;
/** Počet úseků kruhu a půlkruhu (jako v jádře: `CIRCLE_SEGMENTS`). */
const CIRCLE_N = 24;
const HALF_N = 12;
/** Rozestup oken po obvodu lodi (m). */
const WINDOW_SPACING_M = 3;
const WINDOW_W = 0.5;
const WINDOW_H = 0.9;
const DOOR_W = 1.3;
const DOOR_H = 2.2;
/** Odsazení tmavého obdélníku před zeď (m). */
const OPENING_LIFT_M = 0.03;
/** Okna lodi začínají v horní třetině výšky zdi. */
const WINDOW_SILL_OF_WALL = 0.64;
const ARCH_SEGMENTS = 6;

const PLASTER: readonly number[] = [0.93, 0.9, 0.82, 1];
const BARE_STONE: readonly number[] = [0.5, 0.45, 0.4, 1];
const SHINGLE: readonly number[] = [0.42, 0.31, 0.21, 1];
const DARK: readonly number[] = [0.05, 0.045, 0.045, 1];
const TIMBER: readonly number[] = [0.5, 0.38, 0.24, 1];

type V3 = readonly [number, number, number];
type Pt = { x: number; z: number };

function emptyArrays(): ChurchMeshArrays {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Počet trojúhelníků sítě. */
export function triangleCount(arrays: ChurchMeshArrays): number {
  return arrays.indices.length / 3;
}

/** Pomocník skládání sítě – vrcholy s vlastní normálou, barvou a UV. */
class Builder {
  constructor(readonly a: ChurchMeshArrays) {}

  vertex(p: V3, n: V3, color: readonly number[], u: number, v: number): number {
    const i = this.a.positions.length / 3;
    this.a.positions.push(p[0], p[1], p[2]);
    this.a.normals.push(n[0], n[1], n[2]);
    this.a.colors.push(color[0]!, color[1]!, color[2]!, color[3]!);
    this.a.uvs.push(u, v);
    return i;
  }

  tri(i: number, j: number, k: number): void {
    this.a.indices.push(i, j, k);
  }

  /** Trojúhelník s pořadím vrcholů opraveným podle normály vrcholu `i`. */
  triFacing(i: number, j: number, k: number): void {
    const pos = this.a.positions;
    const P = (v: number): number[] => [pos[3 * v]!, pos[3 * v + 1]!, pos[3 * v + 2]!];
    const [p0, p1, p2] = [P(i), P(j), P(k)] as [number[], number[], number[]];
    const u = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!];
    const v = [p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!];
    const g = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const n = this.a.normals;
    const dot = g[0]! * n[3 * i]! + g[1]! * n[3 * i + 1]! + g[2]! * n[3 * i + 2]!;
    if (dot >= 0) this.tri(i, j, k);
    else this.tri(i, k, j);
  }

  /** Čtyřúhelník s pořadím vrcholů opraveným podle normály `n`. */
  quadFacing(p: readonly [V3, V3, V3, V3], n: V3, color: readonly number[]): void {
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const g = u[1]! * v[2]! - u[2]! * v[1]!;
    const h = u[2]! * v[0]! - u[0]! * v[2]!;
    const k = u[0]! * v[1]! - u[1]! * v[0]!;
    const same = g * n[0] + h * n[1] + k * n[2] >= 0;
    this.quad(same ? p : [p[3], p[2], p[1], p[0]], n, color, 1);
  }

  /** Čtyřúhelník; pořadí vrcholů je proti směru hodin při pohledu proti normále `n`. */
  quad(p: readonly [V3, V3, V3, V3], n: V3, color: readonly number[], uv: number): void {
    const i = this.vertex(p[0], n, color, 0, 0);
    this.vertex(p[1], n, color, uv, 0);
    this.vertex(p[2], n, color, uv, uv);
    this.vertex(p[3], n, color, 0, uv);
    this.tri(i, i + 1, i + 2);
    this.tri(i, i + 2, i + 3);
  }
}

/** Barva omítnuté a holé zdi podle výšky a postupu výzdoby (omítka roste odspodu). */
function wallColor(y: number, top: number, decor: number): readonly number[] {
  if (decor >= 1) return PLASTER;
  if (decor <= 0) return BARE_STONE;
  return y / Math.max(top, 0.001) <= decor ? PLASTER : BARE_STONE;
}

/** Obrys částí: vnější a vnitřní lomená čára (proti směru hodin v rovině x–z), kruh uzavřený. */
interface Ring {
  outer: Pt[];
  inner: Pt[];
  closed: boolean;
  smooth: boolean;
  /** Střed kruhu pro hladké normály. */
  center: Pt;
}

function arcPoints(cx: number, cz: number, r: number, from: number, to: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return out;
}

function ringOf(part: ChurchPart, t: number): Ring {
  const s = part.shape;
  if (s.kind === 'rect') {
    const box = (e: number): Pt[] => [
      { x: s.cx - s.length / 2 - e, z: s.cz - s.width / 2 - e },
      { x: s.cx + s.length / 2 + e, z: s.cz - s.width / 2 - e },
      { x: s.cx + s.length / 2 + e, z: s.cz + s.width / 2 + e },
      { x: s.cx - s.length / 2 - e, z: s.cz + s.width / 2 + e },
    ];
    return {
      outer: box(t),
      inner: box(0),
      closed: true,
      smooth: false,
      center: { x: s.cx, z: s.cz },
    };
  }
  const center = { x: s.cx, z: s.cz };
  if (s.kind === 'circle') {
    const full = (r: number): Pt[] =>
      arcPoints(s.cx, s.cz, r, 0, 2 * Math.PI, CIRCLE_N).slice(0, CIRCLE_N);
    return { outer: full(s.r + t), inner: full(s.r), closed: true, smooth: true, center };
  }
  const from = s.facing === 1 ? -Math.PI / 2 : Math.PI / 2;
  const to = s.facing === 1 ? Math.PI / 2 : (3 * Math.PI) / 2;
  return {
    outer: arcPoints(s.cx, s.cz, s.r + t, from, to, HALF_N),
    inner: arcPoints(s.cx, s.cz, s.r, from, to, HALF_N),
    closed: false,
    smooth: true,
    center,
  };
}

/** Vnější normála hrany obrysu proti směru hodin. */
function edgeNormal(p: Pt, q: Pt): V3 {
  return norm([q.z - p.z, 0, -(q.x - p.x)]);
}

/** Svislá stěna mezi dvěma body od `y0` do `y1`; `n0`/`n1` normály konců (hladké stínování). */
function wallFace(
  b: Builder,
  p: Pt,
  q: Pt,
  n0: V3,
  n1: V3,
  y0: number,
  y1: number,
  top: number,
  decor: number,
  flip: boolean,
): void {
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  const c0 = wallColor(y0, top, decor);
  const c1 = wallColor(y1, top, decor);
  const a = b.vertex([p.x, y0, p.z], n0, c0, 0, y0 / 2);
  const bb = b.vertex([q.x, y0, q.z], n1, c0, len / 2, y0 / 2);
  const c = b.vertex([q.x, y1, q.z], n1, c1, len / 2, y1 / 2);
  const d = b.vertex([p.x, y1, p.z], n0, c1, 0, y1 / 2);
  // vnější plocha: p → q je proti směru hodin shora, takže spodní hrana vlevo → vpravo
  // vidí zvenčí `(p,q,top q)` proti směru hodin
  if (flip) {
    b.tri(a, c, bb);
    b.tri(a, d, c);
  } else {
    b.tri(a, bb, c);
    b.tri(a, c, d);
  }
}

/** Zeď části – vnější a vnitřní plocha a koruna zdi; výška `top` je horní hrana. */
function wallBand(b: Builder, ring: Ring, bottom: number, top: number, decor: number): void {
  const count = ring.closed ? ring.outer.length : ring.outer.length - 1;
  const radial = (p: Pt, sign: number): V3 =>
    norm([sign * (p.x - ring.center.x), 0, sign * (p.z - ring.center.z)]);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % ring.outer.length;
    const o0 = ring.outer[i]!;
    const o1 = ring.outer[j]!;
    const i0 = ring.inner[i]!;
    const i1 = ring.inner[j]!;
    const nf = edgeNormal(o0, o1);
    const out0 = ring.smooth ? radial(o0, 1) : nf;
    const out1 = ring.smooth ? radial(o1, 1) : nf;
    wallFace(b, o0, o1, out0, out1, bottom, top, top, decor, true);
    const inn0 = ring.smooth ? radial(i0, -1) : ([-nf[0], 0, -nf[2]] as V3);
    const inn1 = ring.smooth ? radial(i1, -1) : ([-nf[0], 0, -nf[2]] as V3);
    wallFace(b, i1, i0, inn1, inn0, bottom, top, top, decor, true);
    // koruna zdi
    b.quad(
      [
        [i0.x, top, i0.z],
        [i1.x, top, i1.z],
        [o1.x, top, o1.z],
        [o0.x, top, o0.z],
      ],
      [0, 1, 0],
      wallColor(top, top, decor),
      1,
    );
  }
  if (!ring.closed) {
    // čela otevřeného půlkruhu (u lodi) – rovina x = střed, normála k otevřené straně
    const last = ring.outer.length - 1;
    const mid = ring.outer[last >> 1]!;
    const nn = norm([ring.center.x - mid.x, 0, 0]);
    const col = wallColor(top, top, decor);
    for (const idx of [0, last]) {
      const o = ring.outer[idx]!;
      const n = ring.inner[idx]!;
      b.quadFacing(
        [
          [o.x, bottom, o.z],
          [n.x, bottom, n.z],
          [n.x, top, n.z],
          [o.x, top, o.z],
        ],
        nn,
        col,
      );
    }
  }
}

/** Střecha jednoho druhu; `q` = hotová část 0–1. Štíty přidává do `walls`. */
function roofOf(
  part: ChurchPart,
  t: number,
  top: number,
  q: number,
  naveSill: number,
  walls: Builder,
  roofs: Builder,
  decor: number,
): void {
  const s = part.shape;
  const ov = EAVE_M;
  if (part.roof === 'none' || q <= 0) return;
  if (part.roof === 'gable' && s.kind === 'rect') {
    const x0 = s.cx - s.length / 2 - t;
    const x1 = s.cx + s.length / 2 + t;
    const xe = x0 + (x1 - x0) * Math.min(1, q);
    const hw = s.width / 2 + t;
    const yE = top - ov;
    const yR = yE + hw + ov;
    const zN = s.cz - hw - ov;
    const zS = s.cz + hw + ov;
    const nN = norm([0, 1, -1]);
    const nS = norm([0, 1, 1]);
    roofs.quad(
      [
        [x0, yR, s.cz],
        [xe, yR, s.cz],
        [xe, yE, zN],
        [x0, yE, zN],
      ],
      nN,
      SHINGLE,
      3,
    );
    roofs.quad(
      [
        [xe, yR, s.cz],
        [x0, yR, s.cz],
        [x0, yE, zS],
        [xe, yE, zS],
      ],
      nS,
      SHINGLE,
      3,
    );
    // štíty (zeď) na západním konci hned, na východním s dokončenou střechou
    const gable = (x: number, nx: number): void => {
      const n: V3 = [nx, 0, 0];
      const c = wallColor(top, top, decor);
      const i = walls.vertex([x, top, s.cz - hw], n, c, 0, 0);
      const j = walls.vertex([x, top, s.cz + hw], n, c, hw, 0);
      const k = walls.vertex([x, yR - ov, s.cz], n, c, hw / 2, hw / 2);
      walls.triFacing(i, j, k);
    };
    gable(x0, -1);
    if (q >= 1) gable(x1, 1);
    return;
  }
  if (part.roof === 'lean' && s.kind === 'rect') {
    const x0 = s.cx - s.length / 2 - t;
    const x1 = s.cx + s.length / 2 + t;
    const xe = x0 + (x1 - x0) * Math.min(1, q);
    const side = s.cz > 0 ? 1 : -1;
    const hw = s.width / 2 + t;
    const zLow = s.cz + side * (hw + ov);
    const zHigh = s.cz - side * hw;
    const yLow = top - ov;
    const run = hw * 2 + ov;
    const yHigh = Math.min(yLow + run, Math.max(top + 0.3, naveSill - 0.2));
    const n = norm([0, run, side * (yHigh - yLow)]);
    const p: [V3, V3, V3, V3] = [
      [x0, yLow, zLow],
      [xe, yLow, zLow],
      [xe, yHigh, zHigh],
      [x0, yHigh, zHigh],
    ];
    roofs.quad(side > 0 ? p : [p[1], p[0], p[3], p[2]], n, SHINGLE, 3);
    const end = (x: number, nx: number): void => {
      const nn: V3 = [nx, 0, 0];
      const c = wallColor(top, top, decor);
      const a = walls.vertex([x, top, zLow - side * ov], nn, c, 0, 0);
      const b2 = walls.vertex([x, top, zHigh], nn, c, hw, 0);
      const d = walls.vertex([x, yHigh, zHigh], nn, c, hw, hw);
      walls.triFacing(a, b2, d);
    };
    end(x0, -1);
    if (q >= 1) end(x1, 1);
    return;
  }
  if (
    (part.roof === 'cone' && s.kind === 'circle') ||
    (part.roof === 'halfCone' && s.kind === 'half')
  ) {
    const full = s.kind === 'circle';
    const n = full ? CIRCLE_N : HALF_N;
    const from = full ? 0 : s.facing === 1 ? -Math.PI / 2 : Math.PI / 2;
    const span = full ? 2 * Math.PI : Math.PI;
    const R = s.r + t + ov;
    const yB = top - ov;
    const apex: V3 = [s.cx, yB + R, s.cz];
    const covered = Math.min(n, Math.ceil(q * n));
    const ang = (i: number): number => from + (span * i) / n;
    const base = (i: number): V3 => [s.cx + R * Math.cos(ang(i)), yB, s.cz + R * Math.sin(ang(i))];
    const slope = (a: number): V3 => norm([Math.cos(a), 1, Math.sin(a)]);
    for (let i = 0; i < covered; i++) {
      const a0 = roofs.vertex(base(i), slope(ang(i)), SHINGLE, 0, 0);
      const a1 = roofs.vertex(base(i + 1), slope(ang(i + 1)), SHINGLE, 1, 0);
      const ap = roofs.vertex(apex, slope(ang(i) + span / n / 2), SHINGLE, 0.5, 1);
      roofs.tri(a0, ap, a1);
    }
    if (!full && covered === n) {
      // svislá řezná plocha koncha u zdi lodi
      const nx = s.facing === 1 ? -1 : 1;
      const c0 = roofs.vertex(base(0), [nx, 0, 0], SHINGLE, 0, 0);
      const c1 = roofs.vertex(base(n), [nx, 0, 0], SHINGLE, 1, 0);
      const ap = roofs.vertex(apex, [nx, 0, 0], SHINGLE, 0.5, 1);
      if (s.facing === 1) roofs.tri(c0, c1, ap);
      else roofs.tri(c0, ap, c1);
    }
  }
}

/** Tmavý obdélník s půlkruhovým obloukem na vnější ploše zdi. */
function opening(b: Builder, at: Pt, outward: Pt, yBase: number, w: number, h: number): void {
  const nx = outward.x;
  const nz = outward.z;
  const tx = -nz;
  const tz = nx;
  const px = at.x + nx * OPENING_LIFT_M;
  const pz = at.z + nz * OPENING_LIFT_M;
  const n: V3 = [nx, 0, nz];
  const hw = w / 2;
  const rectTop = yBase + h - hw;
  const pt = (s: number, y: number): V3 => [px + tx * s, y, pz + tz * s];
  const a = b.vertex(pt(-hw, yBase), n, DARK, 0, 0);
  const c = b.vertex(pt(hw, yBase), n, DARK, 1, 0);
  const d = b.vertex(pt(hw, rectTop), n, DARK, 1, 1);
  const e = b.vertex(pt(-hw, rectTop), n, DARK, 0, 1);
  // pohled zvenčí: tangenta `t = (-nz, nx)` míří doprava při pohledu proti normále
  b.tri(a, d, c);
  b.tri(a, e, d);
  const centre = b.vertex(pt(0, rectTop), n, DARK, 0.5, 1);
  let prev = e;
  for (let i = 1; i <= ARCH_SEGMENTS; i++) {
    const ang = Math.PI - (Math.PI * i) / ARCH_SEGMENTS;
    const v = b.vertex(pt(hw * Math.cos(ang), rectTop + hw * Math.sin(ang)), n, DARK, 0.5, 1);
    b.tri(centre, prev, v);
    prev = v;
  }
}

/** Polohy oken a vchodu na vnější ploše zdí lodi (vnější bod, směr ven, střed oken). */
function windowSpots(part: ChurchPart, t: number): { at: Pt; out: Pt }[] {
  const s = part.shape;
  const spots: { at: Pt; out: Pt }[] = [];
  if (s.kind === 'rect') {
    const count = Math.max(1, Math.floor(s.length / WINDOW_SPACING_M));
    for (let i = 0; i < count; i++) {
      const x = s.cx - s.length / 2 + ((i + 0.5) * s.length) / count;
      spots.push({ at: { x, z: s.cz - s.width / 2 - t }, out: { x: 0, z: -1 } });
      spots.push({ at: { x, z: s.cz + s.width / 2 + t }, out: { x: 0, z: 1 } });
    }
  } else if (s.kind === 'circle') {
    const count = Math.max(4, Math.floor((2 * Math.PI * (s.r + t)) / WINDOW_SPACING_M));
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / count;
      // východ a západ zabírají apsidy
      if (Math.abs(Math.cos(a)) > 0.8) continue;
      spots.push({
        at: { x: s.cx + (s.r + t) * Math.cos(a), z: s.cz + (s.r + t) * Math.sin(a) },
        out: { x: Math.cos(a), z: Math.sin(a) },
      });
    }
  }
  return spots;
}

type Thickness = number | ((height: number) => number);

/**
 * Sítě kostela z částí jádra (`churchParts`) a postupu stavby. Zdi rostou s `walls` od základů
 * (`foundation` zvedá sokl 0,3 m nad terén), střechy jsou až od `roof > 0` a rostou po délce
 * (sedlová, pultová) nebo po úsecích kruhu (kuželová, koncha), okna a vchod se ukážou, až zeď
 * dosáhne jejich horní hrany, omítka (`decor`) roste od paty. `thickness` je tloušťka zdi, nebo
 * funkce výšky části (`wallThickness`).
 */
export function churchMeshData(
  parts: readonly ChurchPart[],
  progress: ChurchProgress,
  thickness: Thickness,
): ChurchMeshData {
  const walls = new Builder(emptyArrays());
  const roofs = new Builder(emptyArrays());
  const openings = new Builder(emptyArrays());
  const tOf = (part: ChurchPart): number =>
    typeof thickness === 'number' ? thickness : thickness(part.height);
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  const foundation = clamp01(progress.foundation);
  const wallsP = clamp01(progress.walls);
  const roofP = clamp01(progress.roof);
  const decor = clamp01(progress.decor);
  const plinth = FOUNDATION_LIFT_M * foundation;
  const naveTop = Math.max(0, ...parts.filter((p) => p.kind === 'nave').map((p) => p.height));
  const naveSill = FOUNDATION_LIFT_M + naveTop * WINDOW_SILL_OF_WALL;
  if (foundation <= 0 && wallsP <= 0)
    return { walls: walls.a, roofs: roofs.a, openings: openings.a };
  let door: { part: ChurchPart; x: number } | null = null;
  for (const part of parts) {
    const t = tOf(part);
    const ring = ringOf(part, t);
    const minX = Math.min(...ring.outer.map((p) => p.x));
    if (part.kind !== 'aisle' && (door === null || minX < door.x)) door = { part, x: minX };
    const top = FOUNDATION_LIFT_M + part.height * wallsP;
    const bandTop = wallsP > 0 ? top : plinth;
    if (bandTop <= 0) continue;
    const wallH = Math.max(bandTop, 0.01);
    wallBand(walls, ring, -SKIRT_M, wallH, wallsP > 0 ? decor : 0);
    if (wallsP >= 1) roofOf(part, t, top, roofP, naveSill, walls, roofs, decor);
    if (part.kind === 'nave') {
      const sill = FOUNDATION_LIFT_M + part.height * WINDOW_SILL_OF_WALL;
      for (const spot of windowSpots(part, t)) {
        if (sill + WINDOW_H <= wallH && part.height >= 3) {
          opening(openings, spot.at, spot.out, sill, WINDOW_W, WINDOW_H);
        }
      }
    }
  }
  if (door) {
    const { part } = door;
    const t = tOf(part);
    const hDoor = Math.min(DOOR_H, part.height * 0.8);
    const wDoor = Math.min(
      DOOR_W,
      0.9 * (part.shape.kind === 'rect' ? part.shape.width : 2 * part.shape.r),
    );
    const topNow = FOUNDATION_LIFT_M + part.height * wallsP;
    if (wallsP > 0 && FOUNDATION_LIFT_M + hDoor <= topNow) {
      const s = part.shape;
      const x =
        s.kind === 'rect'
          ? s.cx - s.length / 2 - t
          : s.kind === 'circle'
            ? s.cx - s.r - t
            : s.cx - (s.facing === 1 ? 0 : s.r + t);
      opening(openings, { x, z: s.cz }, { x: -1, z: 0 }, FOUNDATION_LIFT_M, wDoor, hDoor);
    }
  }
  return { walls: walls.a, roofs: roofs.a, openings: openings.a };
}

function box(b: Builder, c: V3, ex: V3, ey: V3, ez: V3, color: readonly number[]): void {
  const corner = (sx: number, sy: number, sz: number): V3 => [
    c[0] + sx * ex[0] + sy * ey[0] + sz * ez[0],
    c[1] + sx * ex[1] + sy * ey[1] + sz * ez[1],
    c[2] + sx * ex[2] + sy * ey[2] + sz * ez[2],
  ];
  const add = (n: V3, p: [V3, V3, V3, V3]): void => b.quad(p, n, color, 1);
  add(norm(ex), [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)]);
  add(norm([-ex[0], -ex[1], -ex[2]]), [
    corner(-1, -1, 1),
    corner(-1, 1, 1),
    corner(-1, 1, -1),
    corner(-1, -1, -1),
  ]);
  add(norm(ey), [corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1)]);
  add(norm([-ey[0], -ey[1], -ey[2]]), [
    corner(-1, -1, 1),
    corner(-1, -1, -1),
    corner(1, -1, -1),
    corner(1, -1, 1),
  ]);
  add(norm(ez), [corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1), corner(-1, -1, 1)]);
  add(norm([-ez[0], -ez[1], -ez[2]]), [
    corner(-1, -1, -1),
    corner(-1, 1, -1),
    corner(1, 1, -1),
    corner(1, -1, -1),
  ]);
}

/** Rozestup tyčí lešení po obvodu (m), odstup od zdi (m), tloušťka tyče a patra (m). */
const SCAFFOLD_SPACING_M = 3;
const SCAFFOLD_GAP_M = 0.7;
const SCAFFOLD_POLE_M = 0.07;
const SCAFFOLD_LEVEL_M = 2.4;

/**
 * Lešení kolem zdí hlavní lodi a ostatních částí: svislé tyče po obvodu a vodorovná patra
 * každé 2,4 m do výšky rozestavěné zdi + 1 m. Kreslí se, dokud zdi nejsou hotové.
 */
export function churchScaffoldData(
  parts: readonly ChurchPart[],
  walls: number,
  thickness: Thickness,
): ChurchMeshArrays {
  const b = new Builder(emptyArrays());
  const w = Math.min(1, Math.max(0, walls));
  if (w <= 0 || w >= 1) return b.a;
  for (const part of parts) {
    if (part.kind === 'aisle' || part.kind === 'atrium') continue;
    const t = typeof thickness === 'number' ? thickness : thickness(part.height);
    const ring = ringOf(part, t + SCAFFOLD_GAP_M);
    const top = FOUNDATION_LIFT_M + part.height * w + 1;
    const pts = ring.outer;
    const count = ring.closed ? pts.length : pts.length - 1;
    const poleHalf = SCAFFOLD_POLE_M;
    for (let i = 0; i < count; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const steps = Math.max(1, Math.round(len / SCAFFOLD_SPACING_M));
      const dx = (q.x - p.x) / len;
      const dz = (q.z - p.z) / len;
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        const x = p.x + (q.x - p.x) * f;
        const z = p.z + (q.z - p.z) * f;
        box(b, [x, top / 2, z], [poleHalf, 0, 0], [0, top / 2, 0], [0, 0, poleHalf], TIMBER);
      }
      for (let y = SCAFFOLD_LEVEL_M; y < top; y += SCAFFOLD_LEVEL_M) {
        box(
          b,
          [(p.x + q.x) / 2, y, (p.z + q.z) / 2],
          [(dx * len) / 2, 0, (dz * len) / 2],
          [0, poleHalf, 0],
          [-dz * poleHalf, 0, dx * poleHalf],
          TIMBER,
        );
      }
    }
  }
  return b.a;
}
