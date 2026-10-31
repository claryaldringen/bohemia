import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { stockedPenIds } from '../abandonment';
import { workshopKilns } from '../charcoal';
import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../../landscape';
import { villageCemeteries } from '../cemetery';
import { currentGrainPits, openGrainPits } from '../grain-pits';
import { HAY_WINTER_MONTHS } from '../hay';
import { grazingDemandHa, villageHerds } from '../livestock';
import { obstacleChangesAt, type ObstacleChanges } from '../obstacles';
import { villageOrchards } from '../orchard';
import { herdingCoverage } from '../herding';
import { grazedPartIds, isGrazeableFallow } from '../overgrowth';
import { villageOxen, villagePens } from '../oxen';
import { horsesInPlaces, villageHorses } from '../horses';
import { penCells, penSpecies } from '../pens';
import { ageGroup } from '../people';
import { partStage } from '../summary';
import { gridKey, squareCenter } from '../square-grid';
import { fieldGrids } from '../squares';
import type {
  DwellingPlot,
  HerdSpecies,
  Pen,
  PenSquare,
  Position,
  SquareGrid,
  StoredRoute,
  TileCell,
  VillageRoutes,
  VillageState,
} from '../types';
import { villageWoods } from '../woods';
import { clearingRouteObstacles, withoutHiddenChanges } from './clearing-routes';
import { earthworkSpansOf } from './earthworks';
import {
  computeStableNetwork,
  establishedVillage,
  stableRouteWeights,
  kilnsKey,
  threshingFloorsKey,
  pathPlotOf,
  villagePathBounds,
  roadsKey,
  type PathLine,
  type PathNetwork,
  type PathPlot,
  type PathPoint,
  type PathSquare,
  type PathNetworkInput,
  type PathVillage,
} from './network';
import {
  PATH_FOREST_EDGE,
  obstaclePosition,
  pathCellM,
  pathTerrainOf,
  pathWindowFor,
  withObstacles,
} from './terrain';
import {
  groundSpots,
  nearestSpot,
  walkGraph,
  walkGroundOf,
  walkingDistances,
  walkMemoOf,
  waterWalkDistance,
  withFieldWalk,
  type Walk,
} from './walking';
import { lineRoads } from './road-lining';
import { roadAnchors } from './road-anchors';
import { settleRoadCondition, trafficOnRoads } from './road-condition';
import { routePaths } from './route-paths';
import { villageGrid } from './network-grid';
import { villageBuildings } from './network-search';
import { storedRoutes } from './routes';
import { roadTreeSpeed } from './walk-speed';
import {
  accrueVisits,
  laborTripsPerDay,
  settleWear,
  trafficField,
  wearMap,
  wearRevisionKey,
} from './wear';

// Pěšiny ze stavu vsi (paths.md – Pěšiny a práce): server skládá ves pro pěšiny stejně jako
// scéna (village-view.ts – SceneVillage), spočítá stejnou síť a z ní vzdálenosti chůze dílů
// pole. Přepočítá se, jen když se změní rozložení vsi (stavby, pole, stadia dílů, obyvatelé
// obydlí, stáří spojení) – den po dni v simulaci, takže výsledek nezávisí na tom, po jakých
// kouscích se ves dopočítá.
/** Vzdálenost chůze se ukládá na desetiny metru. */
const WALK_ROUNDING = 10;

/**
 * Čtverec ze středu políčka (díl pole, čtverec sadu a háje) – u natočené stavby (fields.md –
 * Natočené stavby) čtverec její mřížky `grid` se středem a natočením.
 */
function square(landscape: Landscape, cell: TileCell, grid?: SquareGrid): PathSquare {
  if (grid) {
    const c = squareCenter(landscape, grid, cell);
    return {
      cell: { x: cell.x, y: cell.y },
      x: c.x,
      z: c.z,
      size: landscape.cellSizeM,
      rotation: grid.rotation,
    };
  }
  const c = tileCenterWorld(landscape, cell.x, cell.y);
  return { cell: { x: cell.x, y: cell.y }, x: c.x, z: c.z, size: landscape.cellSizeM };
}

/** Další čtverce ohrady, kolem kterých stojí plot – u hotové ohrady bez rozšíření ve stavbě. */
function fencedExtra(pen: Pen): PenSquare[] {
  const extra = pen.extraSquares ?? [];
  return pen.builtDay === null ? extra : extra.filter((q) => q.constructionId === undefined);
}

/**
 * Stojí krávy (`cattle`), nebo voli (`team`) v den `day` v ohradě – v zimě, když ves hotovou ohradu
 * jejich druhu má (oxen.md – Ohrady podle druhu).
 */
function cattlePenned(
  state: Pick<VillageState, 'pens'>,
  day: number,
  species: 'cattle' | 'team' | 'horse' = 'cattle',
): boolean {
  return (
    HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month) &&
    villagePens(state).some((p) => p.builtDay !== null && penSpecies(p) === species)
  );
}

/**
 * Stáda na pastvě v den `day` jako ve scéně (village-view.ts – `SceneVillage.livestock`): kusy
 * zaokrouhleně, v zimě (listopad–březen) stojí krávy v ohradě, když ves hotovou ohradu skotu má.
 */
export function pastureLivestock(
  state: Pick<VillageState, 'livestock' | 'pens'>,
  day: number,
): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const penned = cattlePenned(state, day);
  return {
    sheep: Math.round(herds.sheep),
    goat: Math.round(herds.goat),
    pig: Math.round(herds.pig),
    cow: penned ? 0 : Math.round(herds.cow),
  };
}

/**
 * Díly přílohu, na kterých se stáda v den `day` pasou (fields.md – Zarůstání, diet.md – Pastva):
 * stáda na pastvě (`pastureLivestock`) a voli mimo zimní ohradu, jen kolik pasáci uhlídali
 * (`herdingCoverage` – stádo bez pasáka se nepase), po pastvinách – stejné rozdělení
 * (`grazedPartIds`) jako roční krok zarůstání. Podle nich chodí pasáček (síť pěšin) a pasou se
 * stáda ve scéně.
 */
export function pastureGrazedParts(state: VillageState, day: number): Set<number> {
  const oxen = cattlePenned(state, day, 'team') ? 0 : villageOxen(state);
  // koně se pasou se stády (horses.md – Krmení), v zimě stojí v ohradě jako voli
  const horses = cattlePenned(state, day, 'horse') ? 0 : horsesInPlaces(villageHorses(state), day);
  const demand =
    grazingDemandHa(pastureLivestock(state, day), oxen, horses) * herdingCoverage(state);
  return grazedPartIds(state, day, demand);
}

/**
 * Ves pro pěšiny ze stavu vsi v den `day` – stejná data, jaká dostane scéna (village-view.ts):
 * obydlí i staveniště s pozemky, díly polí podle stadia, sady, hřbitovy, posvátná místa,
 * rozdělení práce posledního dne a pevné cesty (roads.md).
 */
export function pathVillageOf(state: VillageState, day: number, landscape: Landscape): PathVillage {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const plotOf = (plot: DwellingPlot | undefined): { plot: PathPlot } | object =>
    plot ? { plot: pathPlotOf(landscape, plot) } : {};
  const dwellings = [
    ...state.dwellings.map((d) => ({
      id: d.id,
      type: d.type,
      position: d.position,
      built: true,
      inhabited: occupied.has(d.id),
      since: d.builtDay,
      ...plotOf(d.plot),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
      ...(d.plainShape ? { plainShape: true } : {}),
    })),
    ...state.constructions.flatMap((c) =>
      c.kind === 'dwelling' && c.dwellingType !== null && c.position !== null
        ? [
            {
              id: c.id,
              type: c.dwellingType,
              position: c.position,
              built: false,
              since: c.startedDay,
              ...plotOf(c.plot),
              ...(c.craft ? { craft: c.craft } : {}),
              ...(c.plainShape ? { plainShape: true } : {}),
            },
          ]
        : [],
    ),
  ];
  const grazed = pastureGrazedParts(state, day);
  // stadium dílu – cenu pole nemění (paths.md – Stálé trasy), jen zarostlý díl a úhor pro pastvu
  const fields = state.fields.map((f) => ({
    id: f.id,
    parts: state.parts.flatMap((p) => {
      if (p.fieldId !== f.id || p.cell === undefined) return [];
      return [
        {
          ...square(landscape, p.cell, f.grid),
          stage: partStage(p, day),
          ...(isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
        },
      ];
    }),
  }));
  const woods = villageWoods(state).map((w) => ({
    ...square(landscape, w.cell, w.grid),
    surface: w.surface,
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    squares: o.squares.map((s) => square(landscape, s.cell, o.grid)),
  }));
  // hotový hřbitov a rozšíření ve stavbě (`pending`) jako scéna – branka (paths.md – Vchody)
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      // natočený hřbitov (fields.md – Natočené stavby)
      ...(c.grid ? { rotation: c.grid.rotation } : {}),
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
  }));
  const sites = state.constructions.flatMap((c) =>
    (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
      ? [{ id: c.id, kind: c.kind, position: c.position, built: false }]
      : [],
  );
  const buildings = [
    ...(state.sacredBuildings ?? []).map((b) => ({
      id: b.id,
      kind: b.kind,
      position: b.position,
      built: true,
    })),
    ...sites,
  ];
  const oaks = (state.sacredOaks ?? []).map((o) => ({ id: o.id, x: o.x, z: o.z }));
  const groves = (state.groves ?? []).map((g) => ({
    id: g.id,
    x: g.x,
    z: g.z,
    squares: g.cells.map((cell) => square(landscape, cell)),
  }));
  const people = { children: 0, adults: 0, elders: 0 };
  for (const person of state.people) {
    const group = ageGroup(person, day);
    if (group === 'child') people.children++;
    else if (group === 'adult') people.adults++;
    else people.elders++;
  }
  // pařezy a mladé stromy k poslednímu 1. 11. (paths.md – Stálé trasy, pravidlo 5)
  const changes = routeObstacleChanges(state, day);
  const roads = state.roads?.roads ?? [];
  // přirozené louky letošní seče (oxen.md – Seno) – k políčkům, kde se dnes seče, vede pěšina
  const kilns = villageKilnPoints(state);
  const hayMeadows = (state.hay?.mowing?.squares ?? []).flatMap((sq) =>
    sq.cell ? [square(landscape, sq.cell)] : [],
  );
  // do ohrady bez zvířat se krmit nechodí (abandonment.md)
  const stocked = stockedPenIds(state);
  const pits = currentGrainPits(state);
  const pens = villagePens(state).map((p) => ({
    id: p.id,
    cell: { x: p.cell.x, y: p.cell.y },
    x: p.x,
    z: p.z,
    size: landscape.cellSizeM,
    ...(p.grid ? { rotation: p.grid.rotation } : {}),
    built: p.builtDay !== null,
    ...(p.builtDay !== null && !stocked.has(p.id) ? { stocked: false } : {}),
    // další čtverce ohrady (oxen.md – Ohrady podle druhu) – u hotové ohrady jen hotové (plot
    // a branka kolem nich jako ve scéně; rozšíření ve stavbě je jen vytyčené)
    ...(fencedExtra(p).length
      ? {
          extra: fencedExtra(p).map((q) => ({
            cell: { x: q.cell.x, y: q.cell.y },
            x: q.x,
            z: q.z,
            size: landscape.cellSizeM,
            ...(p.grid ? { rotation: p.grid.rotation } : {}),
          })),
        }
      : {}),
  }));
  return {
    dwellings,
    fields,
    orchards,
    cemeteries,
    ...(oaks.length > 0 || groves.length > 0 || buildings.length > 0
      ? { sacred: { oaks, groves, buildings } }
      : {}),
    ...(state.labor
      ? {
          labor: {
            day: state.labor.day,
            month: dateOfDayIndex(state.labor.day).month,
            people,
            shares: state.labor.shares,
          },
        }
      : {}),
    obstacles: changes,
    ...(roads.length > 0
      ? {
          roads: roads.map((r) => ({
            id: r.id,
            points: r.points,
            grade: r.grade,
            // upravená cesta přes mokřinu bez hatě (roads.md – Vylepšení cesty)
            ...(r.unbridged ? { unbridged: true } : {}),
            // vozová cesta (wagons.md) – ves bez vozových cest beze změny
            ...(r.cart ? { cart: true } : {}),
            // stromy u cesty (roads.md – Stromy u cesty zrychlí chůzi) – jen kde nějaké jsou
            ...(roadTreeSpeed(r.lined) > 0 ? { lined: { ...r.lined! } } : {}),
          })),
        }
      : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(state.livestock ? { livestock: pastureLivestock(state, day) } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
    // milíře uhlířů – samostatné stavby (crafts.md – Milíř u skácených buků)
    ...(kilns.length > 0 ? { kilns } : {}),
    // zemní práce vozových cest (roads.md – Vozová cesta) – ves bez nich beze změny
    ...(state.roads?.earthworks && state.roads.earthworks.length > 0
      ? { earthworks: earthworkSpansOf(state) }
      : {}),
    // obilné jámy (production-chains.md – Obilné jámy), zavřené s `open: false` – stálé trasy
    // vedou ke všem (`establishedVillage`); ves bez nich beze změny
    ...(pits.length > 0
      ? {
          grainPits: pits.map((p) => ({
            id: p.id,
            x: p.x,
            z: p.z,
            ...(p.state === 'open' ? {} : { open: false }),
          })),
        }
      : {}),
    // humna (production-chains.md – Humno) – ves bez nich beze změny
    ...((state.threshingFloors ?? []).length > 0
      ? {
          threshingFloors: state.threshingFloors!.map((f) => ({
            id: f.id,
            position: f.position,
            built: f.builtDay !== null,
          })),
        }
      : {}),
  };
}

/**
 * Poslední síť spočítaná ze stavu vsi – po krajinách. Vstup sítě je celý v otisku vsi pro pěšiny
 * (`pathVillageOf` jako JSON – i odstraněné překážky a den), krajina a vrstva překážek se
 * porovnávají přímo. Seč luk (`walkDistancesTo`) tak ve stejný den po přepočtu vzdáleností chůze
 * (`refreshWalkDistances`) síť nepočítá znovu, když se mezi tím ves pro pěšiny nezměnila.
 */
const lastNetworks = new WeakMap<
  Landscape,
  { obstacles: ObstacleLayer | null; input: string; network: PathNetwork | null }
>();

/** Vyšlapanost vsi, jak ji dopočet právě drží (`wearMap`); bez ní null. */
function villageWear(state: VillageState): ReadonlyMap<number, number> | null {
  const wear = state.roads?.wear;
  return wear ? wearMap(wear) : null;
}

/**
 * Čáry pěšin vsi ze stálých tras se silou z vyšlapanosti (`routePaths`) – pro chůzi (paths.md –
 * Stálé trasy, pravidlo 5).
 */
function villageRouteLines(state: VillageState, cellM: number): PathLine[] {
  return routePaths(state.routes?.list ?? [], villageWear(state) ?? new Map(), cellM);
}

/**
 * Vyšlapanost do začátku dne `day` (paths.md – Vyšlapanost a vznik cesty; mutuje stav): interval
 * od posledního sčtu s provozním polem uložených tras – volá se 1. dne v měsíci a před přepočtem
 * tras (trasy se v intervalu nemění). Bez vyšlapanosti nic; bez tras jen dorůstá tráva.
 */
export function settleVillageWear(state: VillageState, day: number, landscape: Landscape): void {
  const wear = state.roads?.wear;
  if (!wear || wear.day >= day) return;
  const routes = state.routes ?? { key: '', list: [] };
  accrueVisits(state.roads!, routes.list, day - wear.day);
  const cellM = pathCellM(landscape);
  const field = trafficField(routes, cellM);
  const from = wear.day;
  // práce intervalu po cílech – pro stav cest dřív, než ji sčítání vynuluje
  const labor = laborTripsPerDay(wear.labor, day - from);
  settleWear(wear, field, from, day);
  // stav cest po týchž intervalech (paths.md – Zarůstání)
  const roads = state.roads!;
  if (roads.roads.length > 0) {
    const entrances = roadAnchors(routes.list, landscape).points.filter(
      (a) => a.kind === 'entrance',
    );
    // stav nesou jen trasy, které šly po cestě (paths.md – Zarůstání, Provoz po cestě)
    const traffic = trafficOnRoads(routes.list, cellM, labor);
    settleRoadCondition(roads, state.constructions, state.trails, traffic, entrances, from, day);
  }
}

/**
 * Klíč rozložení plotů (obydlí s pozemky, hřbitovy, ohrady – části `walkLayoutKey`) – čáry tras
 * s odstupem od plotů (`routeLine`) se v mezipaměti ověřují i jím, ne jen sadou tras.
 */
export function fenceLayoutKey(state: VillageState): string {
  const k = walkLayoutParts(state);
  return JSON.stringify([k.dwellings, k.cemeteries, k.pens]);
}

/**
 * Neprůchodná plocha hotových staveb ve vsi (paths.md – Stavba přes cestu): pozemek, ohrada,
 * hřbitov, okrsek svatyně, dům – buňky mřížky chodců bez cesty (`Infinity`), kde terén sám
 * průchodný je; branka plot neuzavírá. Bez vsi null. Staví mřížku sítě pěšin (jednou za měsíc).
 */
export function villageBlockedAt(
  state: VillageState,
  day: number,
  landscape: Landscape,
): ((x: number, z: number) => boolean) | null {
  // neprůchodné dělají jen stavby, ploty a úpravy terénu (`villageGrid`) – klíč jsou jen ony (části
  // `walkLayoutKey` a zemní práce vozových cest), ne pole, sady, les, cesty ani stáda: ty chůzi jen
  // zdraží a mění se skoro každý měsíc. Okno mřížky leží na mřížce krajiny (`pathWindowFor`), takže
  // větší okno buňky staveb neposune
  const k = walkLayoutParts(state);
  const key = JSON.stringify([
    k.dwellings,
    k.sites,
    k.cemeteries,
    k.sacred,
    k.pens,
    k.kilns,
    k.floors,
    state.roads?.earthworks ?? [],
  ]);
  const last = lastBlocked.get(landscape);
  if (last?.key === key) return last.blocked;
  const blocked = computeBlockedAt(state, day, landscape);
  lastBlocked.set(landscape, { key, blocked });
  return blocked;
}

/** Poslední neprůchodná plocha vsi pro krajinu a otisk rozložení (jedna ves na krajinu). */
const lastBlocked = new WeakMap<
  Landscape,
  { key: string; blocked: ((x: number, z: number) => boolean) | null }
>();

function computeBlockedAt(
  state: VillageState,
  day: number,
  landscape: Landscape,
): ((x: number, z: number) => boolean) | null {
  const village = pathVillageOf(state, day, landscape);
  const bounds = villagePathBounds(village, landscape);
  if (!bounds) return null;
  const terrain = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  // pole, sady, les a cesty jen mění cenu průchodných buněk – bez nich táž neprůchodná plocha
  const fenced: PathVillage = { ...village, fields: [], orchards: [], woods: [], roads: [] };
  const grid = villageGrid({ village: fenced, terrain }, villageBuildings(village).all);
  return (x, z) => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return false;
    const c = j * grid.width + i;
    return !Number.isFinite(grid.base[c]!) && Number.isFinite(terrain.cost[c]!);
  };
}

/**
 * Síť pěšin vsi v den `day` (stejná funkce jako ve scéně). Bez obydlí null. Vrstva překážek
 * přidá kmeny, keře a kameny (bez ní jen terén). Stejný vstup jako minule = táž síť (sdílený
 * objekt – volající ji nemění).
 */
export function villagePathNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  /** Ves pro pěšiny, kterou už volající spočítal ze stejného stavu a dne. */
  village: PathVillage = pathVillageOf(state, day, landscape),
): PathNetwork | null {
  const wear = villageWear(state);
  // vyšlapanost je vstup sítě (slévání tras) – patří do klíče (bez nového kódování)
  const stored = state.roads?.wear;
  // obsazenost domácností, ohrad a jam stálé trasy nemění (`establishedVillage`) – ani klíč
  const input = `${JSON.stringify(establishedVillage(village))}|${stored ? wearRevisionKey(stored) : ''}`;
  const last = lastNetworks.get(landscape);
  if (last && last.obstacles === obstacles && last.input === input) return last.network;
  const network = computeVillageNetwork(state, day, landscape, obstacles, village, wear);
  lastNetworks.set(landscape, { obstacles, input, network });
  return network;
}

/** Vstup sítě vsi – terén s překážkami k poslednímu 1. 11.; bez obydlí null. */
function villageNetworkInput(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: PathVillage,
  wear: ReadonlyMap<number, number> | null,
): PathNetworkInput | null {
  const bounds = villagePathBounds(village, landscape);
  if (!bounds) return null;
  const base = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  const terrain = obstacles
    ? withObstacles(base, obstacles, routeObstacleChanges(state, day))
    : base;
  return {
    village,
    terrain,
    keepRoutes: true,
    ...(wear && wear.size > 0 ? { wear } : {}),
    ...(obstacles ? { tree: (id: number) => obstaclePosition(obstacles, id) } : {}),
  };
}

function computeVillageNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: PathVillage,
  wear: ReadonlyMap<number, number> | null,
): PathNetwork | null {
  const input = villageNetworkInput(state, day, landscape, obstacles, village, wear);
  // stálé trasy posledního kola se ukládají do stavu (`refreshWalkDistances`, `withRoutes`)
  return input ? computeStableNetwork(input) : null;
}

/**
 * Klíč mapy tras (paths.md – Stálé trasy, pravidlo 5): krajina je dána, mění ho jen to, co mění
 * ceny buněk pro chůzi a vůz – obydlí a staveniště (poloha, natočení, druh, pozemek), díly polí
 * (políčka – bez stadia), sady, hřbitovy, posvátná místa, ohrady, les vsi, milíře, humna, pevné
 * cesty (osa, druh, stupeň, mokřina – olemování je jejich součást; ne stav kusů, provoz ani opuštění),
 * zemní práce (profil, brody, hotové úseky – ne průběh), otevřené obilné jámy (stálý cíl) a pařezy
 * k poslednímu 1. 11.; paseka rozestavěného pole v lese až s dohořením pole (`routeTreesKey`).
 * Neobsahuje stadia dílů, lidi, stáří spojení, stáda, práci dne ani den. Vrací rovnou otisk
 * (`walkLayoutHash` proudu klíče, 16 šestnáctkových číslic).
 */
export function routeMapKey(state: VillageState, day: number): string {
  const k = walkLayoutParts(state);
  // proud otisku: text + 0x1f, seznam = jeho texty + 0x1e (oddělovače mimo text klíče – různé
  // klíče dají různé proudy); stejný proud jako včera dá stejný otisk bez počítání po znacích
  // (porovnání řetězců je rychlé)
  const list = (items: readonly string[]): string =>
    items.length > 0 ? `${items.join('\x1f')}\x1f\x1e` : '\x1e';
  const text = (value: string): string => `${value}\x1f`;
  const stream =
    list(k.dwellings) +
    list(k.sites) +
    list(k.parts) +
    list(k.orchards) +
    list(k.cemeteries) +
    text(k.sacred) +
    text(k.roads ?? '-') +
    list(k.pens) +
    list(k.woods) +
    text(k.kilns ?? '-') +
    text(k.floors ?? '-') +
    text(earthworksKey(state)) +
    list((state.grainPits ?? []).map((p) => `${p.id}:${p.x},${p.z}`)) +
    text(routeTreesKey(state, day));
  const known = mapKeyDigests.get(stream);
  if (known !== undefined) {
    mapKeyDigests.delete(stream);
    mapKeyDigests.set(stream, known);
    return known;
  }
  const digest = walkLayoutHash(stream);
  if (mapKeyDigests.size >= MAP_KEY_DIGESTS) {
    mapKeyDigests.delete(mapKeyDigests.keys().next().value!);
  }
  mapKeyDigests.set(stream, digest);
  return digest;
}

/**
 * Otisky posledních proudů klíče mapy tras (`routeMapKey`; mapa se mění jen občas – vsi se
 * dopočítávají po dnech). Jen zrychlení – otisk je funkce proudu.
 */
const mapKeyDigests = new Map<string, string>();
const MAP_KEY_DIGESTS = 4;

/**
 * Zemní práce pro klíč mapy: profil, brody, konce úseků a které jsou hotové, zrušení – ne průběh
 * (`manDays`), který se mění každý den stavby a mapu tras nepřepočítává (výkon). Profil se určí se
 * založením zemních prací (`RoadEarthwork.profile` – jen ke čtení, nové zemní práce = nové id),
 * proto v klíči stačí id, počet bodů a konce osy – ne celý profil (u Vlkova 83 % klíče).
 */
function earthworksKey(state: VillageState): string {
  return (state.roads?.earthworks ?? [])
    .map((e) => {
      const a = e.profile[0];
      const b = e.profile[e.profile.length - 1];
      const ends = a && b ? `${a.x},${a.z}>${b.x},${b.z}` : '';
      return `${e.id}:${e.profile.length}@${ends}:${(e.fords ?? []).join(',')}:${e.pieces
        .map((p) => `${p.toM}${p.builtDay === null ? '' : '*'}`)
        .join(',')}:${JSON.stringify(e.bypassed ?? [])}:${e.abandonedDay === undefined ? '' : 'x'}`;
    })
    .join('|');
}

/**
 * Klíč obsazenosti (paths.md – Stálé trasy, pravidlo 5): obydlené domácnosti, ohrady se zvířaty
 * (do prázdné se krmit nechodí) a otevřené obilné jámy. Trasy nehledá – stálé trasy vedou ze všech
 * hotových obydlí ke všem stavbám (`establishedVillage`), změna je jen převáží
 * (`VillageRoutes.placesKey`; Martin 31. 10. 2026).
 */
export function routePlacesKey(state: VillageState): string {
  const occupied = [...new Set(state.people.map((p) => p.dwellingId))].sort((a, b) => a - b);
  const stocked = [...stockedPenIds(state)].sort((a, b) => a - b);
  const open = openGrainPits(state)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  return `${occupied.join(',')}|${stocked.join(',')}|${open.join(',')}`;
}

/** Poslední 1. 11. nejvýš v den `day` – k němu vstupují do mapy tras pařezy a mladé stromy. */
export function routeTreesDay(day: number): number {
  const { year } = dateOfDayIndex(day);
  const november = dayIndexOf({ year, month: 11, day: 1 });
  if (november <= day) return november;
  // před prvním 1. 11. světa – den před jeho začátkem (žádné kácení)
  return dateOfDayIndex(0).year === year ? -1 : dayIndexOf({ year: year - 1, month: 11, day: 1 });
}

/**
 * Stav vsi pro mapu tras – kácení jen do posledního 1. 11. (`routeTreesDay`), paseka
 * rozestavěného pole v lese jako les (`clearingRouteObstacles`).
 */
function treesAtCut(state: VillageState, cut: number): VillageState {
  const own = withoutHiddenChanges(state, clearingRouteObstacles(state));
  const felled = own.felledTrees?.filter((f) => f.day <= cut);
  const neighbours = state.neighbours;
  return {
    ...own,
    ...(felled ? { felledTrees: felled } : {}),
    ...(neighbours?.felled
      ? { neighbours: { ...neighbours, felled: neighbours.felled.filter((f) => f.day <= cut) } }
      : {}),
  };
}

/**
 * Změny překážek pro mapu tras (paths.md – Stálé trasy, pravidlo 5): pokácené stromy a mladé
 * stromy k poslednímu 1. 11. – mapa se s kácením nemění den po dni; paseka pole v lese zůstane
 * lesem, dokud pole celé nedohoří (forest.md – Klučení lesa pro pole – trasy).
 */
export function routeObstacleChanges(state: VillageState, day: number): ObstacleChanges {
  const cut = routeTreesDay(day);
  return obstacleChangesAt(treesAtCut(state, cut), cut);
}

/**
 * Část klíče mapy za překážky: kácení do posledního 1. 11. a změny bez dne (počty) – bez paseky
 * rozestavěného pole v lese (`clearingRouteObstacles`), takže se klíč změní až s dohořením pole.
 */
function routeTreesKey(state: VillageState, day: number): string {
  const cut = routeTreesDay(day);
  const own = withoutHiddenChanges(state, clearingRouteObstacles(state));
  const felled = [...(own.felledTrees ?? []), ...(state.neighbours?.felled ?? [])].filter(
    (f) => f.day <= cut,
  ).length;
  const cleared = (own.clearedObstacles ?? []).length + (state.neighbours?.cleared ?? []).length;
  // stromy u cest jsou součást cesty (Martin 31. 10. 2026) – jejich sázení mapu nemění
  return `${felled > 0 ? cut : ''}:${felled}:${cleared}:${state.roads?.swath?.length ?? 0}`;
}

/** Části klíče mapy tras (`routeMapKey`) – stavby a ploty bere i neprůchodná plocha vsi. */
interface WalkLayoutParts {
  dwellings: string[];
  sites: string[];
  parts: string[];
  orchards: string[];
  cemeteries: string[];
  sacred: string;
  roads: string | null;
  pens: string[];
  woods: string[];
  kilns: string | null;
  floors: string | null;
}

function walkLayoutParts(state: VillageState): WalkLayoutParts {
  const at = (p: Position): string => `${p.x},${p.z},${p.rotation}`;
  const dwellings = state.dwellings.map(
    (d) =>
      `${d.id}:${d.type}${d.workshop ? `/${d.workshop.craft}` : ''}:${at(d.position)}:${d.plot ? `${d.plot.cell.x},${d.plot.cell.y}${d.plot.yard ? `+${d.plot.yard.x},${d.plot.yard.y}` : ''}${d.plot.square ? `@${d.plot.square.x},${d.plot.square.z},${d.plot.square.rotation}` : ''}` : ''}${d.plainShape ? ':plain' : ''}`,
  );
  const sites = state.constructions.flatMap((c) =>
    c.position !== null && (c.kind === 'dwelling' || c.kind === 'idol' || c.kind === 'shrine')
      ? [
          `${c.id}:${c.kind}${c.craft ? `/${c.craft}` : ''}:${at(c.position)}${c.plainShape ? ':plain' : ''}`,
        ]
      : [],
  );
  // natočená pole, sady a les z nich nesou mřížku (fields.md – Natočené stavby) – klíč starých
  // vsí se nemění
  const grids = fieldGrids(state);
  const turned = (grid: SquareGrid | undefined): string => (grid ? `@${gridKey(grid)}` : '');
  const parts = state.parts.map(
    (p) => `${p.id}:${p.cell ? `${p.cell.x},${p.cell.y}${turned(grids.get(p.fieldId))}` : ''}`,
  );
  // `surface` se po založení lesa nemění (povrch dílu při založení) – do klíče nepatří
  const woods = villageWoods(state).map((w) => `${w.cell.x},${w.cell.y}${turned(w.grid)}`);
  const orchards = villageOrchards(state).map(
    (o) => `${o.id}${turned(o.grid)}:${o.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  // zakládaný hřbitov a rozšíření ve stavbě – branka se počítá z hotových čtverců (paths.md –
  // Vchody); u hotového hřbitova klíč beze změny
  const cemeteries = villageCemeteries(state).map(
    (c) =>
      `${c.id}${turned(c.grid)}:${c.squares.map((s) => `${s.cell.x},${s.cell.y}${s.constructionId === undefined ? '' : 'p'}`).join(';')}${c.builtDay === null ? ':-' : ''}`,
  );
  const sacred = [
    (state.sacredOaks ?? []).map((o) => o.id).join(','),
    (state.groves ?? []).map((g) => g.id).join(','),
    (state.sacredBuildings ?? []).map((b) => b.id).join(','),
  ].join('|');
  const roads = state.roads?.roads ?? [];
  const pens = villagePens(state).map(
    (p) =>
      `${p.id}:${penCells(p)
        .map((c) => `${c.x},${c.y}`)
        .join(';')}${turned(p.grid)}:${p.builtDay === null ? 0 : 1}`,
  );
  const kilns = villageKilnPoints(state);
  const floors = (state.threshingFloors ?? []).map((f) => ({
    id: f.id,
    position: f.position,
    built: f.builtDay !== null,
  }));
  return {
    dwellings,
    sites,
    parts,
    orchards,
    cemeteries,
    sacred,
    roads: roads.length > 0 ? roadsKey(roads) : null,
    pens,
    woods,
    kilns: kilns.length > 0 ? kilnsKey(kilns) : null,
    floors: floors.length > 0 ? threshingFloorsKey(floors) : null,
  };
}

/**
 * Středy milířů uhlířů vsi (crafts.md – Milíř u skácených buků) – samostatné stavby; milíř bez
 * polohy (ves bez vrstvy překážek) se nepočítá.
 */
export function villageKilnPoints(
  state: Pick<VillageState, 'dwellings'>,
): { x: number; z: number; burnerId: number }[] {
  return state.dwellings.flatMap((d) =>
    workshopKilns(d.workshop).flatMap((k) =>
      k.site ? [{ x: k.site.x, z: k.site.z, burnerId: d.id }] : [],
    ),
  );
}

/**
 * Otisk klíče (mapa tras a místa – `VillageState.walkLayoutKey`, pastvina, místa práce) – ve
 * stavu vsi se drží jen on (16 šestnáctkových číslic, dvě nezávislé 32bitové FNV-1a), ne celý klíč
 * (u Vlkova 37 kB). Shoda otisků = shoda klíčů (náhodná shoda 1 : 2^64).
 */
export function walkLayoutHash(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
function dwellingOrigins(state: VillageState): Position[] {
  return [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null ? [c.position] : [],
    ),
  ];
}

/**
 * Vzdálenosti chůze z obydlí vsi k bodům `targets` (m, paths.md – Pěšiny a práce) – stejná síť
 * a stejné měření jako u dílů pole: po pěšinách a pevných cestách podle stupně, rovně s mokřinou
 * a brody (`walking.ts`). Bez sítě (ves bez obydlí) null. Seč přirozených luk (hay.ts –
 * `planMowing`) podle ní řadí louky.
 */
export function walkDistancesTo(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  targets: readonly PathPoint[],
): number[] | null {
  const village = pathVillageOf(state, day, landscape);
  const network = villagePathNetwork(state, day, landscape, obstacles, village);
  if (!network) return null;
  const ground = withFieldWalk(walkGroundOf(landscape), village.fields);
  const lines = villageRouteLines(state, network.traffic.cellM);
  const graph = walkGraph(lines, { roads: state.roads?.roads ?? [], ground });
  return walkingDistances(graph, dwellingOrigins(state), targets, ground).map(
    (walk) => Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING,
  );
}

/**
 * Verze tras a měření chůze v otisku – po změně toho, jak se trasy hledají (stálé trasy a práce
 * dne nad nimi – paths.md, Stálé trasy), po přidání nové vzdálenosti (voda – `waterWalkM`) nebo
 * rychlosti (stromy u cest – `Road.lined`), po změně tvaru domů a po odstupu od plotů (paths.md –
 * Odstup od plotu, `routes-v5`), po dvoru dílny (pěšina obejde pec a jámu – `routes-v6`) a po
 * trasách ze všech staveb bez ohledu na obsazenost a olemování podle míst na stromy (`routes-v7` –
 * Martin 31. 10. 2026), po odhadu chůze s lesem a objížďkou přes brod (`routes-v8` – paths.md,
 * Odhad vzdáleností), po zrušení tras k práci dne (`routes-v9` – Stálé trasy, pravidlo 5) a po
 * napojení chůze na síť jen v nejbližším bodě každé pěšiny (`routes-v10` – Odhad vzdáleností) a po humnu a milíři jako stálých cílech tras (`routes-v11` – Stálé trasy, pravidlo 5) a po chůzi rovně po celých buňkách (`routes-v12` – Odhad vzdáleností) se vsi uložené dřív přepočítají hned při dalším dni, ne až při změně mapy
 * (jednou – pak otisk sedí).
 */
export const WALK_VERSION = 'routes-v12';

/**
 * Trasy vsi pro otisk `key` (paths.md – Stálé trasy, pravidlo 5): jen stálé trasy ze sítě bez
 * práce dne – trasy k práci dne se nehledají (Martin 31. 10. 2026).
 */
function routesOf(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  network: PathNetwork | null,
  key: string,
): VillageRoutes {
  // trasy ze všech hotových obydlí ke všem stavbám, cesty za den podle dnešní obsazenosti
  const found = network ? storedRoutes(network) : [];
  const list = found.length > 0 ? reweighedList(state, day, landscape, obstacles, found) : found;
  return {
    day,
    key,
    list,
    placesKey: walkLayoutHash(routePlacesKey(state)),
  };
}

/**
 * Převáží uložené stálé trasy podle dnešních lidí, stád, obsazenosti a stáří spojení (paths.md –
 * Stálé trasy, pravidlo 5) – buňky tras se nemění, nic se nehledá. Trasa z prázdného obydlí,
 * k prázdné ohradě nebo zavřené jámě dostane 0 cest (a do vyšlapanosti nic nepřidá). Vrátí týž
 * seznam, když se nic nezměnilo.
 */
function reweighRoutes(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  list: StoredRoute[],
): StoredRoute[] {
  // týž seznam týž den a s toutéž obsazeností už převážený (opakovaný přepočet dne – oprava
  // a přestavba cest)
  const mark = `${day}|${state.walkLayoutKey}|${routePlacesKey(state)}`;
  if (WEIGHED.get(list) === mark) return list;
  const next = reweighedList(state, day, landscape, obstacles, list);
  WEIGHED.set(next, mark);
  return next;
}

/**
 * Seznamy tras, které už byly v den a pro otisk převážené – jen zrychlení: převážení je čistá
 * funkce stavu a dne, druhé týž den by dalo týž seznam.
 */
const WEIGHED = new WeakMap<StoredRoute[], string>();

function reweighedList(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  list: StoredRoute[],
): StoredRoute[] {
  const village = pathVillageOf(state, day, landscape);
  // mřížka (jen průchodnost – brány a cíle) z dřívějšího převážení téže mapy tras – buňky se
  // znovu nestaví (paths.md – Stálé trasy, pravidlo 5: převážení po trasách)
  const key = `${state.walkLayoutKey}`;
  const known = WEIGHT_GRIDS.get(landscape);
  const cached = known && known.key === key && known.obstacles === obstacles ? known : null;
  const input = cached
    ? { village, terrain: cached.terrain }
    : villageNetworkInput(state, day, landscape, obstacles, village, null);
  if (!input) return list;
  const { weights, grid } = stableRouteWeights(input, cached?.grid ?? null);
  if (!cached) WEIGHT_GRIDS.set(landscape, { key, obstacles, terrain: input.terrain, grid });
  let changed = false;
  const next = list.map((route) => {
    const w = weights.get(`${route.from}>${route.to}`);
    const trips = w ? Math.round(w.trips * (route.scale ?? 1) * 100) : 0;
    const base = w ? Math.min(trips, Math.round(w.base * 100)) : 0;
    if (trips === route.trips && base === (route.base ?? 0)) return route;
    changed = true;
    const next: StoredRoute = { ...route, trips };
    if (base > 0) next.base = base;
    else delete next.base;
    return next;
  });
  return changed ? next : list;
}

/**
 * Mřížka posledního převážení pro krajinu (jedna ves na krajinu – jako `lastBlocked`): otisk mapy
 * tras (`walkLayoutKey` – i s verzí tras), vrstva překážek, terén okna a mřížka. Jen zrychlení –
 * průchodnost je funkce mapy tras, takže převážení dá s ní i bez ní totéž.
 */
const WEIGHT_GRIDS = new WeakMap<
  Landscape,
  {
    key: string;
    obstacles: ObstacleLayer | null;
    terrain: PathNetworkInput['terrain'];
    grid: ReturnType<typeof stableRouteWeights>['grid'];
  }
>();

/**
 * Vzdálenosti chůze po pěšinách a pevných cestách (mutuje stav – paths.md, roads.md – Rychlejší
 * chůze): díly pole (`FieldPart.walkDistanceM`) a čtverce sadů (`OrchardSquare.walkDistanceM`)
 * z nejbližšího obydlí, palivo z obydlí k nejbližšímu okraji lesa (`Dwelling.forestWalkM`) a voda
 * z obydlí k nejbližší vodě (`Dwelling.waterWalkM` – `waterWalkDistance`). S nimi trasy vsi
 * (`VillageState.routes` – paths.md, Stálé trasy, pravidlo 5):
 *
 * - stálé trasy a vzdálenosti chůze se přepočítají, jen když se změní mapa tras (`routeMapKey` –
 *   stavby a pole od postavení po zánik, pevné cesty, pařezy k 1. 11.); obsazenost domácností,
 *   ohrad a jam ani stadia dílů nic nehledají (Martin 31. 10. 2026);
 * - jiná obsazenost (`routePlacesKey`) stálé trasy hned převáží (`reweighRoutes`) – nic se nehledá;
 * - 1. dne v měsíci se stálé trasy převáží (lidé, stáda, stáří spojení – `reweighRoutes`);
 * - trasy k práci dne a na pastvu se nehledají – pěšiny ke kácení, na paseku, louky a pastvu
 *   vznikají jen ze stálých tras (Martin 31. 10. 2026: „ano“).
 *
 * Olemování pevných cest se určí s postavením nebo vylepšením cesty (`lineRoads`). Ve stavu jen
 * otisky (`walkLayoutHash`). Chůze rovně počítá mokřinu a brody (`walkGroundOf`). Dny přepočtu
 * určuje stav, ne kousky dopočtu.
 */
export function refreshWalkDistances(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  const routes = state.routes;
  // měsíční převážení 1. dne v měsíci
  const monthly = dateOfDayIndex(day).day === 1;
  lineRoads(state);
  const key = walkLayoutHash(`${routeMapKey(state, day)}|${WALK_VERSION}`);
  if (state.walkLayoutKey === key && routes?.key === key) {
    // obsazenost (nastěhování, vyhnání stáda, otevřená jáma) jen převáží – nic se nehledá
    const placesKey = walkLayoutHash(routePlacesKey(state));
    const moved = routes.placesKey !== placesKey;
    if (!monthly && !moved) return;
    // vyšlapanost do dneška ještě s dosavadními trasami a vahami (paths.md)
    settleVillageWear(state, day, landscape);
    const list = reweighRoutes(state, day, landscape, obstacles, routes.list);
    if (list !== routes.list || moved) state.routes = { ...routes, list, placesKey };
    return;
  }
  state.walkLayoutKey = key;
  // vyšlapanost do dneška ještě se starými trasami – nové trasy se po ní slévají (paths.md)
  settleVillageWear(state, day, landscape);
  const village = pathVillageOf(state, day, landscape);
  const network = villagePathNetwork(state, day, landscape, obstacles, village);
  state.routes = routesOf(state, day, landscape, obstacles, network, key);
  if (!network) {
    for (const p of state.parts) delete p.walkDistanceM;
    for (const o of villageOrchards(state)) for (const s of o.squares) delete s.walkDistanceM;
    for (const d of state.dwellings) {
      delete d.forestWalkM;
      delete d.waterWalkM;
    }
    return;
  }
  const ground = withFieldWalk(walkGroundOf(landscape), village.fields);
  // pěšiny ze stálých tras se silou z vyšlapanosti – tentýž zdroj jako scéna (paths.md – Pěšiny
  // a práce, Stálé trasy, pravidlo 5)
  const lines = villageRouteLines(state, network.traffic.cellM);
  const graph = walkGraph(lines, { roads: state.roads?.roads ?? [], ground });
  const origins = dwellingOrigins(state);
  const rounded = (walk: number): number => Math.floor(walk * WALK_ROUNDING) / WALK_ROUNDING;
  const parts = state.parts.filter((p) => p.cell !== undefined);
  const grids = fieldGrids(state);
  const orchards = villageOrchards(state);
  const squares = orchards.flatMap((o) => o.squares);
  // středy čtverců – natočená pole a sady ve své mřížce (fields.md – Natočené stavby)
  const targets = [
    ...parts.map((p) => squareCenter(landscape, grids.get(p.fieldId), p.cell!)),
    ...orchards.flatMap((o) => o.squares.map((s) => squareCenter(landscape, o.grid, s.cell))),
  ];
  // délky rovně z paměti krajiny – úsečky se mezi přepočty opakují (Trasy v paměti)
  const memo = walkMemoOf(landscape);
  const walks = targets.length > 0 ? walkingDistances(graph, origins, targets, ground, memo) : [];
  parts.forEach((p, k) => {
    p.walkDistanceM = rounded(walks[k]!);
  });
  squares.forEach((s, k) => {
    s.walkDistanceM = rounded(walks[parts.length + k]!);
  });
  // palivo: z každého obydlí k nejbližšímu okraji lesa (vzdušnou čarou) chůzí; voda: k nejbližší
  // vodě (paths.md – Pochůzky pro vodu) – přirážka denního minima (population.md – Práce)
  const walk: Walk = (from, to) => walkingDistances(graph, [from], to, ground, memo);
  const edges = groundSpots(ground, PATH_FOREST_EDGE);
  for (const d of state.dwellings) {
    const edge = nearestSpot(edges, d.position);
    if (edge) d.forestWalkM = rounded(walk(d.position, [edge])[0]!);
    else delete d.forestWalkM;
    const water = waterWalkDistance(ground, walk, d.position);
    if (water !== null) d.waterWalkM = rounded(water);
    else delete d.waterWalkM;
  }
}

/**
 * Ves uložená před stálými trasami nese otisk stadií dílů `walkStages` – smaže se (paths.md –
 * Stálé trasy, pravidlo 5); jinak týž stav (jednou a idempotentně).
 */
export function withoutWalkStages(state: VillageState): VillageState {
  if (!('walkStages' in state)) return state;
  const next = { ...state } as VillageState & { walkStages?: unknown };
  delete next.walkStages;
  return next;
}

/**
 * Trasy staré vsi (paths.md – Kdy se trasy počítají a co se ukládá): chybí-li `routes`, nebo
 * platí pro jiný otisk než `walkLayoutKey`, spočítá je při načtení – síť dne `lastDay` bez posunu
 * dne a bez přepočtu chůze (scéna tak trasy má, i když se ves jen zobrazuje). Jinak vrátí týž stav
 * (jednou a idempotentně). Trasy uložené před stálými trasami (jiná `WALK_VERSION` v otisku)
 * přepočítá první den dopočtu (`refreshWalkDistances`) i se vzdálenostmi chůze. Ves bez přepočtu
 * chůze (simulace bez krajiny) nechá být – trasy dostane s prvním přepočtem.
 */
export function withRoutes(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const key = state.walkLayoutKey;
  if (key === undefined || state.routes?.key === key) return state;
  const day = Math.max(0, state.lastDay);
  const village = pathVillageOf(state, day, landscape);
  const network = villagePathNetwork(state, day, landscape, obstacles, village);
  return { ...state, routes: routesOf(state, day, landscape, obstacles, network, key) };
}
