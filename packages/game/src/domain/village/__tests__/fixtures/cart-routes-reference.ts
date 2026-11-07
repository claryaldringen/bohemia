import { length2 } from '../../../landscape';
import { CART_ROUTES } from '../../rules';
import {
  CART_HEADINGS as DIRS,
  CART_HEADING_LENGTHS as DIR_LEN,
  CART_HEADING_VIA as DIR_VIA,
  type CartGrid,
  type CartRoute,
  type CartRoutesInput,
} from '../../paths/cart';
import {
  PathHeap,
  cellsIn,
  quantizedStep,
  simplifyPathLine,
  type PathPoint,
} from '../../paths/network';

// Referenční (původní) hledání tras vozu – `cartRoutesOn` před zrychlením (B2, 26. 10. 2026).
// Test `cart-routes-fast.test.ts` hlídá, že nové hledání dává bit po bitu totéž. Neupravovat.

const HEADINGS = DIRS.length;
const DIAGONAL = DIRS.map(([i, j]) => Math.abs(i) === 1 && Math.abs(j) === 1);
const DEPOT_REACH_M = 15;

/** Průchodné buňky do `radius` m od bodu (aspoň nejbližší průchodná do 3 buněk). */
function cellsNear(grid: CartGrid, p: PathPoint, radius: number): number[] {
  const out: number[] = [];
  cellsIn(grid, p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c, x, z) => {
    if (length2(x - p.x, z - p.z) <= radius && Number.isFinite(grid.cost[c]!)) out.push(c);
  });
  if (out.length > 0) return out;
  let best = -1;
  let bestD = Infinity;
  const reach = 3 * grid.cellM;
  cellsIn(grid, p.x - reach, p.z - reach, p.x + reach, p.z + reach, (c, x, z) => {
    const d = length2(x - p.x, z - p.z);
    if (Number.isFinite(grid.cost[c]!) && d < bestD) {
      best = c;
      bestD = d;
    }
  });
  return best >= 0 ? [best] : [];
}

/** Trasy vozu po mřížce – původní implementace `cartRoutesOn`. */
export function referenceCartRoutesOn(
  grid: CartGrid,
  input: Pick<CartRoutesInput, 'kind' | 'depots' | 'targets'>,
): CartRoute[] {
  const { width: w, height: h, cost, heights } = grid;
  const road = grid.road ?? null;
  const all = w * h;
  const routes: CartRoute[] = input.targets.map(() => ({
    reached: false,
    cost: Infinity,
    lengthM: 0,
    points: [],
    cells: [],
  }));
  // cíle po buňkách
  const goals = new Map<number, number[]>();
  input.targets.forEach((target, k) => {
    for (const c of cellsNear(grid, target, target.reachM)) {
      const list = goals.get(c);
      if (list) list.push(k);
      else goals.set(c, [k]);
    }
  });
  const starts = [...new Set(input.depots.flatMap((d) => cellsNear(grid, d, DEPOT_REACH_M)))];
  if (goals.size === 0 || starts.length === 0) return routes;
  const states = all * HEADINGS;
  const dist = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const heap = new PathHeap();
  for (const c of starts.sort((a, b) => a - b)) {
    for (let hd = 0; hd < HEADINGS; hd++) {
      const s = c * HEADINGS + hd;
      dist[s] = 0;
      heap.push(s, 0);
    }
  }
  const turnSteps = CART_ROUTES.turnSteps[input.kind];
  const step = grid.cellM;
  const best = new Int32Array(input.targets.length).fill(-1);
  const bestD = new Float64Array(input.targets.length).fill(Infinity);
  let left = new Set([...goals.values()].flat()).size;
  // po posledním cíli se dobírají stavy se stejnou cenou – z koncových stavů cíle (buňka × směr)
  // se stejnou cenou vyhraje nižší index (paths.md – Stálé trasy, pravidlo 3)
  let limit = Infinity;
  while (heap.size > 0 && heap.peekKey() <= limit) {
    const s = heap.pop();
    const d = heap.topKey;
    if (d > dist[s]!) continue;
    if (d > CART_ROUTES.maxCost) break;
    const c = Math.floor(s / HEADINGS);
    const hd = s - c * HEADINGS;
    const reachedHere = goals.get(c);
    if (reachedHere) {
      for (const k of reachedHere) {
        if (best[k]! < 0) {
          best[k] = s;
          bestD[k] = d;
          if (--left === 0) limit = d;
        } else if (d === bestD[k]! && s < best[k]!) best[k] = s;
      }
    }
    if (left === 0) continue;
    const i = c % w;
    const j = (c - i) / w;
    const own = cost[c]!;
    for (let turn = -turnSteps; turn <= turnSteps; turn++) {
      const k = (hd + turn + HEADINGS) % HEADINGS;
      const [di, dj] = DIRS[k]!;
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      // úhlopříčka z cesty na cestu jede po ose cesty – roh vedle (les, okraj domu) ji nezastaví;
      // pás cesty na mřížce je jen obraz osy (ohyb cesty u domu by jinak nesjel)
      let blocked = false;
      if (!(road && DIAGONAL[k] && road[c] && road[n])) {
        for (const [vi, vj] of DIR_VIA[k]!) {
          if (cost[(j + vj) * w + i + vi] === Infinity) blocked = true;
        }
      }
      if (blocked) continue;
      const length = DIR_LEN[k]! * step;
      const rise = heights ? Math.abs(heights[n]! - heights[c]!) : 0;
      const grade = rise / length;
      if (grade > CART_ROUTES.maxGrade) continue;
      const g = grade / CART_ROUTES.maxGrade;
      // cena kroku po kvantech (`quantizedStep`) – součty přesné, remízy opravdové
      const nd =
        d +
        quantizedStep(
          length * ((own + next) / 2) * (1 + CART_ROUTES.gradeCost * g * g) +
            CART_ROUTES.turnCost * Math.abs(turn),
        );
      const ns = n * HEADINGS + k;
      if (nd < dist[ns]!) {
        dist[ns] = nd;
        parent[ns] = s;
        heap.push(ns, nd);
      } else if (nd === dist[ns]! && s < parent[ns]!) {
        // remíza – vyhraje předchůdce s nižším indexem (buňka × směr)
        parent[ns] = s;
      }
    }
  }
  input.targets.forEach((_, k) => {
    const end = best[k]!;
    if (end < 0) return;
    const cells: number[] = [];
    for (let s = end; s >= 0; s = parent[s]!) {
      const c = Math.floor(s / HEADINGS);
      if (cells[cells.length - 1] !== c) cells.push(c);
    }
    cells.reverse();
    const raw = cells.map((c) => ({
      x: grid.originX + (c % w) * step,
      z: grid.originZ + Math.floor(c / w) * step,
    }));
    let lengthM = 0;
    for (let q = 1; q < raw.length; q++) {
      lengthM += length2(raw[q]!.x - raw[q - 1]!.x, raw[q]!.z - raw[q - 1]!.z);
    }
    routes[k] = {
      reached: true,
      cost: dist[end]!,
      lengthM,
      points: simplifyPathLine(raw, [], 0.5).points,
      cells,
    };
  });
  return routes;
}
