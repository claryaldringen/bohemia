// Vyhlazení čar sítě, jejich síla a zjednodušení.
// Součást výpočtu sítě pěšin – rozcestník je network.ts (komentář k celku tam).

import { length2 } from '../../landscape';
import {
  PATH_TRAFFIC,
  type PathLine,
  type PathPoint,
  SIMPLIFY_M,
  SMOOTH_PASSES,
} from './network-types';
import { pathStrength } from './network-keys';
import { type Grid, cellX, cellZ } from './network-grid';
import { type Traffic, edgeOther, edgeSlot } from './network-search';

/**
 * Lomené čáry z hran s provozem nad prahem: řetězce mezi rozcestími, branami domů (`anchors` –
 * vyhlazení je nesmí useknout) a volnými konci, zjednodušené a vyhlazené. Síla a stáří v bodě
 * podle provozu na hranách.
 */
export function extractLines(
  grid: Grid,
  traffic: Traffic,
  anchors: ReadonlyMap<number, PathPoint>,
): PathLine[] {
  const edges = traffic.edges;
  const all = grid.width * grid.height;
  const adjacency = new Map<number, Map<number, number>>();
  const link = (a: number, b: number, t: number): void => {
    let m = adjacency.get(a);
    if (!m) {
      m = new Map();
      adjacency.set(a, m);
    }
    m.set(b, t);
  };
  for (let slot = 0; slot < edges.length; slot++) {
    const t = edges[slot]!;
    if (t < PATH_TRAFFIC.min) continue;
    const [a, b] = edgeOther(grid.width, slot);
    link(a, b, t);
    link(b, a, t);
  }
  const visited = new Set<number>();
  const edgeKey = (a: number, b: number): number => (a < b ? a * all + b : b * all + a);
  const chains: number[][] = [];
  const walk = (start: number, next: number): number[] => {
    const chain = [start];
    let prev = start;
    let cur = next;
    visited.add(edgeKey(prev, cur));
    for (;;) {
      chain.push(cur);
      const around = adjacency.get(cur)!;
      if (around.size !== 2 || anchors.has(cur)) break;
      let step = -1;
      for (const n of around.keys()) {
        if (n !== prev && !visited.has(edgeKey(cur, n))) step = n;
      }
      if (step < 0) break;
      visited.add(edgeKey(cur, step));
      prev = cur;
      cur = step;
    }
    return chain;
  };
  const nodes = [...adjacency.keys()].sort((a, b) => a - b);
  for (const node of nodes) {
    const around = adjacency.get(node)!;
    if (around.size === 2 && !anchors.has(node)) continue;
    for (const n of [...around.keys()].sort((a, b) => a - b)) {
      if (!visited.has(edgeKey(node, n))) chains.push(walk(node, n));
    }
  }
  // samotné okruhy (všechny uzly se dvěma sousedy)
  for (const node of nodes) {
    for (const n of [...adjacency.get(node)!.keys()].sort((a, b) => a - b)) {
      if (!visited.has(edgeKey(node, n))) chains.push(walk(node, n));
    }
  }
  const lines: PathLine[] = [];
  for (const chain of chains) {
    if (chain.length < 2) continue;
    // u brány domu pěšina končí přesně u ní (střed buňky může být kus vedle)
    const points = chain.map((c) => anchors.get(c) ?? { x: cellX(grid, c), z: cellZ(grid, c) });
    // mezi rozcestími vedou po hranách řetězce tytéž trasy – síla je skoro stálá
    const strength: number[] = [];
    const years: number[] = [];
    chain.forEach((c, k) => {
      // silnější ze dvou hran řetězce u bodu
      let slot = -1;
      for (const n of [chain[k - 1], chain[k + 1]]) {
        if (n === undefined) continue;
        const candidate = edgeSlot(grid.width, c, n);
        if (slot < 0 || edges[candidate]! > edges[slot]!) slot = candidate;
      }
      const t = slot >= 0 ? edges[slot]! : 0;
      strength.push(pathStrength(t));
      years.push(t > 0 ? traffic.edgeYears[slot]! / t : 0);
    });
    const first = adjacency.get(chain[0]!)!.size;
    const last = adjacency.get(chain[chain.length - 1]!)!.size;
    const simple = simplifyPathLine(points, [strength, years], SIMPLIFY_M);
    const smoothed = smoothPathLine(simple.points, simple.values, SMOOTH_PASSES);
    lines.push({
      points: smoothed.points,
      strength: smoothed.values[0]!,
      years: smoothed.values[1]!,
      openStart: first === 1 || anchors.has(chain[0]!),
      openEnd: last === 1 || anchors.has(chain[chain.length - 1]!),
    });
  }
  return lines;
}

/** Douglasův–Peuckerův algoritmus (konce zůstanou) – hodnoty v bodech (síla…) v ponechaných. */
export function simplifyPathLine(
  points: readonly PathPoint[],
  values: readonly (readonly number[])[],
  tolerance: number,
): { points: PathPoint[]; values: number[][] } {
  if (points.length <= 2) return { points: [...points], values: values.map((v) => [...v]) };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const length = length2(dx, dz);
    let worst = -1;
    let worstD = tolerance;
    for (let k = a + 1; k < b; k++) {
      const p = points[k]!;
      const d =
        length > 1e-9
          ? Math.abs((p.x - pa.x) * dz - (p.z - pa.z) * dx) / length
          : length2(p.x - pa.x, p.z - pa.z);
      if (d > worstD) {
        worst = k;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const outPoints: PathPoint[] = [];
  const outValues: number[][] = values.map(() => []);
  for (let k = 0; k < points.length; k++) {
    if (!keep[k]) continue;
    outPoints.push(points[k]!);
    values.forEach((v, i) => outValues[i]!.push(v[k]!));
  }
  return { points: outPoints, values: outValues };
}

/** Chaikinovo vyhlazení lomené čáry (konce zůstanou na místě), hodnoty v bodech se interpolují. */
export function smoothPathLine(
  points: readonly PathPoint[],
  values: readonly (readonly number[])[],
  passes: number,
): { points: PathPoint[]; values: number[][] } {
  let p = [...points];
  let vs = values.map((v) => [...v]);
  for (let pass = 0; pass < passes && p.length > 2; pass++) {
    const np: PathPoint[] = [p[0]!];
    const nv: number[][] = vs.map((v) => [v[0]!]);
    const mix = (k: number, t: number): void =>
      vs.forEach((v, i) => nv[i]!.push(v[k]! * (1 - t) + v[k + 1]! * t));
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k]!;
      const b = p[k + 1]!;
      if (k > 0) {
        np.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
        mix(k, 0.25);
      }
      if (k < p.length - 2) {
        np.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
        mix(k, 0.75);
      }
    }
    np.push(p[p.length - 1]!);
    vs.forEach((v, i) => nv[i]!.push(v[v.length - 1]!));
    p = np;
    vs = nv;
  }
  return { points: p, values: vs };
}
