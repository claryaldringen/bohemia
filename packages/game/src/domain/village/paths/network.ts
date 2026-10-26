// Vyšlapané pěšiny (docs/design/paths.md). Čistá deterministická funkce vsi a terénu – počítá ji
// server (cesta na pole po pěšině je rychlejší – fields.md – Vzdálenost) i prohlížeč (vzhled,
// postavy) a musí jim vyjít stejně: jen přesná aritmetika (det-math, hlídá ESLint). Z každé
// domácnosti se chodí pro vodu k potoku, pro dřevo k okraji lesa, na pole, do sadu, ke hřbitovu,
// k posvátným místům a na staveniště – tam, kam ves dnes chodí práce (rozdělení práce dne), plus
// kousek navíc, ať zavedená místa pěšinu mají.
// Trasy hledá Dijkstra na hrubé mřížce (path-terrain.ts + domy, pole a překážky vsi). Provoz se
// sčítá po buňkách, z něj síla pěšiny; pak se trasy hledají znovu se slevou na vyšlapané buňky
// (aktivní chodci) – lidé dají přednost vyšlapané pěšině a trasy se slijí do sítě. Ke společnému
// cíli (pole, sad, staveniště…) jde každá domácnost zvlášť, nejvytíženější první, a další se
// k čerstvě vyšlapané pěšině přidá – žádné souběžné pěšiny vedle sebe (Martin). Po pevné cestě
// (roads.md) se jde jako po plné pěšině, takže se k ní trasy stahují – a bez ohledu na to, na čem
// leží (pole, sad, les, svah – Martin, 19. 10. 2026). Výsledek jsou vyhlazené lomené čáry se
// silou v bodech.

import {
  MIN_TRIP,
  PASSES,
  type PathErrands,
  type PathNetwork,
  type PathNetworkInput,
  type NetworkRoute,
} from './network-types';
import { pathStrength } from './network-keys';
import { roadCells, villageGrid } from './network-grid';
import {
  type Household,
  type TripGroup,
  errandGroups,
  households,
  tripGroups,
} from './network-targets';
import {
  PathHeap,
  type PassCosts,
  type RouteRecord,
  type SearchState,
  type Traffic,
  routeAll,
  smoothTraffic,
  trodden,
  villageBuildings,
} from './network-search';
import { extractLines } from './network-lines';
import { wearStrengths } from './wear';

export {
  PATH_TRAFFIC,
  PATH_AGE_FULL_YEARS,
  PATH_YEARS_UNKNOWN,
  woodErrandTrips,
  PATH_REACH_M,
} from './network-types';
export type {
  PathPoint,
  PathLine,
  PathTraffic,
  PathErrands,
  PathNetwork,
  PathSquare,
  PathVillage,
  PathNetworkInput,
  NetworkRoute,
} from './network-types';
export {
  villagePathBounds,
  penPathSquares,
  pathStrength,
  pathAgeFactor,
  pathNetworkKey,
  threshingFloorsKey,
  grainPitsKey,
  kilnsKey,
  pastureHerds,
  liningKey,
  roadsKey,
  pathBounds,
} from './network-keys';
export {
  villageTerrain,
  cellsIn,
  squareCells,
  fencedCells,
  inBuilding,
  buildingBounds,
  DWELLING_PATH_BOX_M,
  pathPlotOf,
  dwellingGatePoint,
  roadMask,
} from './network-grid';
export type { GridWindow, PathBox, Building, PathPlot } from './network-grid';
export { PathHeap, quantizedStep, villageBuildings } from './network-search';
export { simplifyPathLine, smoothPathLine } from './network-lines';

export function computePathNetwork(input: PathNetworkInput): PathNetwork {
  const v = input.village;
  const { dwellings: buildings, all: obstaclesOnly } = villageBuildings(v);
  const grid = villageGrid(input, obstaclesOnly);
  const all = grid.width * grid.height;
  const empty: PathNetwork = {
    lines: [],
    traffic: {
      originX: grid.originX,
      originZ: grid.originZ,
      cellM: grid.cellM,
      width: grid.width,
      height: grid.height,
      values: new Float32Array(all),
      raw: new Float32Array(all),
    },
    errands: new Map(),
    trips: 0,
    visits: new Map(),
  };
  const homes = households(v, grid, buildings);
  if (homes.length === 0) return input.keepRoutes ? { ...empty, routes: [] } : empty;
  // nejvytíženější skupiny první – vyšlapou kmen, ke kterému se přidají ostatní
  const groups = [
    ...errandGroups(input.annual ?? false, v, grid, homes),
    ...tripGroups(input, grid, homes, buildings),
  ]
    .map((group, order) => ({ group, order, total: group.weights.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .map((g) => g.group);
  const state: SearchState = {
    dist: new Float64Array(all),
    stamp: new Uint32Array(all),
    run: 0,
    parent: new Int32Array(all),
    heap: new PathHeap(),
    sinks: new Uint8Array(all),
  };
  // pevné cesty: od začátku jako plná pěšina (sleva), síla buňky nikdy pod ni neklesne;
  // vyšlapanost stejně (paths.md – Slévání): vyšlapaná pěšina zlevní trasu od prvního kola
  const fixed = strongerOf(roadCells(grid), input.wear ? wearStrengths(grid, input.wear) : null);
  const costs: PassCosts = {
    base: grid.base,
    previous: fixed ? new Float32Array(fixed) : new Float32Array(all),
    cost: new Float32Array(grid.base),
    plain: grid.plain,
  };
  if (fixed) {
    for (let c = 0; c < all; c++) {
      if (fixed[c]! > 0) costs.cost[c] = trodden(costs, c, fixed[c]!);
    }
  }
  let result: Traffic = {
    cells: new Float32Array(all),
    edges: new Float32Array(all * 4),
    edgeYears: new Float32Array(all * 4),
    trips: 0,
  };
  let smooth: Float32Array = new Float32Array(all);
  const errands = new Map<number, PathErrands>();
  const records: RouteRecord[] | null = input.keepRoutes ? [] : null;
  for (let pass = 0; pass < PASSES; pass++) {
    if (pass > 0) {
      for (let c = 0; c < all; c++) {
        const s = fixed ? Math.max(fixed[c]!, pathStrength(smooth[c]!)) : pathStrength(smooth[c]!);
        costs.previous[c] = s;
        costs.cost[c] = trodden(costs, c, s);
      }
    }
    const last = pass === PASSES - 1;
    result = routeAll(
      grid,
      costs,
      homes,
      groups,
      state,
      last ? errands : null,
      last ? records : null,
    );
    smooth = smoothTraffic(grid, result.cells);
  }
  return {
    lines: extractLines(grid, result, new Map(homes.map((h) => [h.gate, h.gatePoint]))),
    traffic: { ...empty.traffic, values: smooth, raw: result.cells },
    errands,
    trips: result.trips,
    visits: visitsOf(groups),
    ...(records ? { routes: records.map((r) => networkRoute(r, homes)) } : {}),
  };
}

/** Trasa posledního kola pro `PathNetwork.routes` – odkud (obydlí domácnosti), kam a proč. */
function networkRoute(record: RouteRecord, homes: readonly Household[]): NetworkRoute {
  const { group } = record;
  const base = Math.min(record.trips, group.baseWeights?.[record.home] ?? 0);
  return {
    from: `d:${homes[record.home]!.dwellingId}`,
    to: group.to,
    purpose: group.purpose,
    trips: record.trips,
    cells: record.cells,
    ...(base > 0 ? { base } : {}),
    ...(group.visit ? { visit: group.visit } : {}),
  };
}

/**
 * Provoz ke stavbám (`TripGroup.visit`) z posledního kola: kolo vynuluje váhy domácností, ke
 * kterým se trasa nenašla, takže zbylé váhy nad MIN_TRIP jsou cesty, které opravdu vedly.
 */
function visitsOf(groups: readonly TripGroup[]): Map<string, number> {
  const visits = new Map<string, number>();
  for (const group of groups) {
    if (!group.visit) continue;
    const trips = group.weights.reduce((sum, w) => (w >= MIN_TRIP ? sum + w : sum), 0);
    if (trips > 0) visits.set(group.visit, (visits.get(group.visit) ?? 0) + trips);
  }
  return visits;
}

// --- osy pěšin -------------------------------------------------------------------------------

/** Silnější ze dvou sil pěšin po buňkách (mutuje první); chybí-li jedna, druhá. */
function strongerOf(a: Float32Array | null, b: Float32Array | null): Float32Array | null {
  if (!a || !b) return a ?? b;
  for (let c = 0; c < a.length; c++) a[c] = Math.max(a[c]!, b[c]!);
  return a;
}
