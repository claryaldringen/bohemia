// Pevné cesty (docs/design/roads.md – Dvě vrstvy cest, Stromy u pevných cest). Simulace vsi
// sčítá práci dne po místech a jednou za rok (1. 11.) spočítá stejnou funkcí jako pěšiny dne
// kontrolu cest (provoz tras, zarůstání, převzetí vozy; síť pěšin se nepočítá). Cesta vzniká
// měsíčně z vyšlapanosti (`roadsMonth` – paths.md, Vyšlapanost a vznik cesty): uloží se její osa
// a od té doby se nehýbe – nové trasy se k ní přimknou (sleva v síti). Nepoužívaná vyšlapaná cesta
// zaroste. U cesty se při vzniku určí místa na stromy; na volném místě se strom uchytí náhodou ze
// seedu vsi a roku, roste z keře a stojí, dokud neodumře. Vše je deterministické (jen přesná
// aritmetika – soubor hlídá ESLint jako síť pěšin).

import { dateOfDayIndex } from '../../calendar';
import { type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt, type ObstacleChanges } from '../obstacles';
import { roadAppleStage, roadTreeLook } from '../road-trees';
import { CART_ROADS, FENCE_CLEARANCE, ROAD_LAND, ROADS, WEAR } from '../rules';
import {
  type ChronicleEvent,
  type Construction,
  type LaborDay,
  type LaborTarget,
  type Road,
  type RoadPoint,
  type TileCell,
  type Trail,
  type VillageRoads,
  type VillageRoutes,
  type Cemetery,
  type VillageState,
} from '../types';
import {
  CANDIDATE_STEP_M,
  ON_ROAD_M,
  SAMPLE_M,
  axisDistance,
  dm,
  resample,
  roadGroundOf,
} from './roads-geometry';
import {
  annualTerrain,
  emptyRoads,
  fieldTraffic,
  formWearRuns,
  mergeRoadChains,
  roadTraffic,
  splitRoadWork,
  splitTrailPieces,
  wearRoadDue,
} from './roads-form';
import { annualCartNetwork, markCartRoads, takeOverCartRoads } from './roads-carts';
import { abandonBlockedStretches, cutDeadRoads } from './roads-overgrow';
import { accessDue, accessRoads, gateGuardOf, type GateGuard } from './roads-access';
import { fixedRoadIds, nearEntrance } from './road-condition';
import { updateJunctions } from './junctions';
import {
  type RingBuilding,
  anchorTermini,
  markRoadEnds,
  ringBuildingPoints,
  tidyDue,
  tidyRoads,
} from './roads-tidy';
import { SpotContext, plantingBlocker, rootTrees } from './roads-trees';
import { type RoadAnchors, roadAnchors } from './road-anchors';
import { routeLine } from './routes';
import { pathCellM, trailTerrain } from './terrain';
import { type FenceOutline } from './entrances';
import { fenceClearance, villageFences } from './fences';
import { inBuilding } from './network-grid';
import { villageBuildings } from './network-search';
import { fenceLayoutKey, pathVillageOf, settleVillageWear, villageBlockedAt } from './village';
import { type TrafficField, addCartWear, addWearLabor, trafficField, wearMap } from './wear';
import { villageCemeteries } from '../cemetery';
import { visitKey } from '../abandonment';

function isRoadYearDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === ROADS.yearDay.month && date.day === ROADS.yearDay.day;
}

/**
 * Krok dne pro pevné cesty (mutuje stav – volá simulace na konci dne): 1. 11. roční kontrola
 * (`updateRoads`) a nový rok cest, pak práce dne do ročního součtu. Bez krajiny (kalibrace, testy)
 * nic – pevné cesty se počítají jen s krajinou sídla. Vsi bez pevných cest (starší) začnou sčítat.
 * Vrátí provoz ke stavbám z tras za uplynulý rok (cesty za den – opuštěné stavby, abandonment.md)
 * v den roční kontroly; starší ves bez roku dat a jiné dny (a bez krajiny) null.
 */
export function roadsDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ReadonlyMap<string, number> | null {
  if (!landscape) return null;
  const roads = (state.roads ??= emptyRoads(day));
  // vyšlapanost (paths.md – Vyšlapanost a vznik cesty) – nová ves od dneška od nuly, starší ves
  // ji dostane při načtení (`withWearSeed`)
  const wear = (roads.wear ??= { day, cells: '', labor: [], cellM: WEAR.cellM });
  let visits: ReadonlyMap<string, number> | null = null;
  if (isRoadYearDay(day) && roads.labor.from < day) {
    const changes = obstacleChangesAt(state, day);
    // provoz ke stavbám z tras (chátrání staveb) – napřed, roční kontrola nuluje půlku součtů
    visits = yearVisits(state, roads, day);
    state.chronicle.push(...updateRoads(state, day, landscape, obstacles, { changes }));
    roads.labor = { from: day, days: 0, shares: [] };
  }
  addRoadLabor(roads, state.labor, day);
  addWearLabor(wear, state.labor, day);
  return visits;
}

/** Rok dat, bez kterého se o chátrání staveb nerozhoduje (návrh Clauda – Úloha 6). */
const VISITS_YEAR_DAYS = 360;

/**
 * Pohřbívalo se do hřbitova za poslední rok? Pohřeb jde jen na jeden hřbitov (`bury`), takže
 * návštěvu za pohřby dostane jen ten, kde je mohyla s dnem pohřbu v posledním roce (návrh Clauda).
 */
export function buriedWithinYear(cemetery: Cemetery, day: number): boolean {
  return (cemetery.mounds ?? []).some((m) => day - m.day <= 365);
}

/**
 * Provoz ke stavbám za rok z `roads.visits` (cesty za den po klíči stavby); nuluje součty. Ves
 * s méně než rokem dat (starší ves po převodu) vrátí null a součty sčítá dál – stavby nezačnou
 * chátrat naslepo. Hřbitov, kam se za poslední rok pohřbívalo, se navštívil (pohřeb je cesta ke hřbitovu).
 */
function yearVisits(
  state: VillageState,
  roads: VillageRoads,
  day: number,
): ReadonlyMap<string, number> | null {
  const visits = (roads.visits ??= { from: roads.labor.from, byKey: [] });
  if (visits.from > roads.labor.from && day - visits.from < VISITS_YEAR_DAYS) return null;
  const days = Math.max(1, day - visits.from);
  const map = new Map<string, number>();
  for (const [key, sum] of visits.byKey) map.set(key, sum / days / 100);
  for (const c of villageCemeteries(state)) {
    if (!buriedWithinYear(c, day)) continue;
    const key = visitKey('cemetery', c.id);
    map.set(key, Math.max(map.get(key) ?? 0, 0.01));
  }
  roads.visits = { from: day, byKey: [] };
  return map;
}

/** Čáry tras (nejsilnější napřed) a kotvy pro měsíční vznik cest. */
interface MonthRoutes {
  lines: RoadPoint[][];
  anchors: RoadAnchors;
}

/** Čáry a kotvy posledních sad tras podle `routes.key` – mezi přepočty tras se nemění. */
const MONTH_ROUTES = new Map<string, { check: string; value: MonthRoutes }>();
const MONTH_ROUTES_KEPT = 8;

/** Čáry tras a kotvy (`roadAnchors`) – jednou pro sadu tras (`routes.key`, jako `trafficField`). */
function monthRoutes(
  routes: VillageRoutes,
  landscape: Landscape,
  cellM: number,
  fences: FenceSource,
): MonthRoutes {
  const key = `${routes.key}|${cellM}|${landscape.size}`;
  let trips = 0;
  let steps = 0;
  for (const r of routes.list) {
    trips += r.trips;
    steps += r.steps.length;
  }
  // ploty se mění s rozložením, tedy s `routes.key` – klíč plotů jistí, že čáry nezávisí na tom,
  // kdy se spočítají (stavba dokončená před přepočtem tras)
  const check = `${routes.list.length}/${trips}/${steps}/${fences.key()}`;
  const cached = MONTH_ROUTES.get(key);
  if (cached && cached.check === check) return cached.value;
  // nejsilnější trasy napřed (stálé pořadí – stejné trasy, stejné cesty); osa drží odstup od
  // plotů (paths.md – Odstup od plotu) – ploty jsou v rozložení, tedy v `routes.key`
  const fenced = fences.outlines();
  const lines = routes.list
    .map((route, k) => ({ route, k }))
    .sort((a, b) => b.route.trips - a.route.trips || a.k - b.k)
    .map(({ route }) => routeLine(route, cellM, fenced));
  const value = { lines, anchors: roadAnchors(routes.list, landscape) };
  MONTH_ROUTES.delete(key);
  MONTH_ROUTES.set(key, { check, value });
  if (MONTH_ROUTES.size > MONTH_ROUTES_KEPT) MONTH_ROUTES.delete(MONTH_ROUTES.keys().next().value!);
  return value;
}

/** Ploty vsi pro osy tras: klíč rozložení plotů a jejich obrysy – obojí líně. */
interface FenceSource {
  key: () => string;
  outlines: () => readonly FenceOutline[];
}

/**
 * Ploty vsi (hřbitovy, ohrady, pozemky – `villageFences`) pro osy tras – líně a jednou. Nezávisí
 * na dni (jen na rozložení), takže je jedno, kdo čáry tras spočte první.
 */
function fencesOf(state: VillageState, landscape: Landscape, day: number): FenceSource {
  let key: string | null = null;
  let out: readonly FenceOutline[] | null = null;
  return {
    key: () => (key ??= fenceLayoutKey(state)),
    outlines: () =>
      (out ??= villageFences(pathVillageOf(state, day, landscape), true).map((f) => f.outline)),
  };
}

/** Konce, kde smí cesta končit (kotvy z tras) – bez tras žádné. */
function annualTermini(
  state: VillageState,
  landscape: Landscape,
  day: number,
): (p: RoadPoint) => boolean {
  const routes = state.routes;
  if (!routes || routes.list.length === 0) return () => false;
  return anchorTermini(
    monthRoutes(routes, landscape, pathCellM(landscape), fencesOf(state, landscape, day)).anchors,
  );
}

/**
 * Měsíční kontrola pevných cest 1. dne v měsíci (paths.md – Vyšlapanost a vznik cesty; mutuje
 * stav – volá simulace na začátku dne): vyšlapanost do dneška (`settleVillageWear`), z vyšlapaných
 * čar tras nové cesty od kotvy ke kotvě a po vzniku úklid sítě (`formRoadsKept`), kronika
 * `road-formed`; pak měsíční úklid – pahýly a cesty k vchodům (`tidyMonth`), jen když se změnily
 * trasy nebo cesty, a křižovatky (`updateJunctions`). Jiné dny nic; bez změny jen sečte vyšlapanost (kontext míst na stromy se
 * nestaví).
 */
export function roadsMonth(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  const steps = roadsMonthSteps(state, day, landscape, obstacles);
  for (;;) {
    if (steps.next().done) return;
  }
}

/**
 * `roadsMonth` po krocích: zastaví se mezi sčítáním vyšlapanosti, zánikem cest, vznikem cest
 * a úklidem, aby volající mohl dát přestávku (server – dlouhý dopočet neblokuje ostatní
 * požadavky). Výsledek je týž.
 */
export function* roadsMonthSteps(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): Generator<void, void, void> {
  if (dateOfDayIndex(day).day !== 1) return;
  const clock = ROADS_MONTH_TIMING.clock;
  if (!clock) {
    yield* roadsMonthRunSteps(state, day, landscape, obstacles);
    return;
  }
  const t0 = clock();
  yield* roadsMonthRunSteps(state, day, landscape, obstacles);
  ROADS_MONTH_TIMING.ms += clock() - t0;
  ROADS_MONTH_TIMING.runs++;
}

/**
 * Měření (`road-report.ts`): hodiny volajícího a součet času měsíčních kontrol (`roadsMonth`).
 * Ve hře hodiny chybí a nic se neměří – výsledek na nich nezávisí.
 */
export const ROADS_MONTH_TIMING: { clock: (() => number) | null; ms: number; runs: number } = {
  clock: null,
  ms: 0,
  runs: 0,
};

function roadsMonthRun(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  /** Jen přestavba sítě (`rebuildRoadsPass`). */
  rebuild?: RebuildHints,
): void {
  const steps = roadsMonthRunSteps(state, day, landscape, obstacles, rebuild);
  for (;;) {
    if (steps.next().done) return;
  }
}

function* roadsMonthRunSteps(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  /** Jen přestavba sítě (`rebuildRoadsPass`). */
  rebuild?: RebuildHints,
): Generator<void, void, void> {
  settleVillageWear(state, day, landscape);
  yield;
  const roads = state.roads;
  // zánik: kusy na nule pryč, kus pod hotovou stavbou opuštěný – napřed, aby souběžnost se starou
  // cestou zmizela dřív, než z vyšlapané objížďky vznikne cesta (paths.md – Stavba přes cestu)
  if (roads && roads.roads.length > 0) {
    const gone = cutDeadRoads(roads, state.constructions, state.trails, day);
    state.chronicle.push(...gone);
    // odbočka zarostla – falešné rozcestí se spojí
    if (gone.length > 0) mergeRoadChains(roads, state.constructions, state.trails);
    if (roads.roads.some((r) => !r.abandoned)) {
      const blocked = villageBlockedAt(state, day, landscape);
      if (blocked) abandonBlockedStretches(roads, state.constructions, state.trails, blocked);
    }
  }
  yield;
  const routes = state.routes;
  if (!state.roads || !routes || routes.list.length === 0) return;
  const cellM = pathCellM(landscape);
  const { lines, anchors } = monthRoutes(routes, landscape, cellM, fencesOf(state, landscape, day));
  yield;
  const buildings = ringBuildingsOf(state, day, landscape);
  const entrances = entrancesOf(state, landscape, day);
  // kontext míst na stromy a provozní pole jen, když se cesty opravdu mění
  let base: Omit<SpotContext, 'split'> | null = null;
  const baseOf = (): Omit<SpotContext, 'split'> =>
    (base ??= {
      terrain: trailTerrain(landscape, obstacles),
      blocked: plantingBlocker(state, landscape),
      layer: obstacles,
      changes: obstacleChangesAt(state, day),
      seed: state.seed,
      buildings,
      entrances,
    });
  let field: TrafficField | null = null;
  const fieldOf = (): TrafficField => (field ??= trafficField(routes, cellM));
  const worn = state.roads.wear;
  if (worn) {
    const wear = wearMap(worn);
    // kusy, jejichž cestu úklid smazal, ves nezkouší, dokud jsou vyšlapané (paths.md – Vyšlapanost
    // a vznik cesty, Smazané kusy); kus, který už vyšlapaný není, zapomene
    const lost = new Set(state.roads.lostRuns ?? []);
    const remembered = new Set<string>();
    const due = wearRoadDue(
      state.roads,
      lines,
      wear,
      anchors,
      lost,
      lost.size > 0 ? remembered : undefined,
    );
    if (due) {
      const formed = yield* formRoadsKept(
        state,
        state.roads,
        { lines, anchors, wear, day, base: baseOf(), lost, remembered },
        fieldOf,
      );
      // úklid může novou cestu spojit se starší – do kroniky jen cesty, jejichž id zůstalo
      const kept = new Set(state.roads.roads.map((r) => r.id));
      for (const road of formed) {
        if (kept.has(road.id)) state.chronicle.push({ day, kind: 'road-formed', roadId: road.id });
      }
    }
    rememberLostRuns(state.roads, remembered);
  } else {
    delete state.roads.lostRuns;
  }
  yield;
  const walk = (): ((x: number, z: number) => boolean) | null =>
    villageBlockedAt(state, day, landscape);
  tidyMonth(
    state,
    routes,
    {
      lines,
      anchors,
      day,
      cellM,
      walk,
      buildings,
      entrances,
      fences: fencesOf(state, landscape, day).outlines,
      footprint: footprintOf(state, landscape, day),
      ...(rebuild ? { rebuild } : {}),
    },
    baseOf,
    fieldOf,
  );
}

/**
 * Jednorázový úklid sítě při převodu starší vsi (`withRoadsV2`, mutuje): souběžné cesty, copánky,
 * díry, spojení, pahýly, cesty k vchodům a křižovatky jako měsíční úklid, jen hned a bez ohledu na
 * `tidyKey`. Bez tras (nebo bez kotev) se uklidí jen sama síť – souběžné cesty, díry a spojení.
 */
export function tidyRoadsNow(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  const roads = state.roads;
  if (!roads || roads.roads.length === 0) return;
  const day = state.lastDay;
  const buildings = ringBuildingsOf(state, day, landscape);
  const entrances = entrancesOf(state, landscape, day);
  const baseOf = (): Omit<SpotContext, 'split'> => ({
    terrain: trailTerrain(landscape, obstacles),
    blocked: plantingBlocker(state, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    seed: state.seed,
    buildings,
    entrances,
  });
  const routes = state.routes;
  delete roads.tidyKey;
  if (routes && routes.list.length > 0) {
    const cellM = pathCellM(landscape);
    const { lines, anchors } = monthRoutes(
      routes,
      landscape,
      cellM,
      fencesOf(state, landscape, day),
    );
    const fieldOf = (): TrafficField => trafficField(routes, cellM);
    const walk = (): ((x: number, z: number) => boolean) | null =>
      villageBlockedAt(state, day, landscape);
    tidyMonth(
      state,
      routes,
      {
        lines,
        anchors,
        day,
        cellM,
        walk,
        buildings,
        entrances,
        fences: fencesOf(state, landscape, day).outlines,
        footprint: footprintOf(state, landscape, day),
      },
      baseOf,
      fieldOf,
    );
    return;
  }
  const context: SpotContext = {
    ...baseOf(),
    split: (from, to) => {
      splitRoadWork(state.constructions, from, to);
      splitTrailPieces(state.trails, from, to);
    },
  };
  tidyRoads(roads, state.constructions, () => false, context, undefined, state.trails);
}

/**
 * Jeden průchod jednorázové přestavby sítě (`rebuildRoads` – paths.md, Jednorázová přestavba sítě;
 * mutuje): měsíční kontrola dne `day` bez ohledu na datum a s úklidem vždy – zánik a kusy pod
 * stavbami, vznik cest z vyšlapanosti od kotvy ke kotvě, úklid, cesty k vchodům a křižovatky.
 */
export function rebuildRoadsPass(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  rebuild: RebuildHints = {},
): void {
  if (state.roads) delete state.roads.tidyKey;
  roadsMonthRun(state, day, landscape, obstacles, rebuild);
}

/**
 * Přestavba sítě pro křižovatky (paths.md – Jednorázová přestavba sítě, Rozestup křižovatek):
 * úsek, ze kterého bude vozová cesta (`wagon`), má pro rozestup šířku vozové a je živý jako vozová
 * (po přepočtu se křižovatka s vozovým ramenem už nehne – rozestup musí platit dřív); úsek zemské
 * stezky křižovatku při rozestupu nedrží (stezka se po každém průchodu znovu najde).
 */
export interface RebuildHints {
  wagon?: (road: Road) => boolean;
}

/**
 * Křižovatky při přestavbě (`RebuildHints`): `width` – šířka úseku budoucí vozové cesty pro
 * rozestup, `loose` – úseky zemských stezek, které uzel nedrží. Mimo přestavbu nic. (Práh živosti
 * budoucí vozové – dřív `asBuilt` – odpadl: ramenem je každý neopuštěný úsek, `junctionArm`.)
 */
export function rebuildJunctionHints(
  rebuild: RebuildHints | undefined,
  trails: readonly Trail[] | undefined,
): {
  loose?: ReadonlySet<number>;
  width?: (road: Road) => number | undefined;
} {
  if (!rebuild) return {};
  const loose = new Set((trails ?? []).flatMap((t) => t.pieces.map((q) => q.roadId)));
  const wagon = rebuild.wagon;
  if (!wagon) return { loose };
  return {
    loose,
    width: (road) => (wagon(road) ? ROAD_LAND.widthM.wagon : undefined),
  };
}

/** Kolikrát běžel měsíční úklid (`tidyMonth`) – pro testy a měření, hra ho nečte. */
export const TIDY_RUNS = { count: 0 };

/** Otisk sítě pro měsíční úklid: osy, stupně a opuštění úseků (FNV-1a, 32 bitů). */
function networkKey(roads: VillageRoads): number {
  let hash = 0x811c9dc5;
  const add = (text: string): void => {
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
    }
  };
  for (const road of roads.roads) {
    add(`|${road.id}:${road.grade}${road.unbridged ? 'u' : ''}:${road.abandoned ? 1 : 0}:`);
    for (const p of road.points) add(`${p.x},${p.z};`);
  }
  return hash;
}

/**
 * Stavby a ploty vsi přesně, ne po buňkách mřížky (paths.md – Křižovatky, Ohyb ramene): bod
 * v obdélníku stavby pro pěšiny (`villageBuildings` – obydlí i se šíjí nebo celým pozemkem,
 * staveniště, milíř, modla, humno…) nebo blíž než `FENCE_CLEARANCE.axisM` k plotu hřbitova,
 * ohrady či pozemku (i uvnitř). Spočítá se líně a jednou.
 */
function footprintOf(
  state: VillageState,
  landscape: Landscape,
  day: number,
): () => (x: number, z: number) => boolean {
  let at: ((x: number, z: number) => boolean) | null = null;
  return () => {
    if (at) return at;
    const village = pathVillageOf(state, day, landscape);
    const buildings = villageBuildings(village).all;
    const fences = villageFences(village, true).map((f) => f.outline);
    const reach = FENCE_CLEARANCE.axisM;
    at = (x, z) =>
      buildings.some((b) => inBuilding(b, x, z, 0)) || fenceClearance(fences, x, z, reach) < reach;
    return at;
  };
}

/**
 * Body staveb vsi pro copánek přes křižovatku (paths.md – Copánek přes křižovatku) – spočítají se
 * líně a jednou, až když úklid najde okruh vhodné délky a souběhu.
 */
function ringBuildingsOf(
  state: VillageState,
  day: number,
  landscape: Landscape,
): () => readonly RingBuilding[] {
  let points: readonly RingBuilding[] | null = null;
  return () => (points ??= ringBuildingPoints(pathVillageOf(state, day, landscape)));
}

/** Vchody staveb (kotvy tras) pro copánek přes křižovatku – líně, ze stejných tras jako měsíční úklid. */
function entrancesOf(
  state: VillageState,
  landscape: Landscape,
  day: number,
): () => readonly RoadPoint[] {
  return () => {
    const routes = state.routes;
    if (!routes || routes.list.length === 0) return [];
    const { anchors } = monthRoutes(
      routes,
      landscape,
      pathCellM(landscape),
      fencesOf(state, landscape, day),
    );
    return anchors.points.filter((a) => a.kind === 'entrance');
  };
}

/**
 * Měsíční úklid sítě (paths.md – Síť – kotvy, pahýly a úklid; mutuje): okruhy, souběžné cesty,
 * copánky, díry, spojení a pahýly (`tidyRoads` s kotvami a čarami tras), pak cesty k vchodům
 * (`accessRoads`, kronika `road-formed`). Jen když se od posledního úklidu změnily trasy nebo
 * cesty (`VillageRoads.tidyKey`) – jinak nic, ani kontext míst na stromy. Nakonec (krok 6)
 * křižovatky (`updateJunctions`) – vždy, ramena určuje provoz tras; beze změny nic.
 */
function tidyMonth(
  state: VillageState,
  routes: VillageRoutes,
  month: {
    lines: RoadPoint[][];
    anchors: RoadAnchors;
    day: number;
    cellM: number;
    /** Neprůchodná plocha vsi (stavby, ploty, zemní práce) – jen když se křižovatka posouvá. */
    walk: () => ((x: number, z: number) => boolean) | null;
    /** Jen přestavba sítě (`RebuildHints`). */
    rebuild?: RebuildHints;
    /** Stavby vsi pro copánek přes křižovatku (`ringBuildingsOf`). */
    buildings: () => readonly (readonly RoadPoint[])[];
    /** Vchody staveb – jediný přístup k vchodu copánek nezruší (`entrancesOf`). */
    entrances: () => readonly RoadPoint[];
    /** Ploty vsi – osa cesty k vchodu drží odstup (`fencesOf`). */
    fences: () => readonly FenceOutline[];
    /** Stavby a ploty přesně – ohyb ramene ke křižovatce přes ně nevede (`footprintOf`). */
    footprint: () => (x: number, z: number) => boolean;
  },
  base: () => Omit<SpotContext, 'split'>,
  field: () => TrafficField,
): void {
  const roads = state.roads!;
  const isEnd = anchorTermini(month.anchors);
  const network = { isAnchor: isEnd, lines: month.lines, trails: state.trails };
  // rozestavěný hřbitov nemá branku – cesta k vchodu až k hotovému (paths.md – Vchody)
  const unbuilt = new Set(
    villageCemeteries(state)
      .filter((c) => c.builtDay === null)
      .map((c) => visitKey('cemetery', c.id)),
  );
  const built = (visit: string): boolean => !unbuilt.has(visit);
  // ohyb do vchodu jen u volných úseků a ne přes plot, stavbu ani vodu (paths.md – Cesta do branky)
  const guard = (): GateGuard =>
    gateGuardOf(
      fixedRoadIds(state.constructions, state.trails),
      month.walk,
      () => base().terrain,
      month.fences,
    );
  // křižovatky (krok 6) – ramena ze všech neopuštěných cest (i zarůstajících – `junctionArm`); i bez
  // úklidu: starší ves se tak srovná v prvním měsíci, kotvy u vchodů a plocha vsi se mění se stavbami
  const junctions = (): boolean => {
    const frozen = fixedRoadIds(state.constructions, state.trails);
    const entrances = month.anchors.points.filter((a) => a.kind === 'entrance');
    const hints = rebuildJunctionHints(month.rebuild, state.trails);
    let walkable: ReturnType<typeof month.walk> | undefined;
    let footprint: ReturnType<typeof month.footprint> | undefined;
    return updateJunctions(roads, month.day, state.seed, {
      fixed: frozen,
      ...(hints.loose ? { loose: hints.loose } : {}),
      // uzel u vchodu se při rozestupu křižovatek nehýbe – vchod by přišel o cestu
      anchor: (p) => nearEntrance(p, entrances),
      // nový střed křižovatky nesmí do domu, plotu ani zemních prací
      blocked: (p) => (walkable ??= month.walk())?.(p.x, p.z) ?? false,
      // ohyb ramene ne přes stavbu ani plot (paths.md – Křižovatky, Ohyb ramene)
      footprint: (p) => (footprint ??= month.footprint())(p.x, p.z),
      ...(hints.width ? { width: hints.width } : {}),
    });
  };
  // cesty beze změny: úklid jen, když nové kotvy a trasy dají práci (pahýl, díra, okruh, vchod)
  if (
    roads.tidyKey === networkKey(roads) &&
    !tidyDue(roads, state.constructions, isEnd, network, month.buildings, month.entrances) &&
    !accessDue(roads, routes.list, month.cellM, built, guard())
  ) {
    // ohnuté konce os nic dalšího neuklidí (konce zůstanou ve středu) – otisk sítě se jen posune
    if (junctions()) roads.tidyKey = networkKey(roads);
    return;
  }
  TIDY_RUNS.count++;
  const context: SpotContext = {
    ...base(),
    split: (from, to) => {
      splitRoadWork(state.constructions, from, to);
      splitTrailPieces(state.trails, from, to);
    },
  };
  tidyRoads(roads, state.constructions, isEnd, context, network, state.trails);
  const made = accessRoads(
    roads,
    routes.list,
    month.cellM,
    month.day,
    context,
    field(),
    built,
    guard(),
  );
  if (made.length > 0) {
    mergeRoadChains(roads, state.constructions, state.trails);
    markRoadEnds(roads, isEnd);
    const kept = new Set(roads.roads.map((r) => r.id));
    for (const road of made) {
      if (kept.has(road.id)) {
        state.chronicle.push({ day: month.day, kind: 'road-formed', roadId: road.id });
      }
    }
  }
  junctions();
  roads.tidyKey = networkKey(roads);
}

/** Pracovní kopie částí stavu, které vznik cesty a úklid mění. */
interface RoadsDraft {
  roads: VillageRoads;
  constructions: Construction[];
  trails: Trail[] | undefined;
}

/** Kopie cest (bez vyšlapanosti – ta se nemění), roadIds staveb a kusů zemských stezek. */
function draftOf(state: VillageState, roads: VillageRoads): RoadsDraft {
  const { wear, ...rest } = roads;
  return {
    roads: { ...structuredClone(rest), ...(wear ? { wear } : {}) },
    constructions: state.constructions.map((c) =>
      c.roadIds ? { ...c, roadIds: [...c.roadIds] } : c,
    ),
    trails: state.trails?.map((t) => ({ ...t, pieces: t.pieces.map((p) => ({ ...p })) })),
  };
}

/** Přijme kopii do stavu (cesty celé, u staveb a stezek jen úseky, které se mohly změnit). */
function commitDraft(state: VillageState, draft: RoadsDraft): void {
  state.roads = draft.roads;
  state.constructions.forEach((c, k) => {
    const roadIds = draft.constructions[k]!.roadIds;
    if (roadIds) c.roadIds = roadIds;
  });
  state.trails?.forEach((t, k) => {
    t.pieces = draft.trails![k]!.pieces;
  });
}

/** Kolik kol vzniku nejvýš – v dalším kole se vynechají kusy, které úklid smazal. */
const FORM_ROUNDS = 3;
/** Bod osy nové cesty po úklidu přežil, když pevná cesta vede do tolika m od něj. */
const KEPT_AXIS_M = 1;

/**
 * Přežila nová cesta úklid? Po jejích bodech mimo dřívější pevné cesty (dál než ON_ROAD_M – ne
 * připojení) vede po úklidu pevná cesta aspoň v délce ON_ROAD_M (i pod jiným id po spojení).
 */
function survivedTidy(road: Road, before: VillageRoads, after: VillageRoads): boolean {
  const old = axisDistance(before.roads.filter((r) => !r.abandoned).map((r) => r.points));
  const now = axisDistance(after.roads.filter((r) => !r.abandoned).map((r) => r.points));
  const own = resample(road.points, null, SAMPLE_M).points.filter((p) => old(p.x, p.z) > ON_ROAD_M);
  const kept = own.filter((p) => now(p.x, p.z) <= KEPT_AXIS_M).length;
  return kept * SAMPLE_M >= ON_ROAD_M;
}

/**
 * Vznik cest z vyšlapanosti a úklid (`formWearRuns`, `tidyRoads`) nad kopií stavu (paths.md –
 * Vyšlapanost a vznik cesty): stav se změní, jen když každá nová cesta úklid přežije
 * (`survivedTidy`). Kus, jehož cestu úklid smazal (objížďka souběžná se starší cestou), se
 * v dalším kole vynechá – smazaná cesta tak nerozdělí cizí cesty, nezmění jejich id ani místa na
 * stromy a nespotřebuje `nextId` – a ves si ho zapamatuje (`remembered`), aby ho další měsíce
 * nezkoušela znovu; kusy z paměti vsi (`lost`) vynechá od prvního kola. Konce tras pro úklid jsou
 * kotvy (`anchorTermini`). Vrátí nové cesty, které zůstaly; nic-li nezůstalo, stav nezmění
 * (mutuje stav a `remembered`).
 */
function* formRoadsKept(
  state: VillageState,
  roads: VillageRoads,
  month: {
    lines: readonly RoadPoint[][];
    anchors: RoadAnchors;
    wear: ReadonlyMap<number, number>;
    day: number;
    base: Omit<SpotContext, 'split'>;
    lost: ReadonlySet<string>;
    remembered: Set<string>;
  },
  field: () => TrafficField,
): Generator<void, Road[], void> {
  const { lines, anchors, wear, day, base, remembered } = month;
  const isEnd = anchorTermini(anchors);
  const skip = new Set(month.lost);
  for (let round = 0; round < FORM_ROUNDS; round++) {
    yield;
    const draft = draftOf(state, roads);
    const context: SpotContext = {
      ...base,
      split: (from, to) => {
        splitRoadWork(draft.constructions, from, to);
        splitTrailPieces(draft.trails, from, to);
      },
    };
    const formed = formWearRuns(draft.roads, lines, wear, anchors, day, context, field(), skip);
    if (formed.length === 0) return [];
    yield;
    tidyRoads(draft.roads, draft.constructions, isEnd, context, undefined, draft.trails);
    const lost = formed.filter(({ road }) => !survivedTidy(road, roads, draft.roads));
    if (lost.length === 0) {
      commitDraft(state, draft);
      return formed.map((f) => f.road);
    }
    for (const { key } of lost) {
      skip.add(key);
      remembered.add(key);
    }
  }
  return [];
}

/** Paměť smazaných kusů do stavu – seřazeně (nezávisí na pořadí průchodu); prázdná chybí. */
function rememberLostRuns(roads: VillageRoads, keys: ReadonlySet<string>): void {
  if (keys.size > 0) roads.lostRuns = [...keys].sort();
  else delete roads.lostRuns;
}

/** Klíč místa práce (pole bez dílů; seč přirozených luk za rok jedno místo). */
function laborKey(target: LaborTarget): string {
  if (target.kind === 'trees') return `trees:${target.ids.join('.')}`;
  if (target.kind === 'meadow') return 'meadow';
  // cesta ke kraji mapy (nákup u souseda – crafts.md) podle směru
  if (target.kind === 'edge') return `edge:${target.direction}`;
  // břeh, kam vůz jezdí pro vodu (wagons.md – Co vozy vozí)
  if (target.kind === 'water') return `water:${target.x},${target.z}`;
  // nošení uhlí od milíře do kovárny zvlášť od práce uhlíře u milíře (crafts.md – Uhlí a ruda),
  // každý milíř zvlášť (crafts.md – Milíř u skácených buků)
  if (target.kind === 'kiln') {
    const kiln = target.kiln !== undefined ? `/${target.kiln}` : '';
    return target.from !== undefined
      ? `kiln:${target.id}${kiln}>${target.from}`
      : `kiln:${target.id}${kiln}`;
  }
  if (target.kind === 'pool') return `pool:${target.index}`;
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
 * Roční kontrola pevných cest v den `day` (1. 11.; mutuje stav): provoz cest za uplynulý rok,
 * zarůstání, vyježděné cesty (cesty pěších vznikají měsíčně – `roadsMonth`) a stromy u cest
 * (konec pařezů, odstraněné stavbou, uchycení nových). Vrátí události kroniky.
 * `precomputed` – změny překážek, které už volající spočítal ze stejného stavu
 * (`roadsDay`).
 */
export function updateRoads(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  precomputed?: { changes: ObstacleChanges },
): ChronicleEvent[] {
  const roads = (state.roads ??= emptyRoads(day));
  const changes = precomputed?.changes ?? obstacleChangesAt(state, day);
  const terrain = annualTerrain(state, day, landscape, obstacles, changes);
  const events: ChronicleEvent[] = [];
  const blocked = plantingBlocker(state, landscape);
  if (terrain) {
    // provoz pěších kusů z provozního pole uložených tras (síť pěšin se neskládá znovu)
    const routes = state.routes;
    const cellM = pathCellM(landscape);
    const field = routes && routes.list.length > 0 ? trafficField(routes, cellM) : null;
    const walk = (points: readonly RoadPoint[]): number =>
      field ? fieldTraffic(points, field) : 0;
    // jízdy vozů za rok (wagons.md – Vyjeté cesty) – ves bez vozů nic
    const cart = annualCartNetwork(state, day, landscape, obstacles, changes, terrain);
    for (const road of roads.roads) {
      road.traffic = [...road.traffic, walk(road.points)].slice(-ROADS.overgrowYears);
      if (cart || road.cartTraffic) {
        road.cartTraffic = [
          ...(road.cartTraffic ?? []),
          cart ? roadTraffic(road.points, cart.traffic) : 0,
        ].slice(-CART_ROADS.dropYears);
      }
      // úseky z doby před mokřinou a brody (fáze 1) si je doplní
      road.ground ??= roadGroundOf(road.points, terrain);
    }
    // jízdy vozů vyšlapou pěšinu jako chůze (jednou za rok; cesta pak vznikne z vyšlapanosti)
    if (cart && roads.wear) addCartWear(roads.wear, cart.traffic, Math.max(1, roads.labor.days));
    markCartRoads(roads);
    const context: SpotContext = {
      terrain,
      blocked,
      layer: obstacles,
      changes,
      seed: state.seed,
      buildings: ringBuildingsOf(state, day, landscape),
      entrances: entrancesOf(state, landscape, day),
      split: (from, to) => {
        splitRoadWork(state.constructions, from, to);
        splitTrailPieces(state.trails, from, to);
      },
    };
    // vyježděné cesty – kde vozy jezdí nad prahem i loni, vyšlapanou cestu převezmou (wagons.md)
    if (cart) {
      takeOverCartRoads(roads, cart.runs, roads.cartCandidates ?? [], cart.traffic, context);
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
    tidyRoads(
      roads,
      state.constructions,
      annualTermini(state, landscape, day),
      context,
      undefined,
      state.trails,
    );
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

export {
  addRoadCartTrips,
  annualCartNetwork,
  teamPens,
  villageCartCost,
  villageCartRoutes,
} from './roads-carts';
export {
  annualTerrain,
  mergeRoadChains,
  roadTraffic,
  roadsInWork,
  withMergedRoads,
} from './roads-form';
export { type RoadPiece, roadPieces } from './road-condition';
export { roadGroundOf, roadLengthM, roadWetM } from './roads-geometry';
export { absorbParallelRoads, joinedRoadsOf } from './roads-tidy';
export { plantingBlocker, roadTreeSpots } from './roads-trees';
export { addTrailRoads, addWagonRoad } from './roads-trails';
