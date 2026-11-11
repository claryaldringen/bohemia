// Zemská stezka a vozová cesta jako pevné cesty (trade.md – Zemská stezka, roads.md – Vozová cesta).

import { type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt } from '../core/obstacles';
import { WAGON_ROAD } from '../rules';
import { type Road, type RoadPoint, type VillageState } from '../types';
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
import { emptyRoads, formRoad, splitRoadWork, splitTrailPieces } from './roads-form';
import { SpotContext, plantingBlocker, spotsForRoad } from './roads-trees';

// --- zemská stezka (trade.md – Zemská stezka) -------------------------------------------------

/** Nová cesta stezky se dělí na úseky nejvýš tak dlouhé (m) – staví se po úsecích od vsi ven. */
const TRAIL_PIECE_M = 150;
/** Úsek pevné cesty vede po trase stezky, když tolik jeho bodů leží do TRAIL_MATCH_M od ní. */
const TRAIL_MATCH_M = 3;
const TRAIL_MATCH_SHARE = 0.6;

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

/** Vzdálenost po trase k bodu trasy nejblíž (x, z) – pořadí úseků od vsi ven. */
function alongRoute(route: readonly RoadPoint[], x: number, z: number): number {
  const at = lengthsAlong(route);
  let best = Infinity;
  let along = 0;
  for (let k = 1; k < route.length; k++) {
    const hit = toSegment(x, z, route[k - 1]!, route[k]!);
    if (hit.distance < best) {
      best = hit.distance;
      along = at[k - 1]! + (at[k]! - at[k - 1]!) * hit.t;
    }
  }
  return along;
}

/**
 * Uloží trasu zemské stezky jako pevné cesty (mutuje stav – `state.roads`): kde trasa nevede po
 * pevné cestě (ON_ROAD_M), vznikne nová vyšlapaná cesta, která se k pevným cestám připojí
 * v rozcestí jako cesty z provozu (`formRoad` – osa, místa na stromy, mokřina a brody), kde po
 * ní vede, stezka použije ji. Vrátí id úseků, po kterých stezka vede, seřazené od vsi ven
 * (úsek patří ke stezce, když aspoň TRAIL_MATCH_SHARE jeho bodů leží do TRAIL_MATCH_M od trasy).
 */
export function addTrailRoads(
  state: VillageState,
  route: readonly RoadPoint[],
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  terrain: PathTerrain,
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
  const onRoadAt = axisDistance(roads.roads.map((r) => r.points));
  const onRoad = run.map((p) => onRoadAt(p.x, p.z) <= ON_ROAD_M);
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
      );
      if (last >= j) break;
    }
    i = j + 1;
  }
  const near = axisDistance([route]);
  return roads.roads
    .filter((road) => {
      const points = resample(road.points, null, SAMPLE_M).points;
      const close = points.filter((p) => near(p.x, p.z) <= TRAIL_MATCH_M).length;
      return points.length > 0 && close >= TRAIL_MATCH_SHARE * points.length;
    })
    .map((road) => {
      const half = Math.max(1, roadLengthM(road) / 2);
      const mid = resample(road.points, null, half).points[1] ?? road.points[0]!;
      return { id: road.id, along: alongRoute(route, mid.x, mid.z) };
    })
    .sort((a, b) => a.along - b.along || a.id - b.id)
    .map((r) => r.id);
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
