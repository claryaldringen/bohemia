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
import { pathTerrainOf, pathWindowFor, PATH_WOODLAND, withObstacles } from './paths/terrain';
import { pathVillageOf } from './paths/village';
import {
  WAGON_BIN_M,
  findWagonRoute,
  straightenWagonRoute,
  profileCartMinutes,
  profileEdits,
  roadsCartMinutes,
  wagonEarthworks,
  wagonGridHeight,
  wagonProfile,
  wagonRoadGrid,
  type WagonGrid,
  type WagonTimeRoad,
} from './paths/wagon-route';
import { keepClear, type SwathTally } from './road-swath';
import { OBSTACLE_COST, ROAD_SWATH, WAGON_ROAD } from './rules';
import { sacredSitesOf } from './sacred';
import type {
  ChronicleEvent,
  Construction,
  LaborTarget,
  Road,
  RoadEarthwork,
  RoadProfilePoint,
  VillageState,
} from './types';
import { addLogs, claimedObstacles, logsFromClearedTrees } from './wood';
import { isWoodTreeId } from './woods';

// Vozová cesta (roads.md – Vozová cesta; Martin, 20. 10. 2026: „Měla by přibýt cesta upravená pro
// vůz. Ta bude vozu dávat ještě větší rychlost, bude mít vyježděné, ale zpevněné koleje. Zároveň
// dojde k podstatné změně – tato cesta spojí dva body, které spojuje stará cesta pro pěší, ale co
// nejvíc přímo tak, aby vůz projel.“). Hráč vybere cestu (řetěz úseků – road-chains.ts) a v panelu
// potvrdí „Upravit pro vozy“: mezi jejími konci (rozcestí nebo volné konce) se najde vlastní
// trasa (paths/wagon-route.ts – sklon do 6 % s úvozem a náspem do 3 m, serpentiny samy), spočítá
// se profil, zemní práce, zpevnění kolejí a kácení a vznikne stavba ze společné práce po úsecích
// od vsi ven. Hotový úsek je hned pevná cesta stupně `wagon` (sjízdná – vůz 2,2, pěšky 1,7
// i v mokřině), terén se upraví podle profilu (paths/earthworks.ts). Stará cesta zůstane jako
// samostatná pevná cesta s dnešními pravidly – provoz se sám přesune na rychlejší cestu
// a nepoužívané kusy staré cesty po 5 letech zarostou. Čisté funkce – náhled v prohlížeči počítá
// totéž (`planWagonRoad`) jako server při zahájení stavby (`startWagonRoad`).

export const WAGON_NO_ROAD = 'Cesta tu už není.';
export const WAGON_LOOP = 'Cesta je okruh – vozová cesta potřebuje dva konce.';
export const WAGON_SHORT = 'Cesta je na úpravu pro vozy moc krátká.';
export const WAGON_EXISTS = 'Cesta už je upravená pro vozy.';
export const WAGON_BUILDING = 'Cesta se už upravuje pro vozy.';
export const WAGON_NO_ROUTE =
  'Vůz tudy neprojede ani s úvozem a náspem – překáží sráz, voda nebo stavby.';
export const WAGON_SACRED = 'Vozové cestě stojí v cestě posvátný dub – kácet se nesmí.';
/** Trasa vede velkou oklikou – mezi stavbami se vozová cesta nevejde (délky v m). */
export function wagonDetourReason(lengthM: number, oldLengthM: number): string {
  return `Vozová cesta by vedla velkou oklikou (${Math.round(lengthM)} m místo ${Math.round(oldLengthM)} m) – mezi stavbami se nevejde.`;
}

/** Kratší cesta se pro vozy neupravuje (m) – jako nejkratší pevná cesta. */
const MIN_CHAIN_M = 15;
/** Okno hledání kolem staré cesty a spojnice konců: násobek spojnice + rezerva, meze (m). */
const WINDOW_PAD = { share: 0.4, extraM: 60, minM: 60, maxM: 220 } as const;
/**
 * Oklika: nová trasa delší než `factor` × stará a zároveň o víc než `extraM`, přestože stará cesta
 * je dost mírná i pro vozovou cestu (nejprudší místo do WAGON_ROAD.maxGrade) – délku tedy nedělá
 * svah (serpentiny), ale stavby: vozová cesta se mezi nimi nevejde (krátké cesty mezi domy).
 */
const DETOUR = { factor: 3, extraM: 60 } as const;
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
  return { status: 'none', blocked: null };
}

/** Okno hledání – obdélník staré cesty a konců s rezervou. */
function searchBox(
  chain: readonly ChainLink<WagonPlanRoad>[],
  a: PathPoint,
  b: PathPoint,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const pts = [a, b, ...chain.flatMap((link) => link.road.points)];
  const chord = length2(b.x - a.x, b.z - a.z);
  const pad = Math.min(
    WINDOW_PAD.maxM,
    Math.max(WINDOW_PAD.minM, chord * WINDOW_PAD.share + WINDOW_PAD.extraM),
  );
  return {
    minX: Math.min(...pts.map((p) => p.x)) - pad,
    minZ: Math.min(...pts.map((p) => p.z)) - pad,
    maxX: Math.max(...pts.map((p) => p.x)) + pad,
    maxZ: Math.max(...pts.map((p) => p.z)) + pad,
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

/**
 * Naplánuje vozovou cestu pro cestu hráče `roadId` (roads.md – Vozová cesta): trasa mezi konci
 * řetězu (`findWagonRoute`), profil (`wagonProfile`), zemní práce s převozem hlíny
 * (`wagonEarthworks`), zpevnění kolejí, kácení (`wagonClearing`) a úseky stavby od vsi ven; k tomu
 * délka, nejprudší místo, největší úvoz a násep a doba jízdy vozem dřív a teď. Čistá funkce
 * vstupu – stejně na serveru i v prohlížeči. Kde to nejde, důvod česky.
 */
export function planWagonRoad(input: WagonPlanInput): WagonRoadPlan {
  const state = wagonChainStatus(input.roads, input.earthworks, input.roadId);
  if (state.blocked) return { ok: false, reason: state.blocked };
  const chain = roadChain(input.roads, input.roadId);
  let [from, to] = chainEnds(chain);
  if (
    input.home &&
    length2(to.x - input.home.x, to.z - input.home.z) <
      length2(from.x - input.home.x, from.z - input.home.z)
  ) {
    [from, to] = [to, from];
  }
  const grid = planGrid(input, searchBox(chain, from, to));
  const trips = Math.max(
    0,
    ...chain.map((link) => link.road.cartTraffic?.[link.road.cartTraffic.length - 1] ?? 0),
  );
  const route = findWagonRoute(grid, from, to, trips);
  if (!route) return { ok: false, reason: WAGON_NO_ROUTE };
  // co nejpříměji – přímé úseky, kudy vůz projede a profil vyjde
  const profile = wagonProfile(grid, straightenWagonRoute(grid, route.points));
  if (!profile) return { ok: false, reason: WAGON_NO_ROUTE };
  const oldLengthM = chain.reduce((sum, link) => sum + profileLength(link.road.points), 0);
  const links = chain.map((link) => link.road);
  const oldMaxGrade = chainMaxGrade(grid, links);
  if (
    profile.lengthM > oldLengthM * DETOUR.factor &&
    profile.lengthM - oldLengthM > DETOUR.extraM &&
    oldMaxGrade <= WAGON_ROAD.maxGrade
  ) {
    return { ok: false, reason: wagonDetourReason(profile.lengthM, oldLengthM) };
  }
  const earth = wagonEarthworks(grid, profile.profile, profile.fords);
  const bounds = pieceBounds(profile.lengthM);
  const clearing = wagonClearing(input, grid, profile.profile, profile.fords, bounds);
  if (clearing.sacred) return { ok: false, reason: WAGON_SACRED };
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
    return {
      toM: tenths(toM),
      manDays: tenths(earthManDays + pavingManDays + clearingManDays),
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
    minutesBefore: roundMinutes(roadsCartMinutes(grid, links)),
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
    candidates: [],
    labor: { from: day, days: 0, shares: [] },
  };
  const earthworkId = next.nextId++;
  const constructionId = next.nextId++;
  (next.roads.earthworks ??= []).push({
    id: earthworkId,
    profile: plan.profile,
    pieces: plan.pieces.map((p) => ({ toM: p.toM, manDays: p.manDays, builtDay: null })),
    ...(plan.fords.length > 0 ? { fords: plan.fords } : {}),
    startedDay: day,
    constructionId,
  });
  next.constructions.push({
    id: constructionId,
    kind: 'road',
    startedDay: day,
    cost: plan.laborManDays,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    roadIds: [],
    earthwork: earthworkId,
  });
  return next;
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
    let left = Math.min(c.done, c.cost);
    let built = false;
    for (let k = 0; k < earthwork.pieces.length; k++) {
      const piece = earthwork.pieces[k]!;
      if (left + 1e-9 < piece.manDays) break;
      left -= piece.manDays;
      if (piece.builtDay === null) {
        buildPiece(state, earthwork, k, day, landscape, obstacles);
        built = true;
      }
    }
    // stará cesta po ose vozové cesty zmizí hned, úseky se spojí
    if (built && state.roads) absorbParallelRoads(state.roads, state.constructions);
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
