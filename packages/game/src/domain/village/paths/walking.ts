import { length2 } from '../../landscape';
import { PATH_WALK } from '../rules';
import { PathHeap, type PathLine, type PathPoint } from './network';

// Chůze po vyšlapaných pěšinách (paths.md – Pěšiny a práce, Martin 18. 10. 2026): po pěšině se
// chodí rychleji (PATH_WALK), takže cesta z obydlí na díl pole po pěšině je „kratší“. Vzdálenost
// chůze = nejkratší z: rovně (jako dřív), nebo rovně k pěšině, po ní (úsek se počítá
// (1 − speedup × síla) × délka) a rovně od ní k cíli. Nikdy víc než rovně. Čistá deterministická
// funkce – stejně na serveru i v prohlížeči; použije ji každý, kdo měří cestu na pole.

/** Graf os pěšin – body a úseky s délkou a délkou chůze (rozcestí sdílejí bod). */
export interface WalkGraph {
  x: number[];
  z: number[];
  links: { to: number; length: number; cost: number }[][];
}

/** Délka chůze úsekem pěšiny se silou `strength` 0–1 (m) – po pěšině se jde rychleji. */
export function pathWalkLength(length: number, strength: number): number {
  return length * (1 - PATH_WALK.speedup * Math.min(1, Math.max(0, strength)));
}

/** Graf chůze z os pěšin: úsek mezi body osy, cena = délka chůze podle průměrné síly. */
export function walkGraph(lines: readonly PathLine[]): WalkGraph {
  const graph: WalkGraph = { x: [], z: [], links: [] };
  const shared = new Map<string, number>();
  const node = (p: PathPoint, end: boolean): number => {
    const key = end ? `${p.x}|${p.z}` : null;
    if (key !== null) {
      const found = shared.get(key);
      if (found !== undefined) return found;
    }
    graph.x.push(p.x);
    graph.z.push(p.z);
    graph.links.push([]);
    const id = graph.x.length - 1;
    if (key !== null) shared.set(key, id);
    return id;
  };
  for (const line of lines) {
    let prev = -1;
    line.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === line.points.length - 1);
      if (prev >= 0 && prev !== id) {
        const length = length2(graph.x[id]! - graph.x[prev]!, graph.z[id]! - graph.z[prev]!);
        const strength = (line.strength[k - 1]! + line.strength[k]!) / 2;
        const cost = pathWalkLength(length, strength);
        graph.links[prev]!.push({ to: id, length, cost });
        graph.links[id]!.push({ to: prev, length, cost });
      }
      prev = id;
    });
  }
  return graph;
}

/**
 * Vzdálenost chůze (m) z nejbližšího výchozího bodu (obydlí) ke každému cíli: rovně, nebo
 * k pěšině, po ní a od ní k cíli – kratší z obou. Bez výchozích bodů Infinity.
 */
export function walkingDistances(
  graph: WalkGraph,
  origins: readonly PathPoint[],
  targets: readonly PathPoint[],
): number[] {
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new PathHeap();
  for (let id = 0; id < n; id++) {
    let best = Infinity;
    for (const o of origins) best = Math.min(best, length2(graph.x[id]! - o.x, graph.z[id]! - o.z));
    dist[id] = best;
    if (best < Infinity) heap.push(id, best);
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    for (const { to, cost } of graph.links[c]!) {
      const nd = d + cost;
      if (nd < dist[to]!) {
        dist[to] = nd;
        heap.push(to, nd);
      }
    }
  }
  return targets.map((t) => {
    let best = Infinity;
    for (const o of origins) best = Math.min(best, length2(t.x - o.x, t.z - o.z));
    for (let id = 0; id < n; id++) {
      const via = dist[id]! + length2(t.x - graph.x[id]!, t.z - graph.z[id]!);
      if (via < best) best = via;
    }
    return best;
  });
}
