import { detCos, detSin, length2 } from '../../landscape';
import { CEMETERY_FENCE_INSET_M, HUMNO, PEN_FENCE_INSET_M } from '../rules';
import { rotationCosSin, rotationTurn, ROTATION_TURNS } from '../square-grid';
import type { Position, SacredBuildingKind, TileCell } from '../types';

// Vchody staveb (paths.md – Vchody; Martin, 19. 10. 2026: „A ještě, každá budova by měla mít
// nějaký vchod, od kterého cesta povede.“). Jedna funkce pro jádro (síť pěšin – pěšina vede
// k vchodu) i scénu (kde se kreslí branka): hřbitov a ohrada mají branku v pleteném plotu, modla
// a svatyně vstup na předku. Obydlí mají bránu před vchodem domu nebo branku pozemku už v síti
// (`gateOf` v network.ts). Sad, pole a louky budovy nejsou – vchod nemají. Čisté deterministické
// funkce (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin), stejně na serveru
// i v prohlížeči.

/** Vchod stavby: střed branky (na čáře plotu, na okraji půdorysu) a směr ven (jednotkový). */
export interface Entrance {
  x: number;
  z: number;
  outX: number;
  outZ: number;
}

/**
 * Pletený plot (woven-fence.ts ve webu – jeden pro celou hru): poloměr zakulaceného vnějšího
 * a vnitřního rohu (m). Rovný úsek plotu začíná a končí tečnou oblouku.
 */
export const WOVEN_FENCE_CORNER_M = { outer: 1.25, inner: 0.5 } as const;

/** Branka pleteného plotu: šířka (m) a nejvyšší rozestup kůlů (m – kůl vedle branky). */
export interface FenceGateStyle {
  gateWidth: number;
  postStep: number;
}

/** Branka hřbitova – širší, projde průvod s nebožtíkem (cemetery.md). */
export const CEMETERY_GATE: FenceGateStyle = { gateWidth: 1.8, postStep: 1 };
/** Branka ze žerdí ohrady (oxen.md). */
export const PEN_GATE: FenceGateStyle = { gateWidth: 1.6, postStep: 1 };
/** Plot pozemku polozemnice stojí o tolik uvnitř svého čtverce (m); ohrada a hřbitov viz rules. */
export const FENCE_INSET_M = 0.5;

/**
 * Vstup do posvátného okrsku před předkem stavby (m od středu): modla – okraj půdorysu 4 × 4 m
 * (obětiny stojí vpředu); svatyně – za valem příkopu u hrotu okvětí na předku, kde je příkop
 * nejužší (tools/blender/sacred_layout.py: R_CUSP 12,1 m + val 1,35 m).
 */
export const SACRED_ENTRANCE_M: Record<SacredBuildingKind, number> = { idol: 2, shrine: 13.5 };

/** Čtverec stavby po políčkách (hřbitov, ohrada) – políčko ve své mřížce, střed, strana, natočení. */
export interface EntranceSquare {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  rotation?: number;
}

/** Rovný úsek plotu: začátek, směr (jednotkový, po osách mřížky), délka a směr ven. */
interface FenceRun {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  outX: number;
  outZ: number;
  /** Úsek končí vnitřním rohem (tři čtverce kolem vrcholu) – oblouk WOVEN_FENCE_CORNER_M.inner. */
  endInner: boolean;
}

/** Prostor mřížky stavby: natočená stavba se počítá „rovně“ kolem středu prvního čtverce. */
interface Frame {
  toFlat(x: number, z: number): [number, number];
  toWorld(u: number, v: number): [number, number];
  dirToWorld(u: number, v: number): [number, number];
}

const UNTURNED: Frame = {
  toFlat: (x, z) => [x, z],
  toWorld: (u, v) => [u, v],
  dirToWorld: (u, v) => [u, v],
};

/**
 * Prostor mřížky (jako `gridFrame` ve webu): natočená stavba (fields.md – Natočené stavby) kolem
 * středu `cx`, `cz` – místní (lx, lz) → svět (cx + lx·c + lz·s, cz − lx·s + lz·c).
 */
function frameOf(cx: number, cz: number, rotation: number | undefined): Frame {
  if (rotation === undefined) return UNTURNED;
  const turn = rotationTurn(rotation);
  if (turn !== null && turn % ROTATION_TURNS === 0) return UNTURNED;
  const [c, s] = rotationCosSin(rotation);
  return {
    toFlat: (x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      return [cx + dx * c - dz * s, cz + dx * s + dz * c];
    },
    toWorld: (u, v) => {
      const lx = u - cx;
      const lz = v - cz;
      return [cx + lx * c + lz * s, cz - lx * s + lz * c];
    },
    dirToWorld: (u, v) => [u * c + v * s, -u * s + v * c],
  };
}

/**
 * Branka na rovných úsecích plotu (jako `gateSpot` ve woven-fence.ts): úsek, kam se vejde i s kůlem
 * po stranách, a na něm místo nejblíž k `toward` (v rovném prostoru); při shodě první úsek.
 */
function gateOnRuns(
  runs: readonly FenceRun[],
  toward: readonly [number, number],
  style: FenceGateStyle,
): FenceRun | null {
  const margin = style.gateWidth / 2 + style.postStep;
  let best: FenceRun | null = null;
  let bestD = Infinity;
  for (const run of runs) {
    if (run.length < 2 * margin) continue;
    const along = (toward[0] - run.x) * run.dx + (toward[1] - run.z) * run.dz;
    const s = Math.min(run.length - margin, Math.max(margin, along));
    const x = run.x + run.dx * s;
    const z = run.z + run.dz * s;
    const d = (x - toward[0]) * (x - toward[0]) + (z - toward[1]) * (z - toward[1]);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = { ...run, x, z, length: 0 };
    }
  }
  return best;
}

function toEntrance(frame: Frame, gate: FenceRun): Entrance {
  const [x, z] = frame.toWorld(gate.x, gate.z);
  const [outX, outZ] = frame.dirToWorld(gate.outX, gate.outZ);
  return { x, z, outX, outZ };
}

/** Celočíselný klíč políčka mřížky stavby. */
function cellKey(x: number, y: number): number {
  return (x + 1_048_576) * 2_097_152 + (y + 1_048_576);
}

/** Strany čtverce proti směru hodinových ručiček (ohrazení vlevo): posun políčka, směr, ven. */
const SIDES = [
  // spodní (−z): z levého dolního rohu doprava
  { di: 0, dj: -1, from: [-1, -1], dir: [1, 0], vertex: [0, 0] },
  // pravá (+x)
  { di: 1, dj: 0, from: [1, -1], dir: [0, 1], vertex: [1, 0] },
  // horní (+z)
  { di: 0, dj: 1, from: [1, 1], dir: [-1, 0], vertex: [1, 1] },
  // levá (−x)
  { di: -1, dj: 0, from: [-1, 1], dir: [0, -1], vertex: [0, 1] },
] as const;

/**
 * Rovné úseky pleteného plotu po obrysu čtverců (jako `outlinePaths` + `pathPieces` ve webu):
 * strany čtverců bez souseda, souvislé strany na jedné přímce spojené, zkrácené o tečny
 * zakulacených rohů – vnější roh (jeden čtverec v rohu, nebo dva čtverce na sebe jen rohem)
 * WOVEN_FENCE_CORNER_M.outer, vnitřní roh (tři čtverce) .inner. V rovném prostoru mřížky.
 */
function outlineRuns(
  squares: readonly { cell: TileCell; x: number; z: number; size: number }[],
  inset = 0,
): FenceRun[] {
  const present = new Set(squares.map((q) => cellKey(q.cell.x, q.cell.y)));
  const has = (x: number, y: number): boolean => present.has(cellKey(x, y));
  // vrchol (i, j) = roh mezi políčky (i − 1, j − 1), (i, j − 1), (i − 1, j), (i, j)
  const around = (i: number, j: number): number =>
    (has(i - 1, j - 1) ? 1 : 0) +
    (has(i, j - 1) ? 1 : 0) +
    (has(i - 1, j) ? 1 : 0) +
    (has(i, j) ? 1 : 0);
  const tangent = (i: number, j: number): number =>
    around(i, j) === 3 ? WOVEN_FENCE_CORNER_M.inner : WOVEN_FENCE_CORNER_M.outer;
  // strany bez souseda podle počátečního vrcholu a směru
  interface Side {
    x: number;
    z: number;
    i: number;
    j: number;
    side: number;
    size: number;
  }
  const sides: Side[] = [];
  const startsAt = new Map<string, Side>();
  for (const q of squares) {
    const h = q.size / 2;
    SIDES.forEach((s, k) => {
      if (has(q.cell.x + s.di, q.cell.y + s.dj)) return;
      const side: Side = {
        x: q.x + s.from[0] * h,
        z: q.z + s.from[1] * h,
        i: q.cell.x + s.vertex[0],
        j: q.cell.y + s.vertex[1],
        side: k,
        size: q.size,
      };
      sides.push(side);
      startsAt.set(`${side.i},${side.j},${k}`, side);
    });
  }
  const runs: FenceRun[] = [];
  for (const first of sides) {
    const s = SIDES[first.side]!;
    // úsek začíná ve vrcholu, kam nevede strana stejného směru (roh)
    if (startsAt.has(`${first.i - s.dir[0]},${first.j - s.dir[1]},${first.side}`)) continue;
    let length = first.size;
    let i = first.i + s.dir[0];
    let j = first.j + s.dir[1];
    for (let next = startsAt.get(`${i},${j},${first.side}`); next;) {
      length += next.size;
      i += s.dir[0];
      j += s.dir[1];
      next = startsAt.get(`${i},${j},${first.side}`);
    }
    const ta = tangent(first.i, first.j);
    const tb = tangent(i, j);
    // plot odsazený `inset` dovnitř (ohrada, hřbitov): u vnějšího rohu úsek začíná
    // a končí o kus dál, u vnitřního o kus dřív
    const sa = around(first.i, first.j) === 3 ? -inset : inset;
    const sb = around(i, j) === 3 ? -inset : inset;
    runs.push({
      x: first.x + s.dir[0] * (ta + sa) - s.dir[1] * inset,
      z: first.z + s.dir[1] * (ta + sa) + s.dir[0] * inset,
      dx: s.dir[0],
      dz: s.dir[1],
      length: length - ta - tb - sa - sb,
      // ohrazení vlevo – ven vpravo (0 − x: žádná záporná nula)
      outX: s.dir[1],
      outZ: 0 - s.dir[0],
      endInner: around(i, j) === 3,
    });
  }
  return runs;
}

/** Rovný úsek plotu ve světě: začátek, jednotkový směr a délka (m). */
export interface FenceSegment {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
}

/** Zakulacený roh plotu: střed a poloměr oblouku, jednotkové směry ke koncům čtvrtkruhu. */
export interface FenceArc {
  x: number;
  z: number;
  r: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

/**
 * Pletený plot ve světě (paths.md – Odstup od plotu): rovné úseky a zakulacené rohy jako ve scéně
 * (`outlineRuns`), obdélník kolem a co je uvnitř.
 */
export interface FenceOutline {
  segments: readonly FenceSegment[];
  arcs: readonly FenceArc[];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Leží bod uvnitř plotu? Ostré rohy – zakulacení leží celé do odstupu od plotu. */
  inside: (x: number, z: number) => boolean;
}

/**
 * Plot po obrysu čtverců odsazený `inset` dovnitř (hřbitov, ohrada, pozemek): úseky z `outlineRuns`
 * a na konci každého úseku čtvrtkruh do dalšího (vnější roh – střed dovnitř, vnitřní – ven).
 * Natočené čtverce v osách své mřížky kolem středu prvního. Bez čtverců null.
 */
export function fenceOutline(
  squares: readonly EntranceSquare[],
  inset: number,
): FenceOutline | null {
  const first = squares[0];
  if (!first) return null;
  const frame = frameOf(first.x, first.z, first.rotation);
  const flat = squares.map((q) => {
    const [x, z] = frame.toFlat(q.x, q.z);
    return { cell: q.cell, x, z, size: q.size };
  });
  const segments: FenceSegment[] = [];
  const arcs: FenceArc[] = [];
  for (const run of outlineRuns(flat, inset)) {
    const [x, z] = frame.toWorld(run.x, run.z);
    const [dx, dz] = frame.dirToWorld(run.dx, run.dz);
    segments.push({ x, z, dx, dz, length: Math.max(0, run.length) });
    const r = run.endInner ? WOVEN_FENCE_CORNER_M.inner : WOVEN_FENCE_CORNER_M.outer;
    // konec úseku → střed oblouku: vnější roh se stáčí dovnitř (proti `out`), vnitřní ven
    const side = run.endInner ? 1 : -1;
    const ex = run.x + run.dx * run.length;
    const ez = run.z + run.dz * run.length;
    const [cx, cz] = frame.toWorld(ex + run.outX * r * side, ez + run.outZ * r * side);
    const [ux, uz] = frame.dirToWorld(-run.outX * side, -run.outZ * side);
    arcs.push({ x: cx, z: cz, r, ux, uz, vx: dx, vz: dz });
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const s of segments) {
    for (const [px, pz] of [
      [s.x, s.z],
      [s.x + s.dx * s.length, s.z + s.dz * s.length],
    ] as const) {
      minX = Math.min(minX, px);
      minZ = Math.min(minZ, pz);
      maxX = Math.max(maxX, px);
      maxZ = Math.max(maxZ, pz);
    }
  }
  for (const a of arcs) {
    minX = Math.min(minX, a.x - a.r);
    minZ = Math.min(minZ, a.z - a.r);
    maxX = Math.max(maxX, a.x + a.r);
    maxZ = Math.max(maxZ, a.z + a.r);
  }
  const eps = 1e-6;
  const r = inset - eps;
  const inUnion = (u: number, v: number): boolean =>
    flat.some((q) => Math.abs(u - q.x) <= q.size / 2 && Math.abs(v - q.z) <= q.size / 2);
  // čtverec o poloviční straně `inset` kolem bodu celý ve sjednocení (rohy a středy stran)
  const inside = (x: number, z: number): boolean => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    const [u, v] = frame.toFlat(x, z);
    for (const a of [-r, 0, r]) {
      for (const b of [-r, 0, r]) if (!inUnion(u + a, v + b)) return false;
    }
    return true;
  };
  return { segments, arcs, minX, minZ, maxX, maxZ, inside };
}

/** Vzdálenost bodu od čáry plotu – rovných úseků a oblouků rohů (m). */
export function fenceDistance(fence: FenceOutline, x: number, z: number): number {
  let best = Infinity;
  for (const s of fence.segments) {
    const t = Math.min(s.length, Math.max(0, (x - s.x) * s.dx + (z - s.z) * s.dz));
    const d = length2(x - s.x - s.dx * t, z - s.z - s.dz * t);
    if (d < best) best = d;
  }
  for (const a of fence.arcs) {
    const px = x - a.x;
    const pz = z - a.z;
    // jen v úhlu čtvrtkruhu – jinde je blíž konec sousedního úseku
    if (px * a.ux + pz * a.uz < 0 || px * a.vx + pz * a.vz < 0) continue;
    const d = Math.abs(length2(px, pz) - a.r);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Branka hřbitova (cemetery.md – Co hráč vidí): v pleteném plotu po obrysu čtverců, na rovném
 * úseku nejblíž k nejbližšímu hotovému obydlí (od středu hotových čtverců). Hotový hřbitov má
 * plot kolem hotových čtverců (rozšíření ve stavbě branku nemá), zakládaný kolem všech. Bez
 * hotového obydlí null (scéna dá branku doprostřed prvního úseku, síť vede ke čtvercům).
 */
export function cemeteryEntrance(
  cemetery: {
    squares: readonly (EntranceSquare & { pending?: boolean })[];
    built?: boolean;
  },
  dwellings: readonly { position: { x: number; z: number }; built: boolean }[],
): Entrance | null {
  const ready = cemetery.squares.filter((s) => !s.pending);
  const base = ready.length > 0 ? ready : cemetery.squares;
  if (base.length === 0) return null;
  let cx = 0;
  let cz = 0;
  for (const q of base) {
    cx += q.x;
    cz += q.z;
  }
  cx /= base.length;
  cz /= base.length;
  let toward: { x: number; z: number } | null = null;
  let best = Infinity;
  for (const d of dwellings) {
    if (!d.built) continue;
    const dx = d.position.x - cx;
    const dz = d.position.z - cz;
    const dist = dx * dx + dz * dz;
    if (dist < best) {
      best = dist;
      toward = d.position;
    }
  }
  if (!toward) return null;
  const fenced = cemetery.built === false ? cemetery.squares : base;
  const first = fenced[0]!;
  const frame = frameOf(first.x, first.z, first.rotation);
  const flat = fenced.map((q) => {
    const [x, z] = frame.toFlat(q.x, q.z);
    return { cell: q.cell, x, z, size: q.size };
  });
  const gate = gateOnRuns(
    outlineRuns(flat, CEMETERY_FENCE_INSET_M),
    frame.toFlat(toward.x, toward.z),
    CEMETERY_GATE,
  );
  return gate ? toEntrance(frame, gate) : null;
}

/**
 * Branka ohrady (oxen.md): ze žerdí na straně, kam míří `facing` (k nejbližšímu obydlí – ve scéně
 * i v síti), posunutá po té straně k němu; plot stojí PEN_FENCE_INSET_M uvnitř čtverce. Natočená
 * ohrada v osách svého čtverce. Jako `penLayout` ve webu (cíl branky ve vzdálenosti půl strany
 * plotu + 1 m od středu ve směru `facing`).
 */
export function penEntrance(
  square: { x: number; z: number; size: number; rotation?: number },
  facing: { x: number; z: number },
): Entrance {
  const frame = frameOf(square.x, square.z, square.rotation);
  const [fx, fz] =
    frame === UNTURNED ? [facing.x, facing.z] : flatDir(square.rotation!, facing.x, facing.z);
  const length = length2(fx, fz);
  const [ux, uz] = length > 1e-9 ? [fx / length, fz / length] : [0, -1];
  const half = square.size / 2 - PEN_FENCE_INSET_M;
  const t = WOVEN_FENCE_CORNER_M.outer;
  const run = 2 * half - 2 * t;
  const [x0, z0, x1, z1] = [square.x - half, square.z - half, square.x + half, square.z + half];
  // obdélník plotu proti směru hodinových ručiček: spodní, pravá, horní, levá strana
  const runs: FenceRun[] = [
    { x: x0 + t, z: z0, dx: 1, dz: 0, length: run, outX: 0, outZ: -1, endInner: false },
    { x: x1, z: z0 + t, dx: 0, dz: 1, length: run, outX: 1, outZ: 0, endInner: false },
    { x: x1 - t, z: z1, dx: -1, dz: 0, length: run, outX: 0, outZ: 1, endInner: false },
    { x: x0, z: z1 - t, dx: 0, dz: -1, length: run, outX: -1, outZ: 0, endInner: false },
  ];
  const toward: [number, number] = [square.x + ux * (half + 1), square.z + uz * (half + 1)];
  const gate = gateOnRuns(runs, toward, PEN_GATE)!;
  return toEntrance(frame, gate);
}

/**
 * Branka ohrady o víc čtvercích (oxen.md – Ohrady podle druhu): pletený plot po obrysu čtverců
 * odsazený PEN_FENCE_INSET_M dovnitř (zakulacené rohy), branka na rovném úseku nejblíž k bodu
 * `toward` (nejbližší obydlí). Natočená ohrada v osách své mřížky (kolem středu prvního čtverce).
 * Ohrada o jednom čtverci jako `penEntrance` (branka posunutá po straně ke vsi).
 */
export function penSquaresEntrance(
  squares: readonly EntranceSquare[],
  toward: { x: number; z: number },
): Entrance {
  const first = squares[0]!;
  if (squares.length === 1) {
    return penEntrance(first, { x: toward.x - first.x, z: toward.z - first.z });
  }
  const frame = frameOf(first.x, first.z, first.rotation);
  const flat = squares.map((q) => {
    const [x, z] = frame.toFlat(q.x, q.z);
    return { cell: q.cell, x, z, size: q.size };
  });
  const gate = gateOnRuns(
    outlineRuns(flat, PEN_FENCE_INSET_M),
    frame.toFlat(toward.x, toward.z),
    PEN_GATE,
  );
  return gate
    ? toEntrance(frame, gate)
    : penEntrance(first, { x: toward.x - first.x, z: toward.z - first.z });
}

/**
 * Cíl branky ohrady o víc čtvercích: nejbližší obydlí (i rozestavěné) ke středu čtverců – bez
 * obydlí bod pod středem (−z).
 */
export function penGateToward(
  squares: readonly { x: number; z: number }[],
  dwellings: readonly { position: { x: number; z: number } }[],
): { x: number; z: number } {
  const n = Math.max(1, squares.length);
  const cx = squares.reduce((sum, q) => sum + q.x, 0) / n;
  const cz = squares.reduce((sum, q) => sum + q.z, 0) / n;
  const facing = penEntranceFacing({ x: cx, z: cz }, dwellings);
  return { x: cx + facing.x, z: cz + facing.z };
}

/** Směr ve světě → rovný prostor natočené stavby. */
function flatDir(rotation: number, x: number, z: number): [number, number] {
  const [c, s] = rotationCosSin(rotation);
  return [x * c - z * s, x * s + z * c];
}

/**
 * Cíl branky ohrady: nejbližší obydlí (i rozestavěné) – bez obydlí směr dolů (−z). Jako
 * `scenePenViews` ve webu.
 */
export function penEntranceFacing(
  pen: { x: number; z: number },
  dwellings: readonly { position: { x: number; z: number } }[],
): { x: number; z: number } {
  let target = { x: pen.x, z: pen.z - 1 };
  let best = Infinity;
  for (const d of dwellings) {
    const dx = d.position.x - pen.x;
    const dz = d.position.z - pen.z;
    const dist = dx * dx + dz * dz;
    if (dist < best) {
      best = dist;
      target = d.position;
    }
  }
  return { x: target.x - pen.x, z: target.z - pen.z };
}

/**
 * Vstup na humno (production-chains.md – Humno) před předkem mlatu (m od středu): přístřešek stojí
 * vzadu (−z), mlat je otevřený dopředu (+z) – snopy se nosí a vozí sem, zrno odtud.
 */
export const THRESHING_FLOOR_ENTRANCE_M = HUMNO.sizeM.z / 2 + 1;

/** Vstup na humno – střed před předkem mlatu a směr ven. */
export function threshingFloorEntrance(position: Position): Entrance {
  const outX = detSin(position.rotation);
  const outZ = detCos(position.rotation);
  return {
    x: position.x + outX * THRESHING_FLOOR_ENTRANCE_M,
    z: position.z + outZ * THRESHING_FLOOR_ENTRANCE_M,
    outX,
    outZ,
  };
}

/**
 * Vstup do modly a svatyně: na předku stavby (+z modelu – míří do (sin r, cos r)) ve vzdálenosti
 * SACRED_ENTRANCE_M od středu – tváře modly a obětiny, u svatyně přes příkop k ploše s modlou.
 */
export function sacredEntrance(building: {
  kind: SacredBuildingKind;
  position: Position;
}): Entrance {
  const outX = detSin(building.position.rotation);
  const outZ = detCos(building.position.rotation);
  const reach = SACRED_ENTRANCE_M[building.kind];
  return {
    x: building.position.x + outX * reach,
    z: building.position.z + outZ * reach,
    outX,
    outZ,
  };
}
