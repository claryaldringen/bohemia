// Zemská stezka a vozová cesta jako pevné cesty (trade.md – Zemská stezka, roads.md – Vozová cesta).

import { length2, type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt } from '../core/obstacles';
import { WAGON_ROAD } from '../rules';
import { type Road, type RoadPoint, type VillageRoads, type VillageState } from '../types';
import { type PathTraffic } from './network';
import { pathTerrainOf, pathWindowFor, type PathTerrain } from './terrain';
import {
  ATTACH_M,
  ON_ROAD_M,
  ROAD_CLEAR_M,
  SAMPLE_M,
  axisDistance,
  cm,
  lengthsAlong,
  resample,
  roadGroundOf,
  roadLengthM,
  toSegment,
} from './roads-geometry';
import {
  emptyRoads,
  formRoad,
  endKey,
  hitAlongRoad,
  splitRoad,
  splitRoadWork,
  splitTrailPieces,
} from './roads-form';
import { SpotContext, plantingBlocker, spotsForRoad } from './roads-trees';

// --- zemská stezka (trade.md – Zemská stezka) -------------------------------------------------

/** Nová cesta stezky se dělí na úseky nejvýš tak dlouhé (m) – staví se po úsecích od vsi ven. */
const TRAIL_PIECE_M = 150;
/** Bod trasy leží na pevné cestě, když je od její osy nejvýš tolik metrů. */
const TRAIL_MATCH_M = ON_ROAD_M;

/** Provoz nové cesty stezky – zatím nikdo nechodí (stezka se staví, upravená nezaroste). */
const NO_TRAFFIC: PathTraffic = {
  originX: 0,
  originZ: 0,
  cellM: 1,
  width: 0,
  height: 0,
  values: new Float32Array(0),
  raw: new Float32Array(0),
};

/** Vzdálenost bodu `(x, z)` od cesty a jeho poloha po ose cesty od začátku (m). */
function projectOnRoad(road: Road, x: number, z: number): { distance: number; along: number } {
  const at = lengthsAlong(road.points);
  let best = Infinity;
  let along = 0;
  for (let k = 1; k < road.points.length; k++) {
    const hit = toSegment(x, z, road.points[k - 1]!, road.points[k]!);
    if (hit.distance < best) {
      best = hit.distance;
      along = at[k - 1]! + (at[k]! - at[k - 1]!) * hit.t;
    }
  }
  return { distance: best, along };
}

/**
 * Cesta se dělí jen tam, kde trasa opouští aspoň tolik metrů cesty – kratší zbytek u rozcestí se
 * k úseku stezky přidá celý (trasa mezi cestami vede z rozcestí do rozcestí).
 */
const TRAIL_SPLIT_M = ATTACH_M;
/** Nejvýš tolik rozdělení jedné stezky (pojistka proti nekonečné smyčce). */
const TRAIL_SPLIT_LIMIT = 200;
/** Nejkratší nová vyšlapaná cesta stezky (m) – kratší mezera mezi pevnými cestami se taky zaplní. */
const TRAIL_MIN_ROAD_M = 2;

/** Běh po sobě jdoucích bodů trasy, které patří jedné cestě. */
interface OwnerRun {
  road: Road;
  from: number;
  to: number;
}

/**
 * Majitel každého bodu trasy: nejbližší neopuštěná cesta do TRAIL_MATCH_M (při téměř stejné
 * vzdálenosti zůstane dosavadní majitel), jinak žádný. Souvislé body téhož majitele tvoří běh.
 */
function ownerRuns(roads: readonly Road[], run: readonly RoadPoint[]): OwnerRun[] {
  const runs: OwnerRun[] = [];
  let current: Road | null = null;
  run.forEach((p, i) => {
    let best: Road | null = null;
    let bestDistance = Infinity;
    let keepDistance = Infinity;
    for (const road of roads) {
      if (road.abandoned || road.points.length < 2) continue;
      const distance = projectOnRoad(road, p.x, p.z).distance;
      if (distance > TRAIL_MATCH_M) continue;
      if (road === current) keepDistance = distance;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = road;
      }
    }
    const owner = current && keepDistance <= bestDistance + 0.3 ? current : best;
    const last = runs[runs.length - 1];
    if (owner && last && last.road === owner && last.to === i - 1) last.to = i;
    else if (owner) runs.push({ road: owner, from: i, to: i });
    current = owner;
  });
  return runs;
}

/**
 * Uloží trasu zemské stezky jako pevné cesty (mutuje stav – `state.roads`) a vrátí id úseků, po
 * kterých stezka vede, seřazené od vsi ven – spojitou řadu bez mezer, kde každý kus trasy kryje
 * právě jeden úsek (návrh Clauda, D86):
 * - kde trasa nevede po neopuštěné pevné cestě (TRAIL_MATCH_M), vznikne nová vyšlapaná cesta,
 *   která se k pevným cestám připojí v rozcestí jako cesty z provozu (`formRoad` – osa, místa na
 *   stromy, mokřina a brody); opuštěná cesta (pod stavbou) se za cestu nepočítá;
 * - po existující pevné cestě stezka vede jen tam, kde po ní trasa opravdu jde – cesta se
 *   rozdělí (`splitRoad`) v místě, kde ji trasa opouští, a stezce patří jen střední kus.
 */
export function addTrailRoads(
  state: VillageState,
  route: readonly RoadPoint[],
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  terrain: PathTerrain,
  /** Úsek, po kterém stezka vést nesmí (posvátný strom v pásu cesty) – řada ho obejde, je-li kudy. */
  avoid?: (road: Road) => boolean,
): number[] {
  const roads = (state.roads ??= emptyRoads(day));
  const context: SpotContext = {
    terrain,
    blocked: plantingBlocker(state, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    seed: state.seed,
    split: (from, to) => {
      splitRoadWork(state.constructions, from, to);
      splitTrailPieces(state.trails, from, to);
    },
  };
  const run = resample(route, null, SAMPLE_M).points;
  const onRoadAt = axisDistance(roads.roads.filter((r) => !r.abandoned).map((r) => r.points));
  const onRoad = run.map((p) => onRoadAt(p.x, p.z) <= TRAIL_MATCH_M);
  let i = 0;
  while (i < run.length) {
    if (onRoad[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < run.length && !onRoad[j + 1]) j++;
    // dlouhý běh po kusech nejvýš TRAIL_PIECE_M – kusy na sebe navazují společným bodem
    const pieces = Math.max(1, Math.ceil(((j - i) * SAMPLE_M) / TRAIL_PIECE_M));
    const per = Math.ceil((j - i) / pieces);
    for (let k = i; k < j || k === i; k += per) {
      const last = Math.min(j, k + per);
      formRoad(
        roads,
        run.slice(k, last + 1),
        k > 0 ? ATTACH_M : false,
        last < run.length - 1 ? ATTACH_M : false,
        day,
        NO_TRAFFIC,
        context,
        TRAIL_MIN_ROAD_M,
      );
      if (last >= j) break;
    }
    i = j + 1;
  }
  // cesty, po kterých trasa jde jen kus, se rozdělí tam, kde ji trasa opouští
  for (let guard = 0; guard < TRAIL_SPLIT_LIMIT; guard++) {
    if (!splitPartlyFollowed(roads, run, context)) break;
  }
  const owned = ownerRuns(roads.roads, run).map((r) => r.road);
  return trailChain(roads, run, owned, avoid);
}

/** Klíč uzlu (konce úseku) na cm. */
const nodeOf = (p: RoadPoint): string => endKey(p);

/**
 * Úseky stezky jako spojitá řada po síti od začátku trasy ke konci: nejkratší cesta po neopuštěných
 * úsecích, kde úseky, po kterých trasa jde (`owned`), stojí čtvrtinu délky – řada jde po nich a
 * ostatní úseky jen přemostí mezery. Začátek a konec jsou konce prvního a posledního úseku trasy
 * (blíž k začátku a ke konci trasy). Bez spojení zůstane seznam úseků trasy v pořadí od vsi.
 */
function trailChain(
  roads: VillageRoads,
  run: readonly RoadPoint[],
  owned: readonly Road[],
  avoid?: (road: Road) => boolean,
): number[] {
  const order: number[] = [];
  for (const road of owned) if (!order.includes(road.id)) order.push(road.id);
  if (order.length === 0) return order;
  const byId = new Map(roads.roads.map((r) => [r.id, r]));
  const first = byId.get(order[0]!)!;
  const lastRoad = byId.get(order[order.length - 1]!)!;
  const head = run[0]!;
  const tail = run[run.length - 1]!;
  const closer = (road: Road, to: RoadPoint): RoadPoint => {
    const a = road.points[0]!;
    const b = road.points[road.points.length - 1]!;
    return length2(a.x - to.x, a.z - to.z) <= length2(b.x - to.x, b.z - to.z) ? a : b;
  };
  const source = nodeOf(closer(first, head));
  const target = nodeOf(closer(lastRoad, tail));
  const ownedIds = new Set(order);
  const search = (skip?: (road: Road) => boolean): number[] | null =>
    shortestChain(roads, source, target, ownedIds, skip);
  return (avoid ? search(avoid) : null) ?? search() ?? order;
}

/** Nejkratší řada úseků z uzlu `source` do uzlu `target` (úseky stezky za čtvrtinu); jinak null. */
function shortestChain(
  roads: VillageRoads,
  source: string,
  target: string,
  ownedIds: ReadonlySet<number>,
  skip?: (road: Road) => boolean,
): number[] | null {
  const edges = new Map<string, { to: string; road: Road; cost: number }[]>();
  const link = (from: string, to: string, road: Road, cost: number): void => {
    const list = edges.get(from) ?? [];
    list.push({ to, road, cost });
    edges.set(from, list);
  };
  for (const road of roads.roads) {
    if (road.abandoned || road.points.length < 2 || skip?.(road)) continue;
    const a = nodeOf(road.points[0]!);
    const b = nodeOf(road.points[road.points.length - 1]!);
    const cost = roadLengthM(road) * (ownedIds.has(road.id) ? 0.25 : 1);
    link(a, b, road, cost);
    link(b, a, road, cost);
  }
  const dist = new Map<string, number>([[source, 0]]);
  const via = new Map<string, { from: string; road: Road }>();
  const done = new Set<string>();
  for (;;) {
    let node: string | null = null;
    for (const [key, d] of dist) {
      if (done.has(key)) continue;
      const best = node === null ? Infinity : dist.get(node)!;
      if (d < best - 1e-9 || (Math.abs(d - best) <= 1e-9 && node !== null && key < node))
        node = key;
    }
    if (node === null || node === target) break;
    done.add(node);
    for (const edge of edges.get(node) ?? []) {
      const d = dist.get(node)! + edge.cost;
      const known = dist.get(edge.to);
      if (known === undefined || d < known - 1e-9) {
        dist.set(edge.to, d);
        via.set(edge.to, { from: node, road: edge.road });
      }
    }
  }
  if (!via.has(target) && source !== target) return null;
  const chain: number[] = [];
  for (let at = target; at !== source;) {
    const step = via.get(at)!;
    chain.push(step.road.id);
    at = step.from;
  }
  return chain.reverse();
}

/** Rozdělí první cestu, po které trasa jde jen kus (jen kus delší než TRAIL_SPLIT_M); jinak false. */
function splitPartlyFollowed(
  roads: VillageRoads,
  run: readonly RoadPoint[],
  context: SpotContext,
): boolean {
  for (const owned of ownerRuns(roads.roads, run)) {
    const { road } = owned;
    const alongs = run
      .slice(owned.from, owned.to + 1)
      .map((p) => projectOnRoad(road, p.x, p.z).along);
    const lo = Math.min(...alongs);
    const hi = Math.max(...alongs);
    const length = roadLengthM(road);
    if (hi < length - TRAIL_SPLIT_M) {
      splitRoad(roads, hitAlongRoad(roads, road, hi), context);
      return true;
    }
    if (lo > TRAIL_SPLIT_M) {
      splitRoad(roads, hitAlongRoad(roads, road, lo), context);
      return true;
    }
  }
  return false;
}

/** Strom u vozové cesty stojí za plání (m od osy) – ne na krajnici (roads.md – Vozová cesta). */
const WAGON_SPOT_M = WAGON_ROAD.flatHalfM + 0.5;

/**
 * Hotový úsek vozové cesty (roads.md – Vozová cesta) – nová pevná cesta stupně `wagon` po ose
 * `points` (mutuje stav – `state.roads`): konce leží v uzlech (rozcestí, konec staré cesty, konec
 * předchozího úseku), takže se nepřipojuje ani nerozděluje jiná cesta. Mokřina a brody z terénu,
 * průsek je vykácený (stavba), místa na stromy jako u nové cesty, jen za plání. Volná místa jiných
 * cest, přes která vede, zmizí. Vrátí úsek.
 */
export function addWagonRoad(
  state: VillageState,
  points: readonly RoadPoint[],
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): Road {
  const roads = (state.roads ??= emptyRoads(day));
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const pad = 20;
  const terrain = pathTerrainOf(
    landscape,
    pathWindowFor(landscape, {
      minX: Math.min(...xs) - pad,
      minZ: Math.min(...zs) - pad,
      maxX: Math.max(...xs) + pad,
      maxZ: Math.max(...zs) + pad,
    }),
  );
  const axis = points.map((p) => ({ x: cm(p.x), z: cm(p.z) }));
  const road: Road = {
    id: roads.nextId++,
    points: axis,
    bornDay: day,
    grade: 'wagon',
    traffic: [],
    spots: [],
    ground: roadGroundOf(axis, terrain),
    swath: true,
  };
  roads.roads.push(road);
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const alongNew = axisDistance([axis]);
  for (const other of roads.roads) {
    other.spots = other.spots.filter(
      (s) => occupied.has(s.id) || alongNew(s.x, s.z) >= Math.max(ROAD_CLEAR_M, WAGON_SPOT_M),
    );
  }
  const context: SpotContext = {
    terrain,
    blocked: plantingBlocker(state, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    seed: state.seed,
    split: () => undefined,
  };
  road.spots = spotsForRoad(roads, road, context).filter((s) => alongNew(s.x, s.z) >= WAGON_SPOT_M);
  return road;
}
