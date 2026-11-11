// Zemská stezka (docs/design/trade.md – Zemská stezka, první vylepšení vsi z dvorce vojvody).
import { cloneState } from './clone';
import { relineRoad } from './paths/road-lining';
// Hráč zvolí jeden z 8 směrů; stezka vede od dvorce ke kraji mapy v tom směru – trasu najde
// nejlevnější chůze po terénu pěšin (svahy, brody, les, kmeny a balvany) se slevou po pevných
// cestách, osa se uloží jako pevné cesty (`addTrailRoads` – kde už pevná cesta je, stezka vede po
// ní). Stavba je vylepšení cesty na stupeň upravená (a hať s lávkou přes mokřinu a brod) po
// úsecích od vsi ven; dostavěný úsek hned dostane nový stupeň, hotová stezka nezaroste. Kde vede
// lesem, vykácí se průsek (road-swath.ts – Martin, 19. 10. 2026: „Tam, kde zemská stezka prochází
// lesem, ať se les vykácí.“) – kácení je práce úseku, posvátným dubům a hájům se trasa vyhne.
// Čisté funkce bez I/O – trasu počítá jen server (prohlížeč dostane uložené osy).
import type { Landscape, ObstacleLayer } from '../landscape';
import { villageManor } from './manor';
import { obstacleChangesAt } from './obstacles';
import {
  PathHeap,
  buildingBounds,
  cellsIn,
  inBuilding,
  simplifyPathLine,
  smoothPathLine,
} from './paths/network';
import { addTrailRoads, roadLengthM, roadsInWork } from './paths/roads';
import { trailTerrain, type PathTerrain } from './paths/terrain';
import type { Walk } from './paths/walking';
import { roadMidpoint, roadUpgradeCost, roadUpgradeProgress } from './road-upgrades';
import { roadSwathTally } from './road-swath';
import { DIRECTION_VECTORS, trailStart } from './trail-axis';
import { HUMNO, ROAD_SWATH, TRADE, TRAIL } from './rules';
import { sacredSitesOf } from './sacred';
import type {
  ChronicleEvent,
  Construction,
  Direction8,
  Position,
  Road,
  RoadGrade,
  RoadPoint,
  Trail,
  TrailPiece,
  VillageState,
} from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';

export { DIRECTION_VECTORS, trailStart } from './trail-axis';

/** Směry stezek v pořadí šipek (od severu po směru hodin). */
export const DIRECTIONS: readonly Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

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
  blocked: Uint8Array | null = null,
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
      if (k === Infinity || blocked?.[nb]) continue;
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

/**
 * Buňky terénu do průseku od posvátného dubu nebo stromu háje (`protectedTrees` – happiness.md):
 * tudy stezka nevede, průsek by je musel vykácet (roads.md – Průsek lesem). V mezipaměti podle
 * terénu (vrstva překážek je pevná).
 */
const sacredMaskCache = new WeakMap<PathTerrain, Uint8Array>();

function sacredMask(terrain: PathTerrain, layer: ObstacleLayer): Uint8Array {
  const cached = sacredMaskCache.get(terrain);
  if (cached) return cached;
  const mask = new Uint8Array(terrain.width * terrain.height);
  // i se zjednodušením osy (SIMPLIFY_M) – vyhlazená osa se od buněk trasy odchýlí
  const reach = ROAD_SWATH.halfM + SIMPLIFY_M;
  const cells = Math.ceil(reach / terrain.cellM);
  const index = new Map<number, number>();
  for (let i = 0; i < layer.count; i++) index.set(layer.id[i]!, i);
  for (const id of sacredSitesOf(layer).protectedTrees) {
    const i = index.get(id);
    if (i === undefined) continue;
    const x = layer.x[i]!;
    const z = layer.z[i]!;
    const ci = Math.round((x - terrain.originX) / terrain.cellM);
    const cj = Math.round((z - terrain.originZ) / terrain.cellM);
    for (let dj = -cells; dj <= cells; dj++) {
      for (let di = -cells; di <= cells; di++) {
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= terrain.width || jj >= terrain.height) continue;
        const dx = terrain.originX + ii * terrain.cellM - x;
        const dz = terrain.originZ + jj * terrain.cellM - z;
        if (dx * dx + dz * dz <= reach * reach) mask[jj * terrain.width + ii] = 1;
      }
    }
  }
  sacredMaskCache.set(terrain, mask);
  return mask;
}

/**
 * Buňky terénu pod humny i s pásem stezky (production-chains.md – Humno): stezka mlat s přístřeškem
 * obejde jako vozová cesta stavby vsi. Bez humen null.
 */
function floorMask(terrain: PathTerrain, floors: readonly Position[]): Uint8Array | null {
  if (floors.length === 0) return null;
  const mask = new Uint8Array(terrain.width * terrain.height);
  const hx = HUMNO.sizeM.x / 2;
  const hz = HUMNO.sizeM.z / 2;
  for (const position of floors) {
    const building = { position, box: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz } };
    const margin = ROAD_SWATH.roadbedM;
    const [x0, z0, x1, z1] = buildingBounds(building, margin);
    cellsIn(terrain, x0, z0, x1, z1, (c, x, z) => {
      if (inBuilding(building, x, z, margin)) mask[c] = 1;
    });
  }
  return mask;
}

/** Spojí dvě masky zakázaných buněk (kterákoli může chybět). */
function unionMask(a: Uint8Array | null, b: Uint8Array | null): Uint8Array | null {
  if (!a) return b;
  if (!b) return a;
  const out = new Uint8Array(a.length);
  for (let c = 0; c < a.length; c++) out[c] = a[c]! | b[c]!;
  return out;
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
 * v mezipaměti podle krajiny, bodu, sítě pevných cest a humen). Trasa se vyhne vodě mimo brody,
 * srázům a balvanům, posvátným dubům a hájům (průsek by je musel vykácet – `sacredMask`) a humnům
 * (`floors` – production-chains.md, Humno), les a kmeny ji prodraží, po pevné cestě je chůze
 * poloviční (stezka po ní vede).
 */
export function trailRoutes(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  from: { x: number; z: number },
  roads: readonly Road[],
  floors: readonly Position[] = [],
): TrailRoutes {
  let cache = routeCache.get(landscape);
  if (!cache) {
    cache = new Map();
    routeCache.set(landscape, cache);
  }
  const floorsKey = floors.map((f) => `${cm(f.x)},${cm(f.z)},${f.rotation}`).join(';');
  const key = `${obstacles ? 1 : 0}|${cm(from.x)},${cm(from.z)}|${roadsKey(roads)}|${floorsKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const terrain = trailTerrain(landscape, obstacles);
  const start = nearestPassable(terrain, from.x, from.z);
  const routes = {} as Record<Direction8, RoadPoint[] | null>;
  if (start < 0) {
    for (const d of DIRECTIONS) routes[d] = null;
  } else {
    const blocked = unionMask(
      obstacles ? sacredMask(terrain, obstacles) : null,
      floorMask(terrain, floors),
    );
    const { dist, prev } = walkAll(terrain, roadMask(terrain, roads), start, blocked);
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
  // vozová cesta (roads.md – Vozová cesta) zůstane vozovou – je víc než upravená i hať
  if (current === 'wagon' || target === 'wagon') return 'wagon';
  return 'improved';
}

/**
 * Úsek stezky – cílový stupeň, práce na cestě i s průsekem lesem (bez kácení dřeva hatě), dřevo
 * hatě a lávky, stromy v průseku a jestli průsek nebrání posvátný dub (`swath` – bez krajiny nic).
 */
function pieceOf(
  road: Road,
  swath: { cost: number; trees: number; sacred: boolean } | null,
): { piece: TrailPiece; trees: number; swathTrees: number; sacred: boolean } {
  // po vozové cestě stezka vede bez práce – je zpevněná (roads.md – Vozová cesta)
  const grade = road.grade === 'wagon' ? 'wagon' : 'improved';
  // úprava (i s hatí a lávkou přes mokřinu a brod) jednou cenou
  const work = roadUpgradeCost(road);
  return {
    piece: {
      roadId: road.id,
      grade,
      manDays: tenths(work.manDays + (swath?.cost ?? 0)),
    },
    trees: work.trees,
    swathTrees: swath?.trees ?? 0,
    sacred: swath?.sacred ?? false,
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
      /** Dospělé stromy v průseku lesem – vykácí se se stavbou úseků (klády na hromadu). */
      swathTrees: number;
    }
  | { ok: false; reason: string };

const NO_MANOR = 'Ves zatím nemá dvorec – zakladatelé ho teprve staví.';
export const TRAIL_EXISTS = 'Stezka tímto směrem už vede.';
export const TRAIL_BUILDING = 'Stezka tímto směrem se už staví.';
export const TRAIL_BLOCKED = 'Ke kraji mapy tudy cesta nevede – zahrazuje ji voda nebo sráz.';
const TRAIL_ROAD_IN_WORK = 'Část cesty se už vylepšuje.';
const TRAIL_NO_WOOD = 'Na hať a lávku chybí dřevo.';
const TRAIL_SACRED = 'Stezce v cestě stojí posvátný dub – kácet se nesmí.';

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
    (state.threshingFloors ?? []).map((f) => f.position),
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
  let swathTrees = 0;
  const wet: { x: number; z: number }[] = [];
  for (const id of ids) {
    const road = roads.find((r) => r.id === id);
    if (!road) continue;
    // průsek lesem (roads.md) – úsek, který ho ještě nemá
    const swath =
      obstacles && !road.swath ? roadSwathTally(next, road, day, obstacles, landscape) : null;
    const { piece, trees: pieceTrees, swathTrees: cut, sacred } = pieceOf(road, swath);
    if (sacred) return { ok: false, reason: TRAIL_SACRED };
    pieces.push(piece);
    trees += pieceTrees;
    swathTrees += cut;
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
    swathTrees,
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
  /** Práce celkem i s kácením a průsekem lesem (člověkodny) a dřevo (stromy) – u nové stezky. */
  laborManDays: number;
  trees: number;
  treesToFell: number;
  /** Dospělé stromy v průseku lesem (klády na hromadu) – u nové stezky. */
  swathTrees: number;
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
        swathTrees: 0,
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
        swathTrees: 0,
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
      swathTrees: plan.swathTrees,
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
  const next = cloneState(plan.state);
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

/**
 * Úseky, kde vylepšení cesty už pracuje – průsek lesem se vykácí (road-swath.ts, `roadSwathDay`):
 * u stezky dostavěné úseky a úsek, na kterém se pracuje, u vylepšení na upravenou cestu úseky
 * s nějakou prací (`roadUpgradeProgress`). Bez průseku jen (úsek ho ještě nemá).
 */
export function swathRoadsInWork(state: VillageState): number[] {
  const ids: number[] = [];
  for (const c of state.constructions) {
    if (c.kind !== 'road') continue;
    if (c.trail !== undefined) {
      const trail = villageTrails(state).find((t) => t.id === c.trail);
      if (!trail) continue;
      const front = trailWorkFront(trail, c, c.done);
      const reached = front.finished + (front.current !== null && front.progress > 0 ? 1 : 0);
      for (const piece of trail.pieces.slice(0, reached)) ids.push(piece.roadId);
      continue;
    }
    if (c.roadGrade !== 'improved') continue;
    const done = c.cost > 0 ? Math.min(c.cost, c.done) / c.cost : 0;
    for (const [id, p] of roadUpgradeProgress(state, c, done)) if (p > 0) ids.push(id);
  }
  const roads = state.roads?.roads ?? [];
  return ids.filter((id) => roads.some((r) => r.id === id && !r.swath));
}

/** Úseky prvních `count` kusů stezky dostanou svůj stupeň (mutuje stav). */
export function upgradePieces(state: VillageState, trail: Trail, count: number): void {
  const roads = state.roads?.roads ?? [];
  for (const piece of trail.pieces.slice(0, count)) {
    const road = roads.find((r) => r.id === piece.roadId);
    if (!road) continue;
    const grade = upgradedGrade(road.grade, piece.grade);
    // olemování se určí s vylepšením (roads.md – Stromy u cesty, Kdy)
    if (grade !== road.grade) relineRoad(road);
    road.grade = grade;
    if (road.grade === 'improved') delete road.unbridged;
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
