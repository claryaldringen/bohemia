import { length2, tileCenterWorld, type Landscape } from '../../landscape';
import { CART_ROUTES, CART_SPEED } from '../rules';
import { squareCenter } from '../square-grid';
import { partStage } from '../summary';
import type { CartKind, Road, VillageState } from '../types';
import { cartPartSpeed, cartRoadSpeed, type CartTarget } from './cart';
import { PathHeap, type PathPoint } from './network';
import { fieldCellsOf } from './network-grid';
import { teamPens } from './roads-carts';
import { PATH_FORD, PATH_FOREST, PATH_WATER, PATH_WETLAND, type PathTerrain } from './terrain';
import { fordDetour, walkGroundOf, type WalkGround } from './walking';
import { roadTreeSpeed } from './walk-speed';

// Odhad jízdy vozu (paths.md – Odhad vzdáleností; Martin 31. 10. 2026: „simulace bude počítat jen
// s odhadem vzdáleností a přesné trasy zůstanou prohlížeči – udělej to rovnou“): bez mřížky vozu
// a bez hledání tras. Cena = kratší z: rovně (úsečka po půlbuňkách terénu podle povrchu – louka 1,
// mokřina 1 / 0,55, pole stálou cenou 1 / 0,25, zarostlý díl a les vůz neprojede, brod
// CART_ROUTES.fordCost; svah níž), nebo rovně k nejbližšímu bodu každé pevné cesty, po síti
// pevných cest (rychlost vozu podle druhu – `cartRoadSpeed`, mokřina a brody na ose) a rovně od
// nejbližšího bodu každé cesty k cíli. Úsečka přes potok mimo brod jede objížďkou přes nejbližší
// brod (`fordDetour` – jako chůze; lávka je jen pro pěší). Svah: kus úsečky dlouhý jako dvě buňky
// se sklonem g stojí × (1 + gradeCost · (g / maxGrade)²) do meze, nad polovinou meze nejvýš jako
// serpentiny se sklonem poloviny meze (převýšení / (maxGrade / 2) × (1 + gradeCost / 4)) – vůz
// do svahu nevyjede rovně, ale vyjede. Dvoukolák i čtyřkolák stejně (liší se jen zatáčením
// v přesné trase prohlížeče). Čistá deterministická funkce stavu – stejně na serveru
// i v prohlížeči.

/** Odhad jízdy vozu k cíli: dojede, cena (m jízdy po louce), délka (m) a kde jízda končí. */
export interface CartEstimate {
  reached: boolean;
  cost: number;
  lengthM: number;
  end: PathPoint;
}

/** Buňka ceny vozu: voda mimo brod (objížďka). */
const DEEP = -1;

/**
 * Půda vozu po buňkách terénu půdy chůze (`walkGroundOf`): cena buňky proti louce (Infinity =
 * neprojede, DEEP = voda mimo brod) – les krajiny jen tam, kde je pole (vymýcené), díly polí
 * stálou cenou, zarostlý díl neprojede.
 */
export interface CartGround {
  terrain: PathTerrain;
  cost: Float32Array;
}

const baseCache = new WeakMap<PathTerrain, Float32Array>();
let lastGround: { terrain: PathTerrain; key: string; ground: CartGround } | null = null;

function baseCost(t: PathTerrain): Float32Array {
  const known = baseCache.get(t);
  if (known) return known;
  const cost = new Float32Array(t.width * t.height);
  for (let c = 0; c < cost.length; c++) {
    const flags = t.flags[c]!;
    if (!Number.isFinite(t.cost[c]!) && !(flags & PATH_WATER)) cost[c] = Infinity;
    else if (flags & PATH_WATER) cost[c] = flags & PATH_FORD ? CART_ROUTES.fordCost : DEEP;
    else if (flags & PATH_FOREST) cost[c] = Infinity;
    else if (flags & PATH_WETLAND) cost[c] = 1 / CART_SPEED.wet;
    else cost[c] = 1;
  }
  baseCache.set(t, cost);
  return cost;
}

/** Půda vozu s poli vsi dne `day` (v paměti podle polí – jen zrychlení). */
function cartGroundOf(state: VillageState, day: number, landscape: Landscape): CartGround {
  const t = walkGroundOf(landscape).terrain;
  const grids = new Map(state.fields.map((f) => [f.id, f.grid]));
  const parts = state.parts.filter((p) => p.cell !== undefined);
  let key = '';
  const squares = parts.map((p) => {
    const grid = grids.get(p.fieldId);
    const c = grid
      ? squareCenter(landscape, grid, p.cell!)
      : tileCenterWorld(landscape, p.cell!.x, p.cell!.y);
    const speed = cartPartSpeed(partStage(p, day));
    key += `${p.cell!.x}/${p.cell!.y}:${c.x},${c.z},${grid?.rotation ?? ''},${speed}|`;
    return {
      cell: { x: p.cell!.x, y: p.cell!.y },
      x: c.x,
      z: c.z,
      size: landscape.cellSizeM,
      ...(grid ? { rotation: grid.rotation } : {}),
      speed,
    };
  });
  if (lastGround && lastGround.terrain === t && lastGround.key === key) return lastGround.ground;
  const base = baseCost(t);
  const cost = new Float32Array(base);
  if (squares.length > 0) {
    const { inside, edge, nearest } = fieldCellsOf(t, squares);
    // pole založené v lese je vymýcené – les krajiny tam neplatí (i okraj pole)
    const cleared = (c: number): number =>
      base[c] === Infinity && t.flags[c]! & PATH_FOREST && Number.isFinite(t.cost[c]!)
        ? 1
        : base[c]!;
    for (const c of edge) cost[c] = cleared(c);
    for (let n = 0; n < inside.length; n++) {
      const c = inside[n]!;
      const own = cleared(c);
      // voda zůstává vodou; jinak nejpomalejší z povrchu a dílu (zarostlý díl neprojede)
      if (own === DEEP) continue;
      const speed = squares[nearest[n]!]!.speed;
      cost[c] = speed > 0 ? Math.max(own, 1 / speed) : Infinity;
    }
  }
  const ground = { terrain: t, cost };
  lastGround = { terrain: t, key, ground };
  return ground;
}

/** Cena svahu kusu délky `len` s převýšením `rise` (× proti rovině – viz hlavička). */
function slopeCost(len: number, rise: number, flat: number): number {
  if (len <= 0) return flat;
  const g = rise / len;
  const max = CART_ROUTES.maxGrade;
  const serpentine = (rise / (max / 2)) * (1 + CART_ROUTES.gradeCost / 4) * (flat / len);
  if (g <= max / 2) return flat * (1 + (CART_ROUTES.gradeCost * g * g) / (max * max));
  const direct = g <= max ? flat * (1 + (CART_ROUTES.gradeCost * g * g) / (max * max)) : Infinity;
  return Math.min(direct, serpentine);
}

/** Úsečka posledního `straightCartCost` vjela do vody mimo brod. */
let crossedDeep = false;

/** Výška buňky `c` (bez výšek rovina). */
function heightAt(t: PathTerrain, c: number): number {
  return t.heights ? t.heights[c]! : 0;
}

/**
 * Cena vozu rovně z `a` do `b` bez objížďky (m po louce, Infinity = neprojede): po půlbuňkách
 * terénu, svah po kusech dvou buněk; mimo okno louka. Voda mimo brod neprojede a nastaví
 * `crossedDeep`.
 */
function straightCartCost(g: CartGround, a: PathPoint, b: PathPoint): number {
  crossedDeep = false;
  const length = length2(b.x - a.x, b.z - a.z);
  if (length === 0) return 0;
  const t = g.terrain;
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const piece = length / n;
  const w = t.width;
  const h = t.height;
  let total = 0;
  let run = 0;
  let runLen = 0;
  let runStart = -1;
  let runEnd = -1;
  const flush = (): void => {
    if (runLen === 0) return;
    const rise =
      runStart >= 0 && runEnd >= 0 ? Math.abs(heightAt(t, runEnd) - heightAt(t, runStart)) : 0;
    total += slopeCost(runLen, rise, run);
    run = 0;
    runLen = 0;
    runStart = -1;
  };
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const i = Math.round((a.x + (b.x - a.x) * u - t.originX) / t.cellM);
    const j = Math.round((a.z + (b.z - a.z) * u - t.originZ) / t.cellM);
    let cost = 1;
    let c = -1;
    if (i >= 0 && j >= 0 && i < w && j < h) {
      c = j * w + i;
      cost = g.cost[c]!;
      if (cost === DEEP) {
        crossedDeep = true;
        return Infinity;
      }
      if (cost === Infinity) return Infinity;
    }
    if (runStart < 0) runStart = c;
    runEnd = c;
    run += piece * cost;
    runLen += piece;
    if ((k + 1) % 4 === 0) flush();
  }
  flush();
  return total;
}

/** Cena vozu rovně z `a` do `b`; přes potok mimo brod objížďkou přes nejbližší brod. */
function cartSegment(g: CartGround, ground: WalkGround, a: PathPoint, b: PathPoint): number {
  const value = straightCartCost(g, a, b);
  if (!crossedDeep) return value;
  const ford = fordDetour(ground, a, b);
  if (!ford) return Infinity;
  return straightCartCost(g, a, ford) + straightCartCost(g, ford, b);
}

/** Síť pevných cest pro vůz – body os, spoje s cenou a délkou (rozcestí sdílí bod). */
interface CartRoadGraph {
  x: number[];
  z: number[];
  links: { to: number; cost: number; length: number }[][];
  /** Body každé cesty (index bodu sítě). */
  roads: number[][];
}

/** Cena vozu úsekem osy cesty od `from` do `to` m: mokřina na ose, brody CART_ROUTES.fordCost. */
function roadPieceCartCost(road: Road, from: number, to: number): number {
  const wet = road.ground?.wet ?? [];
  const trees = roadTreeSpeed(road.lined);
  const unbridged = road.unbridged === true;
  const dry = cartRoadSpeed(road.grade, road.cart === true, false, trees, unbridged);
  const wetSpeed = cartRoadSpeed(road.grade, road.cart === true, true, trees, unbridged);
  let cost = 0;
  let at = from;
  for (const [a, b] of wet) {
    if (b <= at || a >= to) continue;
    const start = Math.max(at, a);
    const end = Math.min(to, b);
    cost += (start - at) / dry + (end - start) / wetSpeed;
    at = end;
  }
  cost += Math.max(0, to - at) / dry;
  for (const ford of road.ground?.fords ?? []) {
    if (ford >= from && ford < to) cost += CART_ROUTES.fordCost * CART_ROUTES.widthM;
  }
  return cost;
}

function cartRoadGraph(roads: readonly Road[], t: PathTerrain): CartRoadGraph {
  const graph: CartRoadGraph = { x: [], z: [], links: [], roads: [] };
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
  const cellOf = (x: number, z: number): number => {
    const i = Math.round((x - t.originX) / t.cellM);
    const j = Math.round((z - t.originZ) / t.cellM);
    return i >= 0 && j >= 0 && i < t.width && j < t.height ? j * t.width + i : -1;
  };
  for (const road of roads) {
    const ids: number[] = [];
    let prev = -1;
    let along = 0;
    road.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === road.points.length - 1);
      if (prev >= 0) {
        const length = length2(p.x - graph.x[prev]!, p.z - graph.z[prev]!);
        if (prev !== id) {
          let cost = roadPieceCartCost(road, along, along + length);
          // sráz ani po cestě – vozová cesta má úvozy (roads.md – Vozová cesta)
          if (road.grade !== 'wagon') {
            const ca = cellOf(graph.x[prev]!, graph.z[prev]!);
            const cb = cellOf(p.x, p.z);
            if (ca >= 0 && cb >= 0) {
              cost = slopeCost(length, Math.abs(heightAt(t, cb) - heightAt(t, ca)), cost);
            }
          }
          graph.links[prev]!.push({ to: id, cost, length });
          graph.links[id]!.push({ to: prev, cost, length });
        }
        along += length;
      }
      ids.push(id);
      prev = id;
    });
    graph.roads.push(ids);
  }
  return graph;
}

/** Bod cesty `ids` nejblíž `p` vzdušnou čarou (při shodě první). */
function nearestOn(graph: CartRoadGraph, ids: readonly number[], p: PathPoint): number {
  let best = -1;
  let bestD = Infinity;
  for (const id of ids) {
    const dx = graph.x[id]! - p.x;
    const dz = graph.z[id]! - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Kde jízda k cíli `t` z bodu `p` končí – `reachM` před cílem na úsečce (u cíle `p`). */
function endToward(p: PathPoint, t: CartTarget): { end: PathPoint; length: number } {
  const d = length2(t.x - p.x, t.z - p.z);
  if (d <= t.reachM) return { end: { x: p.x, z: p.z }, length: 0 };
  const s = (d - t.reachM) / d;
  return { end: { x: p.x + (t.x - p.x) * s, z: p.z + (t.z - p.z) * s }, length: d - t.reachM };
}

/**
 * Odhad jízd vozu z nejbližšího z `origins` ke každému cíli (viz hlavička): po pevných cestách
 * `roads` nebo rovně. Nad CART_ROUTES.maxCost nedojede.
 */
export function cartEstimates(
  g: CartGround,
  roads: readonly Road[],
  origins: readonly PathPoint[],
  targets: readonly CartTarget[],
): CartEstimate[] {
  const ground: WalkGround = { terrain: g.terrain };
  const graph = cartRoadGraph(roads, g.terrain);
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const len = new Float64Array(n);
  const heap = new PathHeap();
  for (const ids of graph.roads) {
    for (const o of origins) {
      const id = nearestOn(graph, ids, o);
      if (id < 0) continue;
      const p = { x: graph.x[id]!, z: graph.z[id]! };
      const d = length2(p.x - o.x, p.z - o.z);
      if (d >= dist[id]!) continue;
      const cost = cartSegment(g, ground, o, p);
      if (cost < dist[id]!) {
        dist[id] = cost;
        len[id] = d;
        heap.push(id, cost);
      }
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    for (const { to, cost, length } of graph.links[c]!) {
      const nd = d + cost;
      if (nd < dist[to]!) {
        dist[to] = nd;
        len[to] = len[c]! + length;
        heap.push(to, nd);
      }
    }
  }
  return targets.map((t) => {
    let best = Infinity;
    let bestLen = 0;
    let bestEnd: PathPoint = { x: t.x, z: t.z };
    for (const o of origins) {
      const { end, length } = endToward(o, t);
      if (length >= best) continue;
      const cost = cartSegment(g, ground, o, end);
      if (cost < best) {
        best = cost;
        bestLen = length;
        bestEnd = end;
      }
    }
    for (const ids of graph.roads) {
      const id = nearestOn(graph, ids, t);
      if (id < 0 || !Number.isFinite(dist[id]!)) continue;
      const p = { x: graph.x[id]!, z: graph.z[id]! };
      const { end, length } = endToward(p, t);
      if (dist[id]! + length >= best) continue;
      const cost = dist[id]! + cartSegment(g, ground, p, end);
      if (cost < best) {
        best = cost;
        bestLen = len[id]! + length;
        bestEnd = end;
      }
    }
    const reached = best <= CART_ROUTES.maxCost;
    return {
      reached,
      cost: reached ? best : Infinity,
      lengthM: reached ? bestLen : 0,
      end: bestEnd,
    };
  });
}

/**
 * Odhad jízd vozu vsi (`kind` – dvoukolák i čtyřkolák stejně) od ohrad se spřežením (nebo z `from`
 * – spřežení na poli jede k dalšímu bloku) ke každému cíli. Bez ohrady se spřežením null.
 */
export function villageCartEstimates(
  state: VillageState,
  day: number,
  landscape: Landscape,
  _kind: CartKind,
  targets: readonly CartTarget[],
  from: PathPoint | null = null,
): CartEstimate[] | null {
  const withTeam = teamPens(state);
  const pens = (state.pens ?? [])
    .filter((p) => withTeam.has(p.id))
    .map((p) => ({ x: p.x, z: p.z }));
  if (pens.length === 0) return null;
  const origins = from ? [{ x: from.x, z: from.z }] : pens;
  return cartEstimates(
    cartGroundOf(state, day, landscape),
    state.roads?.roads ?? [],
    origins,
    targets,
  );
}
