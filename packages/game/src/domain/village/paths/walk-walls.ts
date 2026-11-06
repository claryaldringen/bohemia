import type { FortWalls } from '../fortification/walls';
import type { Point } from '../polygon';
import { FORTIFICATIONS } from '../rules-fortifications';
import type { PathPoint } from './network-types';

// Stěny opevnění pro odhad chůze a trasy postav (fortifications.md – Obvod, Brány; Martin
// 6. 11. 2026: opevnění blokuje chodce celým obvodem kromě bran). Síť pěšin stěny zná po buňkách
// (`fortWallCells`), chůze po síti (`walking.ts`) jde ale i rovně – k pěšině, od ní k cíli – a po
// osách pevných cest, které stěnu mohou protnout mimo bránu (brána je nejvýš jedna na úsek, cesta
// se mohla přestavět). Úsečka přes stěnu proto jde branou, je-li blízko, jinak se přes stěnu
// „leze“ s velkou přirážkou – chodec ji vezme, jen když jinudy nejde. Jen sčítání a násobení
// (deterministická vrstva – server i prohlížeč počítají totéž).

/**
 * Jak daleko (m) od otvoru brány smí osa pěšiny zasáhnout do stěny (návrh Clauda 6. 11. 2026): osa
 * stálé trasy jde středy buněk mřížky, kterých se otvor brány dotkne (`fortWallCells`) – kousek
 * vedle otvoru je pořád průchod branou, ne stěnou. Úsečky rovně a osy pevných cest bez rezervy.
 */
export const GATE_SLACK_M = 1;
/**
 * Přirážka (m chůze) za úsečku přes stěnu mimo bránu (návrh Clauda 6. 11. 2026): tak velká, že
 * chodec jde vždy branou, kudy to jde; konečná, aby odhad simulace zůstal číslem i bez spojení.
 */
export const WALL_CLIMB_M = 1000;
/** Úsečka, která do stěny zasáhne méně (m), se jí jen dotkne. */
const TOUCH_M = 0.01;

/** Konvexní čtyřúhelník stěny nebo otvoru brány s obalem a směrem obíhání. */
interface WallQuad {
  readonly pts: readonly Point[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** +1 / −1 podle směru obíhání rohů – vnitřek je na této straně hran. */
  readonly sign: number;
}

/** Stěny a brány opevnění vsi pro chůzi (`WalkGround.walls`). */
export interface WalkWalls {
  readonly walls: readonly WallQuad[];
  readonly gates: readonly WallQuad[];
  /** Středy otvorů bran (v pořadí `gates`). */
  readonly centers: readonly PathPoint[];
  /** Obal všech stěn. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function quadOf(pts: readonly Point[]): WallQuad | null {
  let area = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
    minX = Math.min(minX, a[0]);
    maxX = Math.max(maxX, a[0]);
    minZ = Math.min(minZ, a[1]);
    maxZ = Math.max(maxZ, a[1]);
  }
  if (pts.length < 3 || Math.abs(area) < 1e-9) return null;
  return { pts, minX, maxX, minZ, maxZ, sign: area > 0 ? 1 : -1 };
}

/** Stěny opevnění vsi (`PathFortification` – `fortWalls`) pro chůzi; bez stěn null. */
export function walkWallsOf(forts: readonly FortWalls[] | undefined): WalkWalls | null {
  const walls: WallQuad[] = [];
  const gates: WallQuad[] = [];
  for (const f of forts ?? []) {
    for (const w of f.walls) {
      const q = quadOf(w);
      if (q) walls.push(q);
    }
    for (const g of f.gates) {
      const q = quadOf(g);
      if (q) gates.push(q);
    }
  }
  if (walls.length === 0) return null;
  const centers = gates.map((g) => {
    let x = 0;
    let z = 0;
    for (const p of g.pts) {
      x += p[0];
      z += p[1];
    }
    return { x: x / g.pts.length, z: z / g.pts.length };
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.minX);
    maxX = Math.max(maxX, w.maxX);
    minZ = Math.min(minZ, w.minZ);
    maxZ = Math.max(maxZ, w.maxZ);
  }
  return { walls, gates, centers, minX, maxX, minZ, maxZ };
}

/**
 * Část úsečky a → b uvnitř čtyřúhelníku (Cyrusův–Beckův ořez) jako [t0, t1], nebo null, když jím
 * neprojde (dotyk okraje se nepočítá).
 */
function clip(q: WallQuad, a: PathPoint, b: PathPoint): [number, number] | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  const n = q.pts.length;
  for (let i = 0; i < n; i++) {
    const p = q.pts[i]!;
    const r = q.pts[(i + 1) % n]!;
    const ex = r[0] - p[0];
    const ez = r[1] - p[1];
    // vnitřek: sign · (e × (bod − p)) > 0
    const num = q.sign * (ex * (a.z - p[1]) - ez * (a.x - p[0]));
    const den = q.sign * (ex * dz - ez * dx);
    if (den === 0) {
      if (num <= 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  const span = t1 - t0;
  return span * span * (dx * dx + dz * dz) > TOUCH_M * TOUCH_M ? [t0, t1] : null;
}

/** Druhá mocnina vzdálenosti bodu od čtyřúhelníku (uvnitř 0). */
function squaredDistance(q: WallQuad, x: number, z: number): number {
  const n = q.pts.length;
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const p = q.pts[i]!;
    const r = q.pts[(i + 1) % n]!;
    const ex = r[0] - p[0];
    const ez = r[1] - p[1];
    if (q.sign * (ex * (z - p[1]) - ez * (x - p[0])) < 0) inside = false;
    const len = ex * ex + ez * ez;
    const t = len > 0 ? Math.min(1, Math.max(0, ((x - p[0]) * ex + (z - p[1]) * ez) / len)) : 0;
    const ox = x - (p[0] + ex * t);
    const oz = z - (p[1] + ez * t);
    best = Math.min(best, ox * ox + oz * oz);
  }
  return inside ? 0 : best;
}

/**
 * Projde úsečka a → b stěnou opevnění mimo bránu? Část uvnitř stěny, celá nejvýš `slack` m od
 * otvoru některé brány, je průchod branou (okolí otvoru je konvexní – stačí oba konce části).
 */
export function cutsWall(walls: WalkWalls, a: PathPoint, b: PathPoint, slack = 0): boolean {
  if (
    Math.max(a.x, b.x) < walls.minX ||
    Math.min(a.x, b.x) > walls.maxX ||
    Math.max(a.z, b.z) < walls.minZ ||
    Math.min(a.z, b.z) > walls.maxZ
  ) {
    return false;
  }
  const reach = slack * slack;
  for (const q of walls.walls) {
    if (
      Math.max(a.x, b.x) <= q.minX ||
      Math.min(a.x, b.x) >= q.maxX ||
      Math.max(a.z, b.z) <= q.minZ ||
      Math.min(a.z, b.z) >= q.maxZ
    ) {
      continue;
    }
    const part = clip(q, a, b);
    if (!part) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const x0 = a.x + dx * part[0];
    const z0 = a.z + dz * part[0];
    const x1 = a.x + dx * part[1];
    const z1 = a.z + dz * part[1];
    const byGate = walls.gates.some(
      (g) => squaredDistance(g, x0, z0) <= reach && squaredDistance(g, x1, z1) <= reach,
    );
    if (!byGate) return true;
  }
  return false;
}

/**
 * Brána, kterou jde úsečka a → b přes stěnu (`cutsWall` s rezervou `slack`): střed otvoru brány
 * nejvýš dvě šířky brány od úsečky, ze kterého a do kterého se jde bez stěny (nejbližší, při shodě
 * první); jinak null.
 */
export function gateDetour(
  walls: WalkWalls,
  a: PathPoint,
  b: PathPoint,
  slack = 0,
): PathPoint | null {
  const reach = 4 * FORTIFICATIONS.gate.widthM * FORTIFICATIONS.gate.widthM;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const near: { k: number; d: number }[] = [];
  walls.centers.forEach((c, k) => {
    const t = len > 0 ? Math.min(1, Math.max(0, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len)) : 0;
    const ox = c.x - (a.x + dx * t);
    const oz = c.z - (a.z + dz * t);
    const d = ox * ox + oz * oz;
    if (d <= reach) near.push({ k, d });
  });
  near.sort((p, q) => p.d - q.d || p.k - q.k);
  for (const { k } of near) {
    const c = walls.centers[k]!;
    if (!cutsWall(walls, a, c, slack) && !cutsWall(walls, c, b, slack)) return c;
  }
  return null;
}
