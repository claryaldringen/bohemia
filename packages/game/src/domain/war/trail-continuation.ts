import type { Landscape, ObstacleLayer } from '../landscape';
import { trailTerrain, type PathTerrain } from '../village/paths/terrain';
import { villageManor } from '../village/people/manor';
import { GRID_STEPS, type GridCell } from '../village/people/world-grid';
import { landscapeTrailLines } from '../village/trade/premium-route';
import { nearestTrailCell, sacredMask, traceRoute, walkAll } from '../village/trade/trail';
import { trailStart } from '../village/trade/trail-axis';
import { TRAIL_END_BAND_M, type TrailExit } from '../village/trade/trail-exits';
import type { RoadPoint, VillageState } from '../village/types';
import type { CampaignMap, TrailEntry } from './campaign-types';
import {
  marchCellAt,
  marchGrid,
  NO_CONTINUATIONS,
  type MarchGeometry,
  type Pos,
} from './march-grid';
import { largestRegion } from './march-search';
import { edgeCrossing } from './world-route';

// Pokračování zemské stezky na sousední mapě (trade.md – Zemská stezka, Pokračování na sousední
// mapě; Martin 16. 11. 2026: „ano“; plán 2026-11-16-dense-forest – Rozhodnutí 13, podrobnosti
// návrh Clauda): hotová stezka sousední vsi nekončí na kraji mapy – ze vstupu (bodu okraje) vede
// po síti stezek (`trailTerrain`, mimo posvátné duby a háje) k brance dvorce tamní vsi, bez ní
// k nejbližšímu místu největší souvislé oblasti mřížky pochodu mapy. Nic se neukládá – odvodí se
// z krajiny, vstupů a branky. Počítá jen server: trasa stezky (`walkAll`, `traceRoute`) není
// det-math; prohlížeč dostane osy jako data (mřížka pochodu je bere z `MarchGridOptions`).

export { NO_CONTINUATIONS } from './march-grid';

/** Mezipaměť os (podle krajiny) – kolik různých vstupů a branek si pamatuje (jako `trailRoutes`). */
const CONTINUATION_CACHE_SIZE = 16;

/**
 * Vstupy hotových stezek sousedních vsí na mapu políčka `cell`: výstupy (`TrailExit`), jejichž
 * krok `GRID_STEPS[direction]` vede ze sousedního políčka na `cell`; bod je `edgeCrossing` bodu
 * okraje výstupu (na opačném okraji této mapy). Pořadí podle políčka souseda (y, pak x), pak
 * výstupů.
 */
export function trailEntriesOf(
  cell: GridCell,
  neighbours: readonly { cell: GridCell; exits: readonly TrailExit[] }[],
): TrailEntry[] {
  const sorted = [...neighbours].sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  const entries: TrailEntry[] = [];
  for (const n of sorted) {
    for (const exit of n.exits) {
      const step = GRID_STEPS[exit.direction];
      if (n.cell.x + step.x !== cell.x || n.cell.y + step.y !== cell.y) continue;
      entries.push({ point: edgeCrossing(n.cell, cell, exit.edge), builtDay: exit.builtDay });
    }
  }
  return entries;
}

/** Největší souvislá oblast mřížky mapy bez vsi s rozměry mřížky (bez buněk – paměť). */
interface MapRegion {
  readonly geometry: MarchGeometry;
  readonly region: Uint8Array;
}

const regionCache = new WeakMap<Landscape, Map<ObstacleLayer | null, MapRegion>>();

/** `largestRegion(marchGrid(l, o, null))` – jednou na krajinu a vrstvu překážek. */
function regionOf(landscape: Landscape, obstacles: ObstacleLayer | null): MapRegion {
  let byLayer = regionCache.get(landscape);
  if (!byLayer) {
    byLayer = new Map();
    regionCache.set(landscape, byLayer);
  }
  const known = byLayer.get(obstacles);
  if (known) return known;
  const grid = marchGrid(landscape, obstacles, null);
  const { width, height, originX, originZ, cellM } = grid;
  const area = {
    geometry: { width, height, originX, originZ, cellM },
    region: largestRegion(grid),
  };
  byLayer.set(obstacles, area);
  return area;
}

const noRoadsCache = new WeakMap<PathTerrain, Uint8Array>();

/** Maska pevných cest bez cest – pokračování nebere pevné cesty tamní vsi (týž terén den po dni). */
function noRoads(terrain: PathTerrain): Uint8Array {
  let mask = noRoadsCache.get(terrain);
  if (!mask) {
    mask = new Uint8Array(terrain.width * terrain.height);
    noRoadsCache.set(terrain, mask);
  }
  return mask;
}

/** Střed buňky terénu stezek. */
function terrainPoint(terrain: PathTerrain, c: number): Pos {
  const i = c % terrain.width;
  return {
    x: terrain.originX + i * terrain.cellM,
    z: terrain.originZ + ((c - i) / terrain.width) * terrain.cellM,
  };
}

/**
 * Osa pokračování z jednoho vstupu, nebo null:
 * 1. stezka krajiny s koncem do `TRAIL_END_BAND_M` od vstupu – stezka kostry tam už pokračuje;
 * 2. trasa po terénu stezek s posvátnými duby a háji (`sacredMask`), bez pevných cest a humen,
 *    ze schůdné buňky nejbližší vstupu (`nearestTrailCell`);
 * 3. cíl s brankou je buňka nejbližší brance; bez branky nejbližší (po síti, remíza nižší index)
 *    buňka, jejíž střed leží v největší souvislé oblasti mřížky mapy bez vsi – vstup v ní (nebo
 *    start v ní) bez osy;
 * 4. nedosažitelný cíl – bez osy; jinak osa jako stezka (`traceRoute` – od vstupu).
 */
function continuationOf(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  entry: RoadPoint,
  gate: RoadPoint | null,
): RoadPoint[] | null {
  const band2 = TRAIL_END_BAND_M * TRAIL_END_BAND_M;
  for (const line of landscapeTrailLines(landscape)) {
    for (const end of [line[0], line[line.length - 1]]) {
      if (!end) continue;
      const dx = end.x - entry.x;
      const dz = end.z - entry.z;
      if (dx * dx + dz * dz <= band2) return null;
    }
  }
  const region = gate ? null : regionOf(landscape, obstacles);
  if (region && region.region[marchCellAt(region.geometry, entry)] === 1) return null;
  const terrain = trailTerrain(landscape, obstacles);
  const start = nearestTrailCell(terrain, entry.x, entry.z);
  if (start < 0) return null;
  const blocked = obstacles ? sacredMask(terrain, obstacles) : null;
  const { dist, prev } = walkAll(terrain, noRoads(terrain), start, blocked);
  let goal = -1;
  if (gate) {
    goal = nearestTrailCell(terrain, gate.x, gate.z);
  } else if (region) {
    let best = Infinity;
    for (let c = 0; c < dist.length; c++) {
      const d = dist[c]!;
      if (!(d < best)) continue;
      if (region.region[marchCellAt(region.geometry, terrainPoint(terrain, c))] !== 1) continue;
      best = d;
      goal = c;
    }
  }
  if (goal < 0 || goal === start || dist[goal] === Infinity) return null;
  const axis = traceRoute(terrain, prev, goal, entry);
  return axis.length >= 2 ? axis : null;
}

const continuationCache = new WeakMap<Landscape, Map<string, readonly (readonly RoadPoint[])[]>>();

/**
 * Osy pokračování stezek ze vstupů `entries` na mapě krajiny `landscape` k brance `gate` (null =
 * bez vsi nebo bez dvorce – k největší souvislé oblasti), každý vstup zvlášť (`continuationOf`);
 * vstup bez osy se vynechá. Pro tentýž vstup tentýž objekt (v mezipaměti podle krajiny, vrstvy,
 * vstupů a branky – nejvýš `CONTINUATION_CACHE_SIZE` naposledy vložených), takže paměť mřížek
 * (`MarchGridMemo`) mřížku nestaví znovu. Žádná osa – `NO_CONTINUATIONS`.
 */
export function trailContinuations(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  entries: readonly RoadPoint[],
  gate: RoadPoint | null,
): readonly (readonly RoadPoint[])[] {
  if (entries.length === 0) return NO_CONTINUATIONS;
  let cache = continuationCache.get(landscape);
  if (!cache) {
    cache = new Map();
    continuationCache.set(landscape, cache);
  }
  const at = (p: RoadPoint): string => `${p.x},${p.z}`;
  const key = `${obstacles ? 1 : 0}|${entries.map(at).join(';')}|${gate ? at(gate) : '-'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const axes: (readonly RoadPoint[])[] = [];
  for (const entry of entries) {
    const axis = continuationOf(landscape, obstacles, entry, gate);
    if (axis) axes.push(Object.freeze(axis));
  }
  const result = axes.length === 0 ? NO_CONTINUATIONS : Object.freeze(axes);
  if (cache.size >= CONTINUATION_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/**
 * Osy pokračování na mapě `map` v den `day` (Rozhodnutí 13, Review Focus 6): jen vstupy stezek
 * dostavěných před tím dnem (`builtDay < day` – takt přepočtený z bodu nevidí pokračování dřív,
 * než stezka stála), branka dvorce vsi na mapě (`trailStart`; bez vsi nebo dvorce null). Bez vstupů
 * `NO_CONTINUATIONS`.
 */
export function continuationsOf(
  map: Pick<CampaignMap, 'landscape' | 'obstacles' | 'trailEntries'>,
  village: VillageState | null,
  day: number,
): readonly (readonly RoadPoint[])[] {
  const entries = (map.trailEntries ?? []).filter((e) => e.builtDay < day).map((e) => e.point);
  if (entries.length === 0) return NO_CONTINUATIONS;
  const manor = village ? villageManor(village) : null;
  const gate = manor ? trailStart(map.landscape, manor) : null;
  return trailContinuations(map.landscape, map.obstacles, entries, gate);
}
