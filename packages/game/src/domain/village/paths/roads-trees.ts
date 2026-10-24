// Místa na stromy u pevných cest a uchycení stromů (roads.md – Stromy u pevných cest).

import { dateOfDayIndex } from '../../calendar';
import {
  length2,
  obstaclesNear,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { villageCemeteries } from '../cemetery';
import { workshopKilns } from '../charcoal';
import { giveWayToBuilding, treeTakenLand } from '../land-taken';
import { obstacleStatus, type ObstacleChanges } from '../obstacles';
import { villageOrchards } from '../orchard';
import { villagePens } from '../oxen';
import { plotShapes } from '../plot-cells';
import { plotSquareTile, rotationCosSin, squareCenter } from '../square-grid';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { HUMNO, MILIR, ROAD_APPLES, ROAD_TREES, SACRED_BUILDINGS } from '../rules';
import {
  type DwellingPlot,
  type Road,
  type RoadPoint,
  type RoadTreeSpecies,
  type RoadTreeSpot,
  type SquareGrid,
  type VillageRoads,
  type VillageState,
} from '../types';
import { PATH_FORD, PATH_WOODLAND, type PathTerrain } from './terrain';
import {
  DAYS_PER_YEAR,
  END_CLEAR_M,
  HOMESTEAD_M,
  LAYER_CLEAR_M,
  MILIR_MARGIN_M,
  ROAD_CLEAR_M,
  SACRED_MARGIN_M,
  SACRED_OAK_M,
  SPOT_WALK_M,
  SQUARE_MARGIN_M,
  axisDistance,
  cm,
  lengthsAlong,
} from './roads-geometry';

// --- místa na stromy a uchycení ---------------------------------------------------------------

/** Co potřebuje výběr míst na stromy u nové cesty. */
export interface SpotContext {
  terrain: PathTerrain;
  /** Stavby vsi – tady strom nevyroste (`plantingBlocker`). */
  blocked: (x: number, z: number) => boolean;
  layer: ObstacleLayer | null;
  changes: ObstacleChanges;
  seed: number;
  /** Úsek se rozdělil – stavby na něm patří i novému úseku. */
  split: (from: number, to: number) => void;
}

/**
 * Místa na stromy podél osy (roads.md – Stromy u pevných cest): po ROAD_TREES.spacingM střídavě
 * vlevo a vpravo ROAD_TREES.offsetM od osy, kousek nepravidelně podél, ne blíž END_CLEAR_M ke
 * koncům; kde místo nejde (`canPlant`), zkusí druhou stranu, jinak nic. Místa jsou od sebe
 * aspoň ROAD_TREES.gapM. Deterministicky ze seedu – los v pevném pořadí bez ohledu na to, která
 * místa projdou. `layout` – rozestupy (výchozí stromy u cest, jabloně ROAD_APPLES).
 */
export function roadTreeSpots(
  points: readonly RoadPoint[],
  seed: number,
  canPlant: (x: number, z: number) => boolean,
  layout: {
    spacingM: { from: number; to: number };
    offsetM: { from: number; to: number };
    gapM: number;
  } = ROAD_TREES,
): RoadPoint[] {
  const out: RoadPoint[] = [];
  if (points.length < 2) return out;
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const random = createRandom(seed);
  const { spacingM, offsetM, gapM } = layout;
  const flip = random.next() < 0.5 ? 1 : 0;
  let next = END_CLEAR_M + random.next() * spacingM.from * 0.5;
  let k = 0;
  let segment = 1;
  for (let d = END_CLEAR_M; d <= length - END_CLEAR_M; d += SPOT_WALK_M) {
    if (d < next) continue;
    while (segment < points.length - 1 && at[segment]! < d) segment++;
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = Math.max(1e-6, at[segment]! - at[segment - 1]!);
    const u = Math.min(1, Math.max(0, (d - at[segment - 1]!) / span));
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const tx = (b.x - a.x) / span;
    const tz = (b.z - a.z) / span;
    const preferred = (k + flip) % 2 === 0 ? 1 : -1;
    const offset = offsetM.from + random.next() * (offsetM.to - offsetM.from);
    const along = (random.next() - 0.5) * 2;
    next = d + spacingM.from + random.next() * (spacingM.to - spacingM.from);
    k++;
    for (const side of [preferred, -preferred]) {
      const px = cm(x - tz * side * offset + tx * along);
      const pz = cm(z + tx * side * offset + tz * along);
      const free = out.every((s) => length2(s.x - px, s.z - pz) >= gapM);
      if (free && canPlant(px, pz)) {
        out.push({ x: px, z: pz });
        break;
      }
    }
  }
  return out;
}

/** Místa na stromy u nové cesty – terén, stavby, překážky krajiny, jiné cesty a jiná místa. */
export function spotsForRoad(
  roads: VillageRoads,
  road: Road,
  context: SpotContext,
): RoadTreeSpot[] {
  const { terrain, layer } = context;
  const axes = axisDistance(roads.roads.map((r) => r.points));
  const taken = [
    ...roads.roads.flatMap((r) => r.spots),
    ...roads.trees.map((t) => ({ x: t.x, z: t.z })),
  ];
  const status = layer ? obstacleStatus(context.changes) : null;
  const terrainOk = (x: number, z: number): boolean => {
    const i = Math.round((x - terrain.originX) / terrain.cellM);
    const j = Math.round((z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
    const c = j * terrain.width + i;
    return (
      Number.isFinite(terrain.cost[c]!) && (terrain.flags[c]! & (PATH_WOODLAND | PATH_FORD)) === 0
    );
  };
  const nearObstacle = (x: number, z: number): boolean => {
    if (!layer || !status) return false;
    const r = LAYER_CLEAR_M;
    for (const index of obstaclesNear(layer, x - r, z - r, x + r, z + r)) {
      if (status.kindOf(layer, index) === null) continue;
      if (length2(layer.x[index]! - x, layer.z[index]! - z) < r) return true;
    }
    return false;
  };
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  const seed = deriveSeed(
    context.seed,
    `road:${Math.round(first.x)},${Math.round(first.z)}:${Math.round(last.x)},${Math.round(last.z)}`,
  );
  const spots = roadTreeSpots(road.points, seed, (x, z) => {
    if (taken.some((t) => length2(t.x - x, t.z - z) < ROAD_TREES.gapM)) return false;
    if (axes(x, z) < ROAD_CLEAR_M) return false;
    return terrainOk(x, z) && !context.blocked(x, z) && !nearObstacle(x, z);
  });
  return spots.map((p) => ({ id: roads.nextId++, x: p.x, z: p.z }));
}

/**
 * Stavby vsi, u kterých strom u cesty nevyroste (roads.md – ne ve vsi, na pozemcích, hřbitově
 * ani v sadu): čtverce sadů, hřbitovů, hájů, ohrad, pozemků a lesa vsi i s okrajem, okolí
 * obydlí, stavenišť a zbytků jam, modly, svatyně a humna, milíře a posvátných dubů. Mimo krajinu
 * taky ne. Na poli ano (fields.md – Pole jako krajina; Martin 18. 10. 2026): strom u cesty i jabloň
 * stojí 2,5–4 m od osy – na mezi podél cesty, kam se neorá, a dílu vezme TAKEN_LAND_TREE_M2.
 */
export function plantingBlocker(
  state: VillageState,
  landscape: Landscape,
): (x: number, z: number) => boolean {
  const size = landscape.size;
  const tiles = new Set<number>();
  const addTile = (cell: { x: number; y: number }): void => {
    tiles.add(cell.y * size + cell.x);
  };
  // natočené čtverce (fields.md – Natočené stavby): střed a osy čtverce
  const turned: { x: number; z: number; c: number; s: number }[] = [];
  const addSquare = (grid: SquareGrid | undefined, cell: { x: number; y: number }): void => {
    if (!grid) {
      addTile(cell);
      return;
    }
    const center = squareCenter(landscape, grid, cell);
    const [c, sn] = rotationCosSin(grid.rotation);
    turned.push({ x: center.x, z: center.z, c, s: sn });
  };
  const addPlot = (plot: DwellingPlot | undefined): void => {
    if (!plot) return;
    if (plot.square && !plot.yard && plotSquareTile(landscape, plot.square) === null) {
      const [c, sn] = rotationCosSin(plot.square.rotation);
      turned.push({ x: plot.square.x, z: plot.square.z, c, s: sn });
      return;
    }
    for (const shape of plotShapes(landscape, plot)) {
      if (shape.tile !== null) tiles.add(shape.tile);
    }
  };
  for (const c of villageCemeteries(state)) for (const s of c.squares) addSquare(c.grid, s.cell);
  for (const o of villageOrchards(state)) for (const s of o.squares) addSquare(o.grid, s.cell);
  for (const g of state.groves ?? []) for (const cell of g.cells) addTile(cell);
  for (const d of state.dwellings) addPlot(d.plot);
  for (const c of state.constructions) addPlot(c.plot);
  for (const p of villagePens(state)) addSquare(p.grid, p.cell);
  for (const r of state.ruins ?? []) addPlot(r.plot);
  // les vsi (fields.md – Les vsi) – strom u cesty ani jabloň do něj nepatří, roste tam les
  for (const w of state.woods ?? []) addSquare(w.grid, w.cell);
  const reach = landscape.cellSizeM / 2 + SQUARE_MARGIN_M;
  const inTurned = (x: number, z: number): boolean =>
    turned.some((t) => {
      const dx = x - t.x;
      const dz = z - t.z;
      return Math.abs(dx * t.c - dz * t.s) < reach && Math.abs(dx * t.s + dz * t.c) < reach;
    });
  // obydlí, staveniště i zbytky jam po zaniklých obydlích – pořád ves
  const homes = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
    ...(state.ruins ?? []).map((r) => r.position),
  ];
  const sacred = [
    ...(state.sacredBuildings ?? []).map((b) => ({ kind: b.kind, position: b.position })),
    ...state.constructions.flatMap((c) =>
      (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
        ? [{ kind: c.kind, position: c.position }]
        : [],
    ),
  ].map((b) => ({
    x: b.position.x,
    z: b.position.z,
    half: SACRED_BUILDINGS[b.kind].footprintM / 2 + SACRED_MARGIN_M,
  }));
  // humna i rozestavěná (production-chains.md – Humno) – kruh přes celý natočený půdorys
  const floorReach = Math.sqrt(HUMNO.sizeM.x * HUMNO.sizeM.x + HUMNO.sizeM.z * HUMNO.sizeM.z) / 2;
  const floors = (state.threshingFloors ?? []).map((f) => f.position);
  // milíře uhlířů – samostatné stavby u skácených buků (crafts.md – Milíř u skácených buků)
  const milirs = state.dwellings.flatMap((d) =>
    workshopKilns(d.workshop).flatMap((k) => (k.site ? [[k.site.x, k.site.z] as const] : [])),
  );
  const oaks = state.sacredOaks ?? [];
  const m = SQUARE_MARGIN_M;
  const corners: readonly [number, number][] = [
    [0, 0],
    [-m, -m],
    [m, -m],
    [-m, m],
    [m, m],
  ];
  return (x, z) => {
    for (const [dx, dz] of corners) {
      const tile = tileOfWorldPoint(landscape, x + dx, z + dz);
      if (!tile || tiles.has(tile.y * size + tile.x)) return true;
    }
    if (turned.length > 0 && inTurned(x, z)) return true;
    if (homes.some((h) => length2(h.x - x, h.z - z) < HOMESTEAD_M)) return true;
    if (sacred.some((b) => Math.abs(b.x - x) < b.half && Math.abs(b.z - z) < b.half)) return true;
    if (floors.some((f) => length2(f.x - x, f.z - z) < floorReach + SACRED_MARGIN_M)) return true;
    const milirReach = MILIR.clearingRadiusM + MILIR_MARGIN_M;
    if (milirs.some(([mx, mz]) => length2(mx - x, mz - z) < milirReach)) return true;
    return oaks.some((o) => length2(o.x - x, o.z - z) < SACRED_OAK_M);
  };
}

/** Druh stromu z losu 0–1: polovina dubů, zbytek jilmy a topoly. */
export function speciesOf(r: number): RoadTreeSpecies {
  const { oak, elm } = ROAD_TREES.speciesShare;
  if (r < oak) return 'oak';
  return r < oak + elm ? 'elm' : 'poplar';
}

/**
 * Uchycení stromů (mutuje): na každém volném místě u cesty starší ROAD_TREES.rootAfterYears, kde
 * nestojí stavba ani jiná cesta, se strom uchytí s pravděpodobností ROAD_TREES.rootChancePerYear –
 * los ze seedu vsi, roku a místa (nezávisí na ostatních místech). Druh a délka života se losují
 * při uchycení. Strom na mezi u dílu pole vezme dílu TAKEN_LAND_TREE_M2 (fields.md – Pole jako
 * krajina; `giveWayToBuilding`).
 */
export function rootTrees(
  state: VillageState,
  roads: VillageRoads,
  day: number,
  blocked: (x: number, z: number) => boolean,
  landscape: Landscape,
): void {
  const rooted: { x: number; z: number }[] = [];
  const year = dateOfDayIndex(day).year;
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const axes = axisDistance(roads.roads.map((r) => r.points));
  // u jabloní se strom neuchytí (roads.md – jabloně a stromy u cesty se nepřekrývají)
  const apples = roads.apples ?? [];
  const nearApple = (x: number, z: number): boolean =>
    apples.some((a) => length2(a.x - x, a.z - z) < ROAD_APPLES.treeClearM);
  for (const road of roads.roads) {
    if (day - road.bornDay < ROAD_TREES.rootAfterYears * DAYS_PER_YEAR) continue;
    for (const spot of road.spots) {
      if (occupied.has(spot.id)) continue;
      const random = createRandom(deriveSeed(state.seed, `road-tree:${year}:${spot.id}`));
      if (random.next() >= ROAD_TREES.rootChancePerYear) continue;
      if (blocked(spot.x, spot.z) || axes(spot.x, spot.z) < ROAD_CLEAR_M) continue;
      if (nearApple(spot.x, spot.z)) continue;
      const species = speciesOf(random.next());
      const life = ROAD_TREES.lifeYears[species];
      const years = life.from + random.next() * (life.to - life.from);
      roads.trees.push({
        id: ROAD_TREE_ID_BASE + roads.nextId++,
        spot: spot.id,
        x: spot.x,
        z: spot.z,
        species,
        rootedDay: day,
        diesDay: day + Math.round(years * DAYS_PER_YEAR),
      });
      occupied.add(spot.id);
      rooted.push({ x: spot.x, z: spot.z });
    }
  }
  giveWayToBuilding(state, day, treeTakenLand(landscape, state, rooted), 'road-trees');
}
