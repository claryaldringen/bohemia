import type { PathLine, PathPoint } from './path-network';
import { hash01 } from './smoke-schedule';

// Stromy podél starých pěšin přes pole (docs/design/paths.md – Martin 18. 10. 2026: v Estonsku
// a Dánsku stál statek uprostřed svých polí a cesta k němu vedla přes pole, obvykle lemovaná
// stromy). Jen scenérie, ne překážky simulace: řídké duby, jilmy a topoly po stranách silné
// a dlouho vyšlapané pěšiny tam, kde vede přes pole nebo podél něj, střídavě vlevo a vpravo
// a trochu nepravidelně. Rostou s věkem pěšiny. Čistá deterministická funkce sítě pěšin.

/** Modely stromů z krajiny (public/models/trees/) – osamělé stromy v loukách. */
export const PATH_TREE_MODELS = [
  'oak-1',
  'oak-2',
  'elm-1',
  'elm-2',
  'elm-3',
  'poplar-1',
  'poplar-2',
] as const;
export type PathTreeModel = (typeof PATH_TREE_MODELS)[number];

export interface PathTree {
  model: PathTreeModel;
  x: number;
  z: number;
  rotationY: number;
  /** Násobek velikosti modelu – mladý strom je menší. */
  scale: number;
}

export interface PathTreeOptions {
  /** Bod leží na poli nebo těsně u něj (díly polí). */
  nearField(x: number, z: number): boolean;
  /**
   * Smí tu stát strom: suchá louka mimo les, vodu, domy, ploty, zahrádky, hřbitov a sad. Pěšiny
   * samotné hlídá funkce sama.
   */
  canPlant(x: number, z: number): boolean;
}

/** Strom roste jen u silné pěšiny (síla 0–1). */
export const PATH_TREE_STRENGTH = 0.55;
/** Stromy se sázejí, až se pěšinou chodí tolik let, a plné velikosti dorostou za tolik let. */
export const PATH_TREE_YEARS = { from: 5, full: 35 } as const;
/** Mladý strom má takový díl plné velikosti. */
const YOUNG_SCALE = 0.3;
/** Rozestup stromů podél pěšiny (m) – nepravidelně v rozsahu. */
const SPACING_M = { from: 12, to: 20 } as const;
/** Strom stojí tak daleko od osy pěšiny (m) a od jiné pěšiny nejméně. */
const OFFSET_M = { from: 2.6, to: 3.8 } as const;
const PATH_CLEAR_M = 2.2;
/** Dva stromy nejméně tak daleko od sebe (m) – i z různých pěšin u rozcestí. */
const TREE_GAP_M = 8;
/** Od konce pěšiny (brána, rozcestí) se nesází (m). */
const END_CLEAR_M = 6;
/** Krok procházení osy (m). */
const WALK_STEP_M = 1;
const BUCKET_M = 10;

/** Druh stromu: polovina dubů, zbytek jilmy a topoly. */
function modelOf(seed: number): PathTreeModel {
  const r = hash01(seed, 11, 71);
  if (r < 0.5) return r < 0.25 ? 'oak-1' : 'oak-2';
  if (r < 0.78)
    return (['elm-1', 'elm-2', 'elm-3'] as const)[Math.floor(hash01(seed, 12, 71) * 3)]!;
  return hash01(seed, 13, 71) < 0.5 ? 'poplar-1' : 'poplar-2';
}

/** Velikost stromu podle stáří pěšiny (let): od sázení mladý, za PATH_TREE_YEARS.full plný. */
export function pathTreeGrowth(years: number): number {
  const t = (years - PATH_TREE_YEARS.from) / (PATH_TREE_YEARS.full - PATH_TREE_YEARS.from);
  if (t < 0) return 0;
  return YOUNG_SCALE + (1 - YOUNG_SCALE) * Math.min(1, t);
}

/** Úsečky os pěšin po kyblících – vzdálenost bodu od nejbližší pěšiny. */
function segmentIndex(lines: readonly PathLine[]): (x: number, z: number) => number {
  const buckets = new Map<string, [PathPoint, PathPoint][]>();
  for (const line of lines) {
    for (let k = 1; k < line.points.length; k++) {
      const a = line.points[k - 1]!;
      const b = line.points[k]!;
      const x0 = Math.floor(Math.min(a.x, b.x) / BUCKET_M);
      const x1 = Math.floor(Math.max(a.x, b.x) / BUCKET_M);
      const z0 = Math.floor(Math.min(a.z, b.z) / BUCKET_M);
      const z1 = Math.floor(Math.max(a.z, b.z) / BUCKET_M);
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const key = `${bx},${bz}`;
          const list = buckets.get(key);
          if (list) list.push([a, b]);
          else buckets.set(key, [[a, b]]);
        }
      }
    }
  }
  return (x, z) => {
    let best = Infinity;
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [a, b] of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
          best = Math.min(best, segmentDistance(x, z, a, b));
        }
      }
    }
    return best;
  };
}

function segmentDistance(x: number, z: number, a: PathPoint, b: PathPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/**
 * Stromy podél pěšin: po ose každé silné a staré pěšiny přes pole po 12–20 m, střídavě vlevo
 * a vpravo od osy (kde to nejde, na druhé straně, jinak nic). Stejná síť = stejné stromy.
 */
export function pathsideTrees(lines: readonly PathLine[], options: PathTreeOptions): PathTree[] {
  const distanceToPath = segmentIndex(lines);
  const placed: PathTree[] = [];
  const taken = new Map<string, PathTree[]>();
  const tooClose = (x: number, z: number): boolean => {
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const t of taken.get(`${bx + dx},${bz + dz}`) ?? []) {
          if (Math.hypot(t.x - x, t.z - z) < TREE_GAP_M) return true;
        }
      }
    }
    return false;
  };
  for (const line of lines) {
    if (line.points.length < 2 || Math.max(...line.strength) < PATH_TREE_STRENGTH) continue;
    // délky po ose
    const at = [0];
    for (let k = 1; k < line.points.length; k++) {
      const a = line.points[k - 1]!;
      const b = line.points[k]!;
      at.push(at[k - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const length = at[at.length - 1]!;
    if (length < 2 * END_CLEAR_M) continue;
    const first = line.points[0]!;
    const last = line.points[line.points.length - 1]!;
    const seed =
      (Math.round(first.x * 3) * 73856093) ^
      (Math.round(first.z * 3) * 19349663) ^
      (Math.round(last.x * 3) * 83492791) ^
      Math.round(last.z * 3);
    let k = 0;
    let next = END_CLEAR_M + hash01(seed, 1, 72) * SPACING_M.from * 0.5;
    let segment = 1;
    for (let d = END_CLEAR_M; d <= length - END_CLEAR_M; d += WALK_STEP_M) {
      if (d < next) continue;
      while (segment < at.length - 1 && at[segment]! < d) segment++;
      const a = line.points[segment - 1]!;
      const b = line.points[segment]!;
      const span = Math.max(1e-6, at[segment]! - at[segment - 1]!);
      const u = Math.min(1, Math.max(0, (d - at[segment - 1]!) / span));
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      const strength =
        line.strength[segment - 1]! + (line.strength[segment]! - line.strength[segment - 1]!) * u;
      const years =
        line.years[segment - 1]! + (line.years[segment]! - line.years[segment - 1]!) * u;
      const growth = pathTreeGrowth(years);
      if (strength < PATH_TREE_STRENGTH || growth <= 0 || !options.nearField(x, z)) continue;
      // kolmice k ose, strana se střídá
      const nx = -(b.z - a.z) / span;
      const nz = (b.x - a.x) / span;
      const treeSeed = (seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0;
      const preferred = (k + (seed & 1)) % 2 === 0 ? 1 : -1;
      const offset = OFFSET_M.from + hash01(treeSeed, 2, 72) * (OFFSET_M.to - OFFSET_M.from);
      const along = (hash01(treeSeed, 3, 72) - 0.5) * 2;
      let spot: PathPoint | null = null;
      for (const side of [preferred, -preferred]) {
        const px = x + nx * side * offset + ((b.x - a.x) / span) * along;
        const pz = z + nz * side * offset + ((b.z - a.z) / span) * along;
        if (
          options.canPlant(px, pz) &&
          distanceToPath(px, pz) >= PATH_CLEAR_M &&
          !tooClose(px, pz)
        ) {
          spot = { x: px, z: pz };
          break;
        }
      }
      k++;
      next = d + SPACING_M.from + hash01(treeSeed, 4, 72) * (SPACING_M.to - SPACING_M.from);
      if (!spot) continue;
      const tree: PathTree = {
        model: modelOf(treeSeed),
        x: spot.x,
        z: spot.z,
        rotationY: hash01(treeSeed, 5, 72) * Math.PI * 2,
        scale: growth * (0.88 + hash01(treeSeed, 6, 72) * 0.24),
      };
      placed.push(tree);
      const key = `${Math.floor(spot.x / BUCKET_M)},${Math.floor(spot.z / BUCKET_M)}`;
      const list = taken.get(key);
      if (list) list.push(tree);
      else taken.set(key, [tree]);
    }
  }
  return placed;
}
