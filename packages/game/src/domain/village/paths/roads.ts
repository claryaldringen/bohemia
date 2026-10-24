// Pevné cesty (docs/design/roads.md – Dvě vrstvy cest, Stromy u pevných cest). Simulace vsi
// sčítá práci dne po místech a jednou za rok (1. 11.) spočítá stejnou funkcí jako pěšiny dne
// (`computePathNetwork`) síť z celoroční práce (provoz cest, zarůstání, vozy). Cesta vzniká
// měsíčně z vyšlapanosti (`roadsMonth` – paths.md, Vyšlapanost a vznik cesty): uloží se její osa
// a od té doby se nehýbe – nové trasy se k ní přimknou (sleva v síti). Nepoužívaná vyšlapaná cesta
// zaroste. U cesty se při vzniku určí místa na stromy; na volném místě se strom uchytí náhodou ze
// seedu vsi a roku, roste z keře a stojí, dokud neodumře. Vše je deterministické (jen přesná
// aritmetika – soubor hlídá ESLint jako síť pěšin).

import { dateOfDayIndex } from '../../calendar';
import { type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt, type ObstacleChanges } from '../obstacles';
import { roadAppleStage, roadTreeLook } from '../road-trees';
import { CART_ROADS, ROADS } from '../rules';
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
  type AnnualNetwork,
  annualPathNetwork,
  emptyRoads,
  formWearRuns,
  roadTraffic,
  splitRoadWork,
  splitTrailPieces,
  wearRoadDue,
} from './roads-form';
import { annualCartNetwork, formCartRoads, markCartRoads } from './roads-carts';
import { overgrowRoads } from './roads-overgrow';
import { anchorTermini, networkTermini, tidyRoads } from './roads-tidy';
import { SpotContext, plantingBlocker, rootTrees } from './roads-trees';
import { type RoadAnchors, roadAnchors } from './road-anchors';
import { routeLine } from './routes';
import { pathCellM, trailTerrain } from './terrain';
import { settleVillageWear } from './village';
import { type TrafficField, addWearLabor, trafficField, wearMap } from './wear';

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
  // vyšlapanost (paths.md – Vyšlapanost a vznik cesty) – nová ves od dneška od nuly, starší ves
  // ji dostane při načtení (`withWearSeed`)
  const wear = (roads.wear ??= { day, cells: '', labor: [] });
  let visits: ReadonlyMap<string, number> | null = null;
  if (isRoadYearDay(day) && roads.labor.from < day) {
    const changes = obstacleChangesAt(state, day);
    const annual = annualPathNetwork(state, day, landscape, obstacles, changes);
    state.chronicle.push(...updateRoads(state, day, landscape, obstacles, { annual, changes }));
    visits = annual?.network.visits ?? new Map<string, number>();
    roads.labor = { from: day, days: 0, shares: [] };
  }
  addRoadLabor(roads, state.labor, day);
  addWearLabor(wear, state.labor, day);
  return visits;
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
function monthRoutes(routes: VillageRoutes, landscape: Landscape, cellM: number): MonthRoutes {
  const key = `${routes.key}|${cellM}|${landscape.size}`;
  let trips = 0;
  let steps = 0;
  for (const r of routes.list) {
    trips += r.trips;
    steps += r.steps.length;
  }
  const check = `${routes.list.length}/${trips}/${steps}`;
  const cached = MONTH_ROUTES.get(key);
  if (cached && cached.check === check) return cached.value;
  // nejsilnější trasy napřed (stálé pořadí – stejné trasy, stejné cesty)
  const lines = routes.list
    .map((route, k) => ({ route, k }))
    .sort((a, b) => b.route.trips - a.route.trips || a.k - b.k)
    .map(({ route }) => routeLine(route, cellM));
  const value = { lines, anchors: roadAnchors(routes.list, landscape) };
  MONTH_ROUTES.delete(key);
  MONTH_ROUTES.set(key, { check, value });
  if (MONTH_ROUTES.size > MONTH_ROUTES_KEPT) MONTH_ROUTES.delete(MONTH_ROUTES.keys().next().value!);
  return value;
}

/**
 * Měsíční kontrola pevných cest 1. dne v měsíci (paths.md – Vyšlapanost a vznik cesty; mutuje
 * stav – volá simulace na začátku dne): vyšlapanost do dneška (`settleVillageWear`), z vyšlapaných
 * čar tras nové cesty od kotvy ke kotvě a po vzniku úklid sítě (`formRoadsKept`), kronika
 * `road-formed`. Jiné dny nic; bez vyšlapanosti, tras nebo horkého kusu jen sečte vyšlapanost
 * (kontext míst na stromy se nestaví).
 */
export function roadsMonth(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  if (dateOfDayIndex(day).day !== 1) return;
  settleVillageWear(state, day, landscape);
  const roads = state.roads;
  const routes = state.routes;
  if (!roads?.wear || !routes || routes.list.length === 0) return;
  const cellM = pathCellM(landscape);
  const { lines, anchors } = monthRoutes(routes, landscape, cellM);
  const wear = wearMap(roads.wear);
  if (!wearRoadDue(roads, lines, wear, anchors)) return;
  const base: Omit<SpotContext, 'split'> = {
    terrain: trailTerrain(landscape, obstacles),
    blocked: plantingBlocker(state, landscape),
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    seed: state.seed,
  };
  const formed = formRoadsKept(state, roads, { lines, anchors, wear, day, base }, () =>
    trafficField(routes, cellM),
  );
  // úklid může novou cestu spojit se starší – do kroniky jen cesty, jejichž id zůstalo
  const kept = new Set(state.roads!.roads.map((r) => r.id));
  for (const road of formed) {
    if (kept.has(road.id)) state.chronicle.push({ day, kind: 'road-formed', roadId: road.id });
  }
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
  const old = axisDistance(before.roads.map((r) => r.points));
  const now = axisDistance(after.roads.map((r) => r.points));
  const own = resample(road.points, null, SAMPLE_M).points.filter((p) => old(p.x, p.z) > ON_ROAD_M);
  const kept = own.filter((p) => now(p.x, p.z) <= KEPT_AXIS_M).length;
  return kept * SAMPLE_M >= ON_ROAD_M;
}

/**
 * Vznik cest z vyšlapanosti a úklid (`formWearRuns`, `tidyRoads`) nad kopií stavu (paths.md –
 * Vyšlapanost a vznik cesty): stav se změní, jen když každá nová cesta úklid přežije
 * (`survivedTidy`). Kus, jehož cestu úklid smazal (objížďka souběžná se starší cestou), se
 * v dalším kole vynechá – smazaná cesta tak nerozdělí cizí cesty, nezmění jejich id ani místa na
 * stromy a nespotřebuje `nextId`. Konce tras pro úklid jsou kotvy (`anchorTermini`). Vrátí nové cesty, které zůstaly; nic-li nezůstalo, stav nezmění (mutuje).
 */
function formRoadsKept(
  state: VillageState,
  roads: VillageRoads,
  month: {
    lines: readonly RoadPoint[][];
    anchors: RoadAnchors;
    wear: ReadonlyMap<number, number>;
    day: number;
    base: Omit<SpotContext, 'split'>;
  },
  field: () => TrafficField,
): Road[] {
  const { lines, anchors, wear, day, base } = month;
  const isEnd = anchorTermini(anchors);
  const skip = new Set<string>();
  for (let round = 0; round < FORM_ROUNDS; round++) {
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
    tidyRoads(draft.roads, draft.constructions, isEnd, context);
    const lost = formed.filter(({ road }) => !survivedTidy(road, roads, draft.roads));
    if (lost.length === 0) {
      commitDraft(state, draft);
      return formed.map((f) => f.road);
    }
    for (const { key } of lost) skip.add(key);
  }
  return [];
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

export { addRoadCartTrips, annualCartNetwork, teamPens, villageCartRoutes } from './roads-carts';
export {
  type AnnualNetwork,
  annualPathNetwork,
  mergeRoadChains,
  roadTraffic,
  roadsInWork,
  withMergedRoads,
} from './roads-form';
export { type RoadPiece, keepingApples, roadPieces } from './roads-overgrow';
export { roadGroundOf, roadLengthM, roadWetM } from './roads-geometry';
export { absorbParallelRoads, joinedRoadsOf, withJoinedRoads } from './roads-tidy';
export { plantingBlocker, roadTreeSpots } from './roads-trees';
export { addTrailRoads, addWagonRoad } from './roads-trails';
