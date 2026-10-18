// Pletený plot bez Babylonu – jeden pro celou hru (Martin, 18. 10. 2026): polský plot kolem
// pozemku polozemnice i proutěný plot hřbitova jsou totéž – kůly a mezi nimi vodorovně
// proplétané větve, liší se nejvýš hustotou (`FenceStyle`). V pleteném plotu se hranaté rohy
// dělají špatně, proto jsou všechny rohy zakulacené: vnější oblouk o poloměru ≈ 1,25 m s kůly
// po oblouku, vnitřní roh (tvar L) malý oblouk. Souřadnice světa scény v metrech (x, z).
import type { Point } from './village-layout';

/** Poloměr zakulacených vnějších rohů (m). */
export const WOVEN_CORNER_RADIUS_M = 1.25;
/** Poloměr vnitřních rohů (m) – plot nesahá daleko do sousedního políčka. */
export const WOVEN_INNER_CORNER_RADIUS_M = 0.5;
/** O kolik větev obchází kůl (m) – střídavě vně a uvnitř ohrazení. */
export const RAIL_WEAVE_M = 0.065;

/** Hustota a branka jednoho druhu pleteného plotu. */
export interface FenceStyle {
  /** Nejvyšší rozestup kůlů (m) – po rovných úsecích i po oblouku rohů. */
  postStep: number;
  /** Výšky proplétaných větví nad zemí (m), zdola nahoru. */
  rails: readonly number[];
  /** Šířka branky (m). */
  gateWidth: number;
}

export interface FencePost {
  x: number;
  z: number;
  /** Kůl u branky je vyšší. */
  gate: boolean;
  /** Směr ven z ohrazení (jednotkový) – větve obcházejí kůl střídavě vně a uvnitř. */
  outX: number;
  outZ: number;
}

/** Souvislý kus plotu: kůly v pořadí stavby; uzavřený = poslední kůl navazuje na první. */
export interface FenceRun {
  posts: FencePost[];
  closed: boolean;
}

export interface WovenFence {
  /** Kusy plotu v pořadí stavby – kus s brankou první, začíná u kůlu branky. */
  runs: FenceRun[];
}

/**
 * Lomená čára, podél které plot stojí, ohrazená plocha leží vlevo (při pohledu ve směru čáry
 * je vlevo osa (−dz, dx)). Uzavřená = obrys, otevřená = jen kus (konce bez oblouku).
 */
export interface FencePath {
  points: readonly Point[];
  closed: boolean;
}

/** Branka: bod, ke kterému míří (nejbližší místo plotu), bez bodu uprostřed prvního úseku. */
export interface FenceGate {
  toward: { x: number; z: number } | null;
}

type Piece =
  | { kind: 'line'; from: Point; to: Point; out: Point }
  | {
      kind: 'arc';
      cx: number;
      cz: number;
      radius: number;
      from: number;
      to: number;
      /** +1 roh ven (střed oblouku uvnitř ohrazení), −1 vnitřní roh. */
      convex: 1 | -1;
    };

const EPS = 1e-6;

function pieceLength(piece: Piece): number {
  return piece.kind === 'line'
    ? Math.hypot(piece.to[0] - piece.from[0], piece.to[1] - piece.from[1])
    : piece.radius * Math.abs(piece.to - piece.from);
}

/** Bod a směr ven v podílu `t` 0–1 kusu. */
function pieceAt(piece: Piece, t: number): { p: Point; out: Point } {
  if (piece.kind === 'line') {
    return {
      p: [
        piece.from[0] + (piece.to[0] - piece.from[0]) * t,
        piece.from[1] + (piece.to[1] - piece.from[1]) * t,
      ],
      out: piece.out,
    };
  }
  const a = piece.from + (piece.to - piece.from) * t;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    p: [piece.cx + piece.radius * c, piece.cz + piece.radius * s],
    out: [c * piece.convex, s * piece.convex],
  };
}

/** Body bez opakování (po sobě jdoucí shodné a u uzavřené čáry poslední = první vynechá). */
function cleanPoints(path: FencePath): Point[] {
  const out: Point[] = [];
  for (const p of path.points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPS) out.push(p);
  }
  if (path.closed && out.length > 1) {
    const [first, last] = [out[0]!, out[out.length - 1]!];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPS) out.pop();
  }
  return out;
}

/**
 * Kusy plotu podél čáry: rovné úseky a mezi nimi oblouky rohů (vnější `WOVEN_CORNER_RADIUS_M`,
 * vnitřní `WOVEN_INNER_CORNER_RADIUS_M`, oblouk nikdy nezabere víc než půl úseku).
 */
function pathPieces(path: FencePath): Piece[] {
  const points = cleanPoints(path);
  const n = points.length;
  if (n < 2) return [];
  const edges = path.closed ? n : n - 1;
  const dir = (i: number): Point => {
    const a = points[i % n]!;
    const b = points[(i + 1) % n]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  };
  const edgeLength = (i: number): number => {
    const a = points[i % n]!;
    const b = points[(i + 1) % n]!;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  // roh u bodu k: odbočení θ (kladné = doleva = roh ven), poloměr a délka tečny
  const corners = points.map((v, k) => {
    const open = !path.closed && (k === 0 || k === n - 1);
    if (open) return null;
    const din = dir((k - 1 + n) % n);
    const dout = dir(k);
    const cross = din[0] * dout[1] - din[1] * dout[0];
    const dot = din[0] * dout[0] + din[1] * dout[1];
    const theta = Math.atan2(cross, dot);
    if (Math.abs(theta) < 1e-4) return null;
    const convex: 1 | -1 = theta > 0 ? 1 : -1;
    const wanted = convex > 0 ? WOVEN_CORNER_RADIUS_M : WOVEN_INNER_CORNER_RADIUS_M;
    const half = Math.tan(Math.abs(theta) / 2);
    const room = Math.min(edgeLength((k - 1 + n) % n), edgeLength(k)) / 2;
    const radius = Math.min(wanted, room / half);
    return { v, din, dout, theta, convex, radius, tangent: radius * half };
  });
  const pieces: Piece[] = [];
  for (let i = 0; i < edges; i++) {
    const d = dir(i);
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const ta = corners[i]?.tangent ?? 0;
    const tb = corners[(i + 1) % n]?.tangent ?? 0;
    pieces.push({
      kind: 'line',
      from: [a[0] + d[0] * ta, a[1] + d[1] * ta],
      to: [b[0] - d[0] * tb, b[1] - d[1] * tb],
      // ohrazení vlevo – ven je vpravo
      out: [d[1], -d[0]],
    });
    const corner = corners[(i + 1) % n];
    if (!corner || (!path.closed && i === edges - 1)) continue;
    const { v, din, dout, convex, radius, tangent } = corner;
    // střed oblouku na straně, kam plot odbočuje
    const left: Point = [-din[1], din[0]];
    const start: Point = [v[0] - din[0] * tangent, v[1] - din[1] * tangent];
    const end: Point = [v[0] + dout[0] * tangent, v[1] + dout[1] * tangent];
    const cx = start[0] + left[0] * radius * convex;
    const cz = start[1] + left[1] * radius * convex;
    const from = Math.atan2(start[1] - cz, start[0] - cx);
    let to = Math.atan2(end[1] - cz, end[0] - cx);
    // oblouk jde ve směru odbočení (doleva = kladný úhel)
    if (convex > 0) while (to < from) to += Math.PI * 2;
    else while (to > from) to -= Math.PI * 2;
    pieces.push({ kind: 'arc', cx, cz, radius, from, to, convex });
  }
  return pieces;
}

/** Kůly podél kusů: první na začátku prvního kusu, pak po nejvýš `step` až na konec. */
function postsAlong(pieces: readonly Piece[], step: number): FencePost[] {
  const posts: FencePost[] = [];
  for (const piece of pieces) {
    const length = pieceLength(piece);
    if (length < EPS) continue;
    if (posts.length === 0) {
      const { p, out } = pieceAt(piece, 0);
      posts.push({ x: p[0], z: p[1], gate: false, outX: out[0], outZ: out[1] });
    }
    const count = Math.max(1, Math.ceil(length / step - EPS));
    for (let i = 1; i <= count; i++) {
      const { p, out } = pieceAt(piece, i / count);
      posts.push({ x: p[0], z: p[1], gate: false, outX: out[0], outZ: out[1] });
    }
  }
  return posts;
}

/**
 * Místo branky: rovný úsek uzavřené čáry, kam se vejde i s kůlem po stranách, a vzdálenost
 * středu branky od začátku úseku – nejblíž k `gate.toward`, bez cíle uprostřed prvního úseku.
 */
function gateSpot(
  all: readonly { path: FencePath; pieces: Piece[] }[],
  style: FenceStyle,
  gate: FenceGate,
): { path: number; piece: number; s: number } | null {
  const margin = style.gateWidth / 2 + style.postStep;
  let best: { path: number; piece: number; s: number; d: number } | null = null;
  for (const [pi, { path, pieces }] of all.entries()) {
    if (!path.closed) continue;
    for (const [i, piece] of pieces.entries()) {
      if (piece.kind !== 'line') continue;
      const length = pieceLength(piece);
      if (length < 2 * margin) continue;
      if (!gate.toward) return { path: pi, piece: i, s: length / 2 };
      const dx = (piece.to[0] - piece.from[0]) / length;
      const dz = (piece.to[1] - piece.from[1]) / length;
      const along = (gate.toward.x - piece.from[0]) * dx + (gate.toward.z - piece.from[1]) * dz;
      const s = Math.min(length - margin, Math.max(margin, along));
      const d = Math.hypot(
        piece.from[0] + dx * s - gate.toward.x,
        piece.from[1] + dz * s - gate.toward.z,
      );
      if (!best || d < best.d - EPS) best = { path: pi, piece: i, s, d };
    }
  }
  return best;
}

/**
 * Pletený plot podél čar (`FencePath`, ohrazení vlevo): rohy zakulacené, kůly nejvýš po
 * `style.postStep` po rovných úsecích i po oblouku. Branka (`gate`) je mezera na rovném úseku
 * uzavřené čáry, kam se vejde i s kůlem po stranách – v místě nejbližším k `gate.toward`; kus
 * s brankou pak začíná u jednoho kůlu branky a obejde plot až k druhému. Bez branky jsou
 * uzavřené čáry uzavřený plot.
 */
export function wovenFence(
  paths: readonly FencePath[],
  style: FenceStyle,
  gate: FenceGate | null,
): WovenFence {
  const all = paths.map((path) => ({ path, pieces: pathPieces(path) }));
  const chosen = gate ? gateSpot(all, style, gate) : null;
  const runs: FenceRun[] = [];
  all.forEach(({ path, pieces }, pi) => {
    if (chosen && chosen.path === pi) {
      const line = pieces[chosen.piece] as Extract<Piece, { kind: 'line' }>;
      const length = pieceLength(line);
      const half = style.gateWidth / 2;
      const split = (s: number): Point => pieceAt(line, s / length).p;
      const after: Piece = { ...line, from: split(chosen.s + half) };
      const before: Piece = { ...line, to: split(chosen.s - half) };
      const ordered = [
        after,
        ...pieces.slice(chosen.piece + 1),
        ...pieces.slice(0, chosen.piece),
        before,
      ];
      const posts = postsAlong(ordered, style.postStep);
      if (posts.length > 0) {
        posts[0]!.gate = true;
        posts[posts.length - 1]!.gate = true;
      }
      runs.unshift({ posts, closed: false });
      return;
    }
    const posts = postsAlong(pieces, style.postStep);
    if (path.closed && posts.length > 1) posts.pop(); // poslední kůl je zase první
    if (posts.length > 0) runs.push({ posts, closed: path.closed });
  });
  return { runs };
}

/** Všechny kůly plotu v pořadí stavby. */
export function fencePosts(fence: WovenFence): FencePost[] {
  return fence.runs.flatMap((run) => run.posts);
}

/** Úsek proplétané větve mezi dvěma sousedními kůly (konce posunuté vně / dovnitř kůlu). */
export interface FenceRail {
  /** Výška větve nad zemí (m). */
  height: number;
  /** Index kůlů na koncích v `FenceStage.posts` – výška terénu se bere u kůlu. */
  a: number;
  b: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Co z plotu stojí: kůly a úseky větví. */
export interface FenceStage {
  posts: FencePost[];
  rails: FenceRail[];
}

/**
 * Plot podle průběhu stavby: kůly se zatloukají v pořadí stavby (`posts` – podíl 0–1), až stojí
 * všechny, proplétají se větve zdola nahoru (`rails` – podíl výšek). Větev obchází kůly
 * střídavě vně a uvnitř – každá výška opačně, takže se pletivo kříží.
 */
export function fenceStage(
  fence: WovenFence,
  style: FenceStyle,
  progress: { posts: number; rails: number },
): FenceStage {
  const all = fencePosts(fence);
  const posts = all.slice(0, Math.round(all.length * clamp01(progress.posts)));
  const rails: FenceRail[] = [];
  if (posts.length === all.length && all.length > 0) {
    const levels = Math.ceil(style.rails.length * clamp01(progress.rails) - 1e-9);
    let base = 0;
    for (const run of fence.runs) {
      const n = run.posts.length;
      const at = (i: number, k: number): Point => {
        const post = run.posts[i]!;
        const side = (i + k) % 2 === 0 ? 1 : -1;
        return [post.x + post.outX * RAIL_WEAVE_M * side, post.z + post.outZ * RAIL_WEAVE_M * side];
      };
      const pairs = run.closed && n > 2 ? n : n - 1;
      for (let k = 0; k < levels; k++) {
        for (let i = 0; i < pairs; i++) {
          const j = (i + 1) % n;
          const [ax, az] = at(i, k);
          const [bx, bz] = at(j, k);
          rails.push({ height: style.rails[k]!, a: base + i, b: base + j, ax, az, bx, bz });
        }
      }
      base += n;
    }
  }
  return { posts, rails };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
