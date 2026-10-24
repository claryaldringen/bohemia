import { dateOfDayIndex } from '../../calendar';
import { stockedPenIds } from '../abandonment';
import { workshopKilns } from '../charcoal';
import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../../landscape';
import { villageCemeteries } from '../cemetery';
import { fieldPartLooks } from '../field-progress';
import { openGrainPits } from '../grain-pits';
import { HAY_WINTER_MONTHS } from '../hay';
import { grazingDemandHa, villageHerds } from '../livestock';
import { obstacleChangesAt } from '../obstacles';
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
  TileCell,
  VillageState,
} from '../types';
import { villageWoods } from '../woods';
import { earthworkSpansOf } from './earthworks';
import {
  computePathNetwork,
  kilnsKey,
  threshingFloorsKey,
  liningKey,
  pathAgeFactor,
  pastureHerds,
  pathPlotOf,
  villagePathBounds,
  roadsKey,
  type PathLine,
  type PathNetwork,
  type PathPlot,
  type PathPoint,
  type PathSquare,
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
  waterWalkDistance,
  withFieldWalk,
  type Walk,
} from './walking';
import { lineRoads } from './road-lining';
import { roadAnchors } from './road-anchors';
import { settleRoadCondition } from './road-condition';
import { routePaths } from './route-paths';
import { villageGrid } from './network-grid';
import { villageBuildings } from './network-search';
import { storedRoutes } from './routes';
import { partWalkSpeed, roadTreeSpeed } from './walk-speed';
import { accrueVisits, settleWear, trafficField, wearMap, wearRevisionKey } from './wear';

// Pěšiny ze stavu vsi (paths.md – Pěšiny a práce): server skládá ves pro pěšiny stejně jako
// scéna (village-view.ts – SceneVillage), spočítá stejnou síť a z ní vzdálenosti chůze dílů
// pole. Přepočítá se, jen když se změní rozložení vsi (stavby, pole, stadia dílů, obyvatelé
// obydlí, stáří spojení) – den po dni v simulaci, takže výsledek nezávisí na tom, po jakých
// kouscích se ves dopočítá.

const DAYS_PER_YEAR = 365.25;
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
  // vzhled dílů jako ve scéně – podle něj se chodí přes pole (v osevu, strniště – walk-speed.ts)
  const looks = state.parts.length > 0 ? fieldPartLooks(state, day) : null;
  const fields = state.fields.map((f) => ({
    id: f.id,
    parts: state.parts.flatMap((p) => {
      if (p.fieldId !== f.id || p.cell === undefined) return [];
      const view = looks?.get(p.id);
      return [
        {
          ...square(landscape, p.cell, f.grid),
          partId: p.id,
          stage: partStage(p, day),
          ...(view
            ? {
                look: view.look,
                ...(view.work !== undefined ? { work: view.work } : {}),
                ...(view.before ? { before: view.before } : {}),
              }
            : {}),
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
  const changes = obstacleChangesAt(state, day);
  const roads = state.roads?.roads ?? [];
  // přirozené louky letošní seče (oxen.md – Seno) – k políčkům, kde se dnes seče, vede pěšina
  const kilns = villageKilnPoints(state);
  const hayMeadows = (state.hay?.mowing?.squares ?? []).flatMap((sq) =>
    sq.cell ? [square(landscape, sq.cell)] : [],
  );
  // do ohrady bez zvířat se krmit nechodí (abandonment.md)
  const stocked = stockedPenIds(state);
  const openPits = openGrainPits(state);
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
    // otevřené obilné jámy (production-chains.md – Obilné jámy) – ves bez nich beze změny
    ...(openPits.length > 0
      ? { grainPits: openPits.map((p) => ({ id: p.id, x: p.x, z: p.z })) }
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

/** Čáry pěšin vsi z uložených tras se silou z vyšlapanosti (`routePaths`) – pro chůzi. */
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
  const field = trafficField(routes, pathCellM(landscape));
  const from = wear.day;
  settleWear(wear, field, from, day);
  // stav cest po týchž intervalech (paths.md – Zarůstání)
  const roads = state.roads!;
  if (roads.roads.length > 0) {
    const entrances = roadAnchors(routes.list, landscape).points.filter(
      (a) => a.kind === 'entrance',
    );
    settleRoadCondition(roads, state.constructions, state.trails, field, entrances, from, day);
  }
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
  const k = walkLayoutParts(state, day);
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
  const input = `${JSON.stringify(village)}|${stored ? wearRevisionKey(stored) : ''}`;
  const last = lastNetworks.get(landscape);
  if (last && last.obstacles === obstacles && last.input === input) return last.network;
  const network = computeVillageNetwork(state, day, landscape, obstacles, village, wear);
  lastNetworks.set(landscape, { obstacles, input, network });
  return network;
}

function computeVillageNetwork(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  village: PathVillage,
  wear: ReadonlyMap<number, number> | null,
): PathNetwork | null {
  const bounds = villagePathBounds(village, landscape);
  if (!bounds) return null;
  const base = pathTerrainOf(landscape, pathWindowFor(landscape, bounds));
  const terrain = obstacles ? withObstacles(base, obstacles, obstacleChangesAt(state, day)) : base;
  // trasy posledního kola se ukládají do stavu (`refreshWalkDistances`, `withRoutes`)
  return computePathNetwork({
    village,
    terrain,
    keepRoutes: true,
    ...(wear && wear.size > 0 ? { wear } : {}),
    ...(obstacles ? { tree: (id: number) => obstaclePosition(obstacles, id) } : {}),
  });
}

/**
 * Klíč rozložení vsi pro vzdálenosti chůze: obydlí a staveniště (poloha, pozemek, obyvatelé,
 * stáří spojení po desetinách), díly polí (políčka – bez stadia), sady, hřbitovy, posvátná místa,
 * pevné cesty, ohrady, les vsi a počet stád na pastvě. Práce dne ani pokácené stromy v něm nejsou
 * – síť se kvůli nim každý den nepřepočítává. Stadia dílů a pastva úhoru jsou zvlášť
 * (`walkStageKey`) – promítají se nejvýš jednou za měsíc (Martin, 18. 10. 2026).
 */
export function walkLayoutKey(state: VillageState, day: number): string {
  const k = walkLayoutParts(state, day);
  return JSON.stringify([
    k.dwellings,
    k.sites,
    k.parts,
    k.orchards,
    k.cemeteries,
    k.sacred,
    // bez pevných cest, ohrad a stád prázdné – klíč starších vsí zůstane stejný
    ...(k.roads !== null ? [k.roads] : []),
    ...(k.pens.length > 0 ? [k.pens] : []),
    ...(k.herds > 0 ? [k.herds] : []),
    ...(k.woods.length > 0 ? [k.woods] : []),
    // milíře uhlířů (crafts.md – Milíř u skácených buků) – bez nich klíč beze změny
    ...(k.kilns !== null ? [k.kilns] : []),
    // humna (production-chains.md – Humno) – bez nich klíč beze změny
    ...(k.floors !== null ? [k.floors] : []),
  ]);
}

/** Části klíče rozložení (`walkLayoutKey`) – stavby a ploty bere i neprůchodná plocha vsi. */
interface WalkLayoutParts {
  dwellings: string[];
  sites: string[];
  parts: string[];
  orchards: string[];
  cemeteries: string[];
  sacred: string;
  roads: string | null;
  pens: string[];
  herds: number;
  woods: string[];
  kilns: string | null;
  floors: string | null;
}

function walkLayoutParts(state: VillageState, day: number): WalkLayoutParts {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const age = (since: number): number =>
    Math.round(pathAgeFactor((day - since) / DAYS_PER_YEAR) * 10);
  const at = (p: Position): string => `${p.x},${p.z},${p.rotation}`;
  const dwellings = state.dwellings.map(
    (d) =>
      `${d.id}:${d.type}${d.workshop ? `/${d.workshop.craft}` : ''}:${at(d.position)}:${d.plot ? `${d.plot.cell.x},${d.plot.cell.y}${d.plot.yard ? `+${d.plot.yard.x},${d.plot.yard.y}` : ''}${d.plot.square ? `@${d.plot.square.x},${d.plot.square.z},${d.plot.square.rotation}` : ''}` : ''}:${occupied.has(d.id) ? 1 : 0}:${age(d.builtDay)}${d.plainShape ? ':plain' : ''}`,
  );
  const sites = state.constructions.flatMap((c) =>
    c.position !== null && (c.kind === 'dwelling' || c.kind === 'idol' || c.kind === 'shrine')
      ? [
          `${c.id}:${c.kind}${c.craft ? `/${c.craft}` : ''}:${at(c.position)}:${age(c.startedDay)}${c.plainShape ? ':plain' : ''}`,
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
  const stocked = stockedPenIds(state);
  const pens = villagePens(state).map(
    (p) =>
      `${p.id}:${penCells(p)
        .map((c) => `${c.x},${c.y}`)
        .join(
          ';',
        )}${turned(p.grid)}:${p.builtDay === null ? 0 : 1}${p.builtDay !== null && !stocked.has(p.id) ? ':-' : ''}`,
  );
  const herds = state.livestock ? pastureHerds(pastureLivestock(state, day)) : 0;
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
    herds,
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
): { x: number; z: number }[] {
  return state.dwellings.flatMap((d) =>
    workshopKilns(d.workshop).flatMap((k) => (k.site ? [{ x: k.site.x, z: k.site.z }] : [])),
  );
}

/**
 * Stadia dílů pole pro vzdálenosti chůze (paths.md, fields.md – Vzdálenost): stadium, rychlost
 * chůze přes díl (v osevu, strniště – `partWalkSpeed` ze vzhledu dílu) a jestli se na úhoru pase;
 * k nim olemování pevných cest stromy (`Road.lined` – roads.md, Stromy u cesty zrychlí chůzi;
 * bez stromů u cest nic). Osev a zakládání postupují po dílech den po dni, stromy u cest rostou
 * a odumírají – síť by se jinak přepočítávala každých pár dní; do klíče chůze se proto promítají
 * jen 1. dne v měsíci (`refreshWalkDistances`).
 */
export function walkStageKey(state: VillageState, day: number): string {
  const grazed = pastureGrazedParts(state, day);
  const looks = state.parts.length > 0 ? fieldPartLooks(state, day) : null;
  const lining = liningKey(state.roads?.roads);
  const parts = state.parts
    .map((p) => {
      const stage = partStage(p, day);
      const view = looks?.get(p.id);
      const speed = partWalkSpeed({
        stage,
        ...(view ? { look: view.look } : {}),
        ...(view?.work !== undefined ? { work: view.work } : {}),
        ...(view?.before ? { before: view.before } : {}),
      });
      return `${p.id}:${stage}/${speed}${isGrazeableFallow(p) && !grazed.has(p.id) ? ':-' : ''}`;
    })
    .join(';');
  return lining ? `${parts}|${lining}` : parts;
}

/**
 * Otisk klíče rozložení (`walkLayoutKey`) – ve stavu vsi se drží jen on (16 šestnáctkových
 * číslic, dvě nezávislé 32bitové FNV-1a), ne celý klíč (u Vlkova 37 kB). Shoda otisků = shoda
 * klíčů (náhodná shoda 1 : 2^64).
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
 * Verze měření chůze v otisku rozložení – po přidání nové vzdálenosti (voda – `waterWalkM`) nebo
 * rychlosti (stromy u cest – `Road.lined`) a po změně tvaru domů (varianty rozměrů – population.md)
 * se vsi uložené dřív přepočítají hned při dalším dni, ne až při změně rozložení.
 */
export const WALK_VERSION = 'routes-v2';

/**
 * Vzdálenosti chůze po pěšinách a pevných cestách (mutuje stav – paths.md, roads.md – Rychlejší
 * chůze): díly pole (`FieldPart.walkDistanceM`) a čtverce sadů (`OrchardSquare.walkDistanceM`)
 * z nejbližšího obydlí, palivo z obydlí k nejbližšímu okraji lesa (`Dwelling.forestWalkM`) a voda
 * z obydlí k nejbližší vodě (`Dwelling.waterWalkM` – `waterWalkDistance`). Přepočítá je, jen když
 * se od posledního výpočtu změnilo rozložení vsi (`walkLayoutKey` – i pevné cesty a jejich stupeň,
 * takže i po dokončení vylepšení) nebo stadia dílů (`walkStageKey`), ta ale jen 1. dne v měsíci
 * (Martin – chůze se přepočítává měsíčně; otisk stadií z posledního 1. dne je ve stavu
 * `walkStages`, ve stavu jen otisky `walkLayoutHash`) – stejně olemování pevných cest stromy
 * (`lineRoads`, roads.md – Stromy u cesty zrychlí chůzi). Chůze rovně počítá mokřinu a brody
 * (`walkGroundOf`) – pole za potokem bez cesty zdraží, s hatí a lávkou zlevní. S přepočtem uloží
 * trasy sítě (`VillageState.routes` – paths.md, Kdy se trasy počítají a co se ukládá).
 */
export function refreshWalkDistances(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): void {
  // stadia dílů a olemování cest stromy jen 1. dne v měsíci (a poprvé) – jinak platí otisk
  // z posledního 1. dne; nový úsek cesty (a cesty starší vsi) dostane olemování hned
  const monthly = state.walkStages === undefined || dateOfDayIndex(day).day === 1;
  lineRoads(state, day, monthly);
  if (monthly) state.walkStages = walkLayoutHash(walkStageKey(state, day));
  const key = walkLayoutHash(`${walkLayoutKey(state, day)}|${state.walkStages}|${WALK_VERSION}`);
  const unchanged = state.walkLayoutKey === key;
  state.walkLayoutKey = key;
  if (unchanged) return;
  // vyšlapanost do dneška ještě se starými trasami – nové trasy se po ní slévají (paths.md)
  settleVillageWear(state, day, landscape);
  const village = pathVillageOf(state, day, landscape);
  const network = villagePathNetwork(state, day, landscape, obstacles, village);
  // trasy pro týž otisk rozložení (paths.md – Kdy se trasy počítají a co se ukládá)
  state.routes = { day, key, list: network ? storedRoutes(network) : [] };
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
  // pěšiny z tras se silou z vyšlapanosti – tentýž zdroj jako scéna (paths.md – Pěšiny a práce)
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
  const walks = targets.length > 0 ? walkingDistances(graph, origins, targets, ground) : [];
  parts.forEach((p, k) => {
    p.walkDistanceM = rounded(walks[k]!);
  });
  squares.forEach((s, k) => {
    s.walkDistanceM = rounded(walks[parts.length + k]!);
  });
  // palivo: z každého obydlí k nejbližšímu okraji lesa (vzdušnou čarou) chůzí; voda: k nejbližší
  // vodě (paths.md – Pochůzky pro vodu) – přirážka denního minima (population.md – Práce)
  const walk: Walk = (from, to) => walkingDistances(graph, [from], to, ground);
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
 * Trasy staré vsi (paths.md – Kdy se trasy počítají a co se ukládá): chybí-li `routes`, nebo
 * platí pro jiný otisk rozložení než `walkLayoutKey`, spočítá je při načtení – síť dne
 * `lastDay` bez posunu dne a bez přepočtu chůze (scéna tak trasy má, i když se ves jen zobrazuje).
 * Jinak vrátí týž stav (jednou a idempotentně). Ves bez přepočtu chůze (simulace bez krajiny)
 * nechá být – trasy dostane s prvním přepočtem.
 */
export function withRoutes(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const key = state.walkLayoutKey;
  if (key === undefined || state.routes?.key === key) return state;
  const day = Math.max(0, state.lastDay);
  const network = villagePathNetwork(state, day, landscape, obstacles);
  return { ...state, routes: { day, key, list: network ? storedRoutes(network) : [] } };
}
