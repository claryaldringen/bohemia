import { obstaclesNear, type Landscape, type ObstacleKind, type ObstacleLayer } from '../landscape';
import {
  obstacleChangesAt,
  obstacleStatus,
  recordClearedObstacles,
  type ObstacleChanges,
} from './obstacles';
import { PATH_WOODLAND, trailTerrain } from './paths/terrain';
import { OBSTACLE_COST, ROAD_SWATH } from './rules';
import { sacredSitesOf } from './sacred';
import type { Road, RoadPoint, VillageState, VillageWood } from './types';
import { addLogs, claimedObstacles, logsFromClearedTrees } from './wood';
import { isWoodTreeId, woodTreeSpots } from './woods';

// Průsek lesem (roads.md – Průsek lesem, trade.md – Zemská stezka; Martin, 19. 10. 2026: „Tam,
// kde zemská stezka prochází lesem, ať se les vykácí.“). Upravená cesta a zemská stezka vedou
// lesem v pruhu ROAD_SWATH.halfM od osy (pás upravené cesty 3 m a 2 m z každé strany – vůz i lidé
// se vejdou a nejdou pod větvemi): stromy, mladé stromky, keře, souše a padlé kmeny se vykácí,
// v pásu cesty (ROAD_SWATH.roadbedM) se vyklučí i pařezy a vyberou kameny, po stranách pařezy
// zůstanou a – dokud cesta stojí – nedorostou (`VillageRoads.swath`). Kácení je součást stavby
// úseku (práce podle tabulky překážek, klády za dospělé stromy na hromadu). Posvátné duby a háje
// se nekácí: po stranách zůstanou stát, v pásu cesty vylepšení zastaví (stezka se jim vyhne už
// trasou). Les = buňka terénu v lese nebo v lemu před ním (PATH_WOODLAND) a les vsi; stromy
// u cest a jabloně se nekácí nikde.

/** Co průsek úseku vykácí a co to stojí. */
export interface SwathTally {
  /** Práce (člověkodny) podle tabulky překážek. */
  cost: number;
  /** Překážky odstraněné natrvalo (pás cesty – i pařezy a kameny; keře, mladé stromky, souše). */
  cleared: number[];
  /** Stromy pokácené po stranách – zbude pařez. */
  felled: number[];
  /** Dospělé stromy mezi nimi – klády na hromadu. */
  trees: number;
  /** Pařezy a stromy jiných staveb v pruhu – zůstanou, ale nedorostou. */
  kept: number[];
  /** Posvátný dub nebo strom háje v pásu cesty – průsek (vylepšení) nejde. */
  sacred: boolean;
}

/** Druhy, které se v pruhu kácí (i po stranách). */
const CUT: ReadonlySet<ObstacleKind> = new Set([
  'tree',
  'youngTree',
  'shrub',
  'snag',
  'fallenTree',
]);
/** Druhy, které se navíc odklidí jen v pásu cesty. */
const ROADBED_ONLY: ReadonlySet<ObstacleKind> = new Set(['stump', 'stone']);

/** Vzdálenost bodu od osy (m). */
function axisDistance(points: readonly RoadPoint[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const ex = x - (a.x + dx * t);
    const ez = z - (a.z + dz * t);
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

/** Obdélník osy rozšířený o `pad` m. */
function axisBounds(
  points: readonly RoadPoint[],
  pad: number,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return {
    minX: Math.min(...xs) - pad,
    minZ: Math.min(...zs) - pad,
    maxX: Math.max(...xs) + pad,
    maxZ: Math.max(...zs) + pad,
  };
}

/** Je bod v lese nebo v lemu před ním (buňka terénu pěšin s PATH_WOODLAND)? */
function woodlandAt(landscape: Landscape, layer: ObstacleLayer, x: number, z: number): boolean {
  const terrain = trailTerrain(landscape, layer);
  const i = Math.round((x - terrain.originX) / terrain.cellM);
  const j = Math.round((z - terrain.originZ) / terrain.cellM);
  if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
  return (terrain.flags[j * terrain.width + i]! & PATH_WOODLAND) !== 0;
}

/**
 * Co průsek osy `points` vykácí v den změn `changes` – překážky vrstvy v lese (a lemu) do
 * ROAD_SWATH.halfM od osy a stromy lesa vsi, bez překážek jiných staveb (`claimed` – ty
 * zůstanou a jen nedorostou). Pořadí podle id – výsledek nezávisí na pořadí ve vrstvě.
 */
export function swathTally(
  points: readonly RoadPoint[],
  layer: ObstacleLayer,
  landscape: Landscape,
  changes: ObstacleChanges,
  claimed: ReadonlySet<number> = new Set(),
): SwathTally {
  const tally: SwathTally = { cost: 0, cleared: [], felled: [], trees: 0, kept: [], sacred: false };
  if (points.length < 2) return tally;
  const status = obstacleStatus(changes);
  const protectedTrees = sacredSitesOf(layer).protectedTrees;
  const { halfM, roadbedM } = ROAD_SWATH;
  const box = axisBounds(points, halfM);
  const take = (id: number, kind: ObstacleKind, distance: number, inForest: boolean): void => {
    const roadbed = distance <= roadbedM;
    if (!CUT.has(kind) && !(roadbed && ROADBED_ONLY.has(kind))) {
      // pařez po straně průseku zůstane – nedoroste
      if (kind === 'stump' && inForest) tally.kept.push(id);
      return;
    }
    if (!inForest) return;
    if (claimed.has(id)) {
      tally.kept.push(id);
      return;
    }
    if (kind === 'tree') {
      tally.trees++;
      tally.cost += OBSTACLE_COST.tree;
      if (roadbed) {
        tally.cost += OBSTACLE_COST.stump;
        tally.cleared.push(id);
      } else {
        tally.felled.push(id);
      }
      return;
    }
    tally.cost += OBSTACLE_COST[kind as keyof typeof OBSTACLE_COST] ?? 0;
    tally.cleared.push(id);
  };
  const indices = obstaclesNear(layer, box.minX, box.minZ, box.maxX, box.maxZ).sort(
    (a, b) => layer.id[a]! - layer.id[b]!,
  );
  for (const index of indices) {
    const x = layer.x[index]!;
    const z = layer.z[index]!;
    const distance = axisDistance(points, x, z);
    if (distance > halfM) continue;
    const kind = status.kindOf(layer, index);
    if (kind === null) continue;
    const id = layer.id[index]!;
    if (protectedTrees.has(id)) {
      if (distance <= roadbedM) tally.sacred = true;
      continue;
    }
    take(id, kind, distance, woodlandAt(landscape, layer, x, z));
  }
  // les vsi (fields.md – Les vsi) je les – jeho stromy se kácí taky; stromy u cest a jabloně ne
  for (const o of status.addedIn(box.minX, box.minZ, box.maxX, box.maxZ)) {
    if (!isWoodTreeId(o.id)) continue;
    const distance = axisDistance(points, o.x, o.z);
    if (distance > halfM) continue;
    take(o.id, o.kind, distance, true);
  }
  tally.cost = Math.round(tally.cost * 10) / 10;
  return tally;
}

/** Průsek úseku `road` ze stavu vsi v den `day` (bez stavu vsi jiných staveb – `claimed`). */
export function roadSwathTally(
  state: VillageState,
  road: Pick<Road, 'points'>,
  day: number,
  layer: ObstacleLayer,
  landscape: Landscape,
): SwathTally {
  return swathTally(
    road.points,
    layer,
    landscape,
    obstacleChangesAt(state, day),
    claimedObstacles(state),
  );
}

/** Přidá pařezy, které nedorostou, do průseků vsi (mutuje – vzestupně, bez opakování). */
export function keepClear(state: VillageState, ids: readonly number[]): void {
  const roads = state.roads;
  if (!roads || ids.length === 0) return;
  const all = new Set([...(roads.swath ?? []), ...ids]);
  roads.swath = [...all].sort((a, b) => a - b);
}

/**
 * Vykácí průsek úseku `road` (mutuje stav – volat na klonu): odstraněné překážky do
 * `clearedObstacles`, stromy po stranách pokácené (pařez), oboje v den `day`; klády za dospělé
 * stromy na hromadu (`logs`), pařezy v průseku nedorostou. Úsek dostane `swath`. Vrátí, co se
 * vykácelo.
 */
export function cutRoadSwath(
  state: VillageState,
  road: Road,
  day: number,
  layer: ObstacleLayer,
  landscape: Landscape,
  options: { logs: boolean } = { logs: true },
): SwathTally {
  const tally = roadSwathTally(state, road, day, layer, landscape);
  recordClearedObstacles(state, tally.cleared, day);
  if (tally.felled.length > 0) {
    // strom pokácený dřív (dorostlý) – platí poslední kácení
    state.felledTrees = [...(state.felledTrees ?? []), ...tally.felled.map((id) => ({ id, day }))];
  }
  keepClear(state, [...tally.felled, ...tally.kept]);
  // klády k cestě u prostředku průseku (forest.md – Mýcení a hromada klád)
  const middle = road.points[road.points.length >> 1] ?? null;
  if (options.logs) addLogs(state, logsFromClearedTrees(tally.trees), middle);
  road.swath = true;
  return tally;
}

/**
 * Nový les vsi (fields.md – Les vsi) do průseku nevstoupí (mutuje stav): místa jeho stromů
 * v pruhu úseků s průsekem se odstraní hned (stromy tam nevyrostou).
 */
export function keepSwathsClearOfWoods(
  state: VillageState,
  woods: readonly VillageWood[],
  day: number,
): void {
  const roads = (state.roads?.roads ?? []).filter((r) => r.swath);
  if (roads.length === 0 || woods.length === 0) return;
  const cleared = new Set((state.clearedObstacles ?? []).map((c) => c.id));
  const ids: number[] = [];
  for (const wood of woods) {
    for (const spot of woodTreeSpots(wood)) {
      if (cleared.has(spot.id)) continue;
      if (roads.some((r) => axisDistance(r.points, spot.x, spot.z) <= ROAD_SWATH.halfM)) {
        ids.push(spot.id);
      }
    }
  }
  recordClearedObstacles(state, ids, day);
}

/**
 * Úseky, na kterých vylepšení došlo (krok dne – mutuje stav, po práci a stezkách, před
 * dokončením staveb), vykácí průsek: `roadIds` – úsek stezky, na který stavba došla, a úsek
 * vylepšovaný na upravenou cestu s nějakou prací (`swathRoadsInWork` v trail.ts). Bez krajiny nic.
 */
export function roadSwathDay(
  state: VillageState,
  day: number,
  layer: ObstacleLayer | null,
  landscape: Landscape | null,
  roadIds: readonly number[],
): void {
  if (!layer || !landscape) return;
  for (const id of roadIds) {
    const road = state.roads?.roads.find((r) => r.id === id);
    if (!road || road.swath) continue;
    cutRoadSwath(state, road, day, layer, landscape);
  }
}

/**
 * Starší ves: hotové upravené cesty, hať a lávka a dostavěné úseky stezek dostanou průsek jednou
 * při načtení (`VillageRoads.swathChecked`) – bez práce navíc a bez klád: cesta lesem byla
 * vylepšená a zaplacená, když se průsek ještě nekreslil (stromy se tehdy vykácely, klády už
 * shnily). Ves bez pevných cest beze změny.
 */
export function withRoadSwaths(
  state: VillageState,
  layer: ObstacleLayer,
  landscape: Landscape,
): VillageState {
  if (!state.roads || state.roads.swathChecked || state.roads.roads.length === 0) return state;
  const next = structuredClone(state);
  const day = Math.max(0, next.lastDay);
  for (const road of next.roads!.roads) {
    if (road.grade === 'trodden' || road.swath) continue;
    cutRoadSwath(next, road, day, layer, landscape, { logs: false });
  }
  next.roads!.swathChecked = true;
  return next;
}
