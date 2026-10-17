// Pohřebiště ve scéně bez Babylonu (cemetery.md – Co hráč vidí): nízký proutěný plot kolem
// čtverců s brankou k vsi, hliněné mohylky (žárové hroby 6.–8. století) přibývající, jak se
// pohřebiště plní, a fáze založení (vytyčení → kůly → pletení plotu). Souřadnice světa scény
// v metrech (x, z), čtverce jako u pole (field-cells.ts).
import { cellsBoundary, type CellSquare } from './field-cells';
import { seededRandom, type Point } from './village-layout';

/**
 * Hroby ve čtverci po řadách: 7 × 8 = 56 – musí sedět s CEMETERY.gravesPerSquare (hlídá test);
 * hrob ≈ 2 × 1,75 m.
 */
export const GRAVE_GRID = { columns: 7, rows: 8 } as const;
/** Okraj čtverce bez hrobů (m) – mohylky nesahají k plotu, mezi čtverci zůstane ulička. */
const GRAVE_MARGIN_M = 0.5;
/** Kolik posledních hrobů je čerstvých (holá hlína) – ostatní zarostly travou. */
export const FRESH_GRAVES = 3;
/** Rozestup kůlů plotu (m), výška pleteného plotu (m) a šířka branky (m). */
export const POST_SPACING_M = 1.4;
export const FENCE_HEIGHT_M = 0.8;
export const GATE_WIDTH_M = 1.8;
/** Branka jen na rovném úseku plotu aspoň takhle dlouhém (m). */
const GATE_MIN_RUN_M = GATE_WIDTH_M + 2 * POST_SPACING_M;

export interface GravePlacement {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Čerstvý hrob – mohylka z holé hlíny. */
  fresh: boolean;
}

/**
 * Mohylky prvních `graves` hrobů: čtverce v daném pořadí, v každém po řadách mřížka 7 × 8
 * s drobným rozházením (deterministicky podle `seed`). Víc hrobů, než se vejde, se nekreslí.
 */
export function gravePlacements(
  squares: readonly CellSquare[],
  graves: number,
  seed: number,
): GravePlacement[] {
  const perSquare = GRAVE_GRID.columns * GRAVE_GRID.rows;
  const count = Math.max(0, Math.min(Math.floor(graves), squares.length * perSquare));
  const random = seededRandom(seed * 7919 + 17);
  const out: GravePlacement[] = [];
  for (let i = 0; i < count; i++) {
    const square = squares[Math.floor(i / perSquare)]!;
    const slot = i % perSquare;
    const column = slot % GRAVE_GRID.columns;
    const row = Math.floor(slot / GRAVE_GRID.columns);
    const inner = square.size - 2 * GRAVE_MARGIN_M;
    const stepX = inner / GRAVE_GRID.columns;
    const stepZ = inner / GRAVE_GRID.rows;
    const jitter = (step: number): number => (random() - 0.5) * step * 0.25;
    out.push({
      x: square.x - inner / 2 + (column + 0.5) * stepX + jitter(stepX),
      z: square.z - inner / 2 + (row + 0.5) * stepZ + jitter(stepZ),
      rotationY: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.3,
      fresh: i >= count - FRESH_GRAVES,
    });
  }
  return out;
}

export interface FencePost {
  x: number;
  z: number;
  /** Kůl u branky je vyšší. */
  gate: boolean;
}

export interface FenceLayout {
  /** Úseky pleteného plotu (začátek, konec) – branka je mezera mezi nimi. */
  runs: [Point, Point][];
  /** Kůly v pořadí obcházení plotu (staví se v tomto pořadí). */
  posts: FencePost[];
  /** Rohy obrysu – kolíky vytyčení. */
  corners: Point[];
  /** Obrys čtverců – čára vytyčení. */
  outline: Point[][];
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

/**
 * Úsečky obrysu v pořadí obcházení: každá další navazuje na konec předchozí (otočená, když
 * je potřeba); obrys z více smyček (díra uvnitř) pokračuje další smyčkou.
 */
function chainSegments(segments: readonly [Point, Point][]): [Point, Point][] {
  const left = [...segments];
  const out: [Point, Point][] = [];
  while (left.length > 0) {
    let current = left.shift()!;
    out.push(current);
    for (;;) {
      const end = current[1];
      const index = left.findIndex(([a, b]) => samePoint(a, end) || samePoint(b, end));
      if (index < 0) break;
      const [a, b] = left.splice(index, 1)[0]!;
      current = samePoint(a, end) ? [a, b] : [b, a];
      out.push(current);
    }
  }
  return out;
}

/**
 * Plot kolem čtverců pohřebiště: úseky po obrysu, kůly po ≈ 1,4 m (na koncích úseků vždy)
 * a branka uprostřed nejbližšího dost dlouhého úseku k bodu `gateToward` (k vsi); bez bodu
 * na prvním dost dlouhém úseku.
 */
export function fenceLayout(
  squares: readonly CellSquare[],
  gateToward: { x: number; z: number } | null,
): FenceLayout {
  const outline = cellsBoundary(squares);
  const segments = chainSegments(
    outline.map((line): [Point, Point] => [line[0]!, line[line.length - 1]!]),
  );
  const length = ([a, b]: [Point, Point]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mid = ([a, b]: [Point, Point]): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let gateIndex = -1;
  let best = Infinity;
  segments.forEach((segment, i) => {
    if (length(segment) < GATE_MIN_RUN_M) return;
    const [mx, mz] = mid(segment);
    const d = gateToward ? Math.hypot(mx - gateToward.x, mz - gateToward.z) : i;
    if (d < best) {
      best = d;
      gateIndex = i;
    }
  });

  const runs: [Point, Point][] = [];
  const posts: FencePost[] = [];
  const corners: Point[] = [];
  const addPost = (p: Point, gate: boolean): void => {
    const existing = posts.find((q) => samePoint([q.x, q.z], p));
    if (existing) {
      existing.gate ||= gate;
      return;
    }
    posts.push({ x: p[0], z: p[1], gate });
  };
  const postsAlong = ([a, b]: [Point, Point], gateAtStart: boolean, gateAtEnd: boolean): void => {
    const steps = Math.max(1, Math.round(length([a, b]) / POST_SPACING_M));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const gate = (s === 0 && gateAtStart) || (s === steps && gateAtEnd);
      addPost([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], gate);
    }
  };
  segments.forEach((segment, i) => {
    const [a, b] = segment;
    for (const corner of [a, b])
      if (!corners.some((c) => samePoint(c, corner))) corners.push(corner);
    if (i !== gateIndex) {
      runs.push(segment);
      postsAlong(segment, false, false);
      return;
    }
    // branka: mezera uprostřed úseku, kůly po stranách vyšší
    const total = length(segment);
    const before = (total - GATE_WIDTH_M) / 2 / total;
    const after = (total + GATE_WIDTH_M) / 2 / total;
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const first: [Point, Point] = [a, at(before)];
    const second: [Point, Point] = [at(after), b];
    runs.push(first, second);
    postsAlong(first, false, true);
    postsAlong(second, true, false);
  });
  return { runs, posts, corners, outline };
}

/** Fáze založení pohřebiště pro vývojovou lištu (průběh 0–1, navazují na sebe). */
export const CEMETERY_PHASES = [
  { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.15 },
  { id: 'posts', label: 'zatloukání kůlů', from: 0.15, to: 0.45 },
  { id: 'wattle', label: 'pletení plotu z proutí', from: 0.45, to: 1 },
] as const;

export interface CemeteryConstruction {
  /** Čára vytyčení a kolíky v rozích. */
  layout: boolean;
  /** Podíl zatlučených kůlů 0–1. */
  posts: number;
  /** Výška upleteného plotu (m). */
  wattleHeight: number;
}

/** Co pohřebiště ukáže při průběhu založení 0–1 (hotové = celý plot). */
export function cemeteryConstruction(progress: number, built: boolean): CemeteryConstruction {
  if (built || progress >= 1) return { layout: false, posts: 1, wattleHeight: FENCE_HEIGHT_M };
  const [layout, posts, wattle] = CEMETERY_PHASES;
  const share = (phase: { from: number; to: number }): number =>
    Math.min(1, Math.max(0, (progress - phase.from) / (phase.to - phase.from)));
  return {
    layout: progress < wattle.from,
    posts: progress < layout.to ? 0 : share(posts),
    wattleHeight: progress < wattle.from ? 0 : FENCE_HEIGHT_M * (0.12 + 0.88 * share(wattle)),
  };
}
