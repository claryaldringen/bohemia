import { PathHeap, walkGraph, type PathNetwork, type PathPoint } from '@bohemia/game';

// Chůze postav po vyšlapaných pěšinách (paths.md): k nejbližšímu bodu pěšiny, po ní (graf os ze
// stejné funkce jako vzdálenost chůze dílů na serveru – `walkGraph`) a od ní k cíli. Po pěšině se
// chodí rychleji (PATH_WALK) – trasa nese tempo každého úseku. Jen vzhled.

/** Trasa postavy po pěšinách: body [x, z] od startu do cíle a tempo úseků (1 = mimo pěšinu). */
export interface PathRoute {
  points: [number, number][];
  /** Násobek rychlosti chůze na úseku `i` (mezi body i a i + 1) – na pěšině víc než 1. */
  pace: number[];
}

/** Na pěšinu se odbočí nejvýš z takové dálky (m). */
const ENTRY_MAX_M = 30;
/** Trasa po pěšinách smí trvat nejvýš tolikrát (a o tolik m chůze) déle než přímá – jinak rovně. */
const DETOUR = { factor: 1.7, extraM: 12 } as const;
/** Kolik tras si hledání pamatuje (pak začne znovu). */
const MEMO_SIZE = 4000;
/** Mřížka pro hledání nejbližšího bodu pěšiny (m). */
const BUCKET_M = 12;

export interface PathRouter {
  /**
   * Trasa z `a` do `b` po pěšinách (k nejbližšímu bodu pěšiny, po ní, od ní k cíli). Cíl smí být
   * od pěšiny nejvýš `reach` m (bez údaje ENTRY_MAX_M) – na díl daleko v poli se jde po pěšině
   * k poli a dál přes pole.
   */
  route(a: PathPoint, b: PathPoint, reach?: number): PathRoute | null;
}

/** Hledání tras po pěšinách sítě – graf bodů os (rozcestí sdílejí bod). */
export function pathRouter(network: Pick<PathNetwork, 'lines'>): PathRouter {
  const graph = walkGraph(network.lines);
  const { x: xs, z: zs, links } = graph;
  const buckets = new Map<string, number[]>();
  const bucketKey = (bx: number, bz: number): string => `${bx},${bz}`;
  for (let id = 0; id < xs.length; id++) {
    const key = bucketKey(Math.floor(xs[id]! / BUCKET_M), Math.floor(zs[id]! / BUCKET_M));
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  }
  const nearest = (p: PathPoint, maxM = ENTRY_MAX_M): number => {
    const bx = Math.floor(p.x / BUCKET_M);
    const bz = Math.floor(p.z / BUCKET_M);
    const reach = Math.ceil(maxM / BUCKET_M);
    let best = -1;
    let bestD = maxM;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const id of buckets.get(bucketKey(bx + dx, bz + dz)) ?? []) {
          const d = Math.hypot(xs[id]! - p.x, zs[id]! - p.z);
          if (d < bestD) {
            best = id;
            bestD = d;
          }
        }
      }
    }
    return best;
  };
  // trasy se pamatují (postavy se rozmísťují znovu s každou změnou vsi a chodí po týchž
  // trasách – provoz na cestách, nosiči); vrácená trasa se nemění
  const memo = new Map<string, PathRoute | null>();
  const find = (a: PathPoint, b: PathPoint, reach: number): PathRoute | null => {
    if (xs.length === 0) return null;
    const from = nearest(a);
    const to = nearest(b, reach);
    if (from < 0 || to < 0 || from === to) return null;
    // Dijkstra po grafu os podle délky chůze (malý – stovky až tisíce bodů)
    const dist = new Float64Array(xs.length).fill(Infinity);
    const parent = new Int32Array(xs.length).fill(-1);
    const via = new Int32Array(xs.length).fill(-1);
    const heap = new PathHeap();
    dist[from] = 0;
    heap.push(from, 0);
    while (heap.size > 0) {
      const c = heap.pop();
      const d = heap.topKey;
      if (d > dist[c]!) continue;
      if (c === to) break;
      links[c]!.forEach(({ to: n, cost }, k) => {
        const nd = d + cost;
        if (nd < dist[n]!) {
          dist[n] = nd;
          parent[n] = c;
          via[n] = k;
          heap.push(n, nd);
        }
      });
    }
    if (!Number.isFinite(dist[to]!)) return null;
    const chain: number[] = [];
    for (let c = to; c >= 0; c = parent[c]!) chain.push(c);
    chain.reverse();
    const points: [number, number][] = [[a.x, a.z]];
    const pace: number[] = [1];
    chain.forEach((id, k) => {
      points.push([xs[id]!, zs[id]!]);
      if (k === 0) return;
      const link = links[parent[id]!]![via[id]!]!;
      pace.push(link.cost > 0 ? link.length / link.cost : 1);
    });
    points.push([b.x, b.z]);
    pace.push(1);
    const legs =
      Math.hypot(xs[from]! - a.x, zs[from]! - a.z) + Math.hypot(b.x - xs[to]!, b.z - zs[to]!);
    const direct = Math.hypot(b.x - a.x, b.z - a.z);
    if (legs + dist[to]! > direct * DETOUR.factor + DETOUR.extraM) return null;
    return { points, pace };
  };
  return {
    route(a, b, reach = ENTRY_MAX_M) {
      const key = `${a.x.toFixed(2)},${a.z.toFixed(2)},${b.x.toFixed(2)},${b.z.toFixed(2)},${reach}`;
      if (memo.has(key)) return memo.get(key)!;
      if (memo.size >= MEMO_SIZE) memo.clear();
      const found = find(a, b, reach);
      memo.set(key, found);
      return found;
    },
  };
}
