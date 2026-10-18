import { length2, type Landscape } from '../../landscape';
import { PATH_WALK, ROAD_WALK } from '../rules';
import type { RoadGrade, RoadGround } from '../types';
import { PathHeap, type PathLine, type PathPoint } from './network';
import {
  PATH_WATER,
  PATH_WETLAND,
  pathTerrainOf,
  pathWindowFor,
  type PathTerrain,
} from './terrain';

// Chůze po vyšlapaných pěšinách a pevných cestách (paths.md – Pěšiny a práce, roads.md –
// Rychlejší chůze): vzdálenost chůze = nejkratší z: rovně, nebo rovně k pěšině či cestě, po ní
// a rovně od ní k cíli. Po pěšině se chodí rychleji (PATH_WALK podle síly), po pevné cestě podle
// stupně (ROAD_WALK – vyšlapaná 1,2×, upravená 1,5×). Mokřina se počítá dvojnásobně (bahno – po
// hati 1,5×), brod + 30 m (po lávce bez zdržení). S krajinou (`WalkGround`) se mokřina a voda
// počítají i rovně; bez ní (kalibrace) jen délka – jako dřív. Čistá deterministická funkce –
// stejně na serveru i v prohlížeči; použije ji každý, kdo měří cestu na pole, do sadu, do lesa.

/** Graf chůze – body a úseky s délkou a cenou chůze (rozcestí sdílejí bod). */
export interface WalkGraph {
  x: number[];
  z: number[];
  links: { to: number; length: number; cost: number }[][];
}

/** Pevná cesta pro chůzi – osa, stupeň a mokřina s brody na ose. */
export interface WalkRoad {
  points: readonly PathPoint[];
  grade: RoadGrade;
  ground?: RoadGround;
}

/**
 * Půda pro chůzi rovně: terén pěšin v pevném okně kolem místa vsi (stejném na serveru
 * i v prohlížeči – na kouscích ani na tom, co je kde v mezipaměti, výsledek nezávisí). Mimo okno
 * je to louka.
 */
export interface WalkGround {
  terrain: PathTerrain;
}

/** Okno půdy pro chůzi: tolik metrů od středu místa vsi na každou stranu. */
const WALK_GROUND_HALF_M = 700;
const groundCache = new WeakMap<Landscape, WalkGround>();

/** Půda pro chůzi v krajině sídla (terén pěšin kolem místa vsi; v mezipaměti podle krajiny). */
export function walkGroundOf(landscape: Landscape): WalkGround {
  const cached = groundCache.get(landscape);
  if (cached) return cached;
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const cx = -half + (landscape.villageSite.x + 0.5) * landscape.cellSizeM;
  const cz = -half + (landscape.villageSite.y + 0.5) * landscape.cellSizeM;
  const window = pathWindowFor(landscape, {
    minX: cx - WALK_GROUND_HALF_M,
    minZ: cz - WALK_GROUND_HALF_M,
    maxX: cx + WALK_GROUND_HALF_M,
    maxZ: cz + WALK_GROUND_HALF_M,
  });
  const ground = { terrain: pathTerrainOf(landscape, window) };
  groundCache.set(landscape, ground);
  return ground;
}

/**
 * Délka chůze rovně z `a` do `b` (m): po půlbuňkách terénu – mokřina dvojnásobně, každé vstoupení
 * do vody (brod, potok) + ROAD_WALK.fordExtraM. Bez půdy délka úsečky.
 */
export function groundWalkLength(
  ground: WalkGround | null | undefined,
  a: PathPoint,
  b: PathPoint,
): number {
  const length = length2(b.x - a.x, b.z - a.z);
  if (!ground || length === 0) return length;
  const t = ground.terrain;
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const piece = length / n;
  let cost = 0;
  let inWater = false;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const i = Math.round((a.x + (b.x - a.x) * u - t.originX) / t.cellM);
    const j = Math.round((a.z + (b.z - a.z) * u - t.originZ) / t.cellM);
    let factor = 1;
    let water = false;
    if (i >= 0 && j >= 0 && i < t.width && j < t.height) {
      const c = j * t.width + i;
      const flags = t.flags[c]!;
      water = (flags & PATH_WATER) !== 0;
      if (flags & PATH_WETLAND) factor = 1 / ROAD_WALK.wetSpeed;
    }
    if (water && !inWater) cost += ROAD_WALK.fordExtraM;
    inWater = water;
    cost += piece * factor;
  }
  return cost;
}

/** Délka chůze úsekem pěšiny se silou `strength` 0–1 (m) – po pěšině se jde rychleji. */
export function pathWalkLength(length: number, strength: number): number {
  return length * (1 - PATH_WALK.speedup * Math.min(1, Math.max(0, strength)));
}

/** Rychlost chůze po pevné cestě proti louce – podle stupně a mokřiny. */
export function roadWalkSpeed(grade: RoadGrade, wet: boolean): number {
  if (!wet) return ROAD_WALK.speed[grade];
  return grade === 'causeway' ? ROAD_WALK.causewayWetSpeed : ROAD_WALK.wetSpeed;
}

/**
 * Cena chůze úsekem osy pevné cesty od `from` do `to` m od začátku osy: kusy v mokřině a mimo ni
 * podle rychlosti, brody v úseku + ROAD_WALK.fordExtraM (po lávce – hať a lávka – nic).
 */
export function roadPieceCost(road: WalkRoad, from: number, to: number): number {
  const wet = road.ground?.wet ?? [];
  let cost = 0;
  let at = from;
  for (const [a, b] of wet) {
    if (b <= at || a >= to) continue;
    const start = Math.max(at, a);
    const end = Math.min(to, b);
    cost += (start - at) / roadWalkSpeed(road.grade, false);
    cost += (end - start) / roadWalkSpeed(road.grade, true);
    at = end;
  }
  cost += Math.max(0, to - at) / roadWalkSpeed(road.grade, false);
  if (road.grade !== 'causeway') {
    for (const ford of road.ground?.fords ?? []) {
      if (ford >= from && ford < to) cost += ROAD_WALK.fordExtraM;
    }
  }
  return cost;
}

/**
 * Graf chůze z os pěšin (úsek mezi body osy – cena podle průměrné síly, s mokřinou a vodou
 * z `ground`) a pevných cest (`roads` – podle stupně, mokřiny a brodů na ose). Konce os se stejnými
 * souřadnicemi sdílejí bod (rozcestí).
 */
export function walkGraph(
  lines: readonly PathLine[],
  options: { roads?: readonly WalkRoad[]; ground?: WalkGround | null } = {},
): WalkGraph {
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
  const link = (a: number, b: number, length: number, cost: number): void => {
    graph.links[a]!.push({ to: b, length, cost });
    graph.links[b]!.push({ to: a, length, cost });
  };
  for (const line of lines) {
    let prev = -1;
    line.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === line.points.length - 1);
      if (prev >= 0 && prev !== id) {
        const a = { x: graph.x[prev]!, z: graph.z[prev]! };
        const length = length2(p.x - a.x, p.z - a.z);
        const strength = (line.strength[k - 1]! + line.strength[k]!) / 2;
        const walk = options.ground ? groundWalkLength(options.ground, a, p) : length;
        link(prev, id, length, pathWalkLength(walk, strength));
      }
      prev = id;
    });
  }
  for (const road of options.roads ?? []) {
    let prev = -1;
    let along = 0;
    road.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === road.points.length - 1);
      if (prev >= 0) {
        const length = length2(p.x - graph.x[prev]!, p.z - graph.z[prev]!);
        if (prev !== id) link(prev, id, length, roadPieceCost(road, along, along + length));
        along += length;
      }
      prev = id;
    });
  }
  return graph;
}

/**
 * Vzdálenost chůze (m) z nejbližšího výchozího bodu (obydlí) ke každému cíli: rovně, nebo
 * k pěšině či cestě, po ní a od ní k cíli – kratší z obou. Rovně podle půdy (`ground` – mokřina,
 * voda), bez ní délka úsečky. Bez výchozích bodů Infinity.
 */
export function walkingDistances(
  graph: WalkGraph,
  origins: readonly PathPoint[],
  targets: readonly PathPoint[],
  ground: WalkGround | null = null,
): number[] {
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new PathHeap();
  const straight = (a: PathPoint, x: number, z: number): number =>
    ground ? groundWalkLength(ground, a, { x, z }) : length2(x - a.x, z - a.z);
  for (let id = 0; id < n; id++) {
    let best = Infinity;
    for (const o of origins) {
      // rovně je vždy aspoň délka úsečky – dražší výpočet půdy jen u kandidátů
      if (length2(graph.x[id]! - o.x, graph.z[id]! - o.z) >= best) continue;
      best = Math.min(best, straight(o, graph.x[id]!, graph.z[id]!));
    }
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
    for (const o of origins) {
      if (length2(t.x - o.x, t.z - o.z) >= best) continue;
      best = Math.min(best, straight(o, t.x, t.z));
    }
    for (let id = 0; id < n; id++) {
      const reached = dist[id]!;
      if (reached + length2(t.x - graph.x[id]!, t.z - graph.z[id]!) >= best) continue;
      const via = reached + straight({ x: graph.x[id]!, z: graph.z[id]! }, t.x, t.z);
      if (via < best) best = via;
    }
    return best;
  });
}

/**
 * Chůze po pevných cestách (bez pěšin dne) s půdou – pro kácení dřeva stavby (roads.md): z místa
 * stavby ke stromům. Stejná data na serveru i v prohlížeči (pevné cesty a krajina), takže cena
 * u kurzoru sedí. Vrátí vzdálenosti chůze z `from` ke každému cíli.
 */
export type Walk = (from: PathPoint, targets: readonly PathPoint[]) => number[];

/** Chůze po pevných cestách `roads` s půdou `ground` (bez pěšin dne). */
export function roadWalk(roads: readonly WalkRoad[], ground: WalkGround | null): Walk {
  const graph = walkGraph([], { roads, ground });
  return (from, targets) => walkingDistances(graph, [from], targets, ground);
}

/** Chůze po pevných cestách vsi s půdou krajiny sídla – kácení dřeva staveb (roads.md). */
export function villageRoadWalk(
  state: { roads?: { roads: readonly WalkRoad[] } },
  landscape: Landscape,
): Walk {
  return roadWalk(state.roads?.roads ?? [], walkGroundOf(landscape));
}
