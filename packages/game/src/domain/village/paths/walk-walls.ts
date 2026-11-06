import type { FortWalls } from '../fortification/walls';
import type { Point } from '../polygon';
import { length2 } from '../../landscape';
import type { PathPoint } from './network-types';

// Stěny opevnění pro odhad chůze a trasy postav (fortifications.md – Obvod, Brány; Martin
// 6. 11. 2026: opevnění blokuje chodce celým obvodem kromě bran). Síť pěšin stěny zná po buňkách
// (`fortWallCells`), chůze po síti (`walking.ts`) jde ale i rovně – k pěšině, od ní k cíli – a po
// osách pevných cest, které stěnu mohou protnout mimo bránu (brána je nejvýš jedna na úsek, cesta
// se mohla přestavět). Úsečka přes stěnu proto jde objížďkou přes bránu (`wallDetour`); přes stěnu
// se „leze“ s velkou přirážkou jen tam, kam se branou rovně dojít nedá. Jen deterministická
// matematika (server i prohlížeč počítají totéž).

/**
 * Jak daleko (m) od otvoru brány smí osa pěšiny zasáhnout do stěny (návrh Clauda 6. 11. 2026): osa
 * stálé trasy jde středy buněk mřížky, kterých se otvor brány dotkne (`fortWallCells`) – kousek
 * vedle otvoru je pořád průchod branou, ne stěnou. Úsečky rovně a osy pevných cest bez rezervy.
 */
export const GATE_SLACK_M = 1;
/**
 * Přirážka (m chůze) za úsečku přes stěnu, kterou nejde objet branou (návrh Clauda 6. 11. 2026) –
 * poslední záchrana: tak velká, že chodec jde vždy branou, kudy to jde; konečná, aby odhad
 * simulace zůstal číslem i bez spojení.
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

/** Jak daleko (m) od rohu stěny stojí bod objížďky (`wallDetour` – návrh Clauda 6. 11. 2026). */
const DETOUR_CORNER_M = 1;

/** Body objížďky stěn a nejkratší cesty mezi nimi (vzdálenost a další bod), v paměti podle stěn. */
interface DetourGraph {
  readonly pts: readonly PathPoint[];
  readonly dist: Float64Array;
  readonly next: Int32Array;
  /** Dosah bodů do bodů objížďky (`reachOf`). */
  readonly reach: Map<string, { cost: Float64Array; via: Int32Array }>;
}
const detourGraphs = new WeakMap<WalkWalls, DetourGraph>();

/**
 * Graf objížďky: středy otvorů bran a vypouklé rohy pásu stěn odsazené o DETOUR_CORNER_M ven
 * (podél obou vnějších normál hran v rohu); úsečky mezi nimi bez stěny; nejkratší cesty mezi všemi
 * dvojicemi (Floydův–Warshallův algoritmus, při shodě dřívější).
 */
function detourGraphOf(walls: WalkWalls): DetourGraph {
  const known = detourGraphs.get(walls);
  if (known) return known;
  const pts: PathPoint[] = [...walls.centers];
  const clear = DETOUR_CORNER_M * DETOUR_CORNER_M * 0.25;
  for (const q of walls.walls) {
    const n = q.pts.length;
    for (let i = 0; i < n; i++) {
      const p = q.pts[i]!;
      const before = q.pts[(i + n - 1) % n]!;
      const after = q.pts[(i + 1) % n]!;
      // vnější normály hran před rohem a za ním (vnitřek je na straně `sign`)
      const normal = (from: Point, to: Point): [number, number] => {
        const ex = to[0] - from[0];
        const ez = to[1] - from[1];
        const len = length2(ex, ez) || 1;
        return [(q.sign * ez) / len, (-q.sign * ex) / len];
      };
      const [ax, az] = normal(before, p);
      const [bx, bz] = normal(p, after);
      // spoj kusů rovné stěny (obě hrany míří stejně) objížďku nezkrátí
      if (ax * bx + az * bz > 0.999) continue;
      const x = p[0] + (ax + bx) * DETOUR_CORNER_M;
      const z = p[1] + (az + bz) * DETOUR_CORNER_M;
      // jen vypouklý roh pásu (volno podél obou hran i šikmo) – u vnitřního rohu ani u spoje se
      // nejkratší cesta nezlomí
      const free = (fx: number, fz: number): boolean =>
        !walls.walls.some((w) => squaredDistance(w, fx, fz) < clear);
      if (!free(x, z)) continue;
      if (!free(p[0] + ax * DETOUR_CORNER_M, p[1] + az * DETOUR_CORNER_M)) continue;
      if (!free(p[0] + bx * DETOUR_CORNER_M, p[1] + bz * DETOUR_CORNER_M)) continue;
      if (pts.some((o) => (o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < clear)) continue;
      pts.push({ x, z });
    }
  }
  const w = pts.length;
  const dist = new Float64Array(w * w).fill(Infinity);
  const next = new Int32Array(w * w).fill(-1);
  for (let i = 0; i < w; i++) {
    dist[i * w + i] = 0;
    next[i * w + i] = i;
    for (let j = i + 1; j < w; j++) {
      const a = pts[i]!;
      const b = pts[j]!;
      if (cutsWall(walls, a, b)) continue;
      const d = length2(b.x - a.x, b.z - a.z);
      dist[i * w + j] = d;
      dist[j * w + i] = d;
      next[i * w + j] = j;
      next[j * w + i] = i;
    }
  }
  for (let k = 0; k < w; k++) {
    for (let i = 0; i < w; i++) {
      const ik = dist[i * w + k]!;
      if (ik === Infinity) continue;
      for (let j = 0; j < w; j++) {
        const d = ik + dist[k * w + j]!;
        if (d < dist[i * w + j]!) {
          dist[i * w + j] = d;
          next[i * w + j] = next[i * w + k]!;
        }
      }
    }
  }
  const graph = { pts, dist, next, reach: new Map() };
  detourGraphs.set(walls, graph);
  return graph;
}

/** Kolik bodů si graf objížďky pamatuje dosah (`DetourGraph.reach`), pak začne znovu. */
const DETOUR_MEMO = 4096;

/**
 * Dosah bodu `a` do bodů objížďky: nejkratší cesta a → (rovně bez stěny) bod i → po grafu bod j
 * (`cost[j]`, první bod `via[j]`); v paměti grafu podle bodu a rezervy.
 */
function reachOf(
  walls: WalkWalls,
  g: DetourGraph,
  a: PathPoint,
  slack: number,
): { cost: Float64Array; via: Int32Array } {
  const key = `${a.x}|${a.z}|${slack}`;
  const known = g.reach.get(key);
  if (known) return known;
  const w = g.pts.length;
  const cost = new Float64Array(w).fill(Infinity);
  const via = new Int32Array(w).fill(-1);
  for (let i = 0; i < w; i++) {
    const p = g.pts[i]!;
    if (cutsWall(walls, a, p, slack)) continue;
    const d = length2(p.x - a.x, p.z - a.z);
    for (let j = 0; j < w; j++) {
      const c = d + g.dist[i * w + j]!;
      if (c < cost[j]!) {
        cost[j] = c;
        via[j] = i;
      }
    }
  }
  if (g.reach.size >= DETOUR_MEMO) g.reach.clear();
  const found = { cost, via };
  g.reach.set(key, found);
  return found;
}

/**
 * Objížďka úsečky a → b přes stěnu opevnění (fortifications.md – Brány): nejkratší lomená čára
 * a → body objížďky → b bez stěny – rovně k bráně, branou, kolem rohů stěn k cíli (`detourGraphOf`;
 * středy bran jsou jeho body, takže objížďka jednou branou je mezi nimi) jako body mezi `a` a `b`,
 * při shodě dřívější body. Rovně z `a` a do `b` s rezervou `slack` u bran (osa pěšiny). Kam se bez
 * stěny dojít nedá (kout mezi stěnami bez brány), 'none'; objížďka aspoň `limit` m (vzdušnou
 * čarou po lomené čáře – chůze je aspoň tak dlouhá) se nedopočítá – 'far'.
 */
export function wallDetour(
  walls: WalkWalls,
  a: PathPoint,
  b: PathPoint,
  slack = 0,
  limit = Infinity,
): PathPoint[] | 'none' | 'far' {
  const g = detourGraphOf(walls);
  const w = g.pts.length;
  const from = reachOf(walls, g, a, slack);
  // konec objížďky v pořadí dolní meze (dosah + vzdušnou čarou k cíli) – první, od kterého se
  // k cíli jde bez stěny, je nejkratší
  const bound = new Float64Array(w);
  for (let j = 0; j < w; j++) {
    const r = from.cost[j]!;
    const p = g.pts[j]!;
    bound[j] = r === Infinity ? Infinity : r + length2(b.x - p.x, b.z - p.z);
  }
  let end = -1;
  for (;;) {
    let best = Infinity;
    let pick = -1;
    for (let j = 0; j < w; j++) {
      if (bound[j]! < best) {
        best = bound[j]!;
        pick = j;
      }
    }
    if (pick < 0) return 'none';
    if (best >= limit) return 'far';
    if (!cutsWall(walls, g.pts[pick]!, b, slack)) {
      end = pick;
      break;
    }
    bound[pick] = Infinity;
  }
  const out: PathPoint[] = [];
  let k = from.via[end]!;
  out.push(g.pts[k]!);
  while (k !== end) {
    k = g.next[k * w + end]!;
    out.push(g.pts[k]!);
  }
  return out;
}
