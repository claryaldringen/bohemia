import {
  length2,
  obstaclesNear,
  transferPrecision,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '../landscape';
import { villageManor } from './manor';
import {
  obstacleChangesAt,
  obstacleStatus,
  recordClearedObstacles,
  type ObstacleChanges,
} from './obstacles';
import {
  earthworkReachedM,
  earthworkSpansOf,
  editedHeight,
  profileLength,
  terrainEditsFrom,
  withTerrainEdits,
  type EarthworkSpan,
} from './paths/earthworks';
import { simplifyPathLine, type PathPoint, type PathVillage } from './paths/network';
import { roadChain, type ChainLink } from './paths/road-chains';
import { absorbParallelRoads, addWagonRoad } from './paths/roads';
import { axisDistance, axisSlice } from './paths/roads-geometry';
import { pathTerrainOf, pathWindowFor, PATH_WOODLAND, withObstacles } from './paths/terrain';
import { pathVillageOf } from './paths/village';
import {
  WAGON_BIN_M,
  findWagonRoute,
  profileCartMinutes,
  profileEdits,
  roadsCartMinutes,
  straightenWagonRoute,
  wagonAxisBlocked,
  wagonAxisPoints,
  wagonEarthworks,
  wagonGridHeight,
  wagonNearSacred,
  wagonProfile,
  wagonProfileFailure,
  wagonRoadGrid,
  type WagonGrid,
  type WagonTimeRoad,
} from './paths/wagon-route';
import { keepClear, type SwathTally } from './road-swath';
import {
  OBSTACLE_COST,
  ROAD_SWATH,
  ROAD_UPGRADES,
  WAGON_DETOUR,
  WAGON_ROAD,
  WAGON_STRAIGHTEN,
} from './rules';
import { roadNeedsUpgrade } from './road-upgrades';
import { sacredSitesOf } from './sacred';
import type {
  ChronicleEvent,
  Construction,
  ConstructionWood,
  LaborTarget,
  Road,
  RoadEarthwork,
  RoadProfilePoint,
  VillageState,
} from './types';
import {
  addLogs,
  claimedObstacles,
  logsFromClearedTrees,
  planWoodFrom,
  takeWood,
  woodFellingCost,
  woodLogs,
} from './wood';
import { isWoodTreeId } from './woods';

// Vozová cesta (roads.md – Vozová cesta; Martin, 20. 10. 2026: „Měla by přibýt cesta upravená pro
// vůz. Ta bude vozu dávat ještě větší rychlost, bude mít vyježděné, ale zpevněné koleje. Zároveň
// dojde k podstatné změně – tato cesta spojí dva body, které spojuje stará cesta pro pěší, ale co
// nejvíc přímo tak, aby vůz projel.“; Martin 22. 10. 2026, #6: „Vozová cesta: vznikne ze staré
// pěší cesty a vede po ní.“). Hráč vybere cestu (řetěz úseků – road-chains.ts) a v panelu potvrdí
// „Upravit pro vozy“: osa vozové cesty je osa staré cesty (řetěz mezi rozcestími nebo volnými
// konci), po ní profil (paths/wagon-route.ts – sklon do 6 % s úvozem a náspem do 3 m), zemní
// práce, zpevnění kolejí a kácení a vznikne stavba ze společné práce po úsecích od vsi ven. Hotový
// úsek je hned pevná cesta stupně `wagon` (sjízdná – vůz 2,2, pěšky 1,7 i v mokřině), terén se
// upraví podle profilu (paths/earthworks.ts) a kus staré cesty pod ním zmizí (`absorbParallelRoads`)
// – souběžné cesty nevzniknou. Čisté funkce – náhled v prohlížeči počítá totéž (`planWagonRoad`)
// jako server při zahájení stavby (`startWagonRoad`).

export const WAGON_NO_ROAD = 'Cesta tu už není.';
export const WAGON_LOOP = 'Cesta je okruh – vozová cesta potřebuje dva konce.';
export const WAGON_SHORT = 'Cesta je na úpravu pro vozy moc krátká.';
export const WAGON_EXISTS = 'Cesta už je upravená pro vozy.';
export const WAGON_BUILDING = 'Cesta se už upravuje pro vozy.';
export const WAGON_BLOCKED = 'Vůz po této cestě neprojede – překáží stavba, plot nebo voda.';
/** Vozová cesta se staví na upravené cestě (roads.md – Postupná úprava, Martin 24. 10. 2026). */
export const WAGON_FIRST = 'Napřed uprav cestu.';
export const WAGON_STEEP = 'Cesta je pro vůz moc prudká.';
export const WAGON_NO_WOOD = 'Na lávku chybí dřevo.';
export const WAGON_SACRED = 'Vozové cestě stojí v cestě posvátný dub – kácet se nesmí.';

/** Kratší cesta se pro vozy neupravuje (m) – jako nejkratší pevná cesta. */
const MIN_CHAIN_M = 15;
/**
 * Okraj mřížky kolem staré cesty (m) – vejde se pláň, svahy úvozu a náspu, průsek a vzdálenost
 * ke stavbám, která omezuje úpravy terénu (`WagonGrid.limit`).
 */
const GRID_PAD_M = 30;
/** Úprava terénu menší než tolik (m) nechá překážku stát. */
const FOOTPRINT_M = 0.1;

/** Pevná cesta, jak ji náhled potřebuje – úsek řetězu s rychlostí a provozem vozů. */
export interface WagonPlanRoad extends WagonTimeRoad {
  id: number;
  points: readonly PathPoint[];
  /** Provoz vozů posledních let (jízd za den, nejnovější poslední) – `Road.cartTraffic`. */
  cartTraffic?: readonly number[];
}

/** Zemní práce vsi pro náhled – kus osy a jestli se ještě staví. */
export type WagonPlanEarthwork = EarthworkSpan & { building?: boolean };

/** Co náhled i zahájení stavby potřebují – stejné na serveru i v prohlížeči. */
export interface WagonPlanInput {
  landscape: Landscape;
  layer: ObstacleLayer | null;
  changes: ObstacleChanges;
  /** Překážky jiných staveb – zůstanou stát (průsek je obejde). */
  claimed?: ReadonlySet<number>;
  /** Ves jako síť pěšin (`pathVillageOf`, ve scéně `SceneVillage`). */
  village: PathVillage;
  roads: readonly WagonPlanRoad[];
  /** Zemní práce vsi (terén) – i rozestavěné. */
  earthworks: readonly WagonPlanEarthwork[];
  roadId: number;
  /** Střed vsi (dvorec) – stavba jde od konce blíž k němu ven; bez vsi od začátku řetězu. */
  home: PathPoint | null;
  /** Klády na hromadě vsi (kusy) – na lávky u brodů; bez údaje žádné. */
  woodLogs?: number;
}

/** Úsek stavby vozové cesty – konec na ose (m), práce celkem a po druzích, stromy. */
export interface WagonPiecePlan {
  toM: number;
  manDays: number;
  earthManDays: number;
  pavingManDays: number;
  clearingManDays: number;
  trees: number;
}

/** Naplánovaná vozová cesta – trasa, profil, cena a co z ní plyne, nebo proč nejde. */
export type WagonRoadPlan =
  | {
      ok: true;
      /** Úseky staré cesty (řetěz) v pořadí cesty. */
      chain: number[];
      /** Konce – `from` u vsi (odtud se staví). */
      from: PathPoint;
      to: PathPoint;
      profile: RoadProfilePoint[];
      fords: number[];
      pieces: WagonPiecePlan[];
      lengthM: number;
      oldLengthM: number;
      /** Stromy na lávky pro pěší u brodů (`ROAD_UPGRADES.footbridge`) – klády z hromady, jinak pokácené. */
      footbridgeTrees: number;
      /** Kolik dřeva na lávky chybí (hromada + nejbližší stromy) – stavba nejde zahájit. */
      missingWood: number;
      /** Obejité kusy staré osy (narovnání) – po dostavění zarostou (`Road.abandoned`). */
      bypassed: PathPoint[][];
      /** Nejprudší místo nové trasy (m/m) a staré cesty (terén pod ní). */
      maxGrade: number;
      oldMaxGrade: number;
      maxCutM: number;
      maxFillM: number;
      cutM3: number;
      fillM3: number;
      /** Násep z hlíny z úvozu (m³). */
      movedM3: number;
      laborManDays: number;
      /** Dospělé stromy kácené v průseku (klády na hromadu). */
      trees: number;
      /**
       * Co stavba vykácí a odklidí (id překážek – vzestupně): odstraněné natrvalo (pláň, zemní
       * práce, pás cesty) a pokácené stromy po stranách průseku (zůstane pařez).
       */
      cleared: number[];
      felled: number[];
      /** Doba jízdy vozu (min): stará cesta (null – vůz po ní neprojede) a nová. */
      minutesBefore: number | null;
      minutesAfter: number;
    }
  | { ok: false; reason: string };

function tenths(v: number): number {
  return Math.round(v * 10) / 10;
}

function cmKey(p: PathPoint): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/** Konce řetězu (začátek prvního úseku a konec posledního – podle směru v řetězu). */
function chainEnds(chain: readonly ChainLink<WagonPlanRoad>[]): [PathPoint, PathPoint] {
  const first = chain[0]!;
  const last = chain[chain.length - 1]!;
  const a = first.reversed
    ? first.road.points[first.road.points.length - 1]!
    : first.road.points[0]!;
  const b = last.reversed ? last.road.points[0]! : last.road.points[last.road.points.length - 1]!;
  return [a, b];
}

/** Osa řetězu – body úseků v pořadí a směru řetězu, společné uzly jednou. */
function chainAxis(chain: readonly ChainLink<WagonPlanRoad>[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (const link of chain) {
    const pts = link.reversed ? [...link.road.points].reverse() : link.road.points;
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && cmKey(last) === cmKey(p)) continue;
      out.push({ x: p.x, z: p.z });
    }
  }
  return out;
}

/** Uzly řetězu – konce všech jeho úseků (na cm). */
function chainNodes(chain: readonly ChainLink<WagonPlanRoad>[]): Set<string> {
  const out = new Set<string>();
  for (const link of chain) {
    out.add(cmKey(link.road.points[0]!));
    out.add(cmKey(link.road.points[link.road.points.length - 1]!));
  }
  return out;
}

/**
 * Zemní práce vozové cesty k řetězu: oba konce profilu leží v uzlech řetězu (konce cesty, ze které
 * se plánovala – i když se k ní mezitím připojily hotové úseky vozové cesty). Cesta, která s ní
 * sdílí jen rozcestí, ji nemá.
 */
function chainEarthwork<E extends { profile: readonly PathPoint[] }>(
  earthworks: readonly E[],
  chain: readonly ChainLink<WagonPlanRoad>[],
): E | null {
  const nodes = chainNodes(chain);
  for (const e of earthworks) {
    if (e.profile.length < 2) continue;
    if (nodes.has(cmKey(e.profile[0]!)) && nodes.has(cmKey(e.profile[e.profile.length - 1]!))) {
      return e;
    }
  }
  return null;
}

/** Stav vozové cesty u cesty hráče bez hledání trasy – hotová, staví se, nebo proč nejde. */
export function wagonChainStatus(
  roads: readonly WagonPlanRoad[],
  earthworks: readonly WagonPlanEarthwork[],
  roadId: number,
): { status: 'built' | 'building' | 'none'; blocked: string | null } {
  const chain = roadChain(roads, roadId);
  if (chain.length === 0) return { status: 'none', blocked: WAGON_NO_ROAD };
  const [a, b] = chainEnds(chain);
  const earthwork = chainEarthwork(earthworks, chain);
  if (earthwork?.building) return { status: 'building', blocked: WAGON_BUILDING };
  if (earthwork || chain.some((link) => link.road.grade === 'wagon')) {
    return { status: 'built', blocked: WAGON_EXISTS };
  }
  if (cmKey(a) === cmKey(b)) return { status: 'none', blocked: WAGON_LOOP };
  const length = chain.reduce((sum, link) => sum + profileLength(link.road.points), 0);
  if (length < MIN_CHAIN_M) return { status: 'none', blocked: WAGON_SHORT };
  // postupně: nejdřív úprava celého řetězu vč. hatě a lávky; rozestavěná se nepočítá
  if (chain.some((link) => roadNeedsUpgrade(link.road))) {
    return { status: 'none', blocked: WAGON_FIRST };
  }
  return { status: 'none', blocked: null };
}

/** Okno mřížky – obdélník osy s okrajem GRID_PAD_M. */
function axisBox(axis: readonly PathPoint[]): {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
} {
  return {
    minX: Math.min(...axis.map((p) => p.x)) - GRID_PAD_M,
    minZ: Math.min(...axis.map((p) => p.z)) - GRID_PAD_M,
    maxX: Math.max(...axis.map((p) => p.x)) + GRID_PAD_M,
    maxZ: Math.max(...axis.map((p) => p.z)) + GRID_PAD_M,
  };
}

/** Krajiny s přesností prohlížeče podle objektu krajiny (`planGrid`). */
const browserLandscapes = new WeakMap<Landscape, Landscape>();

/**
 * Krajina s přesností prohlížeče (`transferPrecision` – výšky na cm): náhled v prohlížeči i stavba
 * na serveru tak naplánují bit po bitu stejnou trasu a cenu (prohlížeč dostane krajinu už v této
 * přesnosti – převod je tam beze změny).
 */
function browserLandscape(landscape: Landscape): Landscape {
  let out = browserLandscapes.get(landscape);
  if (!out) {
    out = transferPrecision(landscape);
    browserLandscapes.set(landscape, out);
  }
  return out;
}

/** Mřížka hledání vozové cesty pro vstup a okno – terén s úpravami vsi. */
function planGrid(
  input: WagonPlanInput,
  box: { minX: number; minZ: number; maxX: number; maxZ: number },
): WagonGrid {
  // terén okna (z mezipaměti podle krajiny) s překážkami krajiny – balvany a výchozy neprůchodné
  const landscape = browserLandscape(input.landscape);
  const window = pathTerrainOf(landscape, pathWindowFor(landscape, box));
  const withLayer = input.layer ? withObstacles(window, input.layer, input.changes) : window;
  const terrain = withTerrainEdits(withLayer, terrainEditsFrom(input.earthworks));
  return wagonRoadGrid({
    village: input.village,
    terrain,
    layer: input.layer,
    changes: input.changes,
  });
}

/** Co zemní práce a průsek vykácí – po úsecích stavby (překážka patří úseku nejbližšího bodu osy). */
interface WagonClearing {
  pieces: SwathTally[];
  sacred: boolean;
  /** Nejbližší místo osy (m od začátku), kde stavba zasáhne posvátný strom; jinak Infinity. */
  sacredArc: number;
}

const CUT: ReadonlySet<ObstacleKind> = new Set([
  'tree',
  'youngTree',
  'shrub',
  'snag',
  'fallenTree',
]);
const ROADBED_ONLY: ReadonlySet<ObstacleKind> = new Set(['stump', 'stone']);

/**
 * Kácení vozové cesty (roads.md – Vozová cesta, Průsek lesem): v lese průsek ROAD_SWATH.halfM od
 * osy jako u upravené cesty, všude navíc pláň (WAGON_ROAD.flatHalfM) a kde se terén upraví
 * (úvoz, násep – `FOOTPRINT_M`): stromy, mladé stromky, keře, souše a padlé kmeny; na vozovce
 * a pod zemními pracemi i pařezy a kameny (strom tam dá i práci pařezu), po stranách průseku
 * pařez zůstane a nedoroste. Stromy u cest, jabloně a les vsi taky. Posvátný strom na pláni nebo
 * pod zemními pracemi – stavba nejde. Překážky jiných staveb (`claimed`) zůstanou. Pořadí podle id.
 */
function wagonClearing(
  input: Pick<WagonPlanInput, 'layer' | 'changes' | 'claimed'>,
  grid: WagonGrid,
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
  bounds: readonly number[],
): WagonClearing {
  const out: WagonClearing = {
    pieces: bounds.map(() => ({
      cost: 0,
      cleared: [],
      felled: [],
      trees: 0,
      kept: [],
      sacred: false,
    })),
    sacred: false,
    sacredArc: Infinity,
  };
  const edits = profileEdits(profile, fords);
  if (edits.count === 0) return out;
  const status = obstacleStatus(input.changes);
  const claimed = input.claimed ?? new Set<number>();
  const near = { arc: 0, d: 0 };
  const b = edits.bounds;
  const pieceOf = (arc: number): number => {
    for (let k = 0; k < bounds.length; k++) if (arc <= bounds[k]! + 1e-9) return k;
    return bounds.length - 1;
  };
  const corner = { arc: 0, d: 0 };
  const cornersChanged = (x: number, z: number): boolean => {
    const i0 = Math.floor((x - grid.originX) / grid.cellM);
    const j0 = Math.floor((z - grid.originZ) / grid.cellM);
    for (const [di, dj] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const cx = grid.originX + (i0 + di) * grid.cellM;
      const cz = grid.originZ + (j0 + dj) * grid.cellM;
      const natural = wagonGridHeight(grid, cx, cz);
      if (Math.abs(editedHeight(edits, cx, cz, natural, corner) - natural) > FOOTPRINT_M) {
        return true;
      }
    }
    return false;
  };
  const woodlandAt = (x: number, z: number): boolean => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return false;
    return (grid.flags[j * grid.width + i]! & PATH_WOODLAND) !== 0;
  };
  const visit = (
    id: number,
    kind: ObstacleKind,
    x: number,
    z: number,
    sacredTree: boolean,
    wood: boolean,
  ): void => {
    const base = wagonGridHeight(grid, x, z);
    const h = editedHeight(edits, x, z, base, near);
    if (near.arc < 0) return;
    const nearest = { arc: near.arc, d: near.d };
    // terén se upraví pod překážkou, nebo v bodech sítě kolem ní (síť terénu scény má krok
    // buňky – svah úvozu tam vyjde širší): překážka by visela nad terénem nebo v něm vězela
    const changed = Math.abs(h - base) > FOOTPRINT_M || cornersChanged(x, z);
    const footprint = changed || nearest.d <= WAGON_ROAD.flatHalfM;
    const bed = nearest.d <= WAGON_ROAD.bedHalfM || changed;
    near.arc = nearest.arc;
    near.d = nearest.d;
    const woodland = wood || woodlandAt(x, z);
    const swath = woodland && near.d <= ROAD_SWATH.halfM;
    const tally = out.pieces[pieceOf(near.arc)]!;
    if (sacredTree) {
      if (footprint) {
        out.sacred = true;
        out.sacredArc = Math.min(out.sacredArc, nearest.arc);
        tally.sacred = true;
      }
      return;
    }
    if (CUT.has(kind)) {
      if (!footprint && !swath) return;
      if (claimed.has(id)) {
        tally.kept.push(id);
        return;
      }
      if (kind === 'tree') {
        tally.trees++;
        tally.cost += OBSTACLE_COST.tree;
        if (bed) {
          tally.cost += OBSTACLE_COST.stump;
          tally.cleared.push(id);
        } else {
          tally.felled.push(id);
        }
        return;
      }
      tally.cost += OBSTACLE_COST[kind as keyof typeof OBSTACLE_COST] ?? 0;
      tally.cleared.push(id);
      return;
    }
    if (ROADBED_ONLY.has(kind)) {
      if (bed && !claimed.has(id)) {
        tally.cost += OBSTACLE_COST[kind as keyof typeof OBSTACLE_COST] ?? 0;
        tally.cleared.push(id);
      } else if (kind === 'stump' && swath) {
        tally.kept.push(id);
      }
    }
  };
  if (input.layer) {
    const layer = input.layer;
    const protectedTrees = sacredSitesOf(layer).protectedTrees;
    const indices = obstaclesNear(layer, b.minX, b.minZ, b.maxX, b.maxZ).sort(
      (p, q) => layer.id[p]! - layer.id[q]!,
    );
    for (const index of indices) {
      const kind = status.kindOf(layer, index);
      if (kind === null) continue;
      const id = layer.id[index]!;
      visit(id, kind, layer.x[index]!, layer.z[index]!, protectedTrees.has(id), false);
    }
  }
  const added = [...status.addedIn(b.minX, b.minZ, b.maxX, b.maxZ)].sort((p, q) => p.id - q.id);
  for (const o of added) visit(o.id, o.kind, o.x, o.z, false, isWoodTreeId(o.id));
  for (const tally of out.pieces) tally.cost = tenths(tally.cost);
  return out;
}

/** Konce úseků stavby (m od začátku osy) – stejně dlouhé, co nejblíž WAGON_ROAD.pieceM. */
function pieceBounds(lengthM: number): number[] {
  const count = Math.max(1, Math.round(lengthM / WAGON_ROAD.pieceM));
  return Array.from({ length: count }, (_, k) =>
    k === count - 1 ? lengthM : (lengthM * (k + 1)) / count,
  );
}

/** Nejprudší místo staré cesty (m/m) – sklon terénu mřížky po kusech ≈ 7,5 m po osách úseků. */
function chainMaxGrade(grid: WagonGrid, roads: readonly WagonPlanRoad[]): number {
  let max = 0;
  for (const road of roads) {
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const d = length2(b.x - a.x, b.z - a.z);
      if (d <= 0) continue;
      const n = Math.max(1, Math.ceil(d / 7.5));
      for (let q = 0; q < n; q++) {
        const x0 = a.x + ((b.x - a.x) * q) / n;
        const z0 = a.z + ((b.z - a.z) * q) / n;
        const x1 = a.x + ((b.x - a.x) * (q + 1)) / n;
        const z1 = a.z + ((b.z - a.z) * (q + 1)) / n;
        const rise = Math.abs(wagonGridHeight(grid, x1, z1) - wagonGridHeight(grid, x0, z0));
        max = Math.max(max, rise / (d / n));
      }
    }
  }
  return max;
}

/** Osa s body nejvýš po `stepM` (původní vrcholy zůstanou) – kandidáti na narovnání. */
function subdivide(axis: readonly PathPoint[], stepM: number): PathPoint[] {
  const out: PathPoint[] = [axis[0]!];
  for (let k = 1; k < axis.length; k++) {
    const a = axis[k - 1]!;
    const b = axis[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / stepM));
    for (let q = 1; q <= n; q++) {
      out.push(q === n ? b : { x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  return out;
}

/**
 * Práce profilu (čd): zemní práce s převozem, zpevnění kolejí a kácení (`wagonClearing`); null –
 * profil nevyšel nebo stavbě stojí v cestě posvátný strom.
 */
function profileCost(
  grid: WagonGrid,
  input: Pick<WagonPlanInput, 'layer' | 'changes' | 'claimed'>,
  axis: readonly PathPoint[],
): number | null {
  const p = wagonProfile(grid, axis, true);
  if (!p) return null;
  const earth = wagonEarthworks(grid, p.profile, p.fords);
  const clearing = wagonClearing(input, grid, p.profile, p.fords, [p.lengthM]);
  if (clearing.sacred) return null;
  let sum = WAGON_ROAD.pavingPerM * p.lengthM;
  earth.labor.forEach((v) => (sum += v));
  for (const piece of clearing.pieces) sum += piece.cost;
  return sum;
}

/** Kolik tětiv nejvýš vyzkoušet (od nejvíc ušetřené délky) – ohraničuje cenu plánování. */
const STRAIGHTEN_TRIES = 8;
const STRAIGHTEN_STEP_M = 6;

/**
 * Narovná kličkující kusy osy (roads.md – Vozová cesta, narovnání; Martin 22. 10. 2026, #6): kus
 * nejvýš `WAGON_STRAIGHTEN.maxM` m, kde je osa aspoň `ratio`× delší než tětiva mezi konci a konce
 * se liší výškou aspoň o `climbM` m, se nahradí tětivou, když ji vůz projede, profil po ní vyjde
 * a stojí méně práce (zemní práce, zpevnění i kácení) než po staré ose (nebo stará osa nejde
 * vůbec). Tětiva přes posvátný strom se zahodí – osa zůstane stará. Jinak osa zůstane.
 * Vrací novou osu a obejité kusy staré (zarostou). Bez narovnání je osa beze změny.
 */
export function straightenStretches(
  grid: WagonGrid,
  village: PathVillage,
  axis: readonly PathPoint[],
  input: Pick<WagonPlanInput, 'layer' | 'changes' | 'claimed'>,
): { axis: PathPoint[]; bypassed: PathPoint[][] } {
  const s = subdivide(axis, STRAIGHTEN_STEP_M);
  const arc: number[] = [0];
  for (let k = 1; k < s.length; k++) {
    arc.push(arc[k - 1]! + length2(s[k]!.x - s[k - 1]!.x, s[k]!.z - s[k - 1]!.z));
  }
  const height = s.map((p) => wagonGridHeight(grid, p.x, p.z));
  // kandidáti (začátek, konec tětivy) – nejdřív kde se ušetří nejvíc délky
  const candidates: { i: number; j: number; saved: number }[] = [];
  for (let i = 0; i < s.length - 2; i++) {
    for (let j = i + 2; j < s.length; j++) {
      const along = arc[j]! - arc[i]!;
      if (along > WAGON_STRAIGHTEN.maxM) break;
      const chord = length2(s[j]!.x - s[i]!.x, s[j]!.z - s[i]!.z);
      if (along < WAGON_STRAIGHTEN.ratio * chord) continue;
      if (Math.abs(height[j]! - height[i]!) < WAGON_STRAIGHTEN.climbM) continue;
      candidates.push({ i, j, saved: along - chord });
    }
  }
  candidates.sort((p, q) => q.saved - p.saved || p.i - q.i || q.j - p.j);
  const taken: { i: number; j: number }[] = [];
  let tries = 0;
  for (const { i, j } of candidates) {
    if (tries >= STRAIGHTEN_TRIES) break;
    if (taken.some((t) => i < t.j && j > t.i)) continue;
    tries++;
    const line = [s[i]!, s[j]!];
    if (wagonAxisBlocked(grid, village, line)) continue;
    const straight = profileCost(grid, input, line);
    if (straight === null) continue;
    const oldCost = wagonAxisBlocked(grid, village, s.slice(i, j + 1))
      ? null
      : profileCost(grid, input, s.slice(i, j + 1));
    if (oldCost !== null && straight >= oldCost) continue;
    taken.push({ i, j });
  }
  if (taken.length === 0) return { axis: [...axis], bypassed: [] };
  taken.sort((p, q) => p.i - q.i);
  const out: PathPoint[] = [];
  const bypassed: PathPoint[][] = [];
  let at = 0;
  for (const { i, j } of taken) {
    out.push(...s.slice(at, i + 1));
    bypassed.push(s.slice(i, j + 1));
    at = j;
  }
  out.push(...s.slice(at));
  return { axis: out, bypassed };
}

/**
 * Obejité kusy staré osy zarostou: pevná cesta (ne vozová), která leží (aspoň z `bypassShare` délky) do 2 m od obejitého
 * kusu, je opuštěná (`Road.abandoned` – vypadne ze sítě a bledne podle `ROAD_DECAY`). Mutuje.
 */
export function abandonBypassed(
  roads: readonly Road[],
  bypassed: readonly (readonly PathPoint[])[],
  built: readonly PathPoint[],
): void {
  if (bypassed.length === 0) return;
  const near = axisDistance(bypassed);
  const nearBuilt = built.length >= 2 ? axisDistance([built]) : null;
  for (const road of roads) {
    if (road.grade === 'wagon' || road.abandoned || road.points.length < 2) continue;
    // zbytek souběžný s obejitým kusem nebo s hotovou vozovou cestou obejitý kus neudrží naživu;
    // odbočka, cesta do vchodu či krátký pahýl, který u hotové části jen začíná, zůstane – měří se
    // podíl délky (vzorky po metru), ne jen vrcholy osy
    const len = profileLength(road.points);
    let all = 0;
    let parallel = 0;
    for (let d = 0; d <= len + 1e-9; d += 1) {
      const p = axisSlice(road.points, Math.min(d, len), Math.min(d, len))[0]!;
      all++;
      if (
        near(p.x, p.z) <= BYPASS_MATCH_M ||
        (nearBuilt?.(p.x, p.z) ?? Infinity) <= BYPASS_MATCH_M
      ) {
        parallel++;
      }
    }
    if (parallel >= all * WAGON_ROAD.bypassShare) road.abandoned = true;
  }
}
const BYPASS_MATCH_M = 2;

/** Začátek profilu do `builtM` m od začátku (osa dostavěné části vozové cesty). */
function profilePrefix(profile: readonly PathPoint[], builtM: number): PathPoint[] {
  const out: PathPoint[] = [];
  let along = 0;
  for (let k = 0; k < profile.length && along <= builtM + 1e-9; k++) {
    if (k > 0) {
      const a = profile[k - 1]!;
      const b = profile[k]!;
      along += length2(b.x - a.x, b.z - a.z);
    }
    if (along <= builtM + 1e-9) out.push(profile[k]!);
  }
  return out;
}

/**
 * Obejité kusy, které už dostavěná část vozové cesty (prvních `builtM` m od vsi) minula: konec
 * kusu leží na profilu nejdál `builtM` od začátku. Rozestavěná cesta tak neopustí starou cestu
 * dřív, než ji nová trasa nahradí.
 */
export function bypassedUpTo(earthwork: RoadEarthwork, builtM: number): PathPoint[][] {
  const bypassed = earthwork.bypassed ?? [];
  if (bypassed.length === 0) return [];
  const arcs: number[] = [0];
  for (let k = 1; k < earthwork.profile.length; k++) {
    const a = earthwork.profile[k - 1]!;
    const b = earthwork.profile[k]!;
    arcs.push(arcs[k - 1]! + length2(b.x - a.x, b.z - a.z));
  }
  return bypassed.filter((kus) => {
    const end = kus[kus.length - 1]!;
    let best = 0;
    let bestD = Infinity;
    earthwork.profile.forEach((q, k) => {
      const d = length2(q.x - end.x, q.z - end.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return arcs[best]! <= builtM + 1e-6;
  });
}

/**
 * Naplánuje vozovou cestu pro cestu hráče `roadId` (roads.md – Vozová cesta po staré cestě): osa
 * staré cesty (řetěz úseků od konce blíž vsi), průjezd (`wagonAxisBlocked`), profil po ní
 * (`wagonProfile` bez vyhlazení – nejde-li ani s úvozem a náspem 3 m, cesta je pro vůz moc
 * prudká), zemní práce s převozem hlíny
 * (`wagonEarthworks`), zpevnění kolejí, kácení (`wagonClearing`) a úseky stavby od vsi ven; k tomu
 * délka, nejprudší místo, největší úvoz a násep a doba jízdy vozem dřív a teď. Čistá funkce
 * vstupu – stejně na serveru i v prohlížeči. Kde to nejde, důvod česky.
 */
export function planWagonRoad(input: WagonPlanInput): WagonRoadPlan {
  const state = wagonChainStatus(input.roads, input.earthworks, input.roadId);
  if (state.blocked) return { ok: false, reason: state.blocked };
  const chain = roadChain(input.roads, input.roadId);
  let axis = chainAxis(chain);
  let from = axis[0]!;
  let to = axis[axis.length - 1]!;
  if (
    input.home &&
    length2(to.x - input.home.x, to.z - input.home.z) <
      length2(from.x - input.home.x, from.z - input.home.z)
  ) {
    axis = axis.reverse();
    [from, to] = [to, from];
  }
  const grid = planGrid(input, axisBox(axis));
  const links = chain.map((link) => link.road);
  const old: OldChain = {
    chain,
    from,
    to,
    oldLengthM: chain.reduce((sum, link) => sum + profileLength(link.road.points), 0),
    oldMaxGrade: chainMaxGrade(grid, links),
    minutesBefore: roundMinutes(roadsCartMinutes(grid, links)),
  };
  // vede po staré cestě (Martin 22. 10. 2026, #6), jen kličky do svahu se narovnají
  const straight = straightenStretches(grid, input.village, axis, input);
  const plan = planAlong(input, old, grid, straight.axis, straight.bypassed);
  if (plan.ok) return plan;
  // prudký kus nebo posvátný strom – serpentina (roads.md – Postupná úprava a serpentiny)
  const detour = plan.failAt >= 0 ? detourPlan(input, old, straight, plan.failAt) : null;
  return detour ?? { ok: false, reason: plan.reason };
}

/** Stará cesta, po které vozová cesta vede – řetěz, konce a co o ní plán hlásí. */
interface OldChain {
  chain: ChainLink<WagonPlanRoad>[];
  from: PathPoint;
  to: PathPoint;
  oldLengthM: number;
  oldMaxGrade: number;
  minutesBefore: number | null;
}

/** Plán po ose, nebo důvod a místo selhání (index ve `wagonAxisPoints(axis)`, −1 – objížďka nepomůže). */
type WagonAttempt =
  Extract<WagonRoadPlan, { ok: true }> | { ok: false; reason: string; failAt: number };

/** Profil selže do tolika metrů od buňky u posvátného stromu – důvodem je strom (WAGON_SACRED). */
const SACRED_FAIL_M = 10;

/** Délky od začátku po bodech osy (m). */
function arcsOf(points: readonly PathPoint[]): number[] {
  const out: number[] = [0];
  for (let k = 1; k < points.length; k++) {
    out.push(
      out[k - 1]! + length2(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z),
    );
  }
  return out;
}

/**
 * Objížďka kusu osy `axis[i..j]` (roads.md – Postupná úprava a serpentiny): `findWagonRoute` mezi
 * jeho konci v okně kolem kusu (do stran `padM` m, nejvýš WAGON_DETOUR.maxLabels štítků), narovnaná
 * a vyhlazená trasa (`wagonProfile`); body po WAGON_ROAD.profileStepM s konci přesně v bodech osy.
 * Bez trasy null.
 */
function detourStretch(
  input: WagonPlanInput,
  axis: readonly PathPoint[],
  i: number,
  j: number,
  padM: number,
): PathPoint[] | null {
  const stretch = axis.slice(i, j + 1);
  const grid = planGrid(input, {
    minX: Math.min(...stretch.map((p) => p.x)) - padM,
    minZ: Math.min(...stretch.map((p) => p.z)) - padM,
    maxX: Math.max(...stretch.map((p) => p.x)) + padM,
    maxZ: Math.max(...stretch.map((p) => p.z)) + padM,
  });
  const route = findWagonRoute(grid, axis[i]!, axis[j]!, 0, WAGON_DETOUR.maxLabels);
  if (!route) return null;
  const straight = straightenWagonRoute(grid, route.points);
  // vyhlazená osa, kde profil kusu vyjde s konci v terénu; jinak narovnaná trasa – celý profil
  // (`planAlong`) konce kusu v terénu nepotřebuje
  const local = wagonProfile(grid, straight);
  const out = wagonAxisPoints(local ? local.profile : straight);
  if (out.length < 2) return null;
  out[0] = axis[i]!;
  out[out.length - 1] = axis[j]!;
  return out;
}

/**
 * Serpentiny (roads.md – Postupná úprava a serpentiny): kolem místa selhání `failAt` se v oknech
 * ±WAGON_DETOUR.windowsM m po ose zkusí objížďka (`detourStretch`) a celý plán po nové ose; vezme
 * se nejlevnější hotový plán (práce, pak délka, pak pořadí oken). Když žádné okno nedá hotový plán,
 * ale některé posune selhání za objížďku, pokračuje se od prvního takového (nejvýš
 * WAGON_DETOUR.maxDetours míst). Obejitý kus staré osy jde do `bypassed`. Okna jsou z celočíselných
 * indexů osy – server i prohlížeč najdou totéž. Nic nevyjde – null.
 */
function detourPlan(
  input: WagonPlanInput,
  old: OldChain,
  start: { axis: PathPoint[]; bypassed: PathPoint[][] },
  firstFail: number,
): Extract<WagonRoadPlan, { ok: true }> | null {
  let axis = start.axis;
  let bypassed = start.bypassed;
  let failAt = firstFail;
  for (let round = 0; round < WAGON_DETOUR.maxDetours && failAt >= 0; round++) {
    const cur = wagonAxisPoints(axis);
    const arc = arcsOf(cur);
    const f = Math.min(failAt, cur.length - 1);
    let best: Extract<WagonRoadPlan, { ok: true }> | null = null;
    let next: { axis: PathPoint[]; bypassed: PathPoint[][]; failAt: number } | null = null;
    for (const halfM of WAGON_DETOUR.windowsM) {
      let i = f;
      while (i > 0 && arc[f]! - arc[i]! < halfM) i--;
      let j = f;
      while (j < cur.length - 1 && arc[j]! - arc[f]! < halfM) j++;
      if (j - i < 2) continue;
      const stretch = detourStretch(input, cur, i, j, halfM);
      if (!stretch) continue;
      const cand = [...cur.slice(0, i), ...stretch, ...cur.slice(j + 1)];
      const candBypassed = [...bypassed, cur.slice(i, j + 1)];
      const plan = planAlong(input, old, planGrid(input, axisBox(cand)), cand, candBypassed);
      if (plan.ok) {
        if (
          !best ||
          plan.laborManDays < best.laborManDays ||
          (plan.laborManDays === best.laborManDays && plan.lengthM < best.lengthM)
        ) {
          best = plan;
        }
        continue;
      }
      // selhání až za objížďkou – další místo selhání
      if (next || plan.failAt < 0) continue;
      const candArc = arcsOf(wagonAxisPoints(cand));
      const stretchEnd = arc[i]! + arcsOf(stretch)[stretch.length - 1]!;
      if (candArc[Math.min(plan.failAt, candArc.length - 1)]! > stretchEnd + 1e-6) {
        next = { axis: cand, bypassed: candBypassed, failAt: plan.failAt };
      }
    }
    if (best) return best;
    if (!next) return null;
    ({ axis, bypassed, failAt } = next);
  }
  return null;
}

/**
 * Plán vozové cesty po ose `axis` (stará osa, narovnaná nebo s objížďkou) nad mřížkou `grid`:
 * průjezd, profil, zemní práce, kácení, lávky u nových brodů a úseky stavby. Kde to nejde, důvod
 * a místo selhání (profil – `wagonProfileFailure`, posvátný strom – nejbližší místo osy u něj).
 */
function planAlong(
  input: WagonPlanInput,
  old: OldChain,
  grid: WagonGrid,
  axis: PathPoint[],
  bypassed: PathPoint[][],
): WagonAttempt {
  const { chain, from, to, oldLengthM, oldMaxGrade } = old;
  const links = chain.map((link) => link.road);
  // vůz jí musí projet a profil vyjít
  if (wagonAxisBlocked(grid, input.village, axis)) {
    return { ok: false, reason: WAGON_BLOCKED, failAt: -1 };
  }
  const profile = wagonProfile(grid, axis, true);
  if (!profile) {
    // u posvátného stromu je mez zemních prací malá – hláška nesmí tvrdit, že je cesta moc prudká
    const failAt = wagonProfileFailure(grid, axis);
    const at = wagonAxisPoints(axis)[failAt];
    const sacred = at !== undefined && wagonNearSacred(grid, at, SACRED_FAIL_M);
    return { ok: false, reason: sacred ? WAGON_SACRED : WAGON_STEEP, failAt };
  }
  const earth = wagonEarthworks(grid, profile.profile, profile.fords);
  const bounds = pieceBounds(profile.lengthM);
  const clearing = wagonClearing(input, grid, profile.profile, profile.fords, bounds);
  if (clearing.sacred) {
    const arcs = arcsOf(profile.profile);
    const k = arcs.findIndex((d) => d >= clearing.sacredArc - 1e-9);
    return { ok: false, reason: WAGON_SACRED, failAt: k < 0 ? arcs.length - 1 : k };
  }
  // lávky u brodů staré upravené cesty už stojí (`wagonChainStatus`); brod, který stará osa neměla
  // (narovnaná tětiva, serpentina), dostane lávku jako dřív – 4 stromy a 15 čd na brod
  // úsek bez určené krajiny (`ground`) lávky nezná – brody poblíž jeho osy se berou za staré
  const oldFords = chain.flatMap((link) => {
    const g = link.road.ground;
    if (g) return g.fords.map((d) => axisSlice(link.road.points, d, d)[0]!);
    const len = profileLength(link.road.points);
    const out: PathPoint[] = [];
    for (let d = 0; d <= len; d += WAGON_ROAD.oldFordMatchM / 2) {
      out.push(axisSlice(link.road.points, d, d)[0]!);
    }
    return out;
  });
  const fordArcs = newFordArcs(profile.profile, profile.fords, oldFords);
  const footbridgeTrees = fordArcs.length * ROAD_UPGRADES.footbridge.trees;
  const missingWood =
    footbridgeTrees > 0
      ? planWoodFrom(
          footbridgeTrees,
          profileAt(profile.profile, profile.lengthM / 2),
          {
            logs: input.woodLogs ?? 0,
            changes: () => input.changes,
            claimed: () => new Set(input.claimed ?? []),
          },
          {
            obstacles: input.layer,
            clearedIds: [...clearing.pieces.flatMap((t) => [...t.cleared, ...t.felled])],
          },
        ).missing
      : 0;
  const pieces: WagonPiecePlan[] = bounds.map((toM, k) => {
    const fromM = k > 0 ? bounds[k - 1]! : 0;
    let earthManDays = 0;
    earth.labor.forEach((v, bin) => {
      const mid = (bin + 0.5) * WAGON_BIN_M;
      const inside = k === bounds.length - 1 ? mid >= fromM : mid >= fromM && mid < toM;
      if (inside) earthManDays += v;
    });
    const pavingManDays = WAGON_ROAD.pavingPerM * (toM - fromM);
    const clearingManDays = clearing.pieces[k]!.cost;
    const footbridgeManDays =
      fordArcs.filter((d) => d > fromM && d <= toM + 1e-9).length *
      ROAD_UPGRADES.footbridge.manDays;
    return {
      toM: tenths(toM),
      manDays: tenths(earthManDays + pavingManDays + clearingManDays + footbridgeManDays),
      earthManDays: tenths(earthManDays),
      pavingManDays: tenths(pavingManDays),
      clearingManDays,
      trees: clearing.pieces[k]!.trees,
    };
  });
  // poslední úsek končí přesně na konci osy
  pieces[pieces.length - 1]!.toM = profile.lengthM;
  return {
    ok: true,
    chain: links.map((r) => r.id),
    from,
    to,
    profile: profile.profile,
    fords: profile.fords,
    pieces,
    lengthM: tenths(profile.lengthM),
    oldLengthM: tenths(oldLengthM),
    bypassed,
    footbridgeTrees,
    missingWood,
    maxGrade: profile.maxGrade,
    oldMaxGrade,
    maxCutM: tenths(profile.maxCutM),
    maxFillM: tenths(profile.maxFillM),
    cutM3: Math.round(earth.cutM3),
    fillM3: Math.round(earth.fillM3),
    movedM3: Math.round(earth.movedM3),
    laborManDays: tenths(pieces.reduce((sum, p) => sum + p.manDays, 0)),
    trees: pieces.reduce((sum, p) => sum + p.trees, 0),
    cleared: clearing.pieces.flatMap((t) => t.cleared).sort((a, b) => a - b),
    felled: clearing.pieces.flatMap((t) => t.felled).sort((a, b) => a - b),
    minutesBefore: old.minutesBefore,
    minutesAfter: roundMinutes(profileCartMinutes(profile.profile, profile.fords))!,
  };
}

function roundMinutes(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** Úseky stavby (staví se, nebo hotové) – zemní práce s konci podle profilu. */
function earthworkOf(state: VillageState, c: Construction): RoadEarthwork | null {
  if (c.earthwork === undefined) return null;
  return state.roads?.earthworks?.find((e) => e.id === c.earthwork) ?? null;
}

/** Zemní práce vsi pro náhled – kusy osy (terén) a jestli se ještě staví. */
export function villageWagonEarthworks(state: VillageState): WagonPlanEarthwork[] {
  const spans = earthworkSpansOf(state);
  return (state.roads?.earthworks ?? []).map((e, k) => ({
    ...spans[k]!,
    ...(e.constructionId !== undefined ? { building: true } : {}),
  }));
}

/** Střed vsi pro směr stavby – dvorec, jinak těžiště obydlí; bez obydlí null. */
export function wagonHome(state: VillageState): PathPoint | null {
  const manor = villageManor(state);
  if (manor) return { x: manor.position.x, z: manor.position.z };
  if (state.dwellings.length === 0) return null;
  return {
    x: state.dwellings.reduce((sum, d) => sum + d.position.x, 0) / state.dwellings.length,
    z: state.dwellings.reduce((sum, d) => sum + d.position.z, 0) / state.dwellings.length,
  };
}

/** Vstup plánu ze stavu vsi v den `day` (server – zahájení stavby, testy). */
export function wagonPlanInputOf(
  state: VillageState,
  day: number,
  roadId: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): WagonPlanInput {
  return {
    landscape,
    layer: obstacles,
    changes: obstacleChangesAt(state, day),
    claimed: claimedObstacles(state),
    village: pathVillageOf(state, day, landscape),
    roads: state.roads?.roads ?? [],
    earthworks: villageWagonEarthworks(state),
    roadId,
    home: wagonHome(state),
    woodLogs: woodLogs(state),
  };
}

/**
 * Zahájí stavbu vozové cesty pro cestu hráče `roadId` (roads.md – Vozová cesta): zemní práce
 * s profilem a úseky (`VillageRoads.earthworks`) a stavba `road` ze společné práce (cena = úseky
 * dohromady). RangeError, když to nejde (`planWagonRoad` – důvod česky). Konvence dne jako
 * u ostatních akcí – volá se na ves dopočítanou do dne `day`, práci stavba dostane od dalšího dne.
 */
export function startWagonRoad(
  state: VillageState,
  day: number,
  roadId: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const plan = planWagonRoad(wagonPlanInputOf(state, day, roadId, landscape, obstacles));
  if (!plan.ok) throw new RangeError(plan.reason);
  const next = structuredClone(state);
  next.roads ??= {
    nextId: 1,
    roads: [],
    trees: [],
    labor: { from: day, days: 0, shares: [] },
  };
  // lávky pro pěší u brodů chtějí dřevo jako u upravené cesty: klády z hromady, jinak nejbližší stromy
  let wood: ConstructionWood | undefined;
  if (plan.footbridgeTrees > 0) {
    const mid = profileAt(plan.profile, plan.lengthM / 2);
    const woodPlan = planWoodFrom(
      plan.footbridgeTrees,
      mid,
      {
        logs: woodLogs(next),
        changes: () => obstacleChangesAt(next, day),
        claimed: () => claimedObstacles(next),
      },
      { obstacles, clearedIds: [...plan.cleared, ...plan.felled] },
    );
    if (woodPlan.missing > 0) throw new RangeError(WAGON_NO_WOOD);
    wood = takeWood(next, woodPlan);
  }
  const earthworkId = next.nextId++;
  const constructionId = next.nextId++;
  (next.roads.earthworks ??= []).push({
    id: earthworkId,
    profile: plan.profile,
    pieces: plan.pieces.map((p) => ({ toM: p.toM, manDays: p.manDays, builtDay: null })),
    ...(plan.fords.length > 0 ? { fords: plan.fords } : {}),
    ...(plan.bypassed.length > 0 ? { bypassed: plan.bypassed } : {}),
    startedDay: day,
    constructionId,
  });
  next.constructions.push({
    id: constructionId,
    kind: 'road',
    startedDay: day,
    cost: tenths(plan.laborManDays + woodFellingCost(wood)),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    roadIds: [],
    earthwork: earthworkId,
    ...(wood ? { wood } : {}),
  });
  return next;
}

/** Vzdálenost (m od začátku osy) začátku každého brodu – souvislého běhu indexů bodů profilu. */
export function fordArcsOf(
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
): number[] {
  const set = new Set(fords);
  const out: number[] = [];
  let along = 0;
  for (let k = 0; k < profile.length; k++) {
    if (k > 0) {
      along += length2(profile[k]!.x - profile[k - 1]!.x, profile[k]!.z - profile[k - 1]!.z);
    }
    if (set.has(k) && !set.has(k - 1)) out.push(along);
  }
  return out;
}

/**
 * Brody nové osy, které stará upravená cesta neměla (její lávka tam nestojí): začátky běhů brodu
 * (m od začátku osy), v jejichž blízkosti `WAGON_ROAD.oldFordMatchM` neleží žádný brod staré cesty.
 */
export function newFordArcs(
  profile: readonly RoadProfilePoint[],
  fords: readonly number[],
  oldFords: readonly PathPoint[],
): number[] {
  const set = new Set(fords);
  const out: number[] = [];
  let along = 0;
  let start = -1;
  let startArc = 0;
  const close = (end: number): void => {
    const known = oldFords.some((f) => {
      for (let k = start; k <= end; k++) {
        const q = profile[k]!;
        if (length2(q.x - f.x, q.z - f.z) <= WAGON_ROAD.oldFordMatchM) return true;
      }
      return false;
    });
    if (!known) out.push(startArc);
  };
  for (let k = 0; k < profile.length; k++) {
    if (k > 0) {
      along += length2(profile[k]!.x - profile[k - 1]!.x, profile[k]!.z - profile[k - 1]!.z);
    }
    if (set.has(k) && start < 0) {
      start = k;
      startArc = along;
    } else if (!set.has(k) && start >= 0) {
      close(k - 1);
      start = -1;
    }
  }
  if (start >= 0) close(profile.length - 1);
  return out;
}

/** Bod profilu `d` m od začátku osy (na cm). */
function profileAt(profile: readonly RoadProfilePoint[], d: number): PathPoint {
  let along = 0;
  for (let k = 1; k < profile.length; k++) {
    const a = profile[k - 1]!;
    const b = profile[k]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (along + length >= d && length > 0) {
      const u = Math.max(0, (d - along) / length);
      return {
        x: Math.round((a.x + (b.x - a.x) * u) * 100) / 100,
        z: Math.round((a.z + (b.z - a.z) * u) * 100) / 100,
      };
    }
    along += length;
  }
  const last = profile[profile.length - 1]!;
  return { x: last.x, z: last.z };
}

/** Osa úseku stavby od `from` do `to` m (konce na cm, mezi nimi body profilu). */
function pieceAxis(profile: readonly RoadProfilePoint[], from: number, to: number): PathPoint[] {
  const total = profileLength(profile);
  const start = from <= 0 ? { x: profile[0]!.x, z: profile[0]!.z } : profileAt(profile, from);
  const last = profile[profile.length - 1]!;
  const end = to >= total - 1e-6 ? { x: last.x, z: last.z } : profileAt(profile, to);
  const inner: PathPoint[] = [];
  let along = 0;
  for (let k = 0; k < profile.length; k++) {
    if (k > 0) {
      along += length2(profile[k]!.x - profile[k - 1]!.x, profile[k]!.z - profile[k - 1]!.z);
    }
    if (along > from + 1e-6 && along < to - 1e-6)
      inner.push({ x: profile[k]!.x, z: profile[k]!.z });
  }
  const axis = [start, ...inner, end].filter(
    (p, k, all) => k === 0 || p.x !== all[k - 1]!.x || p.z !== all[k - 1]!.z,
  );
  return simplifyPathLine(axis, [], 0.25).points;
}

/**
 * Dostavěný úsek vozové cesty (mutuje stav): pevná cesta stupně `wagon` po ose úseku
 * (`addWagonRoad`), kácení pod zemními pracemi a v průseku (klády na hromadu, pařezy nedorostou),
 * den dostavění úseku.
 */
function buildPiece(
  state: VillageState,
  earthwork: RoadEarthwork,
  k: number,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): Road | null {
  const piece = earthwork.pieces[k]!;
  const from = k > 0 ? earthwork.pieces[k - 1]!.toM : 0;
  const axis = pieceAxis(earthwork.profile, from, piece.toM);
  piece.builtDay = day;
  if (axis.length < 2) return null;
  const road = addWagonRoad(state, axis, day, landscape, obstacles);
  if (obstacles) {
    const box = {
      minX: Math.min(...earthwork.profile.map((p) => p.x)) - 40,
      minZ: Math.min(...earthwork.profile.map((p) => p.z)) - 40,
      maxX: Math.max(...earthwork.profile.map((p) => p.x)) + 40,
      maxZ: Math.max(...earthwork.profile.map((p) => p.z)) + 40,
    };
    const grid = wagonRoadGrid({
      village: { dwellings: [], fields: [] },
      terrain: pathTerrainOf(landscape, pathWindowFor(landscape, box)),
      layer: obstacles,
      changes: obstacleChangesAt(state, day),
    });
    const bounds = earthwork.pieces.map((p) => p.toM);
    const tally = wagonClearing(
      {
        layer: obstacles,
        changes: obstacleChangesAt(state, day),
        claimed: claimedObstacles(state),
      },
      grid,
      earthwork.profile,
      earthwork.fords ?? [],
      bounds,
    ).pieces[k]!;
    recordClearedObstacles(state, tally.cleared, day);
    if (tally.felled.length > 0) {
      state.felledTrees = [
        ...(state.felledTrees ?? []),
        ...tally.felled.map((id) => ({ id, day })),
      ];
    }
    keepClear(state, [...tally.felled, ...tally.kept]);
    addLogs(state, logsFromClearedTrees(tally.trees));
  }
  return road;
}

/**
 * Krok dne vozových cest (mutuje stav – po práci, před dokončením staveb): úseky, na které stavba
 * od vsi ven došla, jsou hned pevnou cestou stupně `wagon` (sjízdná, terén upravený). Bez krajiny
 * nic (vozová cesta se bez ní nestaví).
 */
export function wagonRoadsDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (!landscape) return;
  for (const c of state.constructions) {
    if (c.kind !== 'road' || c.earthwork === undefined) continue;
    const earthwork = earthworkOf(state, c);
    if (!earthwork) continue;
    // kácení na lávky jde před zemními pracemi
    let left = Math.max(0, Math.min(c.done, c.cost) - woodFellingCost(c.wood));
    let built = false;
    let builtM = 0;
    for (let k = 0; k < earthwork.pieces.length; k++) {
      const piece = earthwork.pieces[k]!;
      if (left + 1e-9 < piece.manDays) break;
      left -= piece.manDays;
      builtM = piece.toM;
      if (piece.builtDay === null) {
        buildPiece(state, earthwork, k, day, landscape, obstacles);
        built = true;
      }
    }
    // stará cesta po ose vozové cesty zmizí hned, úseky se spojí
    if (built && state.roads) {
      absorbParallelRoads(state.roads, state.constructions);
      abandonBypassed(
        state.roads.roads,
        bypassedUpTo(earthwork, builtM),
        profilePrefix(earthwork.profile, builtM),
      );
    }
  }
}

/** Dostavěná vozová cesta (mutuje stav): zemní práce bez stavby, kronika jako vylepšení cesty. */
export function finishWagonRoad(
  state: VillageState,
  c: Construction,
  day: number,
): ChronicleEvent[] {
  const earthwork = earthworkOf(state, c);
  if (!earthwork) return [];
  delete earthwork.constructionId;
  for (const piece of earthwork.pieces) piece.builtDay ??= day;
  return [];
}

/**
 * Kde se na vozové cestě pracuje (rozdělení práce, postavy): bod osy na čele práce – stavba jde
 * od vsi ven. Bez zemních prací null.
 */
export function wagonWorkTarget(
  state: Pick<VillageState, 'roads' | 'constructions'>,
  c: Construction,
): Extract<LaborTarget, { kind: 'wagon' }> | null {
  if (c.earthwork === undefined) return null;
  const earthwork = state.roads?.earthworks?.find((e) => e.id === c.earthwork);
  if (!earthwork || earthwork.profile.length < 2) return null;
  const at = profileAt(earthwork.profile, earthworkReachedM(earthwork, c));
  return { kind: 'wagon', id: c.id, x: at.x, z: at.z };
}

/**
 * Rozestavěná vozová cesta u cesty hráče `roadId` – stavba zemních prací cesty (`chainEarthwork`
 * – panel, průběh); jinak null.
 */
export function wagonChainConstruction(state: VillageState, roadId: number): Construction | null {
  const chain = roadChain(state.roads?.roads ?? [], roadId);
  if (chain.length === 0) return null;
  const building = (state.roads?.earthworks ?? []).filter((e) => e.constructionId !== undefined);
  const earthwork = chainEarthwork(building, chain);
  return earthwork
    ? (state.constructions.find((x) => x.id === earthwork.constructionId) ?? null)
    : null;
}

/** Průběh stavby vozové cesty 0–1 (panel). */
export function wagonProgress(c: Pick<Construction, 'done' | 'cost'>): number {
  return c.cost > 0 ? Math.min(1, c.done / c.cost) : 1;
}
