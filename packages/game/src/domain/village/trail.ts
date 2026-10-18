// Zemská stezka (docs/design/trade.md – Zemská stezka, první vylepšení vsi z dvorce vojvody).
// Hráč zvolí jeden z 8 směrů; stezka vede od dvorce ke kraji mapy v tom směru – trasu najde
// nejlevnější chůze po terénu pěšin (svahy, brody, les, kmeny a balvany) se slevou po pevných
// cestách, osa se uloží jako pevné cesty (`addTrailRoads` – kde už pevná cesta je, stezka vede po
// ní). Stavba je vylepšení cesty na stupeň upravená (a hať s lávkou přes mokřinu a brod) po
// úsecích od vsi ven; dostavěný úsek hned dostane nový stupeň, hotová stezka nezaroste. Čisté
// funkce bez I/O – trasu počítá jen server (prohlížeč dostane uložené osy).
import type { Landscape, ObstacleLayer } from '../landscape';
import { villageManor } from './manor';
import { obstacleChangesAt } from './obstacles';
import { DWELLING_PATH_BOX_M, PathHeap, simplifyPathLine, smoothPathLine } from './paths/network';
import { addTrailRoads, roadLengthM, roadsInWork } from './paths/roads';
import { pathTerrainOf, pathWindowFor, withObstacles, type PathTerrain } from './paths/terrain';
import type { Walk } from './paths/walking';
import { plotCells } from './plot-cells';
import { roadMidpoint, roadNeedsCauseway, roadUpgradeCost } from './road-upgrades';
import { TRADE, TRAIL } from './rules';
import type {
  ChronicleEvent,
  Construction,
  Direction8,
  Dwelling,
  Road,
  RoadGrade,
  RoadPoint,
  Trail,
  TrailPiece,
  VillageState,
} from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';

/** Směry stezek v pořadí šipek (od severu po směru hodin). */
export const DIRECTIONS: readonly Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const H = Math.SQRT1_2;
/** Jednotkový směr ve světě – sever je +z, východ +x (minimapa a kamera – sever nahoře). */
export const DIRECTION_VECTORS: Readonly<Record<Direction8, { x: number; z: number }>> = {
  N: { x: 0, z: 1 },
  NE: { x: H, z: H },
  E: { x: 1, z: 0 },
  SE: { x: H, z: -H },
  S: { x: 0, z: -1 },
  SW: { x: -H, z: -H },
  W: { x: -1, z: 0 },
  NW: { x: -H, z: H },
};

/** U okraje krajiny se nechodí (m) – jako terén pěšin (EDGE_MARGIN_M v paths/terrain.ts). */
const EDGE_MARGIN_M = 10;
/** Zjednodušení a vyhlazení trasy (m, průchody) – jako osy pěšin. */
const SIMPLIFY_M = 1.1;
const SMOOTH_PASSES = 2;
/** Pevná cesta zlevní buňky do tolika metrů od své osy. */
const ROAD_REACH_M = 3;
/** Mezipaměť tras (podle krajiny) – kolik různých výchozích bodů a sítí cest si pamatuje. */
const ROUTE_CACHE_SIZE = 16;

function tenths(v: number): number {
  return Math.round(v * 10) / 10;
}

function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Kde stezka začíná: u dvorce na pozemku za branou (kus za plotem ve směru vchodu), u volného
 * obydlí kus před vchodem.
 */
export function trailStart(landscape: Landscape, manor: Dwelling): { x: number; z: number } {
  const { position } = manor;
  const fx = Math.sin(position.rotation);
  const fz = Math.cos(position.rotation);
  if (manor.plot) {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const cells = plotCells(manor.plot);
    const xs = cells.map((c) => -half + c.x * landscape.cellSizeM);
    const zs = cells.map((c) => -half + c.y * landscape.cellSizeM);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + landscape.cellSizeM;
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs) + landscape.cellSizeM;
    for (let t = 0; t < 60; t += 0.5) {
      const x = position.x + fx * t;
      const z = position.z + fz * t;
      if (x < minX || x > maxX || z < minZ || z > maxZ) return { x: x + fx * 1.5, z: z + fz * 1.5 };
    }
  }
  const front = DWELLING_PATH_BOX_M[manor.type].maxZ + 2;
  return { x: position.x + fx * front, z: position.z + fz * front };
}

/** Terén pěšin přes celou krajinu s překážkami (bez změn vsi – trasa se nemění s kácením). */
const terrainCache = new WeakMap<Landscape, Map<ObstacleLayer | null, PathTerrain>>();

/** Terén pro stezky – celá krajina, v mezipaměti podle krajiny a vrstvy překážek. */
export function trailTerrain(landscape: Landscape, obstacles: ObstacleLayer | null): PathTerrain {
  let byLayer = terrainCache.get(landscape);
  if (!byLayer) {
    byLayer = new Map();
    terrainCache.set(landscape, byLayer);
  }
  const cached = byLayer.get(obstacles);
  if (cached) return cached;
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const window = pathWindowFor(landscape, { minX: -half, minZ: -half, maxX: half, maxZ: half });
  const base = pathTerrainOf(landscape, window);
  const terrain = obstacles ? withObstacles(base, obstacles) : base;
  byLayer.set(obstacles, terrain);
  return terrain;
}

/** Buňky terénu u os pevných cest – chůze po nich je levnější (TRAIL.roadDiscount). */
function roadMask(terrain: PathTerrain, roads: readonly Pick<Road, 'points'>[]): Uint8Array {
  const mask = new Uint8Array(terrain.width * terrain.height);
  const reach = Math.ceil(ROAD_REACH_M / terrain.cellM);
  for (const road of roads) {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const length = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
      const steps = Math.max(1, Math.ceil(length));
      for (let s = 0; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const z = a.z + ((b.z - a.z) * s) / steps;
        const ci = Math.round((x - terrain.originX) / terrain.cellM);
        const cj = Math.round((z - terrain.originZ) / terrain.cellM);
        for (let dj = -reach; dj <= reach; dj++) {
          for (let di = -reach; di <= reach; di++) {
            const i = ci + di;
            const j = cj + dj;
            if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) continue;
            mask[j * terrain.width + i] = 1;
          }
        }
      }
    }
  }
  return mask;
}

const STEPS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Nejbližší schůdná buňka k bodu (do 10 buněk), nebo −1. */
function nearestPassable(terrain: PathTerrain, x: number, z: number): number {
  const ci = Math.round((x - terrain.originX) / terrain.cellM);
  const cj = Math.round((z - terrain.originZ) / terrain.cellM);
  for (let r = 0; r <= 10; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) continue;
        const c = j * terrain.width + i;
        if (terrain.cost[c] === Infinity) continue;
        const d = di * di + dj * dj;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * Nejlevnější chůze z buňky `start` do všech buněk krajiny (Dijkstra, 8 sousedů): cena kroku =
 * délka × průměr ceny obou buněk, u pevné cesty × TRAIL.roadDiscount.
 */
function walkAll(
  terrain: PathTerrain,
  mask: Uint8Array,
  start: number,
): { dist: Float64Array; prev: Int32Array } {
  const n = terrain.width * terrain.height;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new PathHeap();
  dist[start] = 0;
  heap.push(start, 0);
  const { width, height, cost, cellM } = terrain;
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    const i = c % width;
    const j = (c - i) / width;
    for (const [di, dj, step] of STEPS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= width || jj >= height) continue;
      const nb = jj * width + ii;
      const k = cost[nb]!;
      if (k === Infinity) continue;
      const discount = mask[c] && mask[nb] ? TRAIL.roadDiscount : 1;
      const nd = d + step * cellM * ((cost[c]! + k) / 2) * discount;
      if (nd < dist[nb]!) {
        dist[nb] = nd;
        prev[nb] = c;
        heap.push(nb, nd);
      }
    }
  }
  return { dist, prev };
}

/**
 * Cílová buňka stezky ve směru: schůdná buňka do TRAIL.edgeBandM od kraje schůdné krajiny na
 * straně, kam směr míří, v rozmezí ±cone od směru z výchozího bodu – nejlevnější dosažitelná,
 * odklon od směru prodražuje (× 1 + 2 · (1 − cos odklonu)) – stezky do sousedních směrů nevedou
 * ke stejnému místu kraje.
 */
function targetCell(
  terrain: PathTerrain,
  dist: Float64Array,
  landscape: Landscape,
  from: { x: number; z: number },
  direction: Direction8,
  coneDeg: number,
): number {
  const v = DIRECTION_VECTORS[direction];
  const limit = (landscape.size * landscape.cellSizeM) / 2 - EDGE_MARGIN_M - TRAIL.edgeBandM;
  const cos = Math.cos((coneDeg * Math.PI) / 180);
  let best = -1;
  let bestScore = Infinity;
  for (let j = 0; j < terrain.height; j++) {
    const z = terrain.originZ + j * terrain.cellM;
    for (let i = 0; i < terrain.width; i++) {
      const c = j * terrain.width + i;
      const d = dist[c]!;
      if (d === Infinity || d >= bestScore) continue;
      const x = terrain.originX + i * terrain.cellM;
      const edge =
        (v.x > 0 && x >= limit) ||
        (v.x < 0 && x <= -limit) ||
        (v.z > 0 && z >= limit) ||
        (v.z < 0 && z <= -limit);
      if (!edge) continue;
      const dx = x - from.x;
      const dz = z - from.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const along = length > 0 ? (dx * v.x + dz * v.z) / length : -1;
      if (along < cos) continue;
      const score = d * (1 + 2 * (1 - along));
      if (score >= bestScore) continue;
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Trasy stezek do všech směrů – osa od výchozího bodu ke kraji mapy, nebo null (tudy nejde). */
export type TrailRoutes = Readonly<Record<Direction8, RoadPoint[] | null>>;

const routeCache = new WeakMap<Landscape, Map<string, TrailRoutes>>();

/** Klíč sítě pevných cest pro mezipaměť tras (osa se nemění – stačí id, konce a stupeň). */
function roadsKey(roads: readonly Road[]): string {
  return roads
    .map((r) => {
      const a = r.points[0]!;
      const b = r.points[r.points.length - 1]!;
      return `${r.id}:${a.x},${a.z}:${b.x},${b.z}:${r.points.length}`;
    })
    .join(';');
}

/**
 * Trasy stezek od bodu `from` ke kraji mapy do všech 8 směrů (jedno hledání pro všechny směry –
 * v mezipaměti podle krajiny, bodu a sítě pevných cest). Trasa se vyhne vodě mimo brody, srázům
 * a balvanům, les a kmeny ji prodraží, po pevné cestě je chůze poloviční (stezka po ní vede).
 */
export function trailRoutes(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  from: { x: number; z: number },
  roads: readonly Road[],
): TrailRoutes {
  let cache = routeCache.get(landscape);
  if (!cache) {
    cache = new Map();
    routeCache.set(landscape, cache);
  }
  const key = `${obstacles ? 1 : 0}|${cm(from.x)},${cm(from.z)}|${roadsKey(roads)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const terrain = trailTerrain(landscape, obstacles);
  const start = nearestPassable(terrain, from.x, from.z);
  const routes = {} as Record<Direction8, RoadPoint[] | null>;
  if (start < 0) {
    for (const d of DIRECTIONS) routes[d] = null;
  } else {
    const { dist, prev } = walkAll(terrain, roadMask(terrain, roads), start);
    for (const direction of DIRECTIONS) {
      let target = targetCell(terrain, dist, landscape, from, direction, TRAIL.coneDeg);
      if (target < 0) {
        target = targetCell(terrain, dist, landscape, from, direction, TRAIL.wideConeDeg);
      }
      routes[direction] = target < 0 ? null : traceRoute(terrain, prev, target, from);
    }
  }
  if (cache.size >= ROUTE_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, routes);
  return routes;
}

/** Osa trasy z buněk (od výchozího bodu) – zjednodušená a vyhlazená, na centimetry. */
function traceRoute(
  terrain: PathTerrain,
  prev: Int32Array,
  target: number,
  from: { x: number; z: number },
): RoadPoint[] {
  const cells: number[] = [];
  for (let c = target; c >= 0; c = prev[c]!) cells.push(c);
  cells.reverse();
  const points = [
    { x: from.x, z: from.z },
    ...cells.map((c) => ({
      x: terrain.originX + (c % terrain.width) * terrain.cellM,
      z: terrain.originZ + Math.floor(c / terrain.width) * terrain.cellM,
    })),
  ];
  const simple = simplifyPathLine(points, [], SIMPLIFY_M).points;
  const smooth = smoothPathLine(simple, [], SMOOTH_PASSES).points;
  return smooth
    .map((p) => ({ x: cm(p.x), z: cm(p.z) }))
    .filter((p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z);
}

/** Délka osy (m). */
function lengthOf(points: readonly RoadPoint[]): number {
  return roadLengthM({ points: [...points] });
}

/**
 * Dny cesty nosičů tam a zpět (trade.md – Doprava): 2 dny do 400 m stezky, každých dalších 250 m
 * den navíc, nejvýš 6, a 1 den za krajem mapy.
 */
export function trailTripDays(lengthM: number): number {
  const { min, max, fromM, perDayM } = TRADE.tripDays;
  const extra = Math.max(0, Math.ceil((lengthM - fromM) / perDayM - 1e-9));
  return Math.min(max, min + extra) + TRADE.beyondEdgeDays;
}

/** Stezky vsi (starší vsi bez stezek prázdné). */
export function villageTrails(state: Pick<VillageState, 'trails'>): readonly Trail[] {
  return state.trails ?? [];
}

/** Hotová stezka ve směru, nebo null. */
export function builtTrail(
  state: Pick<VillageState, 'trails'>,
  direction: Direction8,
): Trail | null {
  return villageTrails(state).find((t) => t.direction === direction && t.builtDay !== null) ?? null;
}

/** Stupeň po vylepšení – vyšší ze stávajícího a cílového. */
function upgradedGrade(current: RoadGrade, target: TrailPiece['grade']): RoadGrade {
  if (current === 'causeway' || target === 'causeway') return 'causeway';
  return 'improved';
}

/** Úsek stezky – cílový stupeň, práce na cestě (bez kácení) a dřevo hatě a lávky. */
function pieceOf(road: Road): { piece: TrailPiece; trees: number } {
  const grade = roadNeedsCauseway(road) ? 'causeway' : 'improved';
  const improve = road.grade === 'trodden' ? roadUpgradeCost(road, 'improved') : null;
  const causeway =
    grade === 'causeway' && road.grade !== 'causeway' ? roadUpgradeCost(road, 'causeway') : null;
  return {
    piece: {
      roadId: road.id,
      grade,
      manDays: tenths((improve?.manDays ?? 0) + (causeway?.manDays ?? 0)),
    },
    trees: causeway?.trees ?? 0,
  };
}

/** Naplánovaná stezka: trasa, úseky, dřevo a cena – nebo proč stezka teď nejde. */
export type TrailPlan =
  | {
      ok: true;
      direction: Direction8;
      route: RoadPoint[];
      lengthM: number;
      pieces: TrailPiece[];
      /** Ves s uloženými osami stezky (pevné cesty) – stav, do kterého se stavba zapíše. */
      state: VillageState;
      /** Dřevo hatě a lávek (stromy) a plán – klády z hromady, zbytek ke kácení. */
      trees: number;
      wood: WoodPlan | null;
      /** Práce celkem i s kácením (člověkodny). */
      laborManDays: number;
    }
  | { ok: false; reason: string };

export const NO_MANOR = 'Ves zatím nemá dvorec – zakladatelé ho teprve staví.';
export const TRAIL_EXISTS = 'Stezka tímto směrem už vede.';
export const TRAIL_BUILDING = 'Stezka tímto směrem se už staví.';
export const TRAIL_BLOCKED = 'Ke kraji mapy tudy cesta nevede – zahrazuje ji voda nebo sráz.';
export const TRAIL_ROAD_IN_WORK = 'Část cesty se už vylepšuje.';
export const TRAIL_NO_WOOD = 'Na hať a lávku chybí dřevo.';

/**
 * Naplánuje stezku ve směru `direction` (bez změny vstupního stavu): trasa od dvorce, osy jako
 * pevné cesty (`addTrailRoads` na kopii cest), úseky se stupněm a prací, dřevo hatě a lávek
 * (klády z hromady, zbytek nejbližší dospělé stromy k mokřinám – chůzí po pevných cestách).
 */
export function planTrail(
  state: VillageState,
  direction: Direction8,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): TrailPlan {
  const manor = villageManor(state);
  if (!manor) return { ok: false, reason: NO_MANOR };
  const existing = villageTrails(state).find((t) => t.direction === direction);
  if (existing) {
    return { ok: false, reason: existing.builtDay === null ? TRAIL_BUILDING : TRAIL_EXISTS };
  }
  const route = trailRoutes(
    landscape,
    obstacles,
    trailStart(landscape, manor),
    state.roads?.roads ?? [],
  )[direction];
  if (!route || route.length < 2) return { ok: false, reason: TRAIL_BLOCKED };
  const next: VillageState = {
    ...state,
    constructions: structuredClone(state.constructions),
    ...(state.roads ? { roads: structuredClone(state.roads) } : {}),
    ...(state.trails ? { trails: structuredClone(state.trails) } : {}),
  };
  const ids = addTrailRoads(
    next,
    route,
    day,
    landscape,
    obstacles,
    trailTerrain(landscape, obstacles),
  );
  const working = roadsInWork(state.constructions);
  if (ids.some((id) => working.has(id))) return { ok: false, reason: TRAIL_ROAD_IN_WORK };
  const roads = next.roads?.roads ?? [];
  const pieces: TrailPiece[] = [];
  let trees = 0;
  const wet: { x: number; z: number }[] = [];
  for (const id of ids) {
    const road = roads.find((r) => r.id === id);
    if (!road) continue;
    const { piece, trees: pieceTrees } = pieceOf(road);
    pieces.push(piece);
    trees += pieceTrees;
    if (pieceTrees > 0) wet.push(roadMidpoint(road));
  }
  let wood: WoodPlan | null = null;
  if (trees > 0) {
    const at = {
      x: wet.reduce((sum, p) => sum + p.x, 0) / wet.length,
      z: wet.reduce((sum, p) => sum + p.z, 0) / wet.length,
    };
    wood = planWoodFrom(
      trees,
      at,
      {
        logs: woodLogs(state),
        changes: () => obstacleChangesAt(state, day),
        claimed: () => claimedObstacles(state),
      },
      { obstacles, ...(walk ? { walk } : {}) },
    );
    if (wood.missing > 0) return { ok: false, reason: TRAIL_NO_WOOD };
  }
  const felling = wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
  return {
    ok: true,
    direction,
    route,
    lengthM: tenths(lengthOf(route)),
    pieces,
    state: next,
    trees,
    wood,
    laborManDays: tenths(pieces.reduce((sum, p) => sum + p.manDays, 0) + felling),
  };
}

/** Stezka v nabídce dvorce – stav, délka, cena a dny cesty nosičů, nebo proč nejde. */
export interface TrailOption {
  direction: Direction8;
  /** Hotová, rozestavěná (průběh 0–1), nebo zatím žádná. */
  status: 'built' | 'building' | 'none';
  progress: number;
  /** Délka trasy (m); bez trasy null. */
  lengthM: number | null;
  /** Práce celkem i s kácením (člověkodny) a dřevo (stromy) – u nové stezky. */
  laborManDays: number;
  trees: number;
  treesToFell: number;
  /** Dny cesty nosičů tam a zpět (i za krajem mapy); bez trasy null. */
  tripDays: number | null;
  /** Proč stezku teď stavět nejde (česky); hotová i rozestavěná mají důvod taky. */
  blocked: string | null;
}

/** Průběh stavby stezky 0–1. */
function trailProgress(state: VillageState, trail: Trail): number {
  if (trail.builtDay !== null) return 1;
  const c = state.constructions.find((x) => x.trail === trail.id);
  return c && c.cost > 0 ? Math.min(1, c.done / c.cost) : 0;
}

/** Nabídka stezek do všech 8 směrů (panel dvorce). */
export function trailOptions(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): TrailOption[] {
  return DIRECTIONS.map((direction): TrailOption => {
    const trail = villageTrails(state).find((t) => t.direction === direction);
    if (trail) {
      return {
        direction,
        status: trail.builtDay === null ? 'building' : 'built',
        progress: trailProgress(state, trail),
        lengthM: trail.lengthM,
        laborManDays: 0,
        trees: 0,
        treesToFell: 0,
        tripDays: trailTripDays(trail.lengthM),
        blocked: trail.builtDay === null ? TRAIL_BUILDING : TRAIL_EXISTS,
      };
    }
    const plan = planTrail(state, direction, day, landscape, obstacles, walk);
    if (!plan.ok) {
      return {
        direction,
        status: 'none',
        progress: 0,
        lengthM: null,
        laborManDays: 0,
        trees: 0,
        treesToFell: 0,
        tripDays: null,
        blocked: plan.reason,
      };
    }
    return {
      direction,
      status: 'none',
      progress: 0,
      lengthM: plan.lengthM,
      laborManDays: plan.laborManDays,
      trees: plan.trees,
      treesToFell: plan.wood?.fell.length ?? 0,
      tripDays: trailTripDays(plan.lengthM),
      blocked: null,
    };
  });
}

/**
 * Zahájí stavbu zemské stezky ve směru `direction` (trade.md): osy se uloží jako pevné cesty,
 * stavba `road` s úseky stezky od vsi ven (`Construction.trail`), dřevo hatě a lávek z hromady
 * a vyhrazené stromy. Když na trase už je všechno vylepšené, stezka je hotová hned. RangeError,
 * když stezka nejde (`planTrail` – důvod česky). Konvence dne jako u ostatních akcí.
 */
export function startTrail(
  state: VillageState,
  day: number,
  direction: Direction8,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): VillageState {
  const plan = planTrail(state, direction, day, landscape, obstacles, walk);
  if (!plan.ok) throw new RangeError(plan.reason);
  const next = structuredClone(plan.state);
  const trailId = next.nextId++;
  const trail: Trail = {
    id: trailId,
    direction,
    pieces: plan.pieces,
    lengthM: plan.lengthM,
    startedDay: day,
    builtDay: null,
  };
  (next.trails ??= []).push(trail);
  if (plan.laborManDays <= 0) {
    trail.builtDay = day;
    next.chronicle.push({ day, kind: 'trail-built', trailId, direction });
    return next;
  }
  const wood = plan.wood ? takeWood(next, plan.wood) : undefined;
  next.constructions.push({
    id: next.nextId++,
    kind: 'road',
    startedDay: day,
    cost: plan.laborManDays,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    roadIds: plan.pieces.map((p) => p.roadId),
    roadGrade: 'improved',
    trail: trailId,
    ...(wood ? { wood } : {}),
  });
  return next;
}

/** Práce za kácení dřeva stavby stezky (jde jako první část práce – forest.md). */
function fellingOf(c: Construction): number {
  return (c.wood?.fell ?? []).reduce((sum, t) => sum + t.cost, 0);
}

/**
 * Úseky stezky, na které už stavba došla (po kácení dřeva jdou úseky od vsi ven), a úsek, na kterém
 * se pracuje (index), podle odvedené práce `done`.
 */
export function trailWorkFront(
  trail: Trail,
  c: Pick<Construction, 'wood'>,
  done: number,
): { finished: number; current: number | null; progress: number } {
  let left = done - (c.wood ? fellingOf(c as Construction) : 0);
  let finished = 0;
  for (const piece of trail.pieces) {
    if (left + 1e-9 >= piece.manDays) {
      left -= piece.manDays;
      finished++;
      continue;
    }
    return {
      finished,
      current: finished,
      progress: piece.manDays > 0 ? Math.max(0, left) / piece.manDays : 0,
    };
  }
  return { finished, current: null, progress: 1 };
}

/** Úsek, na kterém se teď na stezce pracuje (první nedokončený – kácení dřeva u prvního). */
export function trailWorkRoad(state: Pick<VillageState, 'trails'>, c: Construction): number | null {
  const trail = villageTrails(state).find((t) => t.id === c.trail);
  if (!trail) return c.roadIds?.[0] ?? null;
  const front = trailWorkFront(trail, c, c.done);
  const piece = trail.pieces[front.current ?? trail.pieces.length - 1];
  return piece?.roadId ?? c.roadIds?.[0] ?? null;
}

/** Úseky prvních `count` kusů stezky dostanou svůj stupeň (mutuje stav). */
function upgradePieces(state: VillageState, trail: Trail, count: number): void {
  const roads = state.roads?.roads ?? [];
  for (const piece of trail.pieces.slice(0, count)) {
    const road = roads.find((r) => r.id === piece.roadId);
    if (road) road.grade = upgradedGrade(road.grade, piece.grade);
  }
}

/**
 * Krok dne stezek (mutuje stav – po stavbách): dostavěné úseky stezky od vsi ven hned dostanou
 * nový stupeň – po upravené části se chodí rychleji, i když se dál staví.
 */
export function trailsDay(state: VillageState): void {
  for (const c of state.constructions) {
    if (c.trail === undefined) continue;
    const trail = villageTrails(state).find((t) => t.id === c.trail);
    if (!trail) continue;
    upgradePieces(state, trail, trailWorkFront(trail, c, c.done).finished);
  }
}

/** Dostavěná stezka (mutuje stav): všechny úseky dostanou stupeň, stezka je hotová. */
export function finishTrail(state: VillageState, c: Construction, day: number): ChronicleEvent[] {
  const trail = villageTrails(state).find((t) => t.id === c.trail);
  if (!trail) return [];
  upgradePieces(state, trail, trail.pieces.length);
  trail.builtDay = day;
  return [{ day, kind: 'trail-built', trailId: trail.id, direction: trail.direction }];
}
