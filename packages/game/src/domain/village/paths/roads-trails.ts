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
function ownerRuns(
  roads: readonly Road[],
  run: readonly RoadPoint[],
  skip: (road: Road) => boolean,
): OwnerRun[] {
  const runs: OwnerRun[] = [];
  let current: Road | null = null;
  run.forEach((p, i) => {
    let best: Road | null = null;
    let bestDistance = Infinity;
    let keepDistance = Infinity;
    for (const road of roads) {
      if (road.abandoned || road.points.length < 2 || skip(road)) continue;
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
  /** Cesta, kterou stezka nepoužije (posvátný strom v pásu cesty) – trasu podél ní kryje nová cesta. */
  avoid?: (road: Road) => boolean,
): number[] {
  const roads = (state.roads ??= emptyRoads(day));
  /** Cesty vzniklé touto stavbou (i jejich díly po rozdělení) – `avoid` se jich netýká. */
  const made = new Set<number>();
  const context: SpotContext = {
    terrain,
    blocked: plantingBlocker(state, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    seed: state.seed,
    split: (from, to) => {
      if (made.has(from)) made.add(to);
      splitRoadWork(state.constructions, from, to);
      splitTrailPieces(state.trails, from, to);
    },
  };
  const run = resample(route, null, SAMPLE_M).points;
  // cesta s posvátným stromem v pásu (`avoid`) se do stezky nebere stejně jako opuštěná
  const skipped = new Map<number, boolean>();
  const skip = (road: Road): boolean => {
    let out = skipped.get(road.id);
    if (out === undefined) {
      out = !made.has(road.id) && avoid?.(road) === true;
      skipped.set(road.id, out);
    }
    return out;
  };
  const onRoadAt = axisDistance(
    roads.roads.filter((r) => !r.abandoned && !skip(r)).map((r) => r.points),
  );
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
      const formed = formRoad(
        roads,
        run.slice(k, last + 1),
        k > 0 ? ATTACH_M : false,
        last < run.length - 1 ? ATTACH_M : false,
        day,
        NO_TRAFFIC,
        context,
        TRAIL_MIN_ROAD_M,
      );
      if (formed) made.add(formed.id);
      if (last >= j) break;
    }
    i = j + 1;
  }
  // cesty, po kterých trasa jde jen kus, se rozdělí tam, kde ji trasa opouští
  for (let guard = 0; guard < TRAIL_SPLIT_LIMIT; guard++) {
    if (!splitPartlyFollowed(roads, run, context, skip)) break;
  }
  const owned = ownerRuns(roads.roads, run, skip).map((r) => r.road);
  return trailChain(roads, run, owned, skip, (from, to) => {
    const formed = formRoad(
      roads,
      run.slice(from, to + 1),
      ATTACH_M,
      ATTACH_M,
      day,
      NO_TRAFFIC,
      context,
      TRAIL_MIN_ROAD_M,
    );
    if (formed) made.add(formed.id);
    return formed !== null;
  });
}

/** Klíč uzlu (konce úseku) na cm. */
const nodeOf = (p: RoadPoint): string => endKey(p);

/**
 * Koridor kolem trasy (m): řada stezky smí použít jen úsek, který ležel celý do tolika metrů od
 * trasy (úsek, po kterém trasa jde, vždy). Místní geometrická konstanta, ne pravidlo hry – pokryje
 * rozcestí a rozdíl mezi osou trasy a osou cesty (do `ATTACH_M` od rozcestí), ale ne spojku
 * nebo objížďku, která vede jinudy než trasa.
 */
const TRAIL_CORRIDOR_M = ATTACH_M + SAMPLE_M;
/** Nejvýš tolik doplnění mezer novou cestou po trase při jedné stavbě (pojistka). */
const TRAIL_FILL_LIMIT = 40;

/** Výsledek hledání řady: nalezená řada (nebo null) a uzly dosažitelné ze začátku. */
interface ChainSearch {
  chain: number[] | null;
  reached: Map<string, RoadPoint>;
}

/**
 * Úseky stezky jako spojitá řada po síti od začátku trasy ke konci, **jen v koridoru trasy**
 * (`TRAIL_CORRIDOR_M`): nejkratší cesta po neopuštěných úsecích, kde úseky, po kterých trasa jde
 * (`owned`), stojí čtvrtinu délky – řada jde po nich a ostatní úseky v koridoru jen přemostí
 * mezery. Cesta zakázaná `avoid` (posvátný strom v pásu) se nebere vůbec. Když v koridoru řada nejde složit,
 * mezeru kryje nová cesta po trase (`fill`, `formRoad`). Začátek a konec jsou konce prvního
 * a posledního úseku trasy (blíž k začátku a ke konci trasy).
 */
function trailChain(
  roads: VillageRoads,
  run: readonly RoadPoint[],
  owned: readonly Road[],
  skip: (road: Road) => boolean,
  fill: (from: number, to: number) => boolean,
): number[] {
  const order: number[] = [];
  for (const road of owned) if (!order.includes(road.id)) order.push(road.id);
  if (order.length === 0) return order;
  const byId = new Map(roads.roads.map((r) => [r.id, r]));
  const first = byId.get(order[0]!)!;
  const lastRoad = byId.get(order[order.length - 1]!)!;
  const closer = (road: Road, to: RoadPoint): RoadPoint => {
    const a = road.points[0]!;
    const b = road.points[road.points.length - 1]!;
    return length2(a.x - to.x, a.z - to.z) <= length2(b.x - to.x, b.z - to.z) ? a : b;
  };
  const sourcePoint = closer(first, run[0]!);
  const targetPoint = closer(lastRoad, run[run.length - 1]!);
  const source = nodeOf(sourcePoint);
  const target = nodeOf(targetPoint);
  const ownedIds = new Set(order);
  const near = axisDistance([run]);
  const inCorridor = new Map<number, boolean>();
  const eligible = (road: Road): boolean => {
    if (skip(road)) return false;
    if (ownedIds.has(road.id)) return true;
    let ok = inCorridor.get(road.id);
    if (ok === undefined) {
      ok = resample(road.points, null, SAMPLE_M).points.every(
        (p) => near(p.x, p.z) <= TRAIL_CORRIDOR_M,
      );
      inCorridor.set(road.id, ok);
    }
    return ok;
  };
  /** Pořadí bodu trasy nejblíž uzlu; mimo koridor -1. */
  const progress = (p: RoadPoint): number => {
    let best = -1;
    let bestD = TRAIL_CORRIDOR_M;
    run.forEach((q, i) => {
      const d = length2(p.x - q.x, p.z - q.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  for (let attempt = 0; attempt <= TRAIL_FILL_LIMIT; attempt++) {
    const plain = shortestChain(roads, source, target, ownedIds, eligible);
    const found = plain.chain;
    if (found) return found;
    // mezera: ze dosažitelných uzlů ten nejdál po trase, k nejbližšímu nedosažitelnému za ním
    let from = -1;
    for (const point of plain.reached.values()) from = Math.max(from, progress(point));
    const ends = new Map<string, RoadPoint>();
    for (const road of roads.roads) {
      if (road.abandoned || road.points.length < 2 || !eligible(road)) continue;
      for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
        ends.set(nodeOf(p), p);
      }
    }
    let to = progress(targetPoint);
    for (const [key, point] of [...ends].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (plain.reached.has(key)) continue;
      const at = progress(point);
      if (at > from && (to <= from || at < to)) to = at;
    }
    if (from < 0 || to <= from || !fill(from, to)) break;
  }
  // nejde ani doplnit (mezera kratší než nejkratší cesta) – řada úseků trasy, mezera zůstane
  return order;
}

/**
 * Nejkratší řada úseků z uzlu `source` do uzlu `target` (úseky stezky za čtvrtinu) po úsecích,
 * které projdou `allowed`; bez spojení `chain` null. `reached` = uzly dosažitelné ze `source`.
 */
function shortestChain(
  roads: VillageRoads,
  source: string,
  target: string,
  ownedIds: ReadonlySet<number>,
  allowed: (road: Road) => boolean,
): ChainSearch {
  const edges = new Map<string, { to: string; road: Road; cost: number }[]>();
  const point = new Map<string, RoadPoint>();
  const link = (from: string, to: string, road: Road, cost: number): void => {
    const list = edges.get(from) ?? [];
    list.push({ to, road, cost });
    edges.set(from, list);
  };
  for (const road of roads.roads) {
    if (road.abandoned || road.points.length < 2 || !allowed(road)) continue;
    const first = road.points[0]!;
    const last = road.points[road.points.length - 1]!;
    const a = nodeOf(first);
    const b = nodeOf(last);
    point.set(a, first);
    point.set(b, last);
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
  const reached = new Map<string, RoadPoint>();
  for (const key of dist.keys()) {
    const at = point.get(key);
    if (at) reached.set(key, at);
  }
  if (!via.has(target) && source !== target) return { chain: null, reached };
  const chain: number[] = [];
  for (let at = target; at !== source;) {
    const step = via.get(at)!;
    chain.push(step.road.id);
    at = step.from;
  }
  return { chain: chain.reverse(), reached };
}

/** Rozdělí první cestu, po které trasa jde jen kus (jen kus delší než TRAIL_SPLIT_M); jinak false. */
function splitPartlyFollowed(
  roads: VillageRoads,
  run: readonly RoadPoint[],
  context: SpotContext,
  skip: (road: Road) => boolean,
): boolean {
  for (const owned of ownerRuns(roads.roads, run, skip)) {
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
