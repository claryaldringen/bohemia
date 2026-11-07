import { length2, obstaclesNear, type ObstacleKind, type ObstacleLayer } from '../../landscape';
import { obstacleStatus, type ObstacleChanges } from '../obstacles';
import {
  CART_ROUTES,
  CART_SPEED,
  CEMETERY_FENCE_INSET_M,
  FENCE_CLEARANCE,
  OBSTACLE_COST,
  PEN_FENCE_INSET_M,
  ROAD_SWATH,
  SACRED_BUILDINGS,
  TEAM_TRAVEL,
  WAGON_ROAD,
} from '../rules';
import { sacredSitesOf } from '../sacred';
import type { RoadGrade, RoadGround, RoadLining, RoadProfilePoint } from '../types';
import { isWoodTreeId } from '../woods';
import {
  CART_HEADINGS,
  CART_HEADING_LENGTHS,
  CART_HEADING_VIA,
  cartRoadSpeed,
  roadBandCells,
} from './cart';
import { editedHeight, terrainEditsFrom, type TerrainEdits } from './earthworks';
import { type FenceOutline } from './entrances';
import { fenceClearance } from './fences';
import { fenceBand, gridFences } from './network-grid';
import {
  PathHeap,
  buildingBounds,
  cellsIn,
  fencedCells,
  inBuilding,
  penPathSquares,
  simplifyPathLine,
  smoothPathLine,
  squareCells,
  villageBuildings,
  type GridWindow,
  type PathPoint,
  type PathVillage,
} from './network';
import { PATH_FORD, PATH_WATER, PATH_WOODLAND, type PathTerrain } from './terrain';
import { roadTreeSpeed } from './walk-speed';

// Trasa vozové cesty (roads.md – Vozová cesta; Martin, 20. 10. 2026: „tato cesta spojí dva body,
// které spojuje stará cesta pro pěší, ale co nejvíc přímo tak, aby vůz projel. Pokud budou
// překážet svahy, vyhloubí se úvoz nebo udělá násep. Samozřejmě, některé svahy budou tak velké, že
// se budou muset kombinovat serpentiny, úvozy a náspy.“). Hledání po mřížce terénu pěšin se směry
// vozu (16 směrů, čtyřkolák zatočí na krok nejvýš o jeden – cart.ts) a s rozsahem navržených výšek
// v každém stavu: krok smí stoupat nejvýš o WAGON_ROAD.maxGrade, výška pláně se smí od terénu
// lišit nejvýš o úvoz `maxCutM` a násep `maxFillM` (u staveb, plotů a vody méně – `limit`). Cena =
// délka × WAGON_ROAD.directPerM (Martin: „Co nejpříměji“ – nejkratší trasa, kudy svah jde srovnat)
// + práce stavby (zpevnění, zemní práce, kácení) + čas jízdy vozem za WAGON_ROAD.trafficYears let;
// serpentiny vzniknou samy z meze sklonu a zatáčení. Trasa z mřížky se pak narovná
// (`straightenWagonRoute` – přímé úseky, kudy vůz projede a profil vyjde) a profil (navržené výšky)
// se spočítá na hotové ose – nejmenší zemní práce při sklonu do meze (`wagonProfile`).
// Čisté deterministické funkce (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin),
// stejně na serveru (zahájení stavby) i v prohlížeči (náhled).

const HEADINGS = CART_HEADINGS.length;
/** Štítků na stav (buňka × směr) – rozsah výšek se nedá porovnat jen cenou. */
const LABELS_PER_STATE = 3;
/** Nejvíc štítků hledání – pak trasa „nenalezena“ (ochrana času a paměti). */
const MAX_LABELS = 3_000_000;
/** Sklon při hledání – rezerva pro vyhlazení osy (hotový profil drží WAGON_ROAD.maxGrade). */
const SEARCH_GRADE = WAGON_ROAD.maxGrade - 0.005;
/** Buňky do tolika metrů od konce cesty – odtud trasa vychází a sem dojde. */
const END_REACH_M = 5;
const END_REACH_FAR_M = 9;
/** Změna směru o jeden z 16 stojí (čd) – trasa se zbytečně nekroutí (vlnovky kolem staré cesty). */
const TURN_COST = 0.5;
/**
 * Vyhlazení osy z buněk – zjednodušení (m) a průchody (zubaté kroky mřížky zmizí), od nejhladšího;
 * hladší osa je kratší (v úvratích serpentiny víc) a potřebuje víc zemních prací – vybere se
 * nejlevnější profil, hladší má malou přednost (`SMOOTH_BONUS`). Bez vyhlazení osa z buněk.
 */
const SMOOTHING: readonly { simplifyM: number; passes: number }[] = [
  { simplifyM: 2.2, passes: 3 },
  { simplifyM: 1.2, passes: 2 },
  { simplifyM: 0, passes: 0 },
];
/**
 * Před vyhlazením se osa zhustí na body po tolika metrech – zaoblí se jen rohy (narovnaná trasa má
 * dlouhé přímé úseky a vyhlazení by jinak zaoblilo celý úsek).
 */
const SMOOTH_DENSIFY_M = 4;
/** Hladší osa smí stát o tolik víc zemních prací (podíl) než méně hladká. */
const SMOOTH_BONUS = 1.15;
/** Nejmenší úprava terénu, která jde všude (m) – srovnání pláně; brod zůstává brodem. */
const LIMIT_MIN_M = 0.3;
/** Okraj domu, kam cesta nesmí (m) – jako u vozů, k tomu půl vozovky. */
const HOUSE_MARGIN_M = 0.4;
/**
 * Posvátný strom – trasa k němu nesmí blíž (m): pláň, nejmenší srovnání terénu a buňka sítě terénu
 * kolem stromu (průsek ani zemní práce ho nesmí vykácet – `wagonClearing` hlídá i rohy buňky).
 */
const SACRED_REACH_M = WAGON_ROAD.flatHalfM + 2;
/**
 * Odhad zemních prací při hledání: pláň jde co nejblíž terénu se sklonem do meze a za prudším
 * svahem zaostává; hotový profil (`profileHeights`) rozdělí rozdíl na násep před a úvoz za – asi
 * polovinu posunu.
 */
const PROFILE_LAG = 0.5;
/** Cena zemních prací na m³ průřezu při hledání (čd) – výkop i násep, část ze zdrojů z úvozu. */
const EARTH_RATE = WAGON_ROAD.digPerM3 + WAGON_ROAD.placePerM3 / 2;
/** Druhy překážek, které průsek kácí (road-swath.ts), a které se jen v pásu cesty odklidí. */
const CUT_KINDS: ReadonlySet<ObstacleKind> = new Set([
  'tree',
  'youngTree',
  'shrub',
  'snag',
  'fallenTree',
]);
const ROADBED_KINDS: ReadonlySet<ObstacleKind> = new Set(['stump', 'stone']);

/** Mřížka pro vozovou cestu – výšky, kudy cesta nesmí, kolik se smí upravit a co se kácí. */
export interface WagonGrid extends GridWindow {
  heights: Float32Array;
  flags: Uint8Array;
  /** 1 = cesta tudy nevede (voda mimo brod, sráz, stavby, ploty, osetý díl, posvátný strom…). */
  blocked: Uint8Array;
  /** 1 = u posvátného stromu – nikdy tudy (ani u konce cesty). */
  sacred: Uint8Array;
  /**
   * `blocked` bez okrajů staveb (domy, pozemky… s půl vozovkou) – po staré cestě se stavby měří
   * přesně v bodech osy (`wagonAxisBlocked`), ne po buňkách.
   */
  barred: Uint8Array;
  /** Nejvýš o kolik metrů se tu terén smí upravit (úvoz i násep) – u staveb a vody méně. */
  limit: Float32Array;
  /** Kácení průseku (čd na metr cesty buňkou) – stromy a podrost v lese. */
  clearing: Float32Array;
  /**
   * 1 = pruh u plotu hřbitova či ohrady (do `FENCE_CLEARANCE.nearM`) – trasa tu stojí `nearCost`
   * krát víc (paths.md – Odstup od plotu); buňky blíž než `axisM` jsou v `blocked`.
   */
  nearFence: Uint8Array;
  /** Ploty hřbitovů a ohrad v okně – osa k nim přesně nesmí blíž než `FENCE_CLEARANCE.axisM`. */
  fences: readonly FenceOutline[];
  /** Sklon terénu po buňkách (m/m ve směru x a z). */
  gx: Float32Array;
  gz: Float32Array;
}

export interface WagonGridInput {
  /** Ves (jako síť pěšin – `pathVillageOf` na serveru, `SceneVillage` v prohlížeči). */
  village: PathVillage;
  /** Terén okna – s překážkami krajiny (balvany a výchozy neprůchodné) a úpravami terénu vsi. */
  terrain: PathTerrain;
  layer: ObstacleLayer | null;
  changes: ObstacleChanges;
}

/** Index buňky nejblíž bodu, nebo −1 mimo okno. */
function cellAt(grid: GridWindow, x: number, z: number): number {
  const i = Math.round((x - grid.originX) / grid.cellM);
  const j = Math.round((z - grid.originZ) / grid.cellM);
  if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return -1;
  return j * grid.width + i;
}

/**
 * Buňky pod pevnými cestami – pás `roadBandCells` jako vozová síť (vůz pevnou cestu projede i šikmo
 * lesem nebo polem).
 */
function roadCells(grid: GridWindow, roads: PathVillage['roads']): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height);
  for (const road of roads ?? []) {
    roadBandCells(grid, road.points, (c) => {
      out[c] = 1;
    });
  }
  return out;
}

/**
 * Vzdálenost buněk k nejbližší „stavbě“ (`seed` – domy, ploty, voda, posvátné stromy) v metrech
 * – dvouprůchodová zkosená vzdálenost (krok buňky a úhlopříčka), nejvýš `cap`.
 */
function seedDistance(grid: GridWindow, seed: Uint8Array, cap: number): Float32Array {
  const { width: w, height: h, cellM } = grid;
  const d = new Float32Array(w * h).fill(cap);
  for (let c = 0; c < w * h; c++) if (seed[c]) d[c] = 0;
  const a = cellM;
  const b = cellM * Math.SQRT2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      let v = d[c]!;
      if (i > 0) v = Math.min(v, d[c - 1]! + a);
      if (j > 0) {
        v = Math.min(v, d[c - w]! + a);
        if (i > 0) v = Math.min(v, d[c - w - 1]! + b);
        if (i < w - 1) v = Math.min(v, d[c - w + 1]! + b);
      }
      d[c] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const c = j * w + i;
      let v = d[c]!;
      if (i < w - 1) v = Math.min(v, d[c + 1]! + a);
      if (j < h - 1) {
        v = Math.min(v, d[c + w]! + a);
        if (i < w - 1) v = Math.min(v, d[c + w + 1]! + b);
        if (i > 0) v = Math.min(v, d[c + w - 1]! + b);
      }
      d[c] = v;
    }
  }
  return d;
}

/**
 * Mřížka pro trasu vozové cesty (roads.md – Vozová cesta): zakázané jako u vozové sítě – voda
 * jen brodem, sráz, balvany a výchozy, osetý díl (a křoviny, mladý les – kromě dílů pod pevnou
 * cestou), sad (i okraj), hřbitov a ohrada uvnitř plotu (ulička 3 m mezi nimi průjezdná – jako
 * `cart.ts`), okrsek svatyně, domy, pozemky, staveniště,
 * milíř a modla s půl vozovkou, posvátné duby a háje (i s pláni kolem – průsek by je vykácel)
 * a samotné stromy a keře mimo les (cesta je objede). Les ano – stromy a podrost se vykácí jako
 * průsek (`clearing` – čd na metr podle tabulky překážek). Kolik se smí terén upravit: úvoz
 * a násep nejvýš WAGON_ROAD.maxCutM / maxFillM, u domů, plotů a vody jen tolik, aby svah 1 : 1
 * nesáhl blíž než `clearanceM` (nejméně LIMIT_MIN_M – srovnání pláně, brod).
 */
export function wagonRoadGrid(input: WagonGridInput): WagonGrid {
  const t = input.terrain;
  const all = t.width * t.height;
  const grid: WagonGrid = {
    width: t.width,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    heights: t.heights ?? new Float32Array(all),
    flags: t.flags,
    blocked: new Uint8Array(all),
    sacred: new Uint8Array(all),
    barred: new Uint8Array(all),
    limit: new Float32Array(all),
    clearing: new Float32Array(all),
    nearFence: new Uint8Array(all),
    fences: [],
    gx: new Float32Array(all),
    gz: new Float32Array(all),
  };
  const { blocked } = grid;
  const seed = new Uint8Array(all);
  const v = input.village;
  for (let c = 0; c < all; c++) {
    if (!Number.isFinite(t.cost[c]!)) blocked[c] = 1;
    if (t.flags[c]! & PATH_WATER) seed[c] = 1;
  }
  // díly polí – osetý díl, křoviny a mladý les ne (pod pevnou cestou ano – pás se neorá)
  const onRoad = roadCells(grid, v.roads);
  for (const field of v.fields) {
    for (const part of field.parts) {
      if (part.stage !== 'sown' && part.stage !== 'shrubs' && part.stage !== 'young-forest') {
        continue;
      }
      for (const c of squareCells(grid, [part]).inside) if (!onRoad[c]) blocked[c] = 1;
    }
  }
  // sad – i jeho okraj (stromy v řadách); hřbitov a ohrada jako vozová síť jen uvnitř plotu 1,5 m
  // od okraje čtverců – uličkou 3 m mezi dvěma sousedními vede i vozová cesta (roads.md – Vozová
  // cesta po staré cestě; Martin 23. 10. 2026 – oxen.md, Plot ohrady podle délky); okrsek svatyně
  const block = (c: number): void => {
    blocked[c] = 1;
    seed[c] = 1;
  };
  for (const o of v.orchards ?? []) {
    if (o.squares.length === 0) continue;
    const { inside, edge } = squareCells(grid, o.squares);
    for (const c of [...inside, ...edge]) block(c);
  }
  for (const cemetery of v.cemeteries ?? []) {
    for (const c of fencedCells(grid, cemetery.squares, CEMETERY_FENCE_INSET_M)) block(c);
  }
  for (const pen of v.pens ?? []) {
    for (const c of fencedCells(grid, penPathSquares(pen), PEN_FENCE_INSET_M)) block(c);
  }
  for (const b of v.sacred?.buildings ?? []) {
    if (b.kind !== 'shrine') continue;
    const half = SACRED_BUILDINGS.shrine.footprintM / 2;
    cellsIn(
      grid,
      b.position.x - half,
      b.position.z - half,
      b.position.x + half,
      b.position.z + half,
      (c) => {
        blocked[c] = 1;
        seed[c] = 1;
      },
    );
  }
  // domy, pozemky, staveniště, milíř a modla – s půl vozovkou (do `blocked` až po překážkách)
  const margin = HOUSE_MARGIN_M + WAGON_ROAD.bedHalfM;
  const houses = new Uint8Array(all);
  for (const b of villageBuildings(v).all) {
    const [x0, z0, x1, z1] = buildingBounds(b, margin);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (inBuilding(b, x, z, margin)) houses[c] = 1;
      if (inBuilding(b, x, z, 0)) seed[c] = 1;
    });
  }
  // překážky krajiny: v lese se kácí (průsek), mimo les je cesta objede
  const layer = input.layer;
  const status = obstacleStatus(input.changes);
  const maxX = t.originX + (t.width - 1) * t.cellM;
  const maxZ = t.originZ + (t.height - 1) * t.cellM;
  const cutSum = new Float32Array(all);
  const bedSum = new Float32Array(all);
  // samotný strom, keř či kmen na pevné cestě ji nezavře (vůz po ní jede – stavba ho vykácí),
  // posvátný strom ano
  const markBlocked = (x: number, z: number, radius: number, sacred = false): void => {
    const reach = Math.max(radius, t.cellM / 2);
    cellsIn(grid, x - reach, z - reach, x + reach, z + reach, (c, cx, cz) => {
      if (!sacred && onRoad[c]) return;
      if (radius <= t.cellM / 2 || length2(cx - x, cz - z) <= radius) {
        blocked[c] = 1;
        if (sacred) grid.sacred[c] = 1;
      }
    });
  };
  const tree = OBSTACLE_COST.tree + OBSTACLE_COST.stump * (ROAD_SWATH.roadbedM / ROAD_SWATH.halfM);
  const take = (kind: ObstacleKind, x: number, z: number, wood: boolean, radius: number): void => {
    const c = cellAt(grid, x, z);
    if (c < 0) return;
    const woodland = wood || (t.flags[c]! & PATH_WOODLAND) !== 0;
    if (CUT_KINDS.has(kind)) {
      if (woodland) {
        const cost = kind === 'tree' ? tree : OBSTACLE_COST[kind as keyof typeof OBSTACLE_COST];
        cutSum[c] = cutSum[c]! + cost;
      } else {
        markBlocked(x, z, radius);
      }
    } else if (ROADBED_KINDS.has(kind) && woodland) {
      bedSum[c] = bedSum[c]! + OBSTACLE_COST[kind as 'stump' | 'stone'];
    }
  };
  if (layer) {
    const protectedTrees = sacredSitesOf(layer).protectedTrees;
    for (const index of obstaclesNear(layer, t.originX, t.originZ, maxX, maxZ)) {
      const kind = status.kindOf(layer, index);
      if (kind === null) continue;
      const x = layer.x[index]!;
      const z = layer.z[index]!;
      if (protectedTrees.has(layer.id[index]!)) {
        markBlocked(x, z, SACRED_REACH_M, true);
        // zemní práce nesmí sáhnout ani k rohům buňky se stromem (síť terénu scény)
        cellsIn(grid, x - t.cellM, z - t.cellM, x + t.cellM, z + t.cellM, (c, cx, cz) => {
          if (length2(cx - x, cz - z) <= t.cellM * 1.5) seed[c] = 1;
        });
        continue;
      }
      take(kind, x, z, false, kind === 'fallenTree' ? 1.5 * layer.scale[index]! : 0);
    }
  }
  // les vsi se kácí jako les, stromy u cest a jabloně cesta objede
  for (const o of status.addedIn(t.originX, t.originZ, maxX, maxZ)) {
    if (isWoodTreeId(o.id)) take(o.kind, o.x, o.z, true, 0);
    else markBlocked(o.x, o.z, 0);
  }
  grid.barred.set(blocked);
  for (let c = 0; c < all; c++) if (houses[c]) blocked[c] = 1;
  // odstup od plotu jako u chodců (paths.md – Odstup od plotu, `fenceBand`): pruh u plotu
  // neprůchodný (branka a ulička mezi ploty ne), kus dál dražší – až po stavbách, aby pruh poznal
  // úzký průchod; osa se k plotu přesně nepřiblíží (`wagonFenceAt`)
  const fences = gridFences(grid, v);
  const band = fenceBand(grid, fences, (c) => blocked[c] === 0);
  for (const c of band.near) if (!onRoad[c]) grid.nearFence[c] = 1;
  for (const c of band.blocked) blocked[c] = 1;
  const reachM = FENCE_CLEARANCE.axisM;
  grid.fences = fences
    .map((f) => f.outline)
    .filter(
      (f) =>
        f.maxX + reachM >= t.originX &&
        f.minX - reachM <= maxX &&
        f.maxZ + reachM >= t.originZ &&
        f.minZ - reachM <= maxZ,
    );
  const area = t.cellM * t.cellM;
  for (let c = 0; c < all; c++) {
    grid.clearing[c] =
      (cutSum[c]! * 2 * ROAD_SWATH.halfM + bedSum[c]! * 2 * ROAD_SWATH.roadbedM) / area;
  }
  // kolik se smí terén upravit – svah 1 : 1 od kraje pláně nesmí blíž než clearanceM ke stavbě
  const reach = WAGON_ROAD.flatHalfM + WAGON_ROAD.clearanceM;
  const cap = reach + Math.max(WAGON_ROAD.maxCutM, WAGON_ROAD.maxFillM) + t.cellM;
  const dist = seedDistance(grid, seed, cap);
  for (let c = 0; c < all; c++) {
    const room = dist[c]! - t.cellM / 2 - reach;
    grid.limit[c] = Math.max(LIMIT_MIN_M, room);
  }
  // sklon terénu po buňkách
  const { width: w, height: h, heights } = grid;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      const xl = heights[i > 0 ? c - 1 : c]!;
      const xr = heights[i < w - 1 ? c + 1 : c]!;
      const zl = heights[j > 0 ? c - w : c]!;
      const zr = heights[j < h - 1 ? c + w : c]!;
      const sx = (i > 0 ? 1 : 0) + (i < w - 1 ? 1 : 0);
      const sz = (j > 0 ? 1 : 0) + (j < h - 1 ? 1 : 0);
      grid.gx[c] = sx > 0 ? (xr - xl) / (sx * t.cellM) : 0;
      grid.gz[c] = sz > 0 ? (zr - zl) / (sz * t.cellM) : 0;
    }
  }
  return grid;
}

/** Výška terénu mřížky v bodě (m) – bilineárně mezi buňkami (jako terén pěšin z políček). */
export function wagonGridHeight(grid: WagonGrid, x: number, z: number): number {
  const fi = Math.min(grid.width - 1, Math.max(0, (x - grid.originX) / grid.cellM));
  const fj = Math.min(grid.height - 1, Math.max(0, (z - grid.originZ) / grid.cellM));
  const i0 = Math.min(grid.width - 2, Math.floor(fi));
  const j0 = Math.min(grid.height - 2, Math.floor(fj));
  const ti = fi - i0;
  const tj = fj - j0;
  const h = (i: number, j: number): number => grid.heights[j * grid.width + i]!;
  const top = h(i0, j0) + (h(i0 + 1, j0) - h(i0, j0)) * ti;
  const bottom = h(i0, j0 + 1) + (h(i0 + 1, j0 + 1) - h(i0, j0 + 1)) * ti;
  return top + (bottom - top) * tj;
}

/** Plocha průřezu zemních prací (m²) při posunu pláně `offset` (m) a příčném sklonu `cross`. */
function sectionArea(offset: number, cross: number): number {
  const o = Math.abs(offset);
  const flat = WAGON_ROAD.flatHalfM;
  return 2 * flat * o + (o * o) / WAGON_ROAD.sideSlope + flat * flat * cross * (1 + cross);
}

/** Čas vozu podle sklonu – jako vozová síť (CART_ROUTES.gradeCost při mezi). */
function gradeFactor(grade: number): number {
  const g = grade / CART_ROUTES.maxGrade;
  return 1 + CART_ROUTES.gradeCost * g * g;
}

/**
 * Kolik čd stojí metr jízdy vozem po louce za WAGON_ROAD.trafficYears let při `tripsPerDay`
 * jízdách denně (nejméně `minTripsPerDay` – bez provozu malá váha): den vozky `dayHours` h, vůz
 * po louce TEAM_TRAVEL.speedMps.
 */
export function wagonTimeRate(tripsPerDay: number): number {
  const trips = Math.max(WAGON_ROAD.minTripsPerDay, tripsPerDay);
  return (
    (trips * 365.25 * WAGON_ROAD.trafficYears) / (TEAM_TRAVEL.speedMps * 3600 * WAGON_ROAD.dayHours)
  );
}

/** Nalezená trasa – buňky a osa od konce `from` do `to` (konce cesty, mezi nimi středy buněk). */
export interface WagonRouteCells {
  cells: number[];
  points: PathPoint[];
}

/** Rostoucí zásobník štítků hledání (cena, rozsah výšek, rodič, stav). */
class Labels {
  cost = new Float64Array(4096);
  lo = new Float64Array(4096);
  hi = new Float64Array(4096);
  y = new Float64Array(4096);
  parent = new Int32Array(4096);
  state = new Int32Array(4096);
  dead = new Uint8Array(4096);
  size = 0;

  add(cost: number, lo: number, hi: number, y: number, parent: number, state: number): number {
    if (this.size === this.cost.length) {
      const n = this.size * 2;
      const grow = <T extends Float64Array | Int32Array | Uint8Array>(
        a: T,
        make: (n: number) => T,
      ): T => {
        const b = make(n);
        b.set(a);
        return b;
      };
      this.cost = grow(this.cost, (k) => new Float64Array(k));
      this.lo = grow(this.lo, (k) => new Float64Array(k));
      this.hi = grow(this.hi, (k) => new Float64Array(k));
      this.y = grow(this.y, (k) => new Float64Array(k));
      this.parent = grow(this.parent, (k) => new Int32Array(k));
      this.state = grow(this.state, (k) => new Int32Array(k));
      this.dead = grow(this.dead, (k) => new Uint8Array(k));
    }
    const id = this.size++;
    this.cost[id] = cost;
    this.lo[id] = lo;
    this.hi[id] = hi;
    this.y[id] = y;
    this.parent[id] = parent;
    this.state[id] = state;
    this.dead[id] = 0;
    return id;
  }
}

/** Průchodné buňky do `radius` m od bodu (u konce cesty); jinak prázdné. */
function endCells(grid: WagonGrid, p: PathPoint, radius: number): number[] {
  const out: number[] = [];
  cellsIn(grid, p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c, x, z) => {
    if (!grid.blocked[c] && length2(x - p.x, z - p.z) <= radius) out.push(c);
  });
  return out;
}

/**
 * Nejlevnější trasa vozové cesty z `from` do `to` (A* po buňkách se směrem jízdy a rozsahem
 * navržených výšek): krok o délce L stojí L × (zpevnění + kácení + zemní práce odhadem z posunu
 * pláně a příčného sklonu) + čas jízdy (`wagonTimeRate`, rychlost vozové cesty, sklon) + změna
 * směru; rozsah výšek pláně se po kroku rozšíří o L × sklon a omezí terénem ± `limit` – prázdný
 * rozsah = krok nejde (příliš strmě i s úvozem a náspem). Konce cesty mají pláň v terénu. Bez
 * trasy (nebo po `maxLabels` štítcích – mez paměti a času) null. Se `budget` je mez nejvýš
 * `budget.left` štítků a hledání z něj spotřebované štítky odečte (společný rozpočet víc hledání).
 */
export function findWagonRoute(
  grid: WagonGrid,
  from: PathPoint,
  to: PathPoint,
  tripsPerDay: number,
  maxLabelsOwn = MAX_LABELS,
  budget?: { left: number },
): WagonRouteCells | null {
  const maxLabels = budget ? Math.min(maxLabelsOwn, budget.left) : maxLabelsOwn;
  const { width: w, height: h, cellM, heights, blocked, limit, clearing, gx, gz } = grid;
  const timeRate = wagonTimeRate(tripsPerDay) / CART_SPEED.road.wagon;
  const pave = WAGON_ROAD.pavingPerM;
  const direct = WAGON_ROAD.directPerM;
  const rate = pave + direct + timeRate;
  const g = SEARCH_GRADE;
  const maxCut = WAGON_ROAD.maxCutM;
  const maxFill = WAGON_ROAD.maxFillM;
  const turnSteps = WAGON_ROAD.turnSteps;
  const fordFactor = CART_ROUTES.fordCost;
  const hFrom = wagonGridHeight(grid, from.x, from.z);
  const hTo = wagonGridHeight(grid, to.x, to.z);
  let starts = endCells(grid, from, END_REACH_M);
  if (starts.length === 0) starts = endCells(grid, from, END_REACH_FAR_M);
  let goals = endCells(grid, to, END_REACH_M);
  if (goals.length === 0) goals = endCells(grid, to, END_REACH_FAR_M);
  if (starts.length === 0 || goals.length === 0) return null;
  const goal = new Uint8Array(w * h);
  for (const c of goals) goal[c] = 1;
  const slots = new Int32Array(w * h * HEADINGS * LABELS_PER_STATE).fill(-1);
  const labels = new Labels();
  const heap = new PathHeap();
  const cx = (c: number): number => grid.originX + (c % w) * cellM;
  const cz = (c: number): number => grid.originZ + Math.floor(c / w) * cellM;
  const heuristic = (c: number): number => length2(cx(c) - to.x, cz(c) - to.z) * rate;
  /** Vloží štítek do stavu `s`, když ho jiný nepřebije (cena, rozsah výšek); vrátí id nebo −1. */
  /**
   * Vloží štítek do stavu `s` (buňka × směr): přebitý jiným (dražší a užší rozsah výšek) zahodí;
   * jinak ve stavu zůstanou tři role – nejlevnější, s nejvyšší možnou plání (rezerva do kopce)
   * a s nejnižší (rezerva z kopce) – rozsah dál závisí jen na své mezi, takže se neztratí trasa,
   * která potřebuje stoupat nebo klesat. Vrátí id nového štítku, nebo −1.
   */
  const keep = new Int32Array(LABELS_PER_STATE + 1);
  const insert = (
    s: number,
    cost: number,
    lo: number,
    hi: number,
    y: number,
    parent: number,
  ): number => {
    const base = s * LABELS_PER_STATE;
    let n = 0;
    for (let k = 0; k < LABELS_PER_STATE; k++) {
      const id = slots[base + k]!;
      if (id < 0 || labels.dead[id]) continue;
      const lc = labels.cost[id]!;
      if (lc <= cost + 1e-9 && labels.lo[id]! <= lo + 1e-9 && labels.hi[id]! >= hi - 1e-9) {
        return -1;
      }
      if (cost <= lc && lo <= labels.lo[id]! && hi >= labels.hi[id]!) {
        labels.dead[id] = 1;
        continue;
      }
      keep[n++] = id;
    }
    const id = labels.add(cost, lo, hi, y, parent, s);
    keep[n++] = id;
    // role: nejlevnější, nejvyšší a nejnižší pláň (při shodě levnější, pak starší)
    let cheap = -1;
    let high = -1;
    let low = -1;
    for (let k = 0; k < n; k++) {
      const q = keep[k]!;
      const qc = labels.cost[q]!;
      if (cheap < 0 || qc < labels.cost[cheap]!) cheap = q;
      if (
        high < 0 ||
        labels.hi[q]! > labels.hi[high]! + 1e-9 ||
        (Math.abs(labels.hi[q]! - labels.hi[high]!) <= 1e-9 && qc < labels.cost[high]!)
      ) {
        high = q;
      }
      if (
        low < 0 ||
        labels.lo[q]! < labels.lo[low]! - 1e-9 ||
        (Math.abs(labels.lo[q]! - labels.lo[low]!) <= 1e-9 && qc < labels.cost[low]!)
      ) {
        low = q;
      }
    }
    let slot = 0;
    for (let k = 0; k < n; k++) {
      const q = keep[k]!;
      if (q === cheap || q === high || q === low) slots[base + slot++] = q;
      else labels.dead[q] = 1;
    }
    for (; slot < LABELS_PER_STATE; slot++) slots[base + slot] = -1;
    return labels.dead[id] ? -1 : id;
  };
  for (const c of [...starts].sort((a, b) => a - b)) {
    const d = length2(cx(c) - from.x, cz(c) - from.z);
    const lo = Math.max(hFrom - g * d, heights[c]! - Math.min(maxCut, limit[c]!));
    const hi = Math.min(hFrom + g * d, heights[c]! + Math.min(maxFill, limit[c]!));
    if (lo > hi + 1e-9) continue;
    const y = Math.min(hi, Math.max(lo, heights[c]!));
    for (let hd = 0; hd < HEADINGS; hd++) {
      const id = insert(c * HEADINGS + hd, d * rate, lo, hi, y, -1);
      if (id >= 0) heap.push(id, d * rate + heuristic(c));
    }
  }
  let found = -1;
  while (heap.size > 0) {
    const id = heap.pop();
    if (labels.dead[id]) continue;
    const s = labels.state[id]!;
    if (s < 0) {
      found = id;
      break;
    }
    if (labels.size > maxLabels) {
      if (budget) budget.left -= labels.size;
      return null;
    }
    const cost = labels.cost[id]!;
    const lo = labels.lo[id]!;
    const hi = labels.hi[id]!;
    const y = labels.y[id]!;
    const c = Math.floor(s / HEADINGS);
    const hd = s - c * HEADINGS;
    if (goal[c]) {
      // k bodu konce cesty – pláň v terénu
      const d = length2(cx(c) - to.x, cz(c) - to.z);
      if (hTo >= lo - g * d - 1e-9 && hTo <= hi + g * d + 1e-9) {
        const end = labels.add(cost + d * rate, hTo, hTo, hTo, id, -1);
        heap.push(end, cost + d * rate);
      }
    }
    const i = c % w;
    const j = (c - i) / w;
    for (let turn = -turnSteps; turn <= turnSteps; turn++) {
      const k = (hd + turn + HEADINGS) % HEADINGS;
      const [di, dj] = CART_HEADINGS[k]!;
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      if (blocked[n]) continue;
      let through = false;
      for (const [vi, vj] of CART_HEADING_VIA[k]!) {
        if (blocked[(j + vj) * w + i + vi]) through = true;
      }
      if (through) continue;
      const length = CART_HEADING_LENGTHS[k]! * cellM;
      const hb = heights[n]!;
      const nlo = Math.max(lo - g * length, hb - Math.min(maxCut, limit[n]!));
      const nhi = Math.min(hi + g * length, hb + Math.min(maxFill, limit[n]!));
      if (nlo > nhi + 1e-9) continue;
      // pláň co nejblíž terénu se sklonem do meze profilu (odhad – zemní práce, kde svah
      // stoupá rychleji, než smí cesta), v rozsahu, kudy trasa dál projde
      const gy = WAGON_ROAD.maxGrade * length;
      const ny = Math.min(nhi, Math.max(nlo, Math.min(y + gy, Math.max(y - gy, hb))));
      const offset = Math.abs(ny - hb) * PROFILE_LAG;
      const ux = di / CART_HEADING_LENGTHS[k]!;
      const uz = dj / CART_HEADING_LENGTHS[k]!;
      const cross = Math.abs(-gx[n]! * uz + gz[n]! * ux);
      const natural = Math.min(Math.abs(hb - heights[c]!) / length, WAGON_ROAD.maxGrade);
      const ford = (grid.flags[n]! & PATH_FORD) !== 0 ? fordFactor : 1;
      const plain =
        length *
          (pave +
            direct +
            (clearing[c]! + clearing[n]!) / 2 +
            sectionArea(offset, Math.min(cross, 0.9)) * EARTH_RATE) +
        length * timeRate * gradeFactor(natural) * ford +
        TURN_COST * Math.abs(turn);
      // pruh u plotu dražší (paths.md – Odstup od plotu)
      const step = grid.nearFence[n] ? plain * FENCE_CLEARANCE.nearCost : plain;
      const nextCost = cost + step;
      const nid = insert(n * HEADINGS + k, nextCost, nlo, Math.max(nlo, nhi), ny, id);
      if (nid >= 0) heap.push(nid, nextCost + heuristic(n));
    }
  }
  if (budget) budget.left -= labels.size;
  if (found < 0) return null;
  const cells: number[] = [];
  for (let id = labels.parent[found]!; id >= 0; id = labels.parent[id]!) {
    const c = Math.floor(labels.state[id]! / HEADINGS);
    if (cells[cells.length - 1] !== c) cells.push(c);
  }
  cells.reverse();
  return {
    cells,
    points: [
      { x: from.x, z: from.z },
      ...cells.map((c) => ({ x: cx(c), z: cz(c) })),
      { x: to.x, z: to.z },
    ],
  };
}

/** Osa po bodech nejvýš `step` m od sebe (konce úseků zůstanou). */
function densify(points: readonly PathPoint[], step: number): PathPoint[] {
  if (points.length < 2) return [...points];
  const out: PathPoint[] = [points[0]!];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / step));
    for (let q = 1; q < n; q++)
      out.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    out.push(b);
  }
  return out;
}

/** Krok vzorků narovnání trasy (m) – jemněji než body profilu. */
const STRAIGHT_STEP_M = 1;
/** Nejvíc bodů trasy, přes které jeden přímý úsek vede, a kolik neúspěšných pokusů za sebou. */
const STRAIGHT_SPAN = 160;
const STRAIGHT_MISSES = 8;
/** Úhel mezi přímými úseky nejvýš 45° (cos) – vůz zatočí, vyhlazení roh zaoblí. */
const STRAIGHT_CORNER_COS = Math.SQRT1_2;

/**
 * Bod osy pro profil: terén, o kolik smí pláň od terénu (úvoz, násep – u staveb a vody méně, brod
 * LIMIT_MIN_M) a jestli tudy vůz smí (zakázané buňky, mimo okno).
 */
function axisPoint(
  grid: WagonGrid,
  x: number,
  z: number,
): { natural: number; limit: number; ford: boolean; blocked: boolean; sacred: boolean } {
  const c = cellAt(grid, x, z);
  const ford = c >= 0 && (grid.flags[c]! & PATH_FORD) !== 0;
  const lim = c >= 0 ? grid.limit[c]! : LIMIT_MIN_M;
  return {
    natural: wagonGridHeight(grid, x, z),
    limit: ford ? LIMIT_MIN_M : Math.min(lim, WAGON_ROAD.maxCutM, WAGON_ROAD.maxFillM),
    ford,
    blocked: c < 0 || grid.blocked[c] === 1,
    sacred: c >= 0 && grid.sacred[c] === 1,
  };
}

/** Rozsah výšek pláně (m) – prázdný, když `lo` > `hi`. */
interface HeightRange {
  lo: number;
  hi: number;
}

/**
 * Rozsah výšek pláně po přímém úseku `a` → `b` z rozsahu `start` v `a`: sklon do SEARCH_GRADE
 * (rezerva pro profil po centimetrech a vyhlazení osy); `check` – i zakázané buňky (posvátný strom
 * vždy, ostatní kromě okolí konců cesty `ends` – úsek původní trasy je projetý hledáním),
 * v bodech po STRAIGHT_STEP_M v mezích úvozu a náspu; null, když úsek vede zakázanou buňkou (kromě
 * okolí konců cesty `ends`) nebo se rozsah vyprázdní. Výsledek je rozsah v `b`.
 */
function rangeAlong(
  grid: WagonGrid,
  a: PathPoint,
  b: PathPoint,
  start: HeightRange,
  ends: readonly PathPoint[],
  check: boolean,
): HeightRange | null {
  const length = length2(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(length / STRAIGHT_STEP_M));
  const step = length / n;
  const g = SEARCH_GRADE * step;
  // pruh u plotu je pro trasu dražší (`nearFence`) – přímý úsek do něj nově nevjede, jen kde už
  // trasa vede pruhem (oba konce úseku v něm); paths.md – Odstup od plotu
  const { nearM } = FENCE_CLEARANCE;
  const inBand = (p: PathPoint): boolean => fenceClearance(grid.fences, p.x, p.z, nearM) < nearM;
  const keepBand = check && grid.fences.length > 0 && !(inBand(a) && inBand(b));
  let lo = start.lo;
  let hi = start.hi;
  for (let q = 1; q <= n; q++) {
    const x = a.x + ((b.x - a.x) * q) / n;
    const z = a.z + ((b.z - a.z) * q) / n;
    const p = axisPoint(grid, x, z);
    if (
      check &&
      p.blocked &&
      (p.sacred || !ends.some((e) => length2(e.x - x, e.z - z) <= END_REACH_FAR_M))
    ) {
      return null;
    }
    // ani roh plotu neusekne (paths.md – Odstup od plotu)
    if (check && nearFence(grid, x, z, ends)) return null;
    if (
      keepBand &&
      fenceClearance(grid.fences, x, z, nearM) < nearM &&
      !ends.some((e) => length2(e.x - x, e.z - z) < FENCE_CLEARANCE.gateM)
    ) {
      return null;
    }
    lo = Math.max(lo - g, p.natural - p.limit);
    hi = Math.min(hi + g, p.natural + p.limit);
    if (lo > hi + 1e-9) return null;
  }
  return { lo, hi: Math.max(lo, hi) };
}

/** Úhel v bodě `b` mezi úseky `a` → `b` a `b` → `c` nejvýš STRAIGHT_CORNER_COS? */
function gentleCorner(a: PathPoint, b: PathPoint, c: PathPoint): boolean {
  const ux = b.x - a.x;
  const uz = b.z - a.z;
  const vx = c.x - b.x;
  const vz = c.z - b.z;
  const lu = length2(ux, uz);
  const lv = length2(vx, vz);
  if (lu < 1e-9 || lv < 1e-9) return true;
  return (ux * vx + uz * vz) / (lu * lv) >= STRAIGHT_CORNER_COS - 1e-12;
}

/**
 * Narovná trasu z mřížky (Martin: „Co nejpříměji“): z každého bodu přímým úsekem co nejdál po
 * trase, kudy vůz projede (žádná zakázaná buňka), rohy nejvýš 45° a kde profil vyjde – rozsah
 * výšek pláně z dosavadní narovnané trasy dojde do bodu, odkud zbytek původní trasy dojde ke konci
 * (rozsahy odzadu). Narovnaná trasa tak má profil vždy, když ho měla původní. Krokové „zuby“
 * mřížky zmizí a trasa vede přímo, kde to svah dovolí (úvozem a náspem). Když rozsahy původní
 * trasy nevyjdou (odhad hledání), vrátí ji beze změny.
 */
export function straightenWagonRoute(grid: WagonGrid, points: readonly PathPoint[]): PathPoint[] {
  const n = points.length;
  if (n <= 2) return [...points];
  const ends = [points[0]!, points[n - 1]!];
  const hFrom = wagonGridHeight(grid, points[0]!.x, points[0]!.z);
  const hTo = wagonGridHeight(grid, points[n - 1]!.x, points[n - 1]!.z);
  // rozsahy odzadu – z kterých výšek v bodě k dojde původní trasa ke konci
  const back: HeightRange[] = new Array<HeightRange>(n);
  back[n - 1] = { lo: hTo, hi: hTo };
  for (let k = n - 2; k >= 0; k--) {
    const r = rangeAlong(grid, points[k + 1]!, points[k]!, back[k + 1]!, ends, false);
    if (!r) return [...points];
    back[k] = r;
  }
  if (hFrom < back[0]!.lo - 1e-9 || hFrom > back[0]!.hi + 1e-9) return [...points];
  const out: PathPoint[] = [points[0]!];
  let i = 0;
  let range: HeightRange = { lo: hFrom, hi: hFrom };
  while (i < n - 1) {
    const prev = out.length >= 2 ? out[out.length - 2]! : null;
    let best = -1;
    let bestRange: HeightRange | null = null;
    let misses = 0;
    for (let j = i + 1; j < n && j - i <= STRAIGHT_SPAN && misses < STRAIGHT_MISSES; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const ok =
        (j === i + 1 || !prev || gentleCorner(prev, a, b)) &&
        (j === i + 1 || j === n - 1 || gentleCorner(a, b, points[j + 1]!));
      const r = ok ? rangeAlong(grid, a, b, range, ends, j > i + 1) : null;
      const joined = r && {
        lo: Math.max(r.lo, back[j]!.lo),
        hi: Math.min(r.hi, back[j]!.hi),
      };
      if (joined && joined.lo <= joined.hi + 1e-9) {
        best = j;
        bestRange = joined;
        misses = 0;
      } else if (j > i + 1) {
        misses++;
      }
    }
    if (best < 0 || !bestRange) return [...points];
    out.push(points[best]!);
    range = bestRange;
    i = best;
  }
  return out;
}

/** Profil vozové cesty – body s navrženou výškou, terén pod nimi a co z toho plyne. */
export interface WagonProfile {
  profile: RoadProfilePoint[];
  /** Výška terénu v bodech profilu (m). */
  natural: number[];
  /** Indexy bodů v brodu. */
  fords: number[];
  lengthM: number;
  /** Nejprudší sklon pláně (m/m). */
  maxGrade: number;
  /** Nejhlubší úvoz a nejvyšší násep v ose (m). */
  maxCutM: number;
  maxFillM: number;
}

function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Body osy po nejvýš WAGON_ROAD.profileStepM (na cm, bez opakování), z lomené čáry – vyhlazené
 * (`smooth`), nebo jak je.
 */
function profileAxis(
  points: readonly PathPoint[],
  smooth: { simplifyM: number; passes: number },
): PathPoint[] {
  const axis =
    smooth.passes > 0
      ? smoothPathLine(
          densify(simplifyPathLine(points, [], smooth.simplifyM).points, SMOOTH_DENSIFY_M),
          [],
          smooth.passes,
        ).points
      : [...points];
  const out: PathPoint[] = [];
  const push = (x: number, z: number): void => {
    const p = { x: cm(x), z: cm(z) };
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.z !== p.z) out.push(p);
  };
  push(axis[0]!.x, axis[0]!.z);
  for (let k = 1; k < axis.length; k++) {
    const a = axis[k - 1]!;
    const b = axis[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / WAGON_ROAD.profileStepM));
    for (let q = 1; q <= n; q++) push(a.x + ((b.x - a.x) * q) / n, a.z + ((b.z - a.z) * q) / n);
  }
  return out;
}

/** Meze výšek pláně v bodech osy (mm): konce v terénu, jinak terén ± mez úprav (dolů na mm). */
function heightBounds(
  natural: readonly number[],
  limits: readonly number[],
): { lo: number[]; hi: number[] } {
  const n = natural.length;
  const lo: number[] = [];
  const hi: number[] = [];
  for (let i = 0; i < n; i++) {
    const hc = natural[i]! * 1000;
    if (i === 0 || i === n - 1) {
      lo.push(Math.round(hc));
      hi.push(Math.round(hc));
      continue;
    }
    const lim = Math.floor(limits[i]! * 1000);
    lo.push(Math.ceil(hc - lim));
    hi.push(Math.floor(hc + lim));
  }
  return { lo, hi };
}

/** Nejvyšší změna výšky pláně (mm) na kroku délky `d` m – dolů, sklon nikdy nepřekročí mez. */
function stepMm(d: number): number {
  // dolů, ne zaokrouhlit: sklon nikdy nepřekročí mez (zaokrouhlení nahoru dávalo 6,3–8 %)
  return Math.floor(WAGON_ROAD.maxGrade * d * 1000 + 1e-9);
}

/**
 * Navržené výšky pláně na ose (na mm): nejmenší zemní práce (plocha průřezu × délka) při sklonu
 * nejvýš WAGON_ROAD.maxGrade mezi každými dvěma body a posunu od terénu nejvýš `limit` buňky
 * (úvoz i násep); konce v terénu. Dynamické programování po bodech přes výšky po milimetrech
 * (klouzavé minimum); ceny jen dvou řádků, rodiče po řádcích jako Int16 (rozsah řádku je nejvýš
 * 2 × 3 m = 6 001 mm) – paměť ≈ 12 kB na bod osy (dřív ≈ 72 kB). Nejde-li to, null.
 */
export function profileHeights(
  axis: readonly PathPoint[],
  natural: readonly number[],
  limits: readonly number[],
): { heights: number[]; cost: number } | null {
  const n = axis.length;
  if (n < 2) return null;
  const bounds = heightBounds(natural, limits);
  const ds: number[] = [];
  for (let i = 1; i < n; i++) {
    ds.push(length2(axis[i]!.x - axis[i - 1]!.x, axis[i]!.z - axis[i - 1]!.z));
  }
  // jen výšky dosažitelné od začátku i ke konci – jiné na nejlevnější profil nikdy nepatří (výsledek
  // je týž jako přes celé meze), DP je kratší a nemožný profil skončí hned
  const lo = [...bounds.lo];
  const hi = [...bounds.hi];
  for (let i = 1; i < n; i++) {
    const m = stepMm(ds[i - 1]!);
    lo[i] = Math.max(lo[i]!, lo[i - 1]! - m);
    hi[i] = Math.min(hi[i]!, hi[i - 1]! + m);
    if (lo[i]! > hi[i]!) return null;
  }
  for (let i = n - 2; i >= 0; i--) {
    const m = stepMm(ds[i]!);
    lo[i] = Math.max(lo[i]!, lo[i + 1]! - m);
    hi[i] = Math.min(hi[i]!, hi[i + 1]! + m);
    if (lo[i]! > hi[i]!) return null;
  }
  const weight = (i: number): number => ((ds[i - 1] ?? 0) + (ds[i] ?? 0)) / 2;
  const widest = Math.max(...hi.map((h, i) => h - lo[i]! + 1), 1);
  // rodič je index v předchozím řádku – Int16 stačí pro meze úprav do 16 m
  const Parent = widest > 32_767 ? Int32Array : Int16Array;
  const parents: (Int16Array | Int32Array)[] = [new Parent(hi[0]! - lo[0]! + 1).fill(-1)];
  // dva řádky cen na střídačku – bez nového pole na každý bod osy
  let prev = new Float64Array(widest);
  let cost = new Float64Array(widest);
  let prevLen = hi[0]! - lo[0]! + 1;
  const deque = new Int32Array(widest);
  for (let i = 1; i < n; i++) {
    const plo = lo[i - 1]!;
    const size = Math.max(0, hi[i]! - lo[i]! + 1);
    cost.fill(Infinity, 0, size);
    const parent = new Parent(size).fill(-1);
    const m = stepMm(ds[i - 1]!);
    // klouzavé minimum přes okno [y − m, y + m] předchozího řádku
    let head = 0;
    let tail = 0;
    let next = 0;
    const w = weight(i);
    for (let k = 0; k < size; k++) {
      const y = lo[i]! + k;
      const right = Math.min(prevLen - 1, y + m - plo);
      while (next <= right) {
        if (Number.isFinite(prev[next]!)) {
          while (tail > head && prev[deque[tail - 1]!]! >= prev[next]!) tail--;
          deque[tail++] = next;
        }
        next++;
      }
      const left = y - m - plo;
      while (tail > head && deque[head]! < left) head++;
      if (tail === head) continue;
      const best = deque[head]!;
      const offset = (y - natural[i]! * 1000) / 100;
      cost[k] = prev[best]! + sectionArea(offset, 0) * w;
      parent[k] = best;
    }
    parents.push(parent);
    [prev, cost] = [cost, prev];
    prevLen = size;
  }
  if (prevLen === 0 || !Number.isFinite(prev[0]!)) return null;
  const out = new Array<number>(n);
  let k = 0;
  for (let i = n - 1; i >= 0; i--) {
    out[i] = (lo[i]! + k) / 1000;
    k = parents[i]![k]!;
  }
  return { heights: out, cost: prev[0]! };
}

/**
 * Kde profil po ose nevyjde (roads.md – Postupná úprava a serpentiny): index prvního bodu, kde se
 * dopředný rozsah výšek pláně (meze a krok jako `profileHeights`) vyprázdní; −1, když vyjde.
 * Celočíselně na mm – stejně na serveru i v prohlížeči.
 */
export function profileFailure(
  axis: readonly PathPoint[],
  natural: readonly number[],
  limits: readonly number[],
): number {
  const n = axis.length;
  if (n < 2) return 0;
  const { lo, hi } = heightBounds(natural, limits);
  let a = lo[0]!;
  let b = hi[0]!;
  for (let i = 1; i < n; i++) {
    const m = stepMm(length2(axis[i]!.x - axis[i - 1]!.x, axis[i]!.z - axis[i - 1]!.z));
    a = Math.max(a - m, lo[i]!);
    b = Math.min(b + m, hi[i]!);
    if (a > b) return i;
  }
  return -1;
}

/** Osa jak je – bez vyhlazení (vozová cesta po staré cestě – její osa už je hladká). */
const AS_IS: readonly { simplifyM: number; passes: number }[] = [{ simplifyM: 0, passes: 0 }];

/** Leží bod do `radiusM` m od buňky u posvátného stromu (`sacred`)? */
export function wagonNearSacred(grid: WagonGrid, p: PathPoint, radiusM: number): boolean {
  let near = false;
  cellsIn(grid, p.x - radiusM, p.z - radiusM, p.x + radiusM, p.z + radiusM, (c, x, z) => {
    if (grid.sacred[c] === 1 && length2(x - p.x, z - p.z) <= radiusM) near = true;
  });
  return near;
}

/** Krok kontroly odstupu osy od plotu (m) – jako u osy trasy chodců (`routeLine`). */
const FENCE_CHECK_M = 0.5;

/**
 * Je bod osy blíž plotu hřbitova či ohrady než `FENCE_CLEARANCE.axisM` (i uvnitř plotu; paths.md –
 * Odstup od plotu)? Do `gateM` od konců cesty `ends` ne – konec u branky, jako osa trasy chodců.
 */
function nearFence(grid: WagonGrid, x: number, z: number, ends: readonly PathPoint[]): boolean {
  if (grid.fences.length === 0) return false;
  const { axisM, gateM } = FENCE_CLEARANCE;
  if (fenceClearance(grid.fences, x, z, axisM) >= axisM) return false;
  return !ends.some((e) => length2(e.x - x, e.z - z) < gateM);
}

/**
 * Index prvního bodu osy `axis`, k němuž úsek od předchozího bodu (vzorky po FENCE_CHECK_M) vede
 * blíž plotu (`nearFence` – osa neusekne roh plotu); −1, když osa drží odstup všude.
 */
function fenceAtAlong(
  grid: WagonGrid,
  axis: readonly PathPoint[],
  ends: readonly PathPoint[],
): number {
  if (grid.fences.length === 0 || axis.length === 0) return -1;
  if (nearFence(grid, axis[0]!.x, axis[0]!.z, ends)) return 0;
  for (let k = 1; k < axis.length; k++) {
    const a = axis[k - 1]!;
    const b = axis[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / FENCE_CHECK_M));
    for (let i = 1; i <= n; i++) {
      if (nearFence(grid, a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, ends)) {
        return k;
      }
    }
  }
  return -1;
}

/**
 * Kde osa `points` jak je přijde k plotu hřbitova či ohrady blíž než `FENCE_CLEARANCE.axisM`
 * (paths.md – Odstup od plotu): index bodu ve `wagonAxisPoints(points)`; −1, když nikde. Do
 * `gateM` od konců cesty se odstup nehlídá (branka).
 */
export function wagonAxisFenceAt(grid: WagonGrid, points: readonly PathPoint[]): number {
  if (points.length < 2) return -1;
  const ends = [points[0]!, points[points.length - 1]!];
  return fenceAtAlong(grid, profileAxis(points, AS_IS[0]!), ends);
}

/** Body osy `points` po nejvýš WAGON_ROAD.profileStepM (na cm) – body profilu `wagonProfile(…, true)`. */
export function wagonAxisPoints(points: readonly PathPoint[]): PathPoint[] {
  return profileAxis(points, AS_IS[0]!);
}

/**
 * Kde profil po ose `points` jak je (`wagonProfile(…, true)`) nevyjde: index bodu v
 * `wagonAxisPoints(points)` (`profileFailure`); −1, když vyjde.
 */
export function wagonProfileFailure(grid: WagonGrid, points: readonly PathPoint[]): number {
  const axis = wagonAxisPoints(points);
  const at = axis.map((p) => axisPoint(grid, p.x, p.z));
  return profileFailure(
    axis,
    at.map((p) => p.natural),
    at.map((p) => p.limit),
  );
}

/**
 * Neprojede vůz osou `points` (stará cesta – roads.md, Vozová cesta po staré cestě)? Body osy po
 * WAGON_ROAD.profileStepM mimo okolí konců (konec cesty bývá u vchodu stavby): zakázaná buňka
 * (plot, voda mimo brod, sráz, balvan – `barred`) nebo bod u stavby blíž než vozová síť pustí vůz
 * (půl šířky vozu – stará cesta tam vede a vůz po ní jezdí). Strom či keř na pevné cestě ji
 * nezavře (`wagonRoadGrid`), posvátný strom hlídá přesně kácení (`wagonClearing`). S `fences`
 * i osa blíž plotu než `FENCE_CLEARANCE.axisM` (`wagonAxisFenceAt`).
 */
export function wagonAxisBlocked(
  grid: WagonGrid,
  village: PathVillage,
  points: readonly PathPoint[],
  fences = true,
): boolean {
  if (points.length < 2) return true;
  const ends = [points[0]!, points[points.length - 1]!];
  const buildings = villageBuildings(village).all;
  const margin = HOUSE_MARGIN_M + CART_ROUTES.widthM / 2;
  for (const p of profileAxis(points, AS_IS[0]!)) {
    if (ends.some((e) => length2(e.x - p.x, e.z - p.z) <= END_REACH_FAR_M)) continue;
    const c = cellAt(grid, p.x, p.z);
    if (c < 0 || (grid.barred[c] === 1 && grid.sacred[c] !== 1)) return true;
    if (buildings.some((b) => inBuilding(b, p.x, p.z, margin))) return true;
  }
  return fences && wagonAxisFenceAt(grid, points) >= 0;
}

/**
 * Profil vozové cesty na trase `points` (konce cesty a středy buněk): osa vyhlazená (kde to nejde
 * se sklonem, jak ji našlo hledání), body po WAGON_ROAD.profileStepM, navržené výšky
 * (`profileHeights`). `asIs` – osa staré cesty bez vyhlazení (vozová cesta vede po ní, průjezd
 * hlídá `wagonAxisBlocked`). Bez profilu null.
 */
export function wagonProfile(
  grid: WagonGrid,
  points: readonly PathPoint[],
  asIs = false,
): WagonProfile | null {
  let best: { profile: WagonProfile; cost: number } | null = null;
  for (const smooth of asIs ? AS_IS : SMOOTHING) {
    const axis = profileAxis(points, smooth);
    if (axis.length < 2) return null;
    const at = axis.map((p) => axisPoint(grid, p.x, p.z));
    // vyhlazená osa nesmí do zakázané buňky (kromě okolí konců cesty) ani k plotu – neusekne jeho
    // roh, roh trasy zůstane (paths.md – Odstup od plotu)
    const ends = [points[0]!, points[points.length - 1]!];
    if (
      smooth.passes > 0 &&
      (axis.some(
        (p, i) =>
          at[i]!.blocked &&
          (at[i]!.sacred || !ends.some((e) => length2(e.x - p.x, e.z - p.z) <= END_REACH_FAR_M)),
      ) ||
        fenceAtAlong(grid, axis, ends) >= 0)
    ) {
      continue;
    }
    const natural = at.map((p) => p.natural);
    const fordAt = at.map((p) => p.ford);
    const limits = at.map((p) => p.limit);
    const solved = profileHeights(axis, natural, limits);
    if (!solved) continue;
    // hladší osa má přednost, dokud nestojí o víc než SMOOTH_BONUS zemních prací
    if (best && solved.cost * SMOOTH_BONUS >= best.cost) continue;
    const ys = solved.heights;
    const profile = axis.map((p, i) => ({ x: p.x, z: p.z, y: ys[i]! }));
    let lengthM = 0;
    let maxGrade = 0;
    let maxCutM = 0;
    let maxFillM = 0;
    for (let i = 0; i < profile.length; i++) {
      const o = ys[i]! - natural[i]!;
      if (!fordAt[i]) {
        maxCutM = Math.max(maxCutM, -o);
        maxFillM = Math.max(maxFillM, o);
      }
      if (i === 0) continue;
      const a = profile[i - 1]!;
      const b = profile[i]!;
      const d = length2(b.x - a.x, b.z - a.z);
      lengthM += d;
      if (d > 0) maxGrade = Math.max(maxGrade, Math.abs(b.y - a.y) / d);
    }
    best = {
      cost: solved.cost,
      profile: {
        profile,
        natural,
        fords: fordAt.flatMap((f, i) => (f ? [i] : [])),
        lengthM,
        maxGrade,
        maxCutM,
        maxFillM,
      },
    };
  }
  return best?.profile ?? null;
}

/** Zemní práce vozové cesty – objemy a práce po kusech osy (WAGON_BIN_M). */
export interface WagonEarthworks {
  cutM3: number;
  fillM3: number;
  /** Násep z hlíny z úvozu (m³) a hlína z boku (m³). */
  movedM3: number;
  borrowM3: number;
  /** Práce zemních prací (čd) po kusech osy – podle polohy na ose. */
  labor: Float64Array;
  /** Práce zemních prací celkem (čd). */
  laborManDays: number;
}

/** Délka kusu osy pro objemy a převoz hlíny (m). */
export const WAGON_BIN_M = 5;
/** Krok vzorků objemu (m) – čtverečky 1 × 1 m. */
const VOLUME_STEP_M = 1;

/**
 * Objemy a práce zemních prací profilu (roads.md – Vozová cesta): terén po úpravě proti dnešnímu
 * (`natural` – terén mřížky i s úpravami jiných cest) po čtverečcích 1 m, každý ke kusu osy
 * nejbližší úsečky. Výkop: `digPerM3`. Násep: hlína z úvozu na téže cestě (převoz
 * `haulPerM3` podle vzdálenosti po ose + uložení `placePerM3`), kde je to levnější než hlína
 * z boku (výkop + krátký převoz + uložení) – napřed nejbližší dvojice kusů; zbytek z boku.
 * Přebytek výkopu se rozhrne vedle (v ceně výkopu).
 */
export function wagonEarthworks(
  grid: WagonGrid,
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
): WagonEarthworks {
  const edits = terrainEditsFrom([{ profile, fords, reachedM: Infinity }]);
  const lengths = [0];
  for (let k = 1; k < profile.length; k++) {
    lengths.push(
      lengths[k - 1]! +
        length2(profile[k]!.x - profile[k - 1]!.x, profile[k]!.z - profile[k - 1]!.z),
    );
  }
  const total = lengths[lengths.length - 1]!;
  const bins = Math.max(1, Math.ceil(total / WAGON_BIN_M));
  const cut = new Float64Array(bins);
  const fill = new Float64Array(bins);
  const near = { arc: 0, d: 0 };
  const cellArea = VOLUME_STEP_M * VOLUME_STEP_M;
  for (const key of [...edits.buckets.keys()].sort((a, b) => a - b)) {
    const bi = Math.floor(key / 65536) - 32768;
    const bj = (key % 65536) - 32768;
    const steps = 16 / VOLUME_STEP_M;
    for (let sj = 0; sj < steps; sj++) {
      for (let si = 0; si < steps; si++) {
        const x = bi * 16 + (si + 0.5) * VOLUME_STEP_M;
        const z = bj * 16 + (sj + 0.5) * VOLUME_STEP_M;
        const base = wagonGridHeight(grid, x, z);
        const dv = editedHeight(edits, x, z, base, near) - base;
        if (Math.abs(dv) < 1e-4) continue;
        const b = Math.min(bins - 1, Math.max(0, Math.floor(near.arc / WAGON_BIN_M)));
        if (dv < 0) cut[b] = cut[b]! - dv * cellArea;
        else fill[b] = fill[b]! + dv * cellArea;
      }
    }
  }
  return balanceEarth(cut, fill);
}

/**
 * Převoz hlíny z úvozu do náspu (napřed nejbližší dvojice kusů osy, jen kam je převoz levnější
 * než hlína z boku) a práce po kusech: výkop všude, násep z úvozu převoz + uložení, z boku výkop
 * + krátký převoz + uložení.
 */
export function balanceEarth(cut: Float64Array, fill: Float64Array): WagonEarthworks {
  const bins = cut.length;
  const { digPerM3, placePerM3, haulPerM3 } = WAGON_ROAD;
  const haul = (m: number): number => haulPerM3.base + (haulPerM3.per100M * m) / 100;
  const borrow = digPerM3 + haul(0) + placePerM3;
  const labor = new Float64Array(bins);
  const cutLeft = new Float64Array(cut);
  const fillLeft = new Float64Array(fill);
  let cutM3 = 0;
  let fillM3 = 0;
  for (let b = 0; b < bins; b++) {
    labor[b] = cut[b]! * digPerM3;
    cutM3 += cut[b]!;
    fillM3 += fill[b]!;
  }
  // dvojice kusů s výkopem a náspem podle vzdálenosti (při shodě v pořadí kusů)
  const pairs: [number, number][] = [];
  for (let i = 0; i < bins; i++) {
    if (cut[i]! <= 0) continue;
    for (let j = 0; j < bins; j++) {
      if (fill[j]! <= 0) continue;
      if (haul(Math.abs(i - j) * WAGON_BIN_M) + placePerM3 < borrow) pairs.push([i, j]);
    }
  }
  pairs.sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]) || a[0] - b[0] || a[1] - b[1]);
  let movedM3 = 0;
  for (const [i, j] of pairs) {
    const m = Math.min(cutLeft[i]!, fillLeft[j]!);
    if (m <= 0) continue;
    cutLeft[i] = cutLeft[i]! - m;
    fillLeft[j] = fillLeft[j]! - m;
    labor[j] = labor[j]! + m * (haul(Math.abs(i - j) * WAGON_BIN_M) + placePerM3);
    movedM3 += m;
  }
  let borrowM3 = 0;
  for (let j = 0; j < bins; j++) {
    labor[j] = labor[j]! + fillLeft[j]! * borrow;
    borrowM3 += fillLeft[j]!;
  }
  return {
    cutM3,
    fillM3,
    movedM3,
    borrowM3,
    labor,
    laborManDays: labor.reduce((sum, v) => sum + v, 0),
  };
}

/** Pevná cesta pro čas jízdy – osa, stupeň, vozová, mokřina a olemování stromy. */
export interface WagonTimeRoad {
  points: readonly PathPoint[];
  grade?: RoadGrade;
  unbridged?: boolean | undefined;
  cart?: boolean;
  ground?: RoadGround;
  lined?: RoadLining;
}

/** Délka kusu pro sklon při času jízdy (m) – jako sjízdnost osy (dvě buňky terénu). */
const TIME_PIECE_M = 7.5;

/**
 * Doba jízdy vozu (min) po pevných cestách `roads` za sebou (stará cesta): kusy po TIME_PIECE_M
 * – rychlost cesty (`cartRoadSpeed` i s mokřinou a stromy), sklon terénu mřížky, brod pomalu; nad
 * CART_ROUTES.maxGrade nebo přes vodu mimo brod vůz neprojede – null.
 */
export function roadsCartMinutes(grid: WagonGrid, roads: readonly WagonTimeRoad[]): number | null {
  let cost = 0;
  for (const road of roads) {
    const pts = road.points;
    let along = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const length = length2(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(length / TIME_PIECE_M));
      for (let q = 0; q < n; q++) {
        const u0 = q / n;
        const u1 = (q + 1) / n;
        const x0 = a.x + (b.x - a.x) * u0;
        const z0 = a.z + (b.z - a.z) * u0;
        const x1 = a.x + (b.x - a.x) * u1;
        const z1 = a.z + (b.z - a.z) * u1;
        const piece = length / n;
        const mid = along + piece * (q + 0.5);
        const wet = (road.ground?.wet ?? []).some(([s, e]) => mid >= s && mid <= e);
        const c = cellAt(grid, (x0 + x1) / 2, (z0 + z1) / 2);
        const flags = c >= 0 ? grid.flags[c]! : 0;
        if (flags & PATH_WATER && !(flags & PATH_FORD)) return null;
        const grade =
          piece > 0
            ? Math.abs(wagonGridHeight(grid, x1, z1) - wagonGridHeight(grid, x0, z0)) / piece
            : 0;
        if (grade > CART_ROUTES.maxGrade + 1e-9) return null;
        const speed = cartRoadSpeed(
          road.grade ?? 'trodden',
          road.cart === true,
          wet,
          roadTreeSpeed(road.lined),
          road.unbridged === true,
        );
        const ford = flags & PATH_FORD ? CART_ROUTES.fordCost : 1;
        cost += (piece / speed) * gradeFactor(grade) * ford;
      }
      along += length;
    }
  }
  return cost / TEAM_TRAVEL.speedMps / 60;
}

/**
 * Doba jízdy vozu (min) po vozové cestě s profilem: rychlost vozové cesty, sklon pláně, brod
 * pomalu (CART_ROUTES.fordCost).
 */
export function profileCartMinutes(
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
): number {
  const ford = new Set(fords);
  let cost = 0;
  for (let k = 1; k < profile.length; k++) {
    const a = profile[k - 1]!;
    const b = profile[k]!;
    const d = length2(b.x - a.x, b.z - a.z);
    if (d <= 0) continue;
    const slow = ford.has(k) || ford.has(k - 1) ? CART_ROUTES.fordCost : 1;
    cost += (d / CART_SPEED.road.wagon) * gradeFactor(Math.abs(b.y - a.y) / d) * slow;
  }
  return cost / TEAM_TRAVEL.speedMps / 60;
}

/** Úpravy terénu jednoho profilu celé délky (pro výšky po stavbě – náhled, testy). */
export function profileEdits(
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
): TerrainEdits {
  return terrainEditsFrom([{ profile, fords, reachedM: Infinity }]);
}
