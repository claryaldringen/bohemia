import { cloneState } from './clone';
import { dateOfDayIndex } from '../calendar';
import { length2, obstaclesNear, type Landscape, type ObstacleLayer } from '../landscape';
import { deriveSeed } from '../landscape/random';
import { giveWayToBuilding, landTakenWarning, treeTakenLand } from './land-taken';
import { obstacleChangesAt, obstacleStatus } from './obstacles';
import { monthInWindow, roadApplePlantingWork } from './orchard';
import { roadChain } from './paths/road-chains';
import { plantingBlocker, roadTreeSpots } from './paths/roads';
import { PATH_FORD, PATH_WOODLAND } from './paths/terrain';
import { walkGroundOf } from './paths/walking';
import { ROAD_TREE_ID_BASE, roadAppleStage } from './road-trees';
import { ORCHARD_PLANTING_WINDOWS, ROAD_APPLES } from './rules';
import type { Construction, RoadApple, RoadPoint, VillageState } from './types';

// Jabloně podél pevné cesty (roads.md – Vysazení jabloní; Martin – nezávislé na stupni cesty):
// hráč u vybraného úseku zadá „Vysadit jabloně“ – na volných místech po obou stranách po 10 m
// (kde stojí strom, jabloň nebude). Výsadba je stavba ze společné práce jen v oknech jara
// a podzimu (≈ 0,45 čd na strom), péče v zimě a sklizeň v září–říjnu jdou se sady (orchard.ts),
// jablka do zásoby ovoce. Po ≈ 60 letech zbude souš a místo je volné – „Vysadit jabloně“ znovu
// doplní mezery. Sází se podél celé cesty hráče – řetězu úseků (road-chains.ts): místa po
// úsecích za sebou, jedna stavba.

/** Strom u cesty nebo jabloň do tolika metrů od místa – tam se jabloň nesází (Martin). */
const CLEAR_M = ROAD_APPLES.treeClearM;
/** Kolem překážky krajiny (kmen, keř, kámen) se nesází (m). */
const LAYER_CLEAR_M = 2.5;
/** Jabloň nestojí blíž ose žádné pevné cesty (m). */
const ROAD_CLEAR_M = 2.2;

/** Úsek neexistuje (mezitím zarostl). */
export const NO_ROAD = 'Cesta neexistuje.';

/** Jabloně vsi (bez jabloní prázdné). */
export function villageRoadApples(state: Pick<VillageState, 'roads'>): RoadApple[] {
  return state.roads?.apples ?? [];
}

/** Vzdálenost bodu od úsečky. */
function toSegment(x: number, z: number, a: RoadPoint, b: RoadPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return length2(x - (a.x + dx * t), z - (a.z + dz * t));
}

/**
 * Volná místa na jabloně podél úseku `roadId` v den `day`: po ROAD_APPLES.spacingM střídavě po
 * stranách, na louce i na poli (fields.md – Pole jako krajina) a ne v lese ani ve vodě, mimo
 * stavby vsi (`plantingBlocker`), mimo jiné
 * cesty, nejméně ROAD_APPLES.treeClearM od stojícího stromu u cesty a ROAD_APPLES.gapM od jiné
 * jabloně (i od míst `planned` – předchozí úseky cesty hráče), ne u překážky krajiny.
 * Deterministicky ze seedu vsi a úseku.
 */
export function roadAppleSpots(
  state: VillageState,
  roadId: number,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  planned: readonly RoadPoint[] = [],
): RoadPoint[] {
  const road = state.roads?.roads.find((r) => r.id === roadId);
  if (!road) return [];
  const terrain = walkGroundOf(landscape).terrain;
  const blocked = plantingBlocker(state, landscape);
  const changes = obstacleChangesAt(state, day);
  const status = obstacles ? obstacleStatus(changes) : null;
  const removed = new Set(changes.removed);
  // stromy u cest, které stojí (i souše a pařezy), a jabloně, které ještě nezmizely – od jabloní
  // rozestup řady (gapM), aby doplnění mezer nesázelo naproti stojící jabloni
  const trees = (state.roads?.trees ?? []).filter((t) => !removed.has(t.id));
  const apples = villageRoadApples(state).filter(
    (a) => !removed.has(a.id) && roadAppleStage(a, day) !== null,
  );
  const axes = (state.roads?.roads ?? []).map((r) => r.points);
  const nearAxis = (x: number, z: number): boolean =>
    axes.some((points) =>
      points.slice(1).some((b, k) => toSegment(x, z, points[k]!, b) < ROAD_CLEAR_M),
    );
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
    if (!obstacles || !status) return false;
    const r = LAYER_CLEAR_M;
    for (const index of obstaclesNear(obstacles, x - r, z - r, x + r, z + r)) {
      if (status.kindOf(obstacles, index) === null) continue;
      if (length2(obstacles.x[index]! - x, obstacles.z[index]! - z) < r) return true;
    }
    return false;
  };
  const seed = deriveSeed(state.seed, `road-apples:${roadId}`);
  return roadTreeSpots(
    road.points,
    seed,
    (x, z) => {
      if (trees.some((t) => length2(t.x - x, t.z - z) < CLEAR_M)) return false;
      if (apples.some((a) => length2(a.x - x, a.z - z) < ROAD_APPLES.gapM)) return false;
      if (planned.some((a) => length2(a.x - x, a.z - z) < ROAD_APPLES.gapM)) return false;
      if (nearAxis(x, z)) return false;
      return terrainOk(x, z) && !blocked(x, z) && !nearObstacle(x, z);
    },
    {
      spacingM: { from: ROAD_APPLES.spacingM, to: ROAD_APPLES.spacingM },
      offsetM: ROAD_APPLES.offsetM,
      gapM: ROAD_APPLES.gapM,
    },
  );
}

/** Volné místo na jabloň podél cesty hráče a úsek, ke kterému patří. */
export interface ChainAppleSpot extends RoadPoint {
  roadId: number;
}

/**
 * Volná místa na jabloně podél cesty hráče – řetězu úseku `roadId` (road-chains.ts): úsek po
 * úseku v pořadí cesty (`roadAppleSpots`), každý dbá rozestupu i od míst předchozích.
 */
export function chainAppleSpots(
  state: VillageState,
  roadId: number,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): ChainAppleSpot[] {
  const out: ChainAppleSpot[] = [];
  for (const { road } of roadChain(state.roads?.roads ?? [], roadId)) {
    for (const p of roadAppleSpots(state, road.id, day, landscape, obstacles, out)) {
      out.push({ roadId: road.id, x: p.x, z: p.z });
    }
  }
  return out;
}

/** Výsadba jabloní u cesty: kolik jich přibude, práce a proč teď nejde. */
export interface RoadApplesOption {
  trees: number;
  laborManDays: number;
  blocked: string | null;
  /**
   * Jabloně stojí i na poli a vezmou mu půdu (fields.md – Pole jako krajina) – „Pole se zmenší“
   * / „Pole zanikne“ (oranžově, neblokuje); jinak null.
   */
  warning: string | null;
}

/** Na desetiny. */
function tenths(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Sází se u některého úseku cesty hráče (řetěz úseku) jabloně (rozestavěná výsadba)? */
function plantingAt(state: VillageState, roadId: number): Construction | undefined {
  const chain = new Set(roadChain(state.roads?.roads ?? [], roadId).map((link) => link.road.id));
  return state.constructions.find(
    (c) => c.kind === 'road-apples' && (c.roadIds ?? []).some((id) => chain.has(id)),
  );
}

/**
 * „Vysadit jabloně“ u cesty hráče (řetěz úseku `roadId`) – kolik stromů a za kolik práce, nebo
 * proč ne; bez úseku null.
 */
export function roadApplesOption(
  state: VillageState,
  roadId: number,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): RoadApplesOption | null {
  if (!state.roads?.roads.some((r) => r.id === roadId)) return null;
  if (plantingAt(state, roadId)) {
    return { trees: 0, laborManDays: 0, blocked: 'Jabloně se tu už sázejí.', warning: null };
  }
  const spots = chainAppleSpots(state, roadId, day, landscape, obstacles);
  const trees = spots.length;
  const taken = treeTakenLand(landscape, state, spots);
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  return {
    trees,
    laborManDays: tenths(trees * roadApplePlantingWork()),
    blocked: trees === 0 ? 'Podél cesty není volné místo.' : null,
    warning: landTakenWarning(state, taken, cellAreaM2) ?? null,
  };
}

/** Vzdálenost bodu od nejbližšího obydlí (i staveniště) vzdušnou čarou; bez obydlí 0. */
function nearestDwellingM(state: VillageState, x: number, z: number): number {
  const homes = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
  ];
  return homes.reduce((best, p) => Math.min(best, length2(p.x - x, p.z - z)), Infinity) || 0;
}

/**
 * Zadá výsadbu jabloní podél cesty hráče – řetězu úseku `roadId` (mutuje kopii – vrátí nový stav):
 * jabloně na volných místech (každá u svého úseku) čekají na výsadbu, stavba `road-apples` ze
 * společné práce (`roadIds` = úseky cesty) je vysadí v oknech jara a podzimu po řadě podél cesty. Jabloň na dílu pole mu vezme TAKEN_LAND_TREE_M2 (fields.md – Pole jako krajina),
 * hned se zadáním jako ostatní stavby. RangeError, když výsadba nejde (`roadApplesOption`).
 */
export function startRoadApples(
  state: VillageState,
  day: number,
  roadId: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const option = roadApplesOption(state, roadId, day, landscape, obstacles);
  if (!option) throw new RangeError(NO_ROAD);
  if (option.blocked) throw new RangeError(option.blocked);
  const spots = chainAppleSpots(state, roadId, day, landscape, obstacles);
  const chain = roadChain(state.roads?.roads ?? [], roadId).map((link) => link.road.id);
  const next = cloneState(state);
  const roads = next.roads!;
  const id = next.nextId++;
  const apples = spots.map((p): RoadApple => ({
    id: ROAD_TREE_ID_BASE + roads.nextId++,
    roadId: p.roadId,
    x: p.x,
    z: p.z,
    distanceM: Math.round(nearestDwellingM(next, p.x, p.z) * 10) / 10,
    plantedDay: null,
    constructionId: id,
  }));
  roads.apples = [...(roads.apples ?? []), ...apples];
  next.constructions.push({
    id,
    kind: 'road-apples',
    startedDay: day,
    cost: tenths(apples.length * roadApplePlantingWork()),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    roadIds: chain,
  });
  giveWayToBuilding(next, day, treeTakenLand(landscape, next, apples), 'road-apples');
  return next;
}

/** Úsek, u kterého se teď sází – první nevysazená jabloň stavby `c`; bez ní první úsek stavby. */
export function roadApplesWorkRoad(
  state: Pick<VillageState, 'roads'>,
  c: Construction,
): number | null {
  const next = villageRoadApples(state).find(
    (a) => a.constructionId === c.id && a.plantedDay === null,
  );
  return next?.roadId ?? c.roadIds?.[0] ?? null;
}

/** Kolik práce výsadbě jabloní dnes chybí – jen v oknech výsadby (jaro, podzim), jinak 0. */
export function roadApplesNeed(c: Construction, day: number): number {
  if (!monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month)) return 0;
  return Math.max(0, c.cost - c.done);
}

/**
 * Práce do výsadby jabloní (mutuje stav): jabloně se sázejí po řadě podél úseku – každá, na
 * kterou práce došla, dostane den výsadby. `completes` = výsadba dostala vše, co chyběla.
 */
export function workRoadApples(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
): void {
  c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
  const per = roadApplePlantingWork();
  const pending = villageRoadApples(state).filter((a) => a.constructionId === c.id);
  const planted = completes ? pending.length : Math.floor(c.done / per + 1e-9);
  pending.forEach((apple, k) => {
    if (k < planted && apple.plantedDay === null) apple.plantedDay = day;
  });
}

/** Dokončená výsadba – jabloně už ke stavbě nepatří (mutuje stav). */
export function finishRoadApples(state: VillageState, c: Construction, day: number): void {
  for (const apple of villageRoadApples(state)) {
    if (apple.constructionId !== c.id) continue;
    apple.plantedDay ??= day;
    delete apple.constructionId;
  }
}
