import { dateOfDayIndex } from '../../calendar';
import { length2, obstaclesNear, tileOfWorldPoint, type Landscape } from '../../landscape';
import type { ObstacleLayer } from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { villageCemeteries } from '../cemetery';
import { cloneState } from '../clone';
import { milirCenter } from '../crafts';
import { HAY_WINTER_MONTHS } from '../hay';
import { giveWayToBuilding, treeTakenLand } from '../land-taken';
import { villageHerds } from '../livestock';
import { obstacleChangesAt, obstacleStatus, type ObstacleChanges } from '../obstacles';
import { villageOrchards } from '../orchard';
import { villagePens } from '../oxen';
import { plotShapes } from '../plot-cells';
import { plotSquareTile, rotationCosSin, squareCenter } from '../square-grid';
import { ROAD_TREE_ID_BASE, roadAppleStage, roadTreeLook } from '../road-trees';
import {
  CART_ROADS,
  MILIR,
  ROADS,
  ROAD_APPLES,
  ROAD_TREES,
  SACRED_BUILDINGS,
  WAGON_ROAD,
} from '../rules';
import type {
  CartKind,
  ChronicleEvent,
  Construction,
  DwellingPlot,
  HerdSpecies,
  LaborDay,
  LaborTarget,
  Road,
  RoadCartTrips,
  RoadGrade,
  RoadGround,
  RoadPoint,
  RoadQuietPiece,
  RoadTreeSpecies,
  RoadTreeSpot,
  SquareGrid,
  TileCell,
  Trail,
  VillageRoads,
  VillageState,
} from '../types';
import {
  computePathNetwork,
  pathBounds,
  villagePathBounds,
  pathStrength,
  simplifyPathLine,
  type PathLine,
  type PathNetwork,
  type PathTraffic,
  type PathVillage,
} from './network';
import {
  cartDepots,
  cartRoutes,
  cartTraffic,
  cartVillageOf,
  type CartRoute,
  type CartTarget,
} from './cart';
import {
  PATH_FORD,
  PATH_WETLAND,
  PATH_WOODLAND,
  cartObstacleMask,
  obstaclePosition,
  pathTerrainOf,
  pathWindowFor,
  withObstacles,
  type PathTerrain,
} from './terrain';
import { pathVillageOf } from './village';

// Pevné cesty (docs/design/roads.md – Dvě vrstvy cest, Stromy u pevných cest). Simulace vsi
// sčítá práci dne po místech a jednou za rok (1. 11.) spočítá stejnou funkcí jako pěšiny dne
// (`computePathNetwork`) síť z celoroční práce. Úsek, kudy se nad prahem chodí dva roky po sobě,
// se stane pevnou cestou: uloží se jeho osa a od té doby se nehýbe – nové trasy se k ní
// přimknou (sleva v síti), síť se jen rozrůstá. Nepoužívaná vyšlapaná cesta zaroste. U cesty se
// při vzniku určí místa na stromy; na volném místě se strom uchytí náhodou ze seedu vsi a roku,
// roste z keře a stojí, dokud neodumře. Vše je deterministické (jen přesná aritmetika – soubor
// hlídá ESLint jako síť pěšin) a počítá se jen jednou za rok.

const DAYS_PER_YEAR = 365.25;
/** Krok vzorkování os sítě (m) – úseky nad prahem a porovnání s loňskem. */
const SAMPLE_M = 2;
/** Loňské úseky nad prahem se ukládají po tolika metrech (na decimetry). */
const CANDIDATE_STEP_M = 4;
/** Letošní úsek nad prahem leží „tam, kde loni“, když je od loňského nejvýš tak daleko (m). */
const MATCH_M = 6;
/** Trasa vede po pevné cestě, když je od její osy nejvýš tak daleko (m) – buňka sítě 3,75 m. */
const ON_ROAD_M = 5;
/** Konec nové cesty u pevné cesty se k ní připojí, když je od ní nejvýš tak daleko (m). */
const ATTACH_M = 10;
/** Připojení blíž konci pevné cesty jde přímo do konce (cesta se nedělí) (m). */
const END_SNAP_M = 4;
/** Kratší úsek se pevnou cestou nestane (m). */
const MIN_ROAD_M = 15;
/** Zjednodušení osy nové cesty (m) – body po 2 m by stav zbytečně nafoukly. */
const SIMPLIFY_M = 0.25;
/** Provoz cesty se měří v bodech po tolika metrech (medián – jedno místo ho nezkreslí). */
const MEASURE_STEP_M = 3;
/** Strom nestojí blíž ose žádné pevné cesty (m) ani blíž konci cesty (rozcestí, brána). */
const ROAD_CLEAR_M = 2.2;
const END_CLEAR_M = 6;
/** Krok procházení osy při hledání míst na stromy (m). */
const SPOT_WALK_M = 1;
/** Strom u cesty nestojí kousek od překážky krajiny (kmen, keř, kámen) (m). */
const LAYER_CLEAR_M = 2.5;
/** Kolem čtverců (pole, sad, hřbitov, pozemek, háj) se nesází – jen podél okraje (m). */
const SQUARE_MARGIN_M = 1.5;
/** Ves: kolem obydlí se nesází (m od středu), kolem modly a svatyně, milíře a posvátného dubu. */
const HOMESTEAD_M = 16;
const SACRED_MARGIN_M = 3;
const MILIR_MARGIN_M = 1.5;
const SACRED_OAK_M = 6;
/** Kyblíky prostorového indexu os (m). */
const BUCKET_M = 10;

/** Pevné cesty prázdné vsi – práce se začne sčítat od dne `day`. */
function emptyRoads(day: number): VillageRoads {
  return {
    nextId: 1,
    roads: [],
    trees: [],
    candidates: [],
    labor: { from: day, days: 0, shares: [] },
  };
}

function isRoadYearDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === ROADS.yearDay.month && date.day === ROADS.yearDay.day;
}

/**
 * Krok dne pro pevné cesty (mutuje stav – volá simulace na konci dne): 1. 11. roční kontrola
 * (`updateRoads`) a nový rok cest, pak práce dne do ročního součtu. Bez krajiny (kalibrace, testy)
 * nic – pevné cesty se počítají jen s krajinou sídla. Vsi bez pevných cest (starší) začnou sčítat.
 * Vrátí provoz roční sítě ke stavbám (`PathNetwork.visits` – opuštěné stavby, abandonment.md)
 * v den roční kontroly; ves bez obydlí prázdný, jiné dny (a bez krajiny) null.
 */
export function roadsDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ReadonlyMap<string, number> | null {
  if (!landscape) return null;
  const roads = (state.roads ??= emptyRoads(day));
  let visits: ReadonlyMap<string, number> | null = null;
  if (isRoadYearDay(day) && roads.labor.from < day) {
    const changes = obstacleChangesAt(state, day);
    const annual = annualPathNetwork(state, day, landscape, obstacles, changes);
    state.chronicle.push(...updateRoads(state, day, landscape, obstacles, { annual, changes }));
    visits = annual?.network.visits ?? new Map<string, number>();
    roads.labor = { from: day, days: 0, shares: [] };
  }
  addRoadLabor(roads, state.labor, day);
  return visits;
}

/** Klíč místa práce (pole bez dílů; seč přirozených luk za rok jedno místo). */
function laborKey(target: LaborTarget): string {
  if (target.kind === 'trees') return `trees:${target.ids.join('.')}`;
  if (target.kind === 'meadow') return 'meadow';
  // cesta ke kraji mapy (nákup u souseda – crafts.md) podle směru
  if (target.kind === 'edge') return `edge:${target.direction}`;
  // břeh, kam vůz jezdí pro vodu (wagons.md – Co vozy vozí)
  if (target.kind === 'water') return `water:${target.x},${target.z}`;
  // nošení uhlí od milíře do kovárny zvlášť od práce uhlíře u milíře (crafts.md – Uhlí a ruda)
  if (target.kind === 'kiln' && target.from !== undefined)
    return `kiln:${target.id}>${target.from}`;
  return target.kind === 'village' ? 'village' : `${target.kind}:${target.id}`;
}

/** Políčka luk bez opakování, po řádcích. */
function mergeCells(a: readonly TileCell[], b: readonly TileCell[]): TileCell[] {
  const cells = new Map<string, TileCell>();
  for (const c of [...a, ...b]) cells.set(`${c.x},${c.y}`, { x: c.x, y: c.y });
  return [...cells.values()].sort((p, q) => p.y - q.y || p.x - q.x);
}

/** Práce dne `day` (rozdělení práce vsi) do součtu roku cest (mutuje). */
export function addRoadLabor(roads: VillageRoads, labor: LaborDay | undefined, day: number): void {
  roads.labor.days++;
  if (!labor || labor.day !== day) return;
  const index = new Map(roads.labor.shares.map((s, i) => [laborKey(s.target), i]));
  for (const share of labor.shares) {
    if (share.target.kind === 'village' || share.manDays <= 0) continue;
    const key = laborKey(share.target);
    const at = index.get(key);
    if (at !== undefined) {
      const sum = roads.labor.shares[at]!;
      sum.manDays += share.manDays;
      // seč za rok: všechna políčka luk, kde se sekalo (pěšina vede k nejbližšímu)
      if (sum.target.kind === 'meadow' && share.target.kind === 'meadow') {
        sum.target = { kind: 'meadow', cells: mergeCells(sum.target.cells, share.target.cells) };
      }
    } else {
      const target: LaborTarget =
        share.target.kind === 'field'
          ? { kind: 'field', id: share.target.id }
          : share.target.kind === 'trees'
            ? { kind: 'trees', ids: [...share.target.ids] }
            : share.target.kind === 'meadow'
              ? { kind: 'meadow', cells: mergeCells([], share.target.cells) }
              : { ...share.target };
      index.set(key, roads.labor.shares.length);
      roads.labor.shares.push({ target, manDays: share.manDays });
    }
  }
}

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

/** Ohrady se spřežením – tam stojí vozy (wagons.md – Vůz). */
export function teamPens(state: Pick<VillageState, 'pens'>): Set<number> {
  return new Set(
    (state.pens ?? []).filter((p) => p.builtDay !== null && p.team !== null).map((p) => p.id),
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
 * jako v síti pěšin, pevné cesty podle stupně a příznaku vozová. Bez ohrady se spřežením (nebo
 * bez obydlí) null. Čistá funkce stavu – výsledek se pamatuje pro stejný vstup.
 */
export function villageCartRoutes(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind,
  targets: readonly CartTarget[],
): CartRoute[] | null {
  // mokřina na ose pevných cest (Road.ground) – vůz ji vidí jako chůze
  const village = cartVillageOf(pathVillageOf(state, day, landscape), state.roads?.roads ?? []);
  const depots = cartDepots(village, teamPens(state));
  const bounds = pathBounds(village);
  if (depots.length === 0 || !bounds) return null;
  const margin = 20;
  const box = {
    minX: Math.min(bounds.minX, ...targets.map((t) => t.x - t.reachM - margin)),
    minZ: Math.min(bounds.minZ, ...targets.map((t) => t.z - t.reachM - margin)),
    maxX: Math.max(bounds.maxX, ...targets.map((t) => t.x + t.reachM + margin)),
    maxZ: Math.max(bounds.maxZ, ...targets.map((t) => t.z + t.reachM + margin)),
  };
  const key = JSON.stringify([village, kind, targets, box]);
  const last = lastCartRoutes.get(landscape);
  if (last && last.obstacles === obstacles && last.key === key) return last.routes;
  const terrain = pathTerrainOf(landscape, pathWindowFor(landscape, box));
  const blocked = obstacles
    ? cartObstacleMask(terrain, obstacles, obstacleChangesAt(state, day))
    : null;
  const routes = cartRoutes({ village, terrain, blocked, kind, depots, targets }).routes;
  lastCartRoutes.set(landscape, { obstacles, key, routes });
  return routes;
}

/**
 * Příznak vozová (mutuje – wagons.md, Vyjeté cesty): pevná cesta, kudy vozy jezdí nad prahem
 * CART_ROADS.years let po sobě, ho dostane; vozová cesta, kudy CART_ROADS.dropYears let jezdí
 * pod polovinou prahu, ho ztratí (dál je pěší). Provoz bez vozů se přestane pamatovat.
 */
function markCartRoads(roads: VillageRoads): void {
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

/** Síť z celoroční práce a terén, ze kterého vznikla; ves bez obydlí null. */
export interface AnnualNetwork {
  network: PathNetwork;
  terrain: PathTerrain;
}

/**
 * Stáda na pastvě v průměru roku: krávy, které v zimě stojí v ohradě (ves má hotovou ohradu), se
 * pasou jen mimo zimu – poměrně k měsícům.
 */
function annualPasture(state: VillageState): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const penned = villagePens(state).some((p) => p.builtDay !== null);
  const grazing = penned ? (12 - HAY_WINTER_MONTHS.length) / 12 : 1;
  return {
    sheep: Math.round(herds.sheep),
    goat: Math.round(herds.goat),
    pig: Math.round(herds.pig),
    cow: Math.round(herds.cow * grazing),
  };
}

/**
 * Roční síť (roads.md): ves v den `day` s průměrnými člověkodny na den za rok cest (místo práce
 * dne), dřevo podle průměru roku, stáda na pastvě v průměru roku a sleva za pevné cesty – stejná
 * funkce jako pěšiny dne.
 */
export function annualPathNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  changes: ObstacleChanges = obstacleChangesAt(state, day),
): AnnualNetwork | null {
  const base = pathVillageOf(state, day, landscape);
  const roads = state.roads;
  const days = Math.max(1, roads?.labor.days ?? 1);
  const shares = (roads?.labor.shares ?? []).map((s) => ({
    target: s.target,
    manDays: s.manDays / days,
  }));
  const village: PathVillage = {
    ...base,
    ...(base.labor ? { labor: { ...base.labor, shares } } : {}),
    ...(state.livestock ? { livestock: annualPasture(state) } : {}),
  };
  const bounds = villagePathBounds(village, landscape);
  if (!bounds) return null;
  const window = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  const terrain = obstacles ? withObstacles(window, obstacles, changes) : window;
  const network = computePathNetwork({
    village,
    terrain,
    annual: true,
    ...(obstacles ? { tree: (id: number) => obstaclePosition(obstacles, id) } : {}),
  });
  return { network, terrain };
}

/**
 * Roční kontrola pevných cest v den `day` (1. 11.; mutuje stav): provoz cest za uplynulý rok,
 * zarůstání, nové pevné cesty z úseků nad prahem i loni, letošní úseky nad prahem na příští rok
 * a stromy u cest (konec pařezů, odstraněné stavbou, uchycení nových). Vrátí události kroniky.
 * `precomputed` – roční síť a změny překážek, které už volající spočítal ze stejného stavu
 * (`roadsDay` – provoz ke stavbám z téže sítě).
 */
export function updateRoads(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  precomputed?: { annual: AnnualNetwork | null; changes: ObstacleChanges },
): ChronicleEvent[] {
  const roads = (state.roads ??= emptyRoads(day));
  const changes = precomputed?.changes ?? obstacleChangesAt(state, day);
  const annual = precomputed
    ? precomputed.annual
    : annualPathNetwork(state, day, landscape, obstacles, changes);
  const events: ChronicleEvent[] = [];
  const blocked = plantingBlocker(state, landscape);
  if (annual) {
    const { network, terrain } = annual;
    // jízdy vozů za rok (wagons.md – Vyjeté cesty) – ves bez vozů nic
    const cart = annualCartNetwork(state, day, landscape, obstacles, changes, terrain);
    for (const road of roads.roads) {
      road.traffic = [...road.traffic, roadTraffic(road.points, network.traffic)].slice(
        -ROADS.overgrowYears,
      );
      if (cart || road.cartTraffic) {
        road.cartTraffic = [
          ...(road.cartTraffic ?? []),
          cart ? roadTraffic(road.points, cart.traffic) : 0,
        ].slice(-CART_ROADS.dropYears);
      }
      // úseky z doby před mokřinou a brody (fáze 1) si je doplní
      road.ground ??= roadGroundOf(road.points, terrain);
    }
    // zarůstání vyšlapané cesty po kusech (upravená a hať nezarůstají, ani cesta, která se
    // vylepšuje, a kus s jabloněmi – hráč do něj vložil práci; kus, kudy jezdí vozy, taky ne) –
    // stromy u ní stojí dál
    events.push(...overgrowRoads(state, roads, day, network.traffic, cart?.traffic ?? null));
    markCartRoads(roads);
    const runs = hotRuns(network.lines);
    const context: SpotContext = {
      terrain,
      blocked,
      layer: obstacles,
      changes,
      seed: state.seed,
      split: (from, to) => {
        splitRoadWork(state.constructions, from, to);
        splitTrailPieces(state.trails, from, to);
      },
    };
    for (const road of formRoads(roads, runs, day, network.traffic, context)) {
      events.push({ day, kind: 'road-formed', roadId: road.id });
    }
    // vyježděné cesty – kde vozy jezdí nad prahem i loni: po vyšlapané cestě ji převezmou, jinde
    // vznikne nová (wagons.md – Vyjeté cesty)
    if (cart) {
      const formed = formCartRoads(
        roads,
        cart.runs,
        roads.cartCandidates ?? [],
        day,
        network.traffic,
        cart.traffic,
        context,
      );
      for (const road of formed) events.push({ day, kind: 'road-formed', roadId: road.id });
      const next = cart.runs.map((run) =>
        resample(run, null, CANDIDATE_STEP_M).points.map((p) => ({ x: dm(p.x), z: dm(p.z) })),
      );
      if (next.length > 0) roads.cartCandidates = next;
      else delete roads.cartCandidates;
    } else {
      delete roads.cartCandidates;
    }
    // díry: volný konec kus od jiného úseku (ne u brány ani cíle) se k němu napojí; falešná
    // rozcestí (odbočka zarostla, nová cesta navázala na konec jiné) – úseky se spojí
    const termini = networkTermini(network.lines);
    tidyRoads(roads, state.constructions, termini, context);
    roads.candidates = runs.map((run) =>
      resample(run, null, CANDIDATE_STEP_M).points.map((p) => ({ x: dm(p.x), z: dm(p.z) })),
    );
  } else {
    roads.candidates = [];
  }
  // stromy: pařez zmizel, nebo strom odstranila stavba – místo je volné
  const removed = new Set(changes.removed);
  roads.trees = roads.trees.filter((t) => !removed.has(t.id) && roadTreeLook(t, day) !== null);
  // jabloně: zmizí souše po letech a jabloně odstraněné stavbou (rozestavěná výsadba zůstává)
  if (roads.apples) {
    roads.apples = roads.apples.filter(
      (a) =>
        a.constructionId !== undefined || (!removed.has(a.id) && roadAppleStage(a, day) !== null),
    );
  }
  rootTrees(state, roads, day, blocked, landscape);
  return events;
}

/**
 * Jabloně, které drží cestu (roads.md – Cesta s prací hráče nezaroste): živá jabloň nebo jabloň,
 * která se teprve sází. Až dožijí (souš), kus cesty u nich může zarůst jako jiný.
 */
export function keepingApples(
  roads: Pick<VillageRoads, 'apples'>,
  day: number,
): NonNullable<VillageRoads['apples']> {
  return (roads.apples ?? []).filter((apple) => {
    const stage = roadAppleStage(apple, day);
    return stage === 'tree' || stage === 'planting';
  });
}

/** Kus osy úseku: od–do (m od začátku osy) a jeho střed ve světě (na cm). */
export interface RoadPiece {
  from: number;
  to: number;
  x: number;
  z: number;
}

/**
 * Kusy osy pro zarůstání (roads.md – Zarůstá jen nepoužívaný kus): osa rozdělená na stejně
 * dlouhé kusy co nejblíž ROADS.pieceM (kratší úsek je jeden kus).
 */
export function roadPieces(points: readonly RoadPoint[]): RoadPiece[] {
  const at = lengthsAlong(points);
  const length = at[at.length - 1] ?? 0;
  const count = Math.max(1, Math.round(length / ROADS.pieceM));
  const pieces: RoadPiece[] = [];
  for (let k = 0; k < count; k++) {
    const from = (length * k) / count;
    const to = (length * (k + 1)) / count;
    pieces.push({ from, to, ...pointAlong(points, (from + to) / 2) });
  }
  return pieces;
}

/** Jabloň stojí u kusu cesty, když je od jeho osy nejvýš tak daleko (m) – místa 2,6–3,4 m. */
const APPLE_KEEP_M = 6;

/**
 * Zarůstání vyšlapaných cest po kusech (mutuje – roads.md, Zarůstá jen nepoužívaný kus; Martin,
 * 19. 10. 2026): každý kus osy (`roadPieces`) s provozem roční sítě pod polovinou prahu přičte rok
 * (`Road.quiet` – tichý kus loni do půl kusu odsud), jinak se počítá od nuly. Kus tichý
 * ROADS.overgrowYears let po sobě zaroste, když u něj nestojí živá jabloň (`keepingApples`);
 * celý tichý úsek zaroste jako dřív, jinak se tichý kus vyřízne (`cutOvergrown`) a zbytek zůstane
 * pevnou cestou se starým id. Upravená cesta, hať a cesta, která se vylepšuje, nezarůstají
 * (a počítat nemusí). Vrátí události kroniky (`road-overgrown` jen pro zaniklé kusy).
 */
function overgrowRoads(
  state: VillageState,
  roads: VillageRoads,
  day: number,
  traffic: PathTraffic,
  carts: PathTraffic | null = null,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const building = roadsInWork(state.constructions);
  const apples = keepingApples(roads, day);
  const quietBelow = ROADS.tripsPerDay * ROADS.overgrowShare;
  for (const road of [...roads.roads]) {
    if (road.grade !== 'trodden' || building.has(road.id) || road.points.length < 2) {
      delete road.quiet;
      continue;
    }
    const pieces = roadPieces(road.points);
    const before = road.quiet ?? [];
    const quiet: RoadQuietPiece[] = [];
    const dead = pieces.map((piece) => {
      const axis = axisSlice(road.points, piece.from, piece.to);
      if (roadTraffic(axis, traffic) >= quietBelow) return false;
      // kus, kudy jezdí vozy, není tichý (wagons.md – Vyjeté cesty)
      if (carts && roadTraffic(axis, carts) >= CART_ROADS.tripsPerDay * CART_ROADS.dropShare) {
        return false;
      }
      let years = 1;
      let nearest = ROADS.pieceM / 2;
      for (const old of before) {
        const d = length2(old.x - piece.x, old.z - piece.z);
        if (d <= nearest) {
          nearest = d;
          years = Math.min(ROADS.overgrowYears, old.years + 1);
        }
      }
      quiet.push({ x: piece.x, z: piece.z, years });
      if (years < ROADS.overgrowYears) return false;
      const along = axisDistance([axisSlice(road.points, piece.from, piece.to)]);
      return !apples.some((a) => a.roadId === road.id && along(a.x, a.z) <= APPLE_KEEP_M);
    });
    if (quiet.length > 0) road.quiet = quiet;
    else delete road.quiet;
    if (!dead.some(Boolean)) continue;
    if (dead.every(Boolean)) {
      roads.roads.splice(roads.roads.indexOf(road), 1);
      events.push({ day, kind: 'road-overgrown', roadId: road.id });
      continue;
    }
    for (const roadId of cutOvergrown(roads, road, pieces, dead, traffic)) {
      events.push({ day, kind: 'road-overgrown', roadId });
    }
  }
  return events;
}

/**
 * Vyřízne z úseku zarostlé kusy (`dead` po kusech `pieces`) – mutuje. Živé zbytky zůstanou
 * úseky (první se starým id a dnem vzniku, další s novým id), letošní provoz každého podle jeho
 * osy, tiché kusy, místa na stromy a jabloně k nejbližšímu zbytku (místa zarostlého kusu zmizí –
 * stromy na nich stojí dál), mokřina a brody po kusech. Konce u zarostlého kusu jsou volné
 * (`openEnds`, `VillageRoads.cutEnds`). Vrátí id zarostlých kusů (nová id – pro kroniku).
 */
function cutOvergrown(
  roads: VillageRoads,
  road: Road,
  pieces: readonly RoadPiece[],
  dead: readonly boolean[],
  traffic: PathTraffic,
): number[] {
  const alive: { a: number; b: number }[] = [];
  const gone: number[] = [];
  pieces.forEach((piece, k) => {
    const last = k > 0 ? dead[k - 1] : undefined;
    if (dead[k]) {
      if (last !== true) gone.push(roads.nextId++);
      return;
    }
    if (last === false) alive[alive.length - 1]!.b = piece.to;
    else alive.push({ a: piece.from, b: piece.to });
  });
  const length = pieces[pieces.length - 1]!.to;
  const made: Road[] = alive.map(({ a, b }, k) => {
    const points = axisSlice(road.points, a, b);
    const openEnds: [boolean, boolean] = [
      a > 0 ? true : (road.openEnds?.[0] ?? false),
      b < length ? true : (road.openEnds?.[1] ?? false),
    ];
    return {
      id: k === 0 ? road.id : roads.nextId++,
      points,
      bornDay: road.bornDay,
      grade: road.grade,
      traffic: [...road.traffic.slice(0, -1), roadTraffic(points, traffic)],
      spots: [],
      ...(road.ground ? { ground: groundPart(road.ground, a, b) } : {}),
      openEnds,
      ...(road.cart ? { cart: true as const } : {}),
      ...(road.swath ? { swath: true as const } : {}),
      ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
    };
  });
  const axes = made.map((r) => axisDistance([r.points]));
  const nearest = (x: number, z: number, within: number): Road | null => {
    let best: Road | null = null;
    let bestD = within;
    made.forEach((r, k) => {
      const d = axes[k]!(x, z);
      if (d <= bestD) {
        best = r;
        bestD = d;
      }
    });
    return best;
  };
  for (const spot of road.spots) {
    nearest(spot.x, spot.z, ROAD_TREES.offsetM.to + 1)?.spots.push(spot);
  }
  for (const piece of road.quiet ?? []) {
    const owner = nearest(piece.x, piece.z, ROADS.pieceM / 2);
    if (owner) (owner.quiet ??= []).push(piece);
  }
  for (const apple of roads.apples ?? []) {
    if (apple.roadId === road.id) apple.roadId = nearest(apple.x, apple.z, Infinity)!.id;
  }
  // konce u zarostlého kusu
  const cuts = made.flatMap((r, k) => [
    ...(alive[k]!.a > 0 ? [{ ...r.points[0]! }] : []),
    ...(alive[k]!.b < length ? [{ ...r.points[r.points.length - 1]! }] : []),
  ]);
  roads.cutEnds = [...(roads.cutEnds ?? []), ...cuts];
  roads.roads.splice(roads.roads.indexOf(road), 1, ...made);
  return gone;
}

/** Bod osy `d` m od začátku (na cm). */
function pointAlong(points: readonly RoadPoint[], d: number): RoadPoint {
  return axisSlice(points, d, d)[0]!;
}

/** Úseky, které se právě vylepšují (stavby `road` – roads.md). */
export function roadsInWork(constructions: readonly Construction[]): Set<number> {
  return new Set(constructions.flatMap((c) => c.roadIds ?? []));
}

/**
 * Úsek `from` se rozdělil – stavby na něm patří i novému úseku `to` hned za ním (pořadí po cestě
 * – průběh vylepšení po úsecích, `roadUpgradeProgress`; mutuje).
 */
function splitRoadWork(constructions: Construction[], from: number, to: number): void {
  for (const c of constructions) {
    const k = c.roadIds?.indexOf(from) ?? -1;
    if (k >= 0) c.roadIds!.splice(k + 1, 0, to);
  }
}

/**
 * Úsek `from` se rozdělil – zemská stezka (trade.md), která po něm vede, vede i po novém úseku
 * `to` hned za ním: stejný stupeň, práce zůstane u prvního kusu (mutuje).
 */
function splitTrailPieces(trails: readonly Trail[] | undefined, from: number, to: number): void {
  for (const trail of trails ?? []) {
    const at = trail.pieces.findIndex((p) => p.roadId === from);
    if (at < 0) continue;
    trail.pieces.splice(at + 1, 0, { roadId: to, grade: trail.pieces[at]!.grade, manDays: 0 });
  }
}

/** Krok vzorkování osy pro mokřinu a brody (m), slití mezer (m) a nejkratší mokřina (m). */
const GROUND_STEP_M = 1;
const GROUND_GAP_M = 2;
const GROUND_MIN_WET_M = 2;
/** Body brodu bližší než tolik metrů jsou jeden brod. */
const FORD_GAP_M = 4;

/**
 * Kudy osa vede (roads.md – Vylepšení cesty): úseky v mokřině (rovina podél potoka) a brody přes
 * potok – po metru osy podle příznaků terénu pěšin; mezery do 2 m se slijí, kratší mokřina se
 * nepočítá, brod je uprostřed souvislé řady bodů v brodu. Vzdálenosti od začátku osy na dm.
 */
export function roadGroundOf(points: readonly RoadPoint[], terrain: PathTerrain): RoadGround {
  const ground: RoadGround = { wet: [], fords: [] };
  if (points.length < 2) return ground;
  const { points: samples } = resample(points, null, GROUND_STEP_M);
  const at = lengthsAlong(samples);
  const length = at[at.length - 1]!;
  const flagAt = (p: RoadPoint): number => {
    const i = Math.round((p.x - terrain.originX) / terrain.cellM);
    const j = Math.round((p.z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return 0;
    return terrain.flags[j * terrain.width + i]!;
  };
  const runs = (flag: number, gap: number): [number, number][] => {
    const out: [number, number][] = [];
    samples.forEach((p, k) => {
      if (!(flagAt(p) & flag)) return;
      const from = Math.max(0, at[k]! - GROUND_STEP_M / 2);
      const to = Math.min(length, at[k]! + GROUND_STEP_M / 2);
      const last = out[out.length - 1];
      if (last && from - last[1] <= gap) last[1] = to;
      else out.push([from, to]);
    });
    return out;
  };
  ground.wet = runs(PATH_WETLAND, GROUND_GAP_M)
    .filter(([a, b]) => b - a >= GROUND_MIN_WET_M)
    .map(([a, b]) => [dm(a), dm(b)]);
  ground.fords = runs(PATH_FORD, FORD_GAP_M).map(([a, b]) => dm((a + b) / 2));
  return ground;
}

/** Délka mokřiny na ose (m). */
export function roadWetM(ground: RoadGround | undefined): number {
  return (ground?.wet ?? []).reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Mokřina a brody na ose od `from` do `to` (m) posunuté na začátek úseku. */
function groundPart(ground: RoadGround | undefined, from: number, to: number): RoadGround {
  if (!ground) return { wet: [], fords: [] };
  return {
    wet: ground.wet
      .filter(([a, b]) => b > from && a < to)
      .map(([a, b]): [number, number] => [dm(Math.max(a, from) - from), dm(Math.min(b, to) - from)])
      .filter(([a, b]) => b > a),
    fords: ground.fords.filter((f) => f >= from && f < to).map((f) => dm(f - from)),
  };
}

/** Délka osy úseku (m). */
export function roadLengthM(road: Pick<Road, 'points'>): number {
  const at = lengthsAlong(road.points);
  return at[at.length - 1] ?? 0;
}

function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

function dm(v: number): number {
  return Math.round(v * 10) / 10;
}

// --- geometrie os ------------------------------------------------------------------------------

/** Délky po lomené čáře (kumulativně od začátku). */
function lengthsAlong(points: readonly RoadPoint[]): number[] {
  const at = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    at.push(at[k - 1]! + length2(b.x - a.x, b.z - a.z));
  }
  return at;
}

/** Body lomené čáry po `step` m (s koncem) a hodnoty v nich (lineárně mezi body). */
function resample(
  points: readonly RoadPoint[],
  values: readonly number[] | null,
  step: number,
): { points: RoadPoint[]; values: number[] } {
  const out: RoadPoint[] = [];
  const outValues: number[] = [];
  if (points.length === 0) return { points: out, values: outValues };
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const n = Math.max(1, Math.ceil(length / step - 1e-9));
  let segment = 1;
  for (let s = 0; s <= n; s++) {
    const d = s === n ? length : s * step;
    while (segment < points.length - 1 && at[segment]! < d) segment++;
    if (points.length === 1) {
      out.push({ ...points[0]! });
      outValues.push(values?.[0] ?? 0);
      break;
    }
    const a = points[segment - 1]!;
    const b = points[segment]!;
    const span = at[segment]! - at[segment - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[segment - 1]!) / span)) : 1;
    out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
    if (values) {
      outValues.push(values[segment - 1]! + (values[segment]! - values[segment - 1]!) * u);
    }
  }
  return { points: out, values: outValues };
}

/** Vzdálenost bodu od úsečky a–b a parametr nejbližšího bodu (0–1). */
function toSegment(
  x: number,
  z: number,
  a: RoadPoint,
  b: RoadPoint,
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return { distance: length2(x - (a.x + dx * t), z - (a.z + dz * t)), t };
}

/** Vzdálenost od nejbližší osy (přesně do BUCKET_M, dál Infinity) – úsečky po kyblících. */
function axisDistance(
  polylines: readonly (readonly RoadPoint[])[],
): (x: number, z: number) => number {
  const buckets = new Map<string, [RoadPoint, RoadPoint][]>();
  for (const line of polylines) {
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1]!;
      const b = line[k]!;
      const x0 = Math.floor(Math.min(a.x, b.x) / BUCKET_M);
      const x1 = Math.floor(Math.max(a.x, b.x) / BUCKET_M);
      const z0 = Math.floor(Math.min(a.z, b.z) / BUCKET_M);
      const z1 = Math.floor(Math.max(a.z, b.z) / BUCKET_M);
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const key = `${bx},${bz}`;
          const list = buckets.get(key);
          if (list) list.push([a, b]);
          else buckets.set(key, [[a, b]]);
        }
      }
    }
  }
  return (x, z) => {
    let best = Infinity;
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [a, b] of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
          best = Math.min(best, toSegment(x, z, a, b).distance);
        }
      }
    }
    return best;
  };
}

/** Nejbližší bod na pevných cestách: index cesty, úsek, bod a vzdálenost. */
interface RoadHit {
  road: number;
  segment: number;
  point: RoadPoint;
  distance: number;
}

function nearestOnRoads(roads: readonly Road[], x: number, z: number): RoadHit | null {
  let best: RoadHit | null = null;
  roads.forEach((road, r) => {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const { distance, t } = toSegment(x, z, a, b);
      if (best === null || distance < best.distance) {
        best = {
          road: r,
          segment: k - 1,
          point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
          distance,
        };
      }
    }
  });
  return best;
}

// --- provoz a vznik cest ----------------------------------------------------------------------

/**
 * Provoz pevné cesty v roční síti (cest za den): medián bodů osy po MEASURE_STEP_M, v bodě
 * nejvyšší provoz buněk 3 × 3 kolem něj (trasa vede po cestě nebo těsně vedle). Na setiny.
 */
export function roadTraffic(points: readonly RoadPoint[], traffic: PathTraffic): number {
  const samples = resample(points, null, MEASURE_STEP_M).points;
  const values = samples.map((p) => {
    const ci = Math.round((p.x - traffic.originX) / traffic.cellM);
    const cj = Math.round((p.z - traffic.originZ) / traffic.cellM);
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= traffic.width || j >= traffic.height) continue;
        best = Math.max(best, traffic.raw[j * traffic.width + i]!);
      }
    }
    return best;
  });
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)]! * 100) / 100;
}

/**
 * Úseky roční sítě nad prahem (ROADS.tripsPerDay – síla pěšiny nad pathStrength prahu): osy po
 * SAMPLE_M rozdělené tam, kde provoz klesne pod práh.
 */
function hotRuns(lines: readonly PathLine[]): RoadPoint[][] {
  const threshold = pathStrength(ROADS.tripsPerDay) - 1e-9;
  const runs: RoadPoint[][] = [];
  for (const line of lines) {
    const { points, values } = resample(line.points, line.strength, SAMPLE_M);
    let run: RoadPoint[] = [];
    points.forEach((p, k) => {
      if (values[k]! >= threshold) {
        run.push(p);
        return;
      }
      if (run.length >= 2) runs.push(run);
      run = [];
    });
    if (run.length >= 2) runs.push(run);
  }
  return runs;
}

/**
 * Nové pevné cesty (mutuje `roads`): po bodech letošních úseků nad prahem – bod, který leží i na
 * loňském úseku (MATCH_M) a nevede po pevné cestě (ON_ROAD_M), patří nové cestě. Souvislý běh
 * takových bodů je nová cesta; kde navazuje na pevnou cestu, připojí se k ní (rozdělí ji
 * v rozcestí). Vrátí nové cesty.
 */
function formRoads(
  roads: VillageRoads,
  runs: readonly RoadPoint[][],
  day: number,
  traffic: PathTraffic,
  context: SpotContext,
): Road[] {
  const formed: Road[] = [];
  const candidates = roads.candidates;
  if (candidates.length === 0) return formed;
  const lastYear = axisDistance(candidates);
  for (const run of runs) {
    const onRoadAt = axisDistance(roads.roads.map((r) => r.points));
    const confirmed = run.map((p) => lastYear(p.x, p.z) <= MATCH_M);
    // po pevné cestě, nebo souběžně s ní (do PARALLEL_M stejným směrem) – provoz patří jí, nová
    // souběžná cesta nevznikne (Martin)
    const onRoad = run.map(
      (p, k) =>
        onRoadAt(p.x, p.z) <= ON_ROAD_M ||
        alongsideRoad(
          roads.roads,
          p,
          run[Math.max(0, k - 1)]!,
          run[Math.min(run.length - 1, k + 1)]!,
        ),
    );
    let i = 0;
    while (i < run.length) {
      if (!confirmed[i] || onRoad[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < run.length && confirmed[j + 1] && !onRoad[j + 1]) j++;
      // připojení konce: k pevné cestě, po které trasa vedla (ATTACH_M), nebo k té, se kterou
      // vedla souběžně (do PARALLEL_M – konec nové cesty je od ní až o krok vzorkování dál)
      const reach = (k: number): number | false =>
        k < 0 || k >= run.length || !onRoad[k]
          ? false
          : onRoadAt(run[k]!.x, run[k]!.z) <= ON_ROAD_M
            ? ATTACH_M
            : PARALLEL_M + SAMPLE_M;
      const road = formRoad(
        roads,
        run.slice(i, j + 1),
        reach(i - 1),
        reach(j + 1),
        day,
        traffic,
        context,
      );
      if (road) formed.push(road);
      i = j + 1;
    }
  }
  return formed;
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
 * Vyježděné cesty z provozu vozů (mutuje – wagons.md, Vyjeté cesty; Martin, 19. 10. 2026: „Cesty
 * – pokud nějakou cestu vyjezdí vůz, bude to vyježděná cesta. Pokud vůz takhle vyjezdí vyšlapanou
 * cestu, tak to vozová cesta přebije.“). Po bodech letošních úseků vozů nad prahem, které leží
 * i na loňských (`CartPoint`): kudy vozy jedou po cestě, kterou už mají, provoz patří jí; po
 * vyšlapané cestě bez vozů ji převezmou (`takeOverRoads`); souvislý kus mimo cesty dá novou
 * vyježděnou cestu (konce u pevné cesty se k ní připojí). Kus souběžně vedle vyšlapané cesty
 * (do PARALLEL_M – vozy její osou nejedou) dá novou vyježděnou cestu po ose vozů, když je dlouhý
 * aspoň PARALLEL_MIN_M (souběžný kus vyšlapané pak zmizí – vozová je silnější, `mergeParallelRoads`),
 * kratší vyšlapanou převezme. Provoz vozů se tak nikdy neztratí a souběžná cesta nevznikne. Vrátí
 * nové cesty.
 */
function formCartRoads(
  roads: VillageRoads,
  runs: readonly RoadPoint[][],
  candidates: readonly RoadPoint[][],
  day: number,
  traffic: PathTraffic,
  cartTraffic: PathTraffic,
  context: SpotContext,
): Road[] {
  const formed: Road[] = [];
  if (candidates.length === 0) return formed;
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
  // trasa po trase – nová cesta z jedné trasy patří vozům i na dalších trasách téhož úseku
  for (const run of runs) {
    const points = classify(run);
    // nové cesty: souvislé kusy mimo cesty (i souběžné kus vedle vyšlapané); souběžný kus kratší
    // než PARALLEL_MIN_M vyšlapanou převezme
    const open = (c: CartPoint): boolean => c.kind === 'free' || (c.kind === 'take' && !c.near);
    const fresh: [number, number][] = [];
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
      } else {
        fresh.push([i, j]);
      }
      i = j + 1;
    }
    const taken = points.flatMap((c) =>
      c.kind === 'take' && c.near ? [{ road: c.road, at: c.at }] : [],
    );
    takeOverRoads(roads, taken, cartTraffic, context);
    // připojení konce: k pevné cestě, po které trasa vedla (ATTACH_M), nebo k té, se kterou
    // vedla souběžně (do PARALLEL_M – konec nové cesty je od ní až o krok vzorkování dál)
    const reach = (k: number): number | false => {
      const c = points[k];
      if (!c || c.kind === 'skip' || c.kind === 'free') return false;
      return c.near ? ATTACH_M : PARALLEL_M + SAMPLE_M;
    };
    for (const [from, to] of fresh) {
      const road = formRoad(
        roads,
        run.slice(from, to + 1),
        reach(from - 1),
        reach(to + 1),
        day,
        traffic,
        context,
      );
      if (!road) continue;
      road.cart = true;
      road.cartTraffic = [roadTraffic(road.points, cartTraffic)];
      formed.push(road);
    }
  }
  return formed;
}

/** Vzdálenost bodu `hit` po ose cesty od jejího začátku (m). */
function hitAt(road: Road, hit: RoadHit): number {
  const a = road.points[hit.segment]!;
  return lengthsAlong(road.points)[hit.segment]! + length2(hit.point.x - a.x, hit.point.z - a.z);
}

/** Jedna nová pevná cesta z bodů `points` – s připojením konců k pevné cestě. */
function formRoad(
  roads: VillageRoads,
  points: RoadPoint[],
  /** Připojit začátek / konec k pevné cestě do tolika metrů (false = ne). */
  joinStart: number | false,
  joinEnd: number | false,
  day: number,
  traffic: PathTraffic,
  context: SpotContext,
): Road | null {
  const axis = points.map((p) => ({ x: cm(p.x), z: cm(p.z) }));
  // napojení na pevnou cestu (případné rozdělení cesty v rozcestí) – nejdřív začátek, pak konec
  const start = joinStart !== false ? joinPoint(roads, axis[0]!, context, joinStart) : null;
  if (start) axis.unshift(start);
  const end = joinEnd !== false ? joinPoint(roads, axis[axis.length - 1]!, context, joinEnd) : null;
  if (end) axis.push(end);
  const simple = simplifyPathLine(axis, [], SIMPLIFY_M).points.filter(
    (p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z,
  );
  const along = lengthsAlong(simple);
  const length = along[along.length - 1] ?? 0;
  if (simple.length < 2 || length < MIN_ROAD_M) return null;
  const road: Road = {
    id: roads.nextId++,
    points: simple,
    bornDay: day,
    grade: 'trodden',
    traffic: [roadTraffic(simple, traffic)],
    spots: [],
    ground: roadGroundOf(simple, context.terrain),
  };
  roads.roads.push(road);
  // volná místa jiných cest, přes která nová cesta vede, zmizí (stromy na nich stojí dál)
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const alongNew = axisDistance([simple]);
  for (const other of roads.roads) {
    other.spots = other.spots.filter(
      (s) => occupied.has(s.id) || alongNew(s.x, s.z) >= ROAD_CLEAR_M,
    );
  }
  road.spots = spotsForRoad(roads, road, context);
  return road;
}

/**
 * Bod, kde se konec nové cesty připojí k pevné cestě (do ATTACH_M): u konce pevné cesty do jejího
 * konce, jinak do nejbližšího bodu osy – pevná cesta se tam rozdělí na dva úseky (rozcestí).
 */
function joinPoint(
  roads: VillageRoads,
  from: RoadPoint,
  context: SpotContext,
  reach = ATTACH_M,
): RoadPoint | null {
  const hit = nearestOnRoads(roads.roads, from.x, from.z);
  if (!hit || hit.distance > reach) return null;
  const road = roads.roads[hit.road]!;
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  if (length2(hit.point.x - first.x, hit.point.z - first.z) <= END_SNAP_M) return { ...first };
  if (length2(hit.point.x - last.x, hit.point.z - last.z) <= END_SNAP_M) return { ...last };
  return splitRoad(roads, hit, context);
}

/**
 * Rozdělí pevnou cestu v bodě `hit` na dva úseky (první si nechá id, druhý dostane nové); oba
 * zdědí den vzniku, stupeň a provoz, místa na stromy se rozdělí podle polohy. Vrátí bod rozcestí.
 */
function splitRoad(roads: VillageRoads, hit: RoadHit, context: SpotContext): RoadPoint {
  const road = roads.roads[hit.road]!;
  const at = { x: cm(hit.point.x), z: cm(hit.point.z) };
  const along = lengthsAlong(road.points);
  const a = road.points[hit.segment]!;
  const splitAt = along[hit.segment]! + length2(at.x - a.x, at.z - a.z);
  const total = along[along.length - 1]!;
  const same = (p: RoadPoint): boolean => p.x === at.x && p.z === at.z;
  const head = road.points.slice(0, hit.segment + 1);
  const tail = road.points.slice(hit.segment + 1);
  const first = same(head[head.length - 1]!) ? head : [...head, at];
  const second = same(tail[0]!) ? tail : [at, ...tail];
  const firstAxis = axisDistance([first]);
  const secondAxis = axisDistance([second]);
  const rest: Road = {
    id: roads.nextId++,
    points: second,
    bornDay: road.bornDay,
    grade: road.grade,
    traffic: [...road.traffic],
    spots: road.spots.filter((s) => secondAxis(s.x, s.z) < firstAxis(s.x, s.z)),
    ...(road.ground ? { ground: groundPart(road.ground, splitAt, total) } : {}),
    ...(road.cart ? { cart: true as const } : {}),
    ...(road.swath ? { swath: true as const } : {}),
    ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
  };
  road.spots = road.spots.filter((s) => secondAxis(s.x, s.z) >= firstAxis(s.x, s.z));
  // tiché kusy podle polohy (roads.md – Zarůstá jen nepoužívaný kus)
  if (road.quiet) {
    const tail = road.quiet.filter((q) => secondAxis(q.x, q.z) < firstAxis(q.x, q.z));
    const head = road.quiet.filter((q) => secondAxis(q.x, q.z) >= firstAxis(q.x, q.z));
    if (tail.length > 0) rest.quiet = tail;
    if (head.length > 0) road.quiet = head;
    else delete road.quiet;
  }
  // jabloně podél druhé části patří novému úseku (roads.md – Vysazení jabloní)
  for (const apple of roads.apples ?? []) {
    if (apple.roadId === road.id && secondAxis(apple.x, apple.z) < firstAxis(apple.x, apple.z)) {
      apple.roadId = rest.id;
    }
  }
  if (road.ground) road.ground = groundPart(road.ground, 0, splitAt);
  // rozcestí uprostřed – vnitřní konce nejsou volné
  if (road.openEnds) {
    rest.openEnds = [false, road.openEnds[1]];
    road.openEnds = [road.openEnds[0], false];
  }
  road.points = first;
  // osa se změnila – olemování stromy se určí znovu (roads.md – Stromy u cesty zrychlí chůzi)
  delete road.lined;
  roads.roads.splice(hit.road + 1, 0, rest);
  context.split(road.id, rest.id);
  return at;
}

// --- slučování úseků v uzlu bez odbočky -------------------------------------------------------

/** Klíč konce úseku – rozcestí sdílejí bod (na cm). */
function endKey(p: RoadPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/** Mokřina a brody osy obráceně (od konce) – délka osy `length`. */
function reversedGround(ground: RoadGround, length: number): RoadGround {
  return {
    wet: ground.wet
      .map(([a, b]): [number, number] => [dm(length - b), dm(length - a)])
      .sort((p, q) => p[0] - q[0]),
    fords: ground.fords.map((f) => dm(length - f)).sort((a, b) => a - b),
  };
}

/**
 * Mokřina a brody dvou navazujících os (druhá začíná v `offset` m první): mokřiny, mezi kterými
 * je nejvýš GROUND_GAP_M, se slijí (jako při určení z krajiny), brody blíž než FORD_GAP_M jsou
 * jeden.
 */
function joinedGround(first: RoadGround, second: RoadGround, offset: number): RoadGround {
  const wet: [number, number][] = [];
  for (const [a, b] of [
    ...first.wet,
    ...second.wet.map(([a, b]): [number, number] => [dm(a + offset), dm(b + offset)]),
  ]) {
    const last = wet[wet.length - 1];
    if (last && a - last[1] <= GROUND_GAP_M) last[1] = Math.max(last[1], b);
    else wet.push([a, b]);
  }
  const fords: number[] = [];
  for (const f of [...first.fords, ...second.fords.map((f) => dm(f + offset))]) {
    const last = fords[fords.length - 1];
    if (last === undefined || f - last > FORD_GAP_M) fords.push(f);
  }
  return { wet, fords };
}

/** Provoz posledních let dvou spojených úseků – po letech od nejnovějšího, vážený délkou. */
function joinedTraffic(
  a: Pick<Road, 'traffic'>,
  b: Pick<Road, 'traffic'>,
  lengthA: number,
  lengthB: number,
): number[] {
  const years = Math.max(a.traffic.length, b.traffic.length);
  const out: number[] = [];
  for (let k = years; k >= 1; k--) {
    const ta = a.traffic[a.traffic.length - k];
    const tb = b.traffic[b.traffic.length - k];
    if (ta === undefined) out.push(tb!);
    else if (tb === undefined) out.push(ta);
    else out.push(Math.round(((ta * lengthA + tb * lengthB) / (lengthA + lengthB)) * 100) / 100);
  }
  return out;
}

/** Stavby vylepšení (`road`) na úseku – id staveb. */
function upgradesOf(constructions: readonly Construction[], roadId: number): string {
  return constructions
    .filter((c) => c.kind === 'road' && c.roadIds?.includes(roadId))
    .map((c) => c.id)
    .join(',');
}

/**
 * Úseky, které se potkávají v uzlu, kde žádný další úsek nekončí (falešné rozcestí – zbytek po
 * rozdělení, když odbočka zarostla, nebo nová cesta navázaná na konec jiné), se spojí do jednoho
 * (mutuje – roads.md, Martin: „úsek mezi dvěma rozcestími je v pohodě“): osa za sebou, místa na
 * stromy, jabloně, mokřina a brody, provoz (vážený délkou), den vzniku staršího a jeho id – úsek
 * vznikl dřív. Různý stupeň zůstane rozdělený (skutečná hranice vylepšení), stejně tak úseky, kde
 * se vylepšuje jen jeden z nich (nebo každý jinou stavbou) – po dokončení se spojí, mají-li
 * stejný stupeň. Stavby na úsecích (výsadba jabloní, společné vylepšení) přejdou na spojený
 * úsek. Uzavřený okruh z jednoho úseku zůstane, dva úseky mezi stejnými uzly se do okruhu
 * nespojí. Vrátí, jestli něco spojil.
 */
export function mergeRoadChains(roads: VillageRoads, constructions: Construction[]): boolean {
  let merged = false;
  for (let pair = chainPair(roads, constructions); pair; pair = chainPair(roads, constructions)) {
    joinRoads(roads, constructions, pair[0], pair[1]);
    merged = true;
  }
  return merged;
}

/**
 * Starší ves s falešnými rozcestími (z doby před slučováním úseků) – při načtení se úseky spojí
 * (`mergeRoadChains`). Idempotentní a levné: bez takového uzlu vrátí týž objekt (nic se neukládá).
 * Simulace pak spojuje sama (roční kontrola, dokončené vylepšení), takže po prvním převodu je
 * každý další beze změny a dopočet po kouscích dá totéž co vcelku.
 */
export function withMergedRoads(state: VillageState): VillageState {
  if (!state.roads || !chainPair(state.roads, state.constructions)) return state;
  const next = cloneState(state);
  mergeRoadChains(next.roads!, next.constructions);
  return next;
}

type RoadEnd = { road: Road; atStart: boolean };

/** První uzel (v pořadí úseků), kde se potkávají právě dva úseky, které jde spojit; jinak null. */
function chainPair(
  roads: VillageRoads,
  constructions: readonly Construction[],
): [RoadEnd, RoadEnd] | null {
  const ends = new Map<string, RoadEnd[]>();
  const endOf = (road: Road, atStart: boolean): RoadPoint =>
    atStart ? road.points[0]! : road.points[road.points.length - 1]!;
  const valid = roads.roads.filter((r) => r.points.length >= 2);
  for (const road of valid) {
    for (const atStart of [true, false]) {
      const key = endKey(endOf(road, atStart));
      const list = ends.get(key) ?? [];
      list.push({ road, atStart });
      ends.set(key, list);
    }
  }
  /** Směr osy od konce do úseku (jednotkový). */
  const away = (end: RoadEnd): RoadPoint => {
    const pts = end.road.points;
    const p = end.atStart ? pts[0]! : pts[pts.length - 1]!;
    const q = end.atStart ? pts[1]! : pts[pts.length - 2]!;
    const l = length2(q.x - p.x, q.z - p.z) || 1;
    return { x: (q.x - p.x) / l, z: (q.z - p.z) / l };
  };
  // ze všech uzlů nejrovnější pokračování první (kusy jedné cesty před odbočkou k jiné trase –
  // u okruhu z několika úseků tak zůstane rovná cesta celá), při shodě v pořadí úseků
  let best: { pair: [RoadEnd, RoadEnd]; turn: number } | null = null;
  for (const road of valid) {
    for (const atStart of [true, false]) {
      const list = ends.get(endKey(endOf(road, atStart)))!;
      if (list.length !== 2 || list[0]!.road !== road || list[0]!.atStart !== atStart) continue;
      const [a, b] = list as [RoadEnd, RoadEnd];
      if (a.road === b.road || a.road.grade !== b.road.grade) continue;
      // vozová a pěší cesta zůstanou dva úseky (wagons.md – Vyjeté cesty)
      if (!!a.road.cart !== !!b.road.cart) continue;
      // dva úseky mezi stejnými uzly (dvě trasy) se nespojí do okruhu – copánek řeší
      // `removeBraids`, vzdálené trasy zůstanou dvě
      if (endKey(endOf(a.road, !a.atStart)) === endKey(endOf(b.road, !b.atStart))) continue;
      if (upgradesOf(constructions, a.road.id) !== upgradesOf(constructions, b.road.id)) continue;
      const da = away(a);
      const db = away(b);
      const turn = da.x * db.x + da.z * db.z;
      if (!best || turn < best.turn - 1e-9) best = { pair: [a, b], turn };
    }
  }
  return best?.pair ?? null;
}

/** Spojí dva úseky v jejich společném konci (starší zůstane, mladší zmizí – mutuje). */
function joinRoads(
  roads: VillageRoads,
  constructions: Construction[],
  first: RoadEnd,
  second: RoadEnd,
): void {
  const older = (a: Road, b: Road): boolean =>
    a.bornDay < b.bornDay || (a.bornDay === b.bornDay && a.id < b.id);
  const [keep, gone] = older(first.road, second.road) ? [first, second] : [second, first];
  const road = keep.road;
  const other = gone.road;
  const lengthKeep = roadLengthM(road);
  const lengthOther = roadLengthM(other);
  // druhý úsek natočený tak, aby navazoval; směr ponechaného úseku zůstane
  const otherPoints = gone.atStart === keep.atStart ? [...other.points].reverse() : other.points;
  const otherGround =
    other.ground && gone.atStart === keep.atStart
      ? reversedGround(other.ground, lengthOther)
      : other.ground;
  const points = keep.atStart
    ? [...otherPoints.slice(0, -1), ...road.points]
    : [...road.points, ...otherPoints.slice(1)];
  const ground =
    road.ground && otherGround
      ? keep.atStart
        ? joinedGround(otherGround, road.ground, lengthOther)
        : joinedGround(road.ground, otherGround, lengthKeep)
      : undefined;
  // volné konce spojeného úseku – vnější konce obou (bez údaje u některého bez údaje)
  const otherOpen = other.openEnds
    ? gone.atStart === keep.atStart
      ? ([other.openEnds[1], other.openEnds[0]] as [boolean, boolean])
      : other.openEnds
    : undefined;
  if (road.openEnds && otherOpen) {
    road.openEnds = keep.atStart
      ? [otherOpen[0], road.openEnds[1]]
      : [road.openEnds[0], otherOpen[1]];
  } else {
    delete road.openEnds;
  }
  road.traffic = joinedTraffic(road, other, lengthKeep, lengthOther);
  if (road.cartTraffic || other.cartTraffic) {
    road.cartTraffic = joinedTraffic(
      { traffic: road.cartTraffic ?? [] },
      { traffic: other.cartTraffic ?? [] },
      lengthKeep,
      lengthOther,
    );
  }
  road.points = points.map((p) => ({ x: p.x, z: p.z }));
  road.spots = [...road.spots, ...other.spots];
  // osa se změnila – olemování stromy se určí znovu (roads.md – Stromy u cesty zrychlí chůzi)
  delete road.lined;
  // průsek lesem (roads.md) – spojený úsek ho má, když ho měl kterýkoli
  if (other.swath) road.swath = true;
  if (ground) road.ground = ground;
  else delete road.ground;
  // tiché kusy obou (roads.md – Zarůstá jen nepoužívaný kus) – po bodech, osa se nemění
  const quiet = [...(road.quiet ?? []), ...(other.quiet ?? [])];
  if (quiet.length > 0) road.quiet = quiet;
  else delete road.quiet;
  for (const apple of roads.apples ?? []) if (apple.roadId === other.id) apple.roadId = road.id;
  for (const c of constructions) {
    if (!c.roadIds?.includes(other.id)) continue;
    c.roadIds = [...new Set(c.roadIds.map((id) => (id === other.id ? road.id : id)))];
  }
  roads.roads = roads.roads.filter((r) => r !== other);
}

// --- souběžné cesty -----------------------------------------------------------------------------

/**
 * Souběžná cesta (Martin: „Pokud už cesta vede tím směrem, lidé by měli použít tu, ne si
 * prošlapat vlastní souběžnou.“): bod osy do PARALLEL_M od jiné pevné cesty, jejíž směr se od
 * směru osy liší nejvýš o úhel s kosinem PARALLEL_COS (≈ 37°). Souběžný kus aspoň PARALLEL_MIN_M
 * dlouhý se z mladší / slabší cesty odstraní.
 */
const PARALLEL_M = 12;
const PARALLEL_COS = 0.8;
const PARALLEL_MIN_M = 25;
/** Krok vzorkování osy při hledání souběžných kusů (m). */
const PARALLEL_STEP_M = 2;
/**
 * Copánek: dva úseky mezi stejnými dvěma uzly, které se od sebe nevzdálí víc než tolik (m) –
 * slabší zmizí (lidé chodí po silnější).
 */
const BRAID_M = 25;
/** Trasa delší o víc než tento násobek je u copánku oklika – zmizí ona. */
const BRAID_LONGER = 1.05;
/** Kol úklidu (souběžné kusy → díry → copánky) nejvýš. */
const TIDY_ROUNDS = 3;

/** Vede bod `p` (směr osy od `before` k `after`) souběžně s některou z cest `roads`? */
function alongsideRoad(
  roads: readonly Road[],
  p: RoadPoint,
  before: RoadPoint,
  after: RoadPoint,
): boolean {
  const tx = after.x - before.x;
  const tz = after.z - before.z;
  const tl = length2(tx, tz);
  if (tl < 1e-9) return false;
  for (const road of roads) {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      if (toSegment(p.x, p.z, a, b).distance > PARALLEL_M) continue;
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const sl = length2(sx, sz);
      if (sl < 1e-9) continue;
      if (Math.abs(tx * sx + tz * sz) / (tl * sl) >= PARALLEL_COS) return true;
    }
  }
  return false;
}

/** Síla stupně cesty – vozová cesta (roads.md – Vozová cesta) je nejsilnější. */
const GRADE_RANK: Readonly<Record<RoadGrade, number>> = {
  trodden: 0,
  improved: 1,
  causeway: 2,
  wagon: 3,
};

/** Pořadí síly cest: vyšší stupeň, starší, víc provozu loni, menší id – silnější dřív. */
function strongerRoad(a: Road, b: Road): number {
  const grade = (r: Road): number => GRADE_RANK[r.grade];
  return (
    grade(b) - grade(a) ||
    // vozová cesta před pěší (wagons.md – Vyjeté cesty)
    (b.cart ? 1 : 0) - (a.cart ? 1 : 0) ||
    a.bornDay - b.bornDay ||
    (b.traffic[b.traffic.length - 1] ?? 0) - (a.traffic[a.traffic.length - 1] ?? 0) ||
    a.id - b.id
  );
}

/** Nejdelší souběžný kus osy `road` se silnějšími cestami `stronger` (od–do v m); jinak null. */
function parallelRun(
  road: Road,
  stronger: readonly Road[],
): { from: number; to: number; partner: Road } | null {
  if (stronger.length === 0) return null;
  const samples = resample(road.points, null, PARALLEL_STEP_M).points;
  const at = lengthsAlong(samples);
  let best: { from: number; to: number; partner: Road } | null = null;
  let start = -1;
  let partner: Road | null = null;
  const close = (end: number): void => {
    if (start < 0 || !partner) return;
    const from = at[start]!;
    const to = at[end]!;
    if (to - from >= PARALLEL_MIN_M && (!best || to - from > best.to - best.from)) {
      best = { from, to, partner };
    }
  };
  samples.forEach((p, k) => {
    const before = samples[Math.max(0, k - 1)]!;
    const after = samples[Math.min(samples.length - 1, k + 1)]!;
    const along = stronger.filter((r) => alongsideRoad([r], p, before, after));
    if (along.length > 0) {
      if (start < 0) {
        start = k;
        partner = along[0]!;
      }
      return;
    }
    close(k - 1);
    start = -1;
    partner = null;
  });
  close(samples.length - 1);
  return best;
}

/** Kus osy od `from` do `to` m (body zlomu mezi tím, konce na cm). */
function axisSlice(points: readonly RoadPoint[], from: number, to: number): RoadPoint[] {
  const at = lengthsAlong(points);
  const pointAt = (d: number): RoadPoint => {
    let k = 1;
    while (k < points.length - 1 && at[k]! < d) k++;
    const a = points[k - 1]!;
    const b = points[k]!;
    const span = at[k]! - at[k - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (d - at[k - 1]!) / span)) : 0;
    return { x: cm(a.x + (b.x - a.x) * u), z: cm(a.z + (b.z - a.z) * u) };
  };
  const out = [pointAt(from)];
  points.forEach((p, k) => {
    if (at[k]! > from + 1e-6 && at[k]! < to - 1e-6) out.push({ x: p.x, z: p.z });
  });
  out.push(pointAt(to));
  return out.filter((p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z);
}

/**
 * Souběžné pevné cesty se sloučí (mutuje): z mladší / slabší cesty se vyřízne kus, který vede
 * souběžně se silnější (`parallelRun`) – zbytky kratší než MIN_ROAD_M zmizí, delší zůstanou jako
 * úseky (první s id cesty, další s novým) a jejich konce u silnější cesty pak napojí
 * `joinRoadGaps`. Místa na stromy ve vyříznutém kusu: se stromem do ROAD_TREES.offsetM.to + 1 m
 * od silnější cesty přejdou k ní, ostatní stromy stojí dál bez cesty (jako u zarostlé). Jabloně
 * vyříznutého kusu patří silnější cestě. Cesty ve stavbě (vylepšení, výsadba) se nemění. Vrátí,
 * jestli něco sloučil.
 */
function mergeParallelRoads(roads: VillageRoads, constructions: readonly Construction[]): boolean {
  const building = roadsInWork(constructions);
  let merged = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const order = [...roads.roads].sort(strongerRoad);
    let cut: { road: Road; from: number; to: number; partner: Road } | null = null;
    // od nejslabší – se silnějšími než ona
    for (let i = order.length - 1; i > 0 && !cut; i--) {
      const road = order[i]!;
      // vozová cesta (roads.md – Vozová cesta) má vlastní zemní práce – nevyřízne se
      if (building.has(road.id) || road.points.length < 2 || road.grade === 'wagon') continue;
      const run = parallelRun(road, order.slice(0, i));
      if (run) cut = { road, ...run };
    }
    if (!cut) break;
    cutRoad(roads, cut.road, cut.from, cut.to, cut.partner);
    merged = true;
  }
  return merged;
}

/** Vyřízne z úseku `road` kus od `from` do `to` m (souběžný s `partner`) – mutuje. */
function cutRoad(roads: VillageRoads, road: Road, from: number, to: number, partner: Road): void {
  const length = roadLengthM(road);
  const pieces = [
    { a: 0, b: from },
    { a: to, b: length },
  ].filter(({ a, b }) => b - a >= MIN_ROAD_M);
  const made: Road[] = pieces.map(({ a, b }, k) => {
    const points = axisSlice(road.points, a, b);
    return {
      id: k === 0 ? road.id : roads.nextId++,
      points,
      bornDay: road.bornDay,
      grade: road.grade,
      traffic: [...road.traffic],
      spots: [],
      ...(road.ground ? { ground: groundPart(road.ground, a, b) } : {}),
      ...(road.cart ? { cart: true as const } : {}),
      ...(road.swath ? { swath: true as const } : {}),
      ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
    };
  });
  // místa na stromy a jabloně k nejbližšímu kusu, ve vyříznutém kusu k silnější cestě
  const partnerAxis = axisDistance([partner.points]);
  const axes = made.map((r) => axisDistance([r.points]));
  const occupied = new Set(roads.trees.map((t) => t.spot));
  const nearPiece = (x: number, z: number): Road | null => {
    let best: Road | null = null;
    let bestD = ROAD_TREES.offsetM.to + 1;
    made.forEach((r, k) => {
      const d = axes[k]!(x, z);
      if (d <= bestD) {
        best = r;
        bestD = d;
      }
    });
    return best;
  };
  for (const spot of road.spots) {
    const piece = nearPiece(spot.x, spot.z);
    if (piece) piece.spots.push(spot);
    else if (occupied.has(spot.id) && partnerAxis(spot.x, spot.z) <= ROAD_TREES.offsetM.to + 1) {
      partner.spots.push(spot);
    }
  }
  for (const apple of roads.apples ?? []) {
    if (apple.roadId !== road.id) continue;
    apple.roadId = (nearPiece(apple.x, apple.z) ?? partner).id;
  }
  // tiché kusy k nejbližšímu zbytku (roads.md – Zarůstá jen nepoužívaný kus)
  for (const q of road.quiet ?? []) {
    const piece = nearPiece(q.x, q.z);
    if (piece) (piece.quiet ??= []).push(q);
  }
  const index = roads.roads.indexOf(road);
  roads.roads.splice(index, 1, ...made);
}

/**
 * Která ze dvou tras mezi stejnými uzly zůstane: vyšší stupeň, pak kratší (delší o víc než
 * BRAID_LONGER je oklika), pak silnější (`strongerRoad`) – ta dřív.
 */
function braidOrder(a: Road, b: Road): number {
  const grade = (r: Road): number => GRADE_RANK[r.grade];
  const la = roadLengthM(a);
  const lb = roadLengthM(b);
  const shorter = la > lb * BRAID_LONGER ? 1 : lb > la * BRAID_LONGER ? -1 : 0;
  return grade(b) - grade(a) || shorter || strongerRoad(a, b);
}

/**
 * Copánky se rozpletou (mutuje): dva úseky mezi stejnými dvěma uzly (oba konce společné), slabší
 * (`braidOrder` – nižší stupeň, oklika) se od silnějšího nikde nevzdálí víc než BRAID_M – slabší
 * zmizí jako vyříznutý souběžný kus (`cutRoad` – stromy u něj stojí dál, jabloně patří
 * silnějšímu). Cesty ve stavbě zůstanou. Vrátí, jestli něco odstranil.
 */
function removeBraids(roads: VillageRoads, constructions: readonly Construction[]): boolean {
  const building = roadsInWork(constructions);
  const endsOf = (r: Road): string =>
    [endKey(r.points[0]!), endKey(r.points[r.points.length - 1]!)].sort().join('|');
  let removed = false;
  for (let guard = roads.roads.length; guard > 0; guard--) {
    const order = [...roads.roads].filter((r) => r.points.length >= 2).sort(braidOrder);
    let braid: { weak: Road; strong: Road } | null = null;
    for (let i = order.length - 1; i > 0 && !braid; i--) {
      const weak = order[i]!;
      if (building.has(weak.id) || weak.grade === 'wagon') continue;
      const key = endsOf(weak);
      const [a, b] = key.split('|');
      if (a === b) continue;
      for (const strong of order.slice(0, i)) {
        if (endsOf(strong) !== key) continue;
        const axis = strong.points;
        const far = resample(weak.points, null, PARALLEL_STEP_M).points.some((p) => {
          let best = Infinity;
          for (let k = 1; k < axis.length; k++) {
            best = Math.min(best, toSegment(p.x, p.z, axis[k - 1]!, axis[k]!).distance);
          }
          return best > BRAID_M;
        });
        if (!far) {
          braid = { weak, strong };
          break;
        }
      }
    }
    if (!braid) break;
    cutRoad(roads, braid.weak, 0, roadLengthM(braid.weak), braid.strong);
    removed = true;
  }
  return removed;
}

/**
 * Úklid pevných cest po roční kontrole (i převodu starší vsi – mutuje): souběžné cesty se sloučí,
 * díry se zacelí, falešná rozcestí spojí a určí se skutečné volné konce (roads.md – Úseky
 * a rozcestí).
 */
function tidyRoads(
  roads: VillageRoads,
  constructions: Construction[],
  termini: readonly RoadPoint[],
  context: SpotContext,
): void {
  // konce po zarostlém kusu jsou skutečné volné konce – díra se k nim nedoplní (roads.md)
  const ends = [...termini, ...(roads.cutEnds ?? [])];
  // po sloučení souběžných kusů a zacelení děr můžou vzniknout copánky – znovu, nejvýš pár kol
  for (let round = 0; round < TIDY_ROUNDS; round++) {
    const parallel = mergeParallelRoads(roads, constructions);
    joinRoadGaps(roads, ends, context);
    // copánky před spojováním – kusy silnější cesty se po odstranění slabší trasy spojí zpět
    const braids = removeBraids(roads, constructions);
    mergeRoadChains(roads, constructions);
    const more = removeBraids(roads, constructions);
    if (more) mergeRoadChains(roads, constructions);
    if (!parallel && !braids && !more) break;
  }
  markRoadEnds(roads, ends);
  // konce po zarostlém kusu, kde už žádný úsek nekončí, zmizí
  if (roads.cutEnds) {
    const degrees = endDegrees(roads.roads);
    const kept = roads.cutEnds.filter((p) => degrees.has(endKey(p)));
    if (kept.length > 0) roads.cutEnds = kept;
    else delete roads.cutEnds;
  }
  roads.endsChecked = true;
  roads.parallelsChecked = true;
}

// --- díry mezi úseky ----------------------------------------------------------------------------

/**
 * Volný konec úseku se k jinému úseku napojí, když je od jeho osy nebo konce nejvýš tak daleko
 * (m) – díry po přimknutí trasy kus vedle nebo po úseku, kde provoz na chvíli klesl pod práh
 * (Vlkov: 5,3 m mezi úseky v polích, 11,6 m u brány domu).
 */
const JOIN_GAP_M = 12;
/**
 * Konec úseku je skutečný volný konec (brána domu, cíl – pole, voda, les –, slepý konec), když
 * do tolika metrů (m) končí čára roční sítě – trasa tam nepokračuje. Jinde pokračuje (díra).
 */
const TERMINUS_M = 6;

/** Volné konce čar roční sítě (brány domů, cíle a slepé konce) – kde trasy končí. */
function networkTermini(lines: readonly PathLine[]): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (const line of lines) {
    if (line.points.length < 2) continue;
    if (line.openStart) out.push(line.points[0]!);
    if (line.openEnd) out.push(line.points[line.points.length - 1]!);
  }
  return out;
}

function isTerminus(p: RoadPoint, termini: readonly RoadPoint[]): boolean {
  return termini.some((t) => length2(t.x - p.x, t.z - p.z) <= TERMINUS_M);
}

/** Kolik konců úseků je v bodě (klíč na cm). */
function endDegrees(roads: readonly Road[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const road of roads) {
    if (road.points.length < 2) continue;
    for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
      const key = endKey(p);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return count;
}

/**
 * První díra (v pořadí úseků): volný konec úseku (žádný jiný úsek v něm nekončí), který není
 * skutečným koncem trasy (`termini`), a nejbližší bod jiného úseku do JOIN_GAP_M; jinak null.
 */
function firstGap(
  roads: VillageRoads,
  termini: readonly RoadPoint[],
): { road: Road; atStart: boolean; hit: RoadHit } | null {
  const degrees = endDegrees(roads.roads);
  for (const road of roads.roads) {
    // vozová cesta končí, kde ji stavba vede (rozestavěná uprostřed trasy) – osa se neprodlouží
    if (road.points.length < 2 || road.grade === 'wagon') continue;
    for (const atStart of [true, false]) {
      const p = atStart ? road.points[0]! : road.points[road.points.length - 1]!;
      if ((degrees.get(endKey(p)) ?? 0) !== 1 || isTerminus(p, termini)) continue;
      const others = roads.roads.map((r) => (r === road ? { ...r, points: [] } : r));
      const hit = nearestOnRoads(others, p.x, p.z);
      if (hit && hit.distance <= JOIN_GAP_M) return { road, atStart, hit };
    }
  }
  return null;
}

/**
 * Díry mezi úseky se zacelí (mutuje – roads.md, Úseky a rozcestí): volný konec úseku, který není
 * u brány domu ani u cíle (trasa roční sítě tudy pokračuje – `termini`) a leží do JOIN_GAP_M od
 * jiného úseku, se k němu napojí spojovacím kusem osy – do jeho konce (blíž než END_SNAP_M), jinak
 * do nejbližšího bodu osy, kde se ten úsek rozdělí (rozcestí). Uzel je pak společný – falešné
 * rozcestí spojí `mergeRoadChains`. Mokřina a brody napojeného úseku se určí znovu z terénu.
 * Vrátí, jestli něco napojil.
 */
function joinRoadGaps(
  roads: VillageRoads,
  termini: readonly RoadPoint[],
  context: SpotContext,
): boolean {
  let joined = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const gap = firstGap(roads, termini);
    if (!gap) break;
    const other = roads.roads[gap.hit.road]!;
    const first = other.points[0]!;
    const last = other.points[other.points.length - 1]!;
    const near = (q: RoadPoint): boolean =>
      length2(gap.hit.point.x - q.x, gap.hit.point.z - q.z) <= END_SNAP_M;
    const at = near(first)
      ? { ...first }
      : near(last)
        ? { ...last }
        : splitRoad(roads, gap.hit, context);
    const { road } = gap;
    road.points = gap.atStart ? [at, ...road.points] : [...road.points, at];
    road.ground = roadGroundOf(road.points, context.terrain);
    delete road.lined;
    joined = true;
  }
  return joined;
}

/**
 * Které konce úseků jsou skutečné volné konce (`Road.openEnds` – pás cesty se tam ve scéně
 * vytrácí): konec, ve kterém nekončí jiný úsek, u brány domu nebo cíle (`termini`). Konec, kde
 * trasa pokračuje pěšinou dne, a rozcestí volné nejsou (mutuje).
 */
function markRoadEnds(roads: VillageRoads, termini: readonly RoadPoint[]): void {
  const degrees = endDegrees(roads.roads);
  const open = (p: RoadPoint): boolean =>
    (degrees.get(endKey(p)) ?? 0) === 1 && isTerminus(p, termini);
  for (const road of roads.roads) {
    if (road.points.length < 2) continue;
    road.openEnds = [open(road.points[0]!), open(road.points[road.points.length - 1]!)];
  }
}

/**
 * Zacelí díry a spojí falešná rozcestí na samotných úsecích (vývojová ukázka a testy – bez stavu
 * vsi): `termini` – skutečné konce tras (brány, cíle), `terrain` – terén pro mokřinu a brody
 * napojených úseků. Vrátí nové úseky s volnými konci (`openEnds`), vstup nemění.
 */
export function joinedRoadsOf(
  list: readonly Road[],
  termini: readonly RoadPoint[],
  terrain: PathTerrain,
): Road[] {
  const roads: VillageRoads = {
    nextId: list.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    roads: cloneState([...list]),
    trees: [],
    candidates: [],
    labor: { from: 0, days: 0, shares: [] },
  };
  tidyRoads(roads, [], termini, {
    terrain,
    blocked: () => false,
    layer: null,
    changes: { removed: [], stumps: [], saplings: [] },
    seed: 0,
    split: () => undefined,
  });
  return roads.roads;
}

/**
 * Starší ves z doby před zacelováním děr a slučováním souběžných cest (bez
 * `VillageRoads.endsChecked` / `parallelsChecked`) – při načtení se souběžné úseky sloučí, díry
 * zacelí a určí se volné konce jako v roční kontrole (roční síť z práce od poslední kontroly).
 * Jednou: pak to dělá roční kontrola sama a stav nese příznak – bez cest i s příznakem vrátí týž
 * objekt (nic se neukládá).
 */
export function withJoinedRoads(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const checked = state.roads?.endsChecked && state.roads.parallelsChecked;
  if (!state.roads || checked || state.roads.roads.length === 0) return state;
  const next = cloneState(state);
  const roads = next.roads!;
  const day = next.lastDay;
  const changes = obstacleChangesAt(next, day);
  const annual = annualPathNetwork(next, day, landscape, obstacles, changes);
  if (annual) {
    tidyRoads(roads, next.constructions, networkTermini(annual.network.lines), {
      terrain: annual.terrain,
      blocked: plantingBlocker(next, landscape),
      layer: obstacles,
      changes,
      seed: next.seed,
      split: (from, to) => splitRoadWork(next.constructions, from, to),
    });
  }
  roads.endsChecked = true;
  roads.parallelsChecked = true;
  return next;
}

// --- místa na stromy a uchycení ---------------------------------------------------------------

/** Co potřebuje výběr míst na stromy u nové cesty. */
interface SpotContext {
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
function spotsForRoad(roads: VillageRoads, road: Road, context: SpotContext): RoadTreeSpot[] {
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
 * obydlí, stavenišť a zbytků jam, modly a svatyně, milíře a posvátných dubů. Mimo krajinu taky
 * ne. Na poli ano (fields.md – Pole jako krajina; Martin 18. 10. 2026): strom u cesty i jabloň
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
  const milirs = [
    ...state.dwellings.flatMap((d) => (d.workshop?.craft === 'burner' ? [d.position] : [])),
    ...state.constructions.flatMap((c) =>
      c.craft === 'burner' && c.position !== null ? [c.position] : [],
    ),
  ].map((p) => milirCenter(p));
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
    const milirReach = MILIR.clearingRadiusM + MILIR_MARGIN_M;
    if (milirs.some(([mx, mz]) => length2(mx - x, mz - z) < milirReach)) return true;
    return oaks.some((o) => length2(o.x - x, o.z - z) < SACRED_OAK_M);
  };
}

/** Druh stromu z losu 0–1: polovina dubů, zbytek jilmy a topoly. */
function speciesOf(r: number): RoadTreeSpecies {
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
function rootTrees(
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
