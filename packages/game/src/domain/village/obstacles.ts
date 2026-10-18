import {
  detCos,
  detSin,
  length2,
  obstacleKind,
  obstaclesInTile,
  obstaclesNear,
  type ObstacleKind,
  type ObstacleLayer,
} from '../landscape';
import { pointInPolygon, type Point } from './polygon';
import { roadTreeObstacleKind, type RoadTreeObstacleKind } from './road-trees';
import {
  DWELLING_CLEARING_M,
  OBSTACLE_COST,
  OUTCROP_RADIUS_M,
  TREE_REGROWTH_YEARS,
  TREE_SAPLING_AFTER_YEARS,
} from './rules';
import type { DwellingType, ObstacleChange, Position, TileCell, VillageState } from './types';

// Krajina sídla = vygenerovaná vrstva překážek + změny, které v ní udělali lidé (fields.md –
// Krajina sídla a scéna, forest.md – Krajina sídla): odstraněné překážky (pole, obydlí) zmizí
// natrvalo i s pařezy, pokácené stromy nechají pařez a z náletu znovu dorostou. Navíc ves do
// krajiny přidává stromy u pevných cest (roads.md) – překážky nad vrstvou (`added`), které stavba
// odstraní jako ostatní.

const DAYS_PER_YEAR = 365.25;
const NO_IDS: ReadonlySet<number> = new Set();

/** Změny překážek v daný den – pro scénu, kontroly umístění a výběr stromů ke kácení. */
export interface ObstacleChanges {
  /** Odstraněné natrvalo (pole, obydlí, hřbitovy, sady). */
  readonly removed: readonly number[];
  /** Pokácené stromy – stojí po nich pařez. */
  readonly stumps: readonly number[];
  /** Pokácené stromy, které znovu rostou z náletu (mladý stromek). */
  readonly saplings: readonly number[];
  /**
   * Překážky, které ves přidala nad vrstvu – stromy u pevných cest (roads.md) v daný den, podle
   * id. Bez údaje žádné.
   */
  readonly added?: readonly AddedObstacle[];
}

/** Překážka přidaná vsí nad vrstvu (strom u pevné cesty): id, pata (m) a druh v daný den. */
export interface AddedObstacle {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly kind: RoadTreeObstacleKind;
}

export const NO_OBSTACLE_CHANGES: ObstacleChanges = { removed: [], stumps: [], saplings: [] };

/** Co zbylo z pokáceného stromu po čase: pařez, mladý stromek, nebo zase dospělý strom. */
export type TreeRegrowth = 'stump' | 'sapling' | 'grown';

/** Stav pokáceného stromu v den `day` (pokácen v den `felledDay`). */
export function treeRegrowth(felledDay: number, day: number): TreeRegrowth {
  const years = (day - felledDay) / DAYS_PER_YEAR;
  if (years >= TREE_REGROWTH_YEARS) return 'grown';
  return years >= TREE_SAPLING_AFTER_YEARS ? 'sapling' : 'stump';
}

type ChangeLists = Pick<VillageState, 'clearedObstacles' | 'felledTrees' | 'roads'>;

/**
 * Změny překážek vsi v den `day` (stromy, které už dorostly, mezi změnami nejsou) a stromy
 * u pevných cest, které v ten den stojí a stavba je neodstranila (`added`).
 */
export function obstacleChangesAt(state: ChangeLists, day: number): ObstacleChanges {
  const removed = new Set((state.clearedObstacles ?? []).map((c) => c.id));
  // u stromu pokáceného víckrát platí poslední kácení
  const lastFelled = new Map<number, number>();
  for (const f of state.felledTrees ?? []) {
    lastFelled.set(f.id, Math.max(f.day, lastFelled.get(f.id) ?? -Infinity));
  }
  const stumps: number[] = [];
  const saplings: number[] = [];
  for (const [id, felledDay] of lastFelled) {
    if (removed.has(id)) continue;
    const regrowth = treeRegrowth(felledDay, day);
    if (regrowth === 'stump') stumps.push(id);
    else if (regrowth === 'sapling') saplings.push(id);
  }
  const byId = (a: number, b: number): number => a - b;
  const added: AddedObstacle[] = [];
  for (const tree of state.roads?.trees ?? []) {
    if (removed.has(tree.id)) continue;
    const kind = roadTreeObstacleKind(tree, day);
    if (kind !== null) added.push({ id: tree.id, x: tree.x, z: tree.z, kind });
  }
  added.sort((a, b) => a.id - b.id);
  return {
    removed: [...removed].sort(byId),
    stumps: stumps.sort(byId),
    saplings: saplings.sort(byId),
    ...(added.length > 0 ? { added } : {}),
  };
}

/** Rychlé dotazy nad změnami – jaký druh překážky teď na místě je. */
export interface ObstacleStatus {
  /** Druh překážky teď (pokácený strom = pařez, dorůstající = mladý stromek), odstraněná null. */
  kindOf(layer: ObstacleLayer, index: number): ObstacleKind | null;
  /** Překážky přidané vsí (stromy u pevných cest) s patou v obdélníku – podle id. */
  addedIn(minX: number, minZ: number, maxX: number, maxZ: number): readonly AddedObstacle[];
}

/** Dotazy podle objektu změn – kontrola umístění běží při každém pohybu kurzoru, změny ne. */
const statusCache = new WeakMap<ObstacleChanges, ObstacleStatus>();

/** Dotazy nad změnami vsi; pro týž objekt změn se množiny staví jen jednou. */
export function obstacleStatus(changes: ObstacleChanges = NO_OBSTACLE_CHANGES): ObstacleStatus {
  const cached = statusCache.get(changes);
  if (cached) return cached;
  const removed = new Set(changes.removed);
  const stumps = new Set(changes.stumps);
  const saplings = new Set(changes.saplings);
  const added = changes.added ?? [];
  const status: ObstacleStatus = {
    kindOf(layer, index) {
      const id = layer.id[index]!;
      if (removed.has(id)) return null;
      if (stumps.has(id)) return 'stump';
      if (saplings.has(id)) return 'youngTree';
      return obstacleKind(layer, index);
    },
    addedIn(minX, minZ, maxX, maxZ) {
      if (added.length === 0) return added;
      return added.filter(
        (o) => !removed.has(o.id) && o.x >= minX && o.x <= maxX && o.z >= minZ && o.z <= maxZ,
      );
    },
  };
  statusCache.set(changes, status);
  return status;
}

/** Překážky na místě stavby a co stojí jejich odstranění. */
export interface ObstacleTally {
  /** Práce navíc (člověkodny) podle tabulky překážek (fields.md). */
  cost: number;
  /** Překážky, které osadníci odstraní (bez skalních výchozů). */
  ids: number[];
  /** Z nich dospělé stromy – za každý kláda na hromadu, pokud ho nevyhradila stavba (forest.md). */
  treeIds: number[];
  /** Kolik překážek kterého druhu na místě je (i výchozy). */
  counts: Partial<Record<ObstacleKind, number>>;
  /** Plocha pod skalními výchozy (m²) – pole ji obejde. */
  outcropAreaM2: number;
}

function emptyTally(): ObstacleTally {
  return { cost: 0, ids: [], treeIds: [], counts: {}, outcropAreaM2: 0 };
}

function addToTally(
  tally: ObstacleTally,
  layer: ObstacleLayer,
  index: number,
  kind: ObstacleKind,
): void {
  tally.counts[kind] = (tally.counts[kind] ?? 0) + 1;
  if (kind === 'outcrop') {
    const radius = OUTCROP_RADIUS_M * layer.scale[index]!;
    tally.outcropAreaM2 += Math.PI * radius * radius;
    return;
  }
  tally.ids.push(layer.id[index]!);
  if (kind === 'tree') tally.treeIds.push(layer.id[index]!);
  tally.cost += OBSTACLE_COST[kind];
}

/** Přičte překážku přidanou vsí (strom u pevné cesty – dospělý dá kládu jako strom z vrstvy). */
function addAddedToTally(tally: ObstacleTally, obstacle: AddedObstacle): void {
  tally.counts[obstacle.kind] = (tally.counts[obstacle.kind] ?? 0) + 1;
  tally.ids.push(obstacle.id);
  if (obstacle.kind === 'tree') tally.treeIds.push(obstacle.id);
  tally.cost += OBSTACLE_COST[obstacle.kind];
}

/** Políčko krajiny (index po ose) bodu světa – jako `obstaclesInTile` vrstvy. */
function tileIndexOf(layer: ObstacleLayer, v: number): number {
  const half = (layer.size * layer.cellSizeM) / 2;
  return Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
}

/** Přidané překážky (stromy u cest) s patou v mnohoúhelníku. */
function addedInPolygon(status: ObstacleStatus, polygon: readonly Point[]): AddedObstacle[] {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return status
    .addedIn(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs))
    .filter((o) => pointInPolygon([o.x, o.z], polygon));
}

/**
 * Cena překážek z `tally` bez druhů `included`, které jsou v sazbě povrchu za hektar (v lese
 * stromy a podrost, v křovinách keře – SURFACE_INCLUDED_OBSTACLES). Počítá se z počtů po druzích
 * v pevném pořadí – výsledek nezávisí na pořadí překážek ve vrstvě.
 */
export function tallyCost(tally: ObstacleTally, included: readonly ObstacleKind[] = []): number {
  let cost = 0;
  for (const [kind, price] of Object.entries(OBSTACLE_COST) as [
    keyof typeof OBSTACLE_COST,
    number,
  ][]) {
    if (!included.includes(kind)) cost += price * (tally.counts[kind] ?? 0);
  }
  return cost;
}

/**
 * Překážky na čtverci pole, sadu nebo hřbitova (pata v políčku). Odstraní se všechny (kromě
 * skalních výchozů a stromů z `keep` – posvátné duby zůstanou stát, happiness.md); kolik z nich
 * se platí po kusech, rozhoduje povrch čtverce – na lesním čtverci pole platí sazba za hektar
 * a stromy jsou v ceně (fields.md – Co je překážka, `tallyCost`).
 */
export function cellObstacles(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  cell: TileCell,
  keep: ReadonlySet<number> = NO_IDS,
): ObstacleTally {
  const tally = emptyTally();
  for (const index of obstaclesInTile(layer, cell.x, cell.y)) {
    if (keep.has(layer.id[index]!)) continue;
    const kind = status.kindOf(layer, index);
    if (kind !== null) addToTally(tally, layer, index, kind);
  }
  // stromy u pevných cest (roads.md) s patou v políčku
  const half = (layer.size * layer.cellSizeM) / 2;
  const x0 = -half + cell.x * layer.cellSizeM;
  const z0 = -half + cell.y * layer.cellSizeM;
  for (const o of status.addedIn(x0, z0, x0 + layer.cellSizeM, z0 + layer.cellSizeM)) {
    if (keep.has(o.id)) continue;
    if (tileIndexOf(layer, o.x) !== cell.x || tileIndexOf(layer, o.z) !== cell.y) continue;
    addAddedToTally(tally, o);
  }
  return tally;
}

/** Bod v souřadnicích modelu obydlí (x napříč, z k vchodu) → svět (natočení jako rotation.y). */
export function buildingLocalToWorld(position: Position, lx: number, lz: number): Point {
  return localToWorld(position, lx, lz);
}

function localToWorld(position: Position, lx: number, lz: number): Point {
  // deterministicky – kontrola v prohlížeči a na serveru musí najít tytéž překážky
  const cos = detCos(position.rotation);
  const sin = detSin(position.rotation);
  return [position.x + lx * cos + lz * sin, position.z - lx * sin + lz * cos];
}

/** Plocha, kterou osadníci kolem obydlí vyklidí (staveniště) – rohy ve světě. */
export function dwellingClearing(type: DwellingType, position: Position): Point[] {
  const c = DWELLING_CLEARING_M[type];
  return [
    localToWorld(position, c.minX, c.minZ),
    localToWorld(position, c.maxX, c.minZ),
    localToWorld(position, c.maxX, c.maxZ),
    localToWorld(position, c.minX, c.maxZ),
  ];
}

/** Indexy překážek, jejichž pata leží v mnohoúhelníku. */
function obstaclesInPolygon(layer: ObstacleLayer, polygon: readonly Point[]): number[] {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return obstaclesNear(
    layer,
    Math.min(...xs),
    Math.min(...zs),
    Math.max(...xs),
    Math.max(...zs),
  ).filter((i) => pointInPolygon([layer.x[i]!, layer.z[i]!], polygon));
}

/**
 * Překážky na vyklízené ploše obydlí – platí se po kusech (i v lese, fields.md). Překážky
 * v políčkách `fieldTiles` (index y × size + x) patří polím – odstraní je založení dílu, obydlí
 * je neplatí. Stromy z `keep` (posvátné duby, happiness.md) zůstanou stát.
 */
export function dwellingObstacles(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  type: DwellingType,
  position: Position,
  fieldTiles: ReadonlySet<number> = new Set(),
  keep: ReadonlySet<number> = NO_IDS,
): ObstacleTally {
  return polygonObstacles(layer, status, dwellingClearing(type, position), fieldTiles, keep);
}

/**
 * Překážky, jejichž pata leží v mnohoúhelníku (vyklízená plocha stavby) – platí se po kusech,
 * bez překážek v políčkách `skipTiles` (index y × size + x) a stromů z `keep`.
 */
export function polygonObstacles(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  polygon: readonly Point[],
  skipTiles: ReadonlySet<number> = new Set(),
  keep: ReadonlySet<number> = NO_IDS,
): ObstacleTally {
  const tally = emptyTally();
  const half = (layer.size * layer.cellSizeM) / 2;
  const tileOf = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  for (const index of obstaclesInPolygon(layer, polygon)) {
    if (skipTiles.has(tileOf(layer.z[index]!) * layer.size + tileOf(layer.x[index]!))) continue;
    if (keep.has(layer.id[index]!)) continue;
    const kind = status.kindOf(layer, index);
    if (kind !== null) addToTally(tally, layer, index, kind);
  }
  for (const o of addedInPolygon(status, polygon)) {
    if (skipTiles.has(tileOf(o.z) * layer.size + tileOf(o.x)) || keep.has(o.id)) continue;
    addAddedToTally(tally, o);
  }
  return tally;
}

/**
 * Překážky ve více mnohoúhelnících (dílna a kruh milíře – crafts.md) – jako `polygonObstacles`,
 * ale překážka, která leží ve víc z nich, se počítá jednou.
 */
export function polygonsObstacles(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  polygons: readonly (readonly Point[])[],
  skipTiles: ReadonlySet<number> = new Set(),
  keep: ReadonlySet<number> = NO_IDS,
): ObstacleTally {
  const tally = emptyTally();
  const seen = new Set<number>();
  const half = (layer.size * layer.cellSizeM) / 2;
  const tileOf = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  for (const polygon of polygons) {
    for (const index of obstaclesInPolygon(layer, polygon)) {
      if (seen.has(index)) continue;
      seen.add(index);
      if (skipTiles.has(tileOf(layer.z[index]!) * layer.size + tileOf(layer.x[index]!))) continue;
      if (keep.has(layer.id[index]!)) continue;
      const kind = status.kindOf(layer, index);
      if (kind !== null) addToTally(tally, layer, index, kind);
    }
  }
  const seenAdded = new Set<number>();
  for (const polygon of polygons) {
    for (const o of addedInPolygon(status, polygon)) {
      if (seenAdded.has(o.id)) continue;
      seenAdded.add(o.id);
      if (skipTiles.has(tileOf(o.z) * layer.size + tileOf(o.x)) || keep.has(o.id)) continue;
      addAddedToTally(tally, o);
    }
  }
  return tally;
}

/** Vzdálenost bodu od úsečky a–b. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return length2(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Zasahuje do mnohoúhelníku některý skalní výchoz (kruh kolem paty)? Výchoz se neodstraní. */
export function outcropUnder(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  polygon: readonly Point[],
): boolean {
  const reach = OUTCROP_RADIUS_M * 2; // největší výchoz (velikost do 1,8) + rezerva
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  for (const i of obstaclesNear(
    layer,
    Math.min(...xs) - reach,
    Math.min(...zs) - reach,
    Math.max(...xs) + reach,
    Math.max(...zs) + reach,
  )) {
    if (status.kindOf(layer, i) !== 'outcrop') continue;
    const center: Point = [layer.x[i]!, layer.z[i]!];
    if (pointInPolygon(center, polygon)) return true;
    const radius = OUTCROP_RADIUS_M * layer.scale[i]!;
    for (let k = 0; k < polygon.length; k++) {
      if (distanceToSegment(center, polygon[k]!, polygon[(k + 1) % polygon.length]!) < radius) {
        return true;
      }
    }
  }
  return false;
}

// --- les a dřevo (forest.md) – pomocníci pro kácení ------------------------------------------

/** Dospělý strom s vzdáleností od místa (m). */
export interface TreeAtDistance {
  id: number;
  x: number;
  z: number;
  distanceM: number;
}

/**
 * Stojící dospělé stromy sídla podle vzdálenosti od bodu (nejbližší první, při shodě menší id)
 * – ne mladé stromky, souše, padlé stromy, pařezy ani pokácené a odstraněné stromy (forest.md
 * – Kácení). Počítají se všechny, i vnitřek lesa (impostory).
 */
export function matureTreesByDistance(
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  from: { x: number; z: number },
  options: {
    limit?: number;
    maxDistanceM?: number;
    /** Stromy, které se nekácí (posvátné duby a háje – `sacredSitesOf(...).protectedTrees`). */
    exclude?: ReadonlySet<number>;
  } = {},
): TreeAtDistance[] {
  const status = obstacleStatus(changes);
  const maxDistance = options.maxDistanceM ?? Infinity;
  const exclude = options.exclude ?? NO_IDS;
  const trees: TreeAtDistance[] = [];
  for (let i = 0; i < layer.count; i++) {
    if (status.kindOf(layer, i) !== 'tree' || exclude.has(layer.id[i]!)) continue;
    const x = layer.x[i]!;
    const z = layer.z[i]!;
    const distanceM = length2(x - from.x, z - from.z);
    if (distanceM <= maxDistance) trees.push({ id: layer.id[i]!, x, z, distanceM });
  }
  trees.sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  return options.limit === undefined ? trees : trees.slice(0, options.limit);
}

/** Kolik dospělých stromů v krajině sídla stojí (forest.md – dá se ještě stavět?). */
export function countMatureTrees(layer: ObstacleLayer, changes: ObstacleChanges): number {
  const status = obstacleStatus(changes);
  let count = 0;
  for (let i = 0; i < layer.count; i++) if (status.kindOf(layer, i) === 'tree') count++;
  return count;
}

/**
 * Pokácí stromy v den `day` – zbude po nich pařez a z náletu znovu dorostou (forest.md).
 * RangeError, když strom už pokácený (a nedorostl) nebo odstraněný je, nebo když se id
 * opakuje. Jestli je to dospělý strom, ověří volající (`matureTreesByDistance`). Záznamy
 * stromů, které mezitím dorostly, se zahodí – stromy zase stojí.
 */
export function fellTrees(state: VillageState, ids: readonly number[], day: number): VillageState {
  if (!Number.isInteger(day) || day < 0) throw new RangeError(`Neplatný den kácení ${day}.`);
  if (new Set(ids).size !== ids.length) throw new RangeError('Strom nejde pokácet dvakrát.');
  const changes = obstacleChangesAt(state, day);
  const unavailable = new Set([...changes.removed, ...changes.stumps, ...changes.saplings]);
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0) throw new RangeError(`Neplatné id stromu ${id}.`);
    if (unavailable.has(id)) throw new RangeError(`Strom ${id} už nestojí.`);
  }
  const kept = (state.felledTrees ?? []).filter((f) => treeRegrowth(f.day, day) !== 'grown');
  return { ...state, felledTrees: [...kept, ...ids.map((id) => ({ id, day }))] };
}

/** Přidá odstraněné překážky (pole, obydlí, hřbitovy, sady) – mutuje stav, volat na klonu. */
export function recordClearedObstacles(
  state: VillageState,
  ids: readonly number[],
  day: number,
): void {
  if (ids.length === 0) return;
  const cleared = (state.clearedObstacles ??= []);
  for (const id of ids) cleared.push({ id, day } satisfies ObstacleChange);
}

/**
 * Ves založená před vrstvou překážek (bez `clearedObstacles`): doplní odstraněné překážky
 * pod obydlími, rozestavěnými obydlími, založenými díly polí a hotovými čtverci hřbitovů, díly
 * ve stavu zakládání a čtverce hřbitovů ve stavbě dostanou své překážky. Den odstranění
 * neznáme – použije se den, do kterého je ves dopočítaná. Ves s překážkami vrací beze změny.
 */
export function withObstacleClearing(state: VillageState, layer: ObstacleLayer): VillageState {
  if (state.clearedObstacles !== undefined) return state;
  const next = structuredClone(state);
  next.clearedObstacles = [];
  next.felledTrees ??= [];
  const status = obstacleStatus();
  const day = Math.max(0, state.lastDay);
  const sites: { type: DwellingType; position: Position }[] = [
    ...next.dwellings,
    ...next.constructions.flatMap((c) =>
      c.kind === 'dwelling' && c.dwellingType !== null && c.position !== null
        ? [{ type: c.dwellingType, position: c.position }]
        : [],
    ),
  ];
  const removed = new Set<number>();
  const cemeteries = next.cemeteries ?? [];
  // překážky v políčkách polí a hřbitovů patří jim, ne obydlí
  const fieldTiles = new Set([
    ...next.parts.flatMap((p) => (p.cell ? [p.cell.y * layer.size + p.cell.x] : [])),
    ...cemeteries.flatMap((c) => c.squares.map((s) => s.cell.y * layer.size + s.cell.x)),
  ]);
  for (const site of sites) {
    const tally = dwellingObstacles(layer, status, site.type, site.position, fieldTiles);
    for (const id of tally.ids) removed.add(id);
  }
  for (const part of next.parts) {
    if (!part.cell) continue;
    const ids = cellObstacles(layer, status, part.cell).ids;
    if (part.state === 'founding') {
      const pending = ids.filter((id) => !removed.has(id));
      if (pending.length > 0) part.obstacles = pending;
    } else {
      for (const id of ids) removed.add(id);
    }
  }
  for (const cemetery of cemeteries) {
    for (const square of cemetery.squares) {
      const ids = cellObstacles(layer, status, square.cell).ids;
      const building = square.constructionId !== undefined || cemetery.builtDay === null;
      if (building) {
        if (ids.length > 0) square.obstacles = ids;
      } else {
        for (const id of ids) removed.add(id);
      }
    }
  }
  recordClearedObstacles(
    next,
    [...removed].sort((a, b) => a - b),
    day,
  );
  return next;
}
