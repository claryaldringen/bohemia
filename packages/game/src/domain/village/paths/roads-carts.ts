// Provoz vozů a vyježděné cesty: roční síť vozů, vozové trasy, vznik a převzetí cest vozy (wagons.md – Vyjeté cesty).

import { type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt, type ObstacleChanges } from '../obstacles';
import { oxPens } from '../oxen';
import { CART_ROADS } from '../rules';
import {
  type CartKind,
  type Road,
  type RoadCartTrips,
  type RoadPoint,
  type VillageRoads,
  type VillageState,
} from '../types';
import { pathBounds, type PathTraffic } from './network';
import {
  cartDepots,
  cartRoutes,
  cartTraffic,
  cartVillageOf,
  type CartRoute,
  type CartTarget,
} from './cart';
import { cartObstacleMask, pathTerrainOf, pathWindowFor, type PathTerrain } from './terrain';
import { pathVillageOf } from './village';
import {
  MATCH_M,
  MIN_ROAD_M,
  ON_ROAD_M,
  PARALLEL_MIN_M,
  RoadHit,
  SAMPLE_M,
  alongsideRoad,
  axisDistance,
  lengthsAlong,
  nearestOnRoads,
  resample,
  roadLengthM,
} from './roads-geometry';
import { hitAt, roadTraffic, splitRoad } from './roads-form';
import { SpotContext } from './roads-trees';

/**
 * Jízdy vozů do součtu roku cest (mutuje – wagons.md, Vozová síť): svoz (fáze 1 – tesař a vozy)
 * sem přičte, kam a jakým vozem jel. Stejný cíl a vůz se sečte.
 */
export function addRoadCartTrips(roads: VillageRoads, trips: readonly RoadCartTrips[]): void {
  const list = (roads.labor.cart ??= []);
  for (const t of trips) {
    if (t.trips <= 0) continue;
    const same = list.find((o) => o.x === t.x && o.z === t.z && o.kind === t.kind);
    if (same) same.trips += t.trips;
    else list.push({ x: t.x, z: t.z, kind: t.kind, trips: t.trips });
  }
}

/** Hotové ohrady volů – tam stojí vozy (wagons.md – Vůz, oxen.md – Ohrada volů). */
export function teamPens(state: Pick<VillageState, 'pens'>): Set<number> {
  return new Set(
    oxPens(state)
      .filter((p) => p.builtDay !== null)
      .map((p) => p.id),
  );
}

/** Vůz dojede k cíli, když je od něj nejvýš tak daleko (m) – kraj dílu, louky, hromady. */
const CART_REACH_M = 9;

/**
 * Roční síť vozů (wagons.md – Vyjeté cesty): jízdy vozů za rok cest (`VillageRoads.labor.cart`,
 * průměr na den) po trasách vozů od ohrad se spřežením – provoz po buňkách a úseky tras nad
 * prahem (CART_ROADS.tripsPerDay). Bez jízd nebo bez ohrady se spřežením null.
 */
export function annualCartNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  changes: ObstacleChanges,
  terrain: PathTerrain,
): { traffic: PathTraffic; runs: RoadPoint[][] } | null {
  const trips = state.roads?.labor.cart ?? [];
  if (trips.length === 0) return null;
  // mokřina na ose pevných cest (Road.ground) – vůz ji vidí jako chůze
  const village = cartVillageOf(pathVillageOf(state, day, landscape), state.roads?.roads ?? []);
  const depots = cartDepots(village, teamPens(state));
  if (depots.length === 0) return null;
  const days = Math.max(1, state.roads?.labor.days ?? 1);
  const blocked = obstacles ? cartObstacleMask(terrain, obstacles, changes) : null;
  const raw = new Float32Array(terrain.width * terrain.height);
  const routes: { points: RoadPoint[]; cells: number[] }[] = [];
  for (const kind of ['two-wheel', 'four-wheel'] as const satisfies readonly CartKind[]) {
    const own = trips.filter((t) => t.kind === kind);
    if (own.length === 0) continue;
    const targets: CartTarget[] = own.map((t) => ({ x: t.x, z: t.z, reachM: CART_REACH_M }));
    const found = cartRoutes({ village, terrain, blocked, kind, depots, targets });
    const traffic = cartTraffic(
      found.grid,
      found.routes,
      own.map((t) => t.trips / days),
    );
    for (let c = 0; c < raw.length; c++) raw[c] = raw[c]! + traffic.raw[c]!;
    for (const route of found.routes) {
      if (!route.reached) continue;
      routes.push({
        points: route.cells.map((c) => ({
          x: terrain.originX + (c % terrain.width) * terrain.cellM,
          z: terrain.originZ + Math.floor(c / terrain.width) * terrain.cellM,
        })),
        cells: route.cells,
      });
    }
  }
  const traffic: PathTraffic = {
    originX: terrain.originX,
    originZ: terrain.originZ,
    cellM: terrain.cellM,
    width: terrain.width,
    height: terrain.height,
    values: raw,
    raw,
  };
  // úseky tras nad prahem – osa po SAMPLE_M (jako úseky sítě pěšin)
  const threshold = CART_ROADS.tripsPerDay - 1e-9;
  const runs: RoadPoint[][] = [];
  for (const route of routes) {
    let run: RoadPoint[] = [];
    const flush = (): void => {
      if (run.length >= 2) runs.push(resample(run, null, SAMPLE_M).points);
      run = [];
    };
    route.cells.forEach((c, k) => {
      if (raw[c]! >= threshold) run.push(route.points[k]!);
      else flush();
    });
    flush();
  }
  return { traffic, runs };
}

/** Poslední trasy vozů ze stavu vsi – po krajinách (stejný vstup = stejné trasy). */
const lastCartRoutes = new WeakMap<
  Landscape,
  { obstacles: ObstacleLayer | null; key: string; routes: CartRoute[] | null }
>();

/**
 * Dosah vozů vsi (wagons.md – Vozová síť; rozhraní pro svoz – „dojede vůz k cíli a za kolik“):
 * trasy vozu `kind` od ohrad se spřežením ke všem cílům najednou (jedno hledání) – dojede,
 * cena, délka a osa trasy pro scénu. Terén pěšin v okně vsi a cílů, překážky krajiny a stavby vsi
 * jako v síti pěšin, pevné cesty podle stupně a příznaku vozová. S `from` trasa odtud (spřežení
 * na poli jede k dalšímu bloku – oxen.md, Spřežení zůstane na poli). Bez ohrady se spřežením (nebo
 * bez obydlí) null. Čistá funkce stavu – výsledek se pamatuje pro stejný vstup.
 */
export function villageCartRoutes(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind,
  targets: readonly CartTarget[],
  from: { x: number; z: number } | null = null,
): CartRoute[] | null {
  // mokřina na ose pevných cest (Road.ground) – vůz ji vidí jako chůze
  const village = cartVillageOf(pathVillageOf(state, day, landscape), state.roads?.roads ?? []);
  const pens = cartDepots(village, teamPens(state));
  const depots = from && pens.length > 0 ? [{ x: from.x, z: from.z }] : pens;
  const bounds = pathBounds(village);
  if (depots.length === 0 || !bounds) return null;
  const margin = 20;
  const ends = from ? [...targets, { x: from.x, z: from.z, reachM: 0 }] : targets;
  const box = {
    minX: Math.min(bounds.minX, ...ends.map((t) => t.x - t.reachM - margin)),
    minZ: Math.min(bounds.minZ, ...ends.map((t) => t.z - t.reachM - margin)),
    maxX: Math.max(bounds.maxX, ...ends.map((t) => t.x + t.reachM + margin)),
    maxZ: Math.max(bounds.maxZ, ...ends.map((t) => t.z + t.reachM + margin)),
  };
  const key = JSON.stringify([village, kind, targets, box, from]);
  const last = lastCartRoutes.get(landscape);
  if (last && last.obstacles === obstacles && last.key === key) return last.routes;
  const terrain = pathTerrainOf(landscape, pathWindowFor(landscape, box));
  const blocked = obstacles
    ? cartObstacleMask(terrain, obstacles, obstacleChangesAt(state, day))
    : null;
  // čtyřkolák vsi po louce a strništi kamkoli, na zoraný díl ne (wagons.md – Co se vozí a na čem)
  const fourWheel = kind === 'four-wheel';
  const routes = cartRoutes({ village, terrain, blocked, kind, depots, targets, fourWheel }).routes;
  lastCartRoutes.set(landscape, { obstacles, key, routes });
  return routes;
}

/**
 * Příznak vozová (mutuje – wagons.md, Vyjeté cesty): pevná cesta, kudy vozy jezdí nad prahem
 * CART_ROADS.years let po sobě, ho dostane; vozová cesta, kudy CART_ROADS.dropYears let jezdí
 * pod polovinou prahu, ho ztratí (dál je pěší). Provoz bez vozů se přestane pamatovat.
 */
export function markCartRoads(roads: VillageRoads): void {
  for (const road of roads.roads) {
    const history = road.cartTraffic;
    if (!history) continue;
    const recent = history.slice(-CART_ROADS.years);
    if (
      !road.cart &&
      recent.length >= CART_ROADS.years &&
      recent.every((t) => t >= CART_ROADS.tripsPerDay)
    ) {
      road.cart = true;
    }
    const quiet = history.every((t) => t < CART_ROADS.tripsPerDay * CART_ROADS.dropShare);
    if (road.cart && history.length >= CART_ROADS.dropYears && quiet) delete road.cart;
    if (!road.cart && history.length >= CART_ROADS.dropYears && history.every((t) => t === 0)) {
      delete road.cartTraffic;
    }
  }
}

/**
 * Kam patří bod letošní trasy vozů nad prahem (wagons.md – Vyjeté cesty): `skip` – loni tu vozy
 * nejezdily (MATCH_M); `road` – po cestě, kterou vozy už mají (vyježděná, upravená, hať – do
 * ON_ROAD_M, nebo souběžně do PARALLEL_M), nebo napříč přes pevnou cestu – provoz patří jí
 * (`near` – do ON_ROAD_M, konec nové cesty se k ní připojí); `take` – po vyšlapané cestě bez vozů
 * stejným směrem (`at` – kde na její ose, m; `near` – do ON_ROAD_M, jinak souběžně kus vedle);
 * `free` – mimo pevné cesty.
 */
type CartPoint =
  | { kind: 'skip' }
  | { kind: 'road'; near: boolean }
  | { kind: 'take'; road: Road; at: number; near: boolean }
  | { kind: 'free' };

/** Cesta, kterou vozy už mají: vyježděná, nebo upravená a hať (vozy po nich jezdí vždy). */
function cartReady(road: Road): boolean {
  return road.cart === true || road.grade !== 'trodden';
}

/**
 * Bod osy cesty ve vzdálenosti `d` m od začátku (úsek a bod – pro `splitRoad`).
 */
function hitAlong(roads: VillageRoads, road: Road, d: number): RoadHit {
  const at = lengthsAlong(road.points);
  let k = 1;
  while (k < road.points.length - 1 && at[k]! < d) k++;
  const a = road.points[k - 1]!;
  const b = road.points[k]!;
  const span = at[k]! - at[k - 1]!;
  const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[k - 1]!) / span)) : 0;
  return {
    road: roads.roads.indexOf(road),
    segment: k - 1,
    point: { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u },
    distance: 0,
  };
}

/**
 * Vyšlapaná cesta se v převzatých kusech stane vyježděnou (mutuje – wagons.md, Vyjeté cesty;
 * Martin: „Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“). Body trasy
 * vozů na ose (`at`) blíž než MIN_ROAD_M od sebe patří jednomu kusu; kus aspoň MIN_ROAD_M (u kratší
 * cesty aspoň polovina) dostane příznak vozová a zbytek osy kratší než MIN_ROAD_M se k němu přidá.
 * Celá cesta příznak dostane celá, jinak se v koncích kusu rozdělí (`splitRoad` – vozová a pěší
 * cesta jsou dva úseky). Letošní provoz vozů se změří po osách nových úseků.
 */
function takeOverRoads(
  roads: VillageRoads,
  taken: readonly { road: Road; at: number }[],
  cartTraffic: PathTraffic,
  context: SpotContext,
): void {
  const byRoad = new Map<Road, number[]>();
  for (const t of taken) {
    const list = byRoad.get(t.road);
    if (list) list.push(t.at);
    else byRoad.set(t.road, [t.at]);
  }
  for (const [road, list] of byRoad) {
    if (!roads.roads.includes(road)) continue;
    const length = roadLengthM(road);
    const stretches: { from: number; to: number }[] = [];
    for (const at of [...list].sort((a, b) => a - b)) {
      const last = stretches[stretches.length - 1];
      if (last && at <= last.to + MIN_ROAD_M) last.to = Math.max(last.to, at);
      else stretches.push({ from: at, to: at });
    }
    const kept = stretches
      .filter((t) => t.to - t.from >= Math.min(MIN_ROAD_M, length / 2))
      .map((t) => ({
        from: t.from < MIN_ROAD_M ? 0 : t.from,
        to: length - t.to < MIN_ROAD_M ? length : t.to,
      }));
    if (kept.length === 0) continue;
    const before = new Set(roads.roads);
    // od konce osy – začátek úseku (a jeho id) zůstane tomuto objektu
    const carts: Road[] = [];
    for (const t of kept.reverse()) {
      if (t.to < roadLengthM(road) - 1e-6) splitRoad(roads, hitAlong(roads, road, t.to), context);
      if (t.from > 1e-6) {
        splitRoad(roads, hitAlong(roads, road, t.from), context);
        carts.push(roads.roads[roads.roads.indexOf(road) + 1]!);
      } else {
        carts.push(road);
      }
    }
    for (const piece of [road, ...roads.roads.filter((r) => !before.has(r))]) {
      if (carts.includes(piece)) {
        piece.cart = true;
        piece.cartTraffic = [roadTraffic(piece.points, cartTraffic)];
      } else if (piece.cartTraffic && piece.cartTraffic.length > 0) {
        piece.cartTraffic[piece.cartTraffic.length - 1] = roadTraffic(piece.points, cartTraffic);
      }
    }
  }
}

/**
 * Vozy převezmou vyšlapanou cestu (mutuje – wagons.md, Vyjeté cesty; Martin, 19. 10. 2026: „Pokud
 * vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta přebije.“). Nové cesty vozy už
 * nezakládají – kudy vozy jezdit musí, tam jízdy vyšlapou pěšinu (`addCartWear`) a cesta vznikne
 * měsíčně jako každá jiná. Po bodech letošních úseků vozů nad prahem, které leží i na loňských
 * (`CartPoint`): po vyšlapané cestě bez vozů ji převezmou (`takeOverRoads`) – i kratší kus
 * souběžně vedle ní (do PARALLEL_MIN_M).
 */
export function takeOverCartRoads(
  roads: VillageRoads,
  runs: readonly RoadPoint[][],
  candidates: readonly RoadPoint[][],
  cartTraffic: PathTraffic,
  context: SpotContext,
): void {
  if (candidates.length === 0) return;
  const lastYear = axisDistance(candidates);
  const classify = (run: readonly RoadPoint[]): CartPoint[] =>
    run.map((p, k) => {
      if (lastYear(p.x, p.z) > MATCH_M) return { kind: 'skip' };
      const before = run[Math.max(0, k - 1)]!;
      const after = run[Math.min(run.length - 1, k + 1)]!;
      const hit = nearestOnRoads(roads.roads, p.x, p.z);
      if (hit && hit.distance <= ON_ROAD_M) {
        const road = roads.roads[hit.road]!;
        if (cartReady(road) || !alongsideRoad([road], p, before, after)) {
          return { kind: 'road', near: true };
        }
        return { kind: 'take', road, at: hitAt(road, hit), near: true };
      }
      if (alongsideRoad(roads.roads.filter(cartReady), p, before, after)) {
        return { kind: 'road', near: false };
      }
      const beside = roads.roads.find((r) => !cartReady(r) && alongsideRoad([r], p, before, after));
      if (beside) {
        const side = nearestOnRoads([beside], p.x, p.z)!;
        return { kind: 'take', road: beside, at: hitAt(beside, side), near: false };
      }
      return { kind: 'free' };
    });
  // trasa po trase – převzetí vyšlapané cesty vozy
  for (const run of runs) {
    const points = classify(run);
    // souběžný kus kratší než PARALLEL_MIN_M vyšlapanou převezme; delší souběžný kus nic
    // nepřebírá (vozová cesta po ose vozů vznikne z vyšlapanosti)
    // otevřený bod = mimo cestu nebo souběžně vedle vyšlapané (ne přímo na ní); nová cesta se
    // z něj nezakládá, jen se případně převezme vyšlapaná vedle
    const open = (c: CartPoint): boolean => c.kind === 'free' || (c.kind === 'take' && !c.near);
    let i = 0;
    while (i < run.length) {
      if (!open(points[i]!)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < run.length && open(points[j + 1]!)) j++;
      const beside = points.slice(i, j + 1).every((c) => c.kind === 'take');
      if (beside && (lengthsAlong(run.slice(i, j + 1)).at(-1) ?? 0) < PARALLEL_MIN_M) {
        for (let k = i; k <= j; k++) {
          const c = points[k]!;
          if (c.kind === 'take') points[k] = { ...c, near: true };
        }
      }
      i = j + 1;
    }
    const taken = points.flatMap((c) =>
      c.kind === 'take' && c.near ? [{ road: c.road, at: c.at }] : [],
    );
    takeOverRoads(roads, taken, cartTraffic, context);
  }
}
