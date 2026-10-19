import {
  length2,
  obstacleIndex,
  obstacleKind,
  obstacleLook,
  obstacleSpecies,
  obstaclesNear,
  type ObstacleLayer,
} from '../landscape';
import { distanceFactor } from './fields';
import {
  fellTrees,
  obstacleChangesAt,
  obstacleStatus,
  felledTreeStage,
  type ObstacleChanges,
  type TreeAtDistance,
} from './obstacles';
import {
  DWELLING_TREES,
  FELLING_MAN_DAYS_PER_TREE,
  LOG_ROT_PER_YEAR,
  LOGS_PER_CLEARED_TREE,
  OAK_MODEL_HEIGHT_M,
  SACRED_BUILDINGS,
} from './rules';
import type { Walk } from './paths/walking';
import { sacredSitesOf } from './sacred';
import { isWoodTreeId } from './woods';
import type {
  Construction,
  ConstructionWood,
  Dwelling,
  DwellingType,
  SacredBuildingKind,
  VillageState,
} from './types';

// Les a dřevo (forest.md): hromada klád u vsi, dřevo staveb (nejdřív z hromady, zbytek se kácí
// z nejbližších dospělých stromů ke staveništi), hnití klád a palivo. Stromy ke kácení se
// vybírají jednou při zahájení stavby (vyhradí se) – simulace pak kácí jen podle uložených id,
// nikdy neprochází celou vrstvu překážek (desítky tisíc stromů) den po dni.

/** Tolerance proti chybám desetinných čísel u odvedené práce stavby. */
const EPSILON = 1e-9;
/** Klády hnijí rovnoměrně po dnech – za rok ubude LOG_ROT_PER_YEAR. */
const DAILY_LOG_KEEP = (1 - LOG_ROT_PER_YEAR) ** (1 / 365);

/** Klády na hromadě (u vsí uložených před dřevem 0). */
export function woodLogs(state: Pick<VillageState, 'woodLogs'>): number {
  return state.woodLogs ?? 0;
}

/**
 * Klády na hromadě v kusech – hromada hnije po troškách, kus se počítá, dokud z něj zbývá aspoň
 * polovina (zaokrouhleně). Tolik jich hráč vidí a tolik jich stavba může vzít.
 */
export function wholeLogs(logs: number): number {
  return Math.max(0, Math.round(logs));
}

/** Přidá klády na hromadu (mutuje stav – volat na klonu). */
export function addLogs(state: VillageState, logs: number): void {
  if (logs <= 0) return;
  state.woodLogs = woodLogs(state) + logs;
}

/** Klády z mýcení – dospělé stromy na vymýcené ploše (1 kláda za strom). */
export function logsFromClearedTrees(trees: number): number {
  return trees * LOGS_PER_CLEARED_TREE;
}

/** Jeden den hnití klád na hromadě (mutuje stav). */
export function rotLogs(state: VillageState): void {
  if (state.woodLogs !== undefined && state.woodLogs > 0) state.woodLogs *= DAILY_LOG_KEEP;
}

/** Práce za skácení a dovoz jednoho stromu podle vzdálenosti od staveniště (člověkodny). */
export function fellingCost(distanceM: number): number {
  return FELLING_MAN_DAYS_PER_TREE * distanceFactor(distanceM);
}

/** Práce za kácení stromů stavby (první část ceny stavby). */
export function woodFellingCost(wood: ConstructionWood | undefined): number {
  return wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
}

/** Kolik stromů stavba ještě musí skácet. */
export function treesToFell(c: Pick<Construction, 'wood'>): number {
  return c.wood ? c.wood.fell.length - c.wood.felled : 0;
}

/**
 * Stromy vyhrazené rozestavěnými stavbami, které ještě stojí (nepokácené), a stromy, které právě
 * kácejí řemeslné dílny (hrnčíř, buky milíře uhlíře – crafts.md). Patří své stavbě nebo dílně: nepočítají se
 * do klád z mýcení (pole, hřbitov, staveniště) a nekácí je nikdo jiný.
 */
export function reservedTrees(
  state: Pick<VillageState, 'constructions'> &
    Partial<Pick<VillageState, 'dwellings' | 'neighbours'>>,
): Set<number> {
  // stromy, které si vyhradily jiné vsi na téže mapě, nekácí ani tahle (migration.md)
  const reserved = new Set<number>(state.neighbours?.reserved ?? []);
  for (const c of state.constructions) {
    if (!c.wood) continue;
    for (let i = c.wood.felled; i < c.wood.fell.length; i++) {
      const id = c.wood.fell[i]!.id;
      if (id !== null) reserved.add(id);
    }
  }
  for (const d of state.dwellings ?? []) {
    const id = d.workshop?.felling?.id;
    if (id !== undefined && id !== null) reserved.add(id);
    // buky rozdělaného milíře uhlíře, které ještě nejsou připravené (crafts.md – Uhlíř)
    const kiln = d.workshop?.kiln;
    if (!kiln) continue;
    for (let i = kiln.prepared; i < kiln.trees.length; i++) {
      const tree = kiln.trees[i]!.id;
      if (tree !== null) reserved.add(tree);
    }
  }
  return reserved;
}

/**
 * Překážky, které stavba obydlí pro své dřevo kácet nesmí, protože už patří jiné stavbě: stromy
 * vyhrazené jinými stavbami a překážky na zakládaných dílech polí, čtvercích hřbitova ve stavbě
 * a čtvercích sadu, které se ještě nezačaly sázet (ty odstraní a za stromy dají klády jejich
 * stavba).
 */
export function claimedObstacles(
  state: Pick<VillageState, 'constructions' | 'parts' | 'cemeteries' | 'orchards'> &
    Partial<Pick<VillageState, 'dwellings'>>,
): Set<number> {
  const claimed = reservedTrees(state);
  for (const part of state.parts) for (const id of part.obstacles ?? []) claimed.add(id);
  for (const cemetery of state.cemeteries ?? []) {
    for (const square of cemetery.squares) for (const id of square.obstacles ?? []) claimed.add(id);
  }
  for (const orchard of state.orchards ?? []) {
    for (const square of orchard.squares) for (const id of square.obstacles ?? []) claimed.add(id);
  }
  return claimed;
}

/** Je strom vrstvy dub (podle modelu)? */
export function isOak(layer: ObstacleLayer, index: number): boolean {
  return OAK_MODEL_HEIGHT_M[obstacleLook(layer, index)] !== undefined;
}

/** Výchozí výběr stromů – všechny dospělé (i les vsi). */
const ACCEPT_ALL = (): boolean => true;

/**
 * Dospělé stromy lesa vsi (fields.md – Les vsi), které v den změn stojí – mezi překážkami
 * přidanými vsí (`changes.added`), bez stromů z `exclude`.
 */
function woodTreesStanding(
  changes: ObstacleChanges,
  exclude: ReadonlySet<number>,
): { id: number; x: number; z: number }[] {
  return (changes.added ?? []).filter(
    (o) => o.kind === 'tree' && isWoodTreeId(o.id) && !exclude.has(o.id),
  );
}

/**
 * Nejbližší stojící dospělé stromy k bodu (nejbližší první, při shodě menší id) bez stromů
 * z `exclude` a bez posvátných dubů a stromů hájů (ty se pro stavby nekácí – happiness.md) –
 * jako `matureTreesByDistance`, ale hledá po políčkách v rostoucím čtverci, takže neprochází
 * celou vrstvu. Patří k nim i dospělé stromy lesa vsi (`changes.added` – fields.md, Les vsi):
 * pro stavby i pro uhlíře (`isBeech` – les vsi je smíšený les a dřevo vsi, uhlíř ho pálí jako buk),
 * duby pro modlu a svatyni rostou jen v lese krajiny. `accept` zúží výběr (duby pro modlu
 * a svatyni, buky pro uhlíře). Když dospělých stromů není dost, vrátí všechny.
 */
export function nearestMatureTrees(
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  from: { x: number; z: number },
  count: number,
  exclude: ReadonlySet<number> = new Set(),
  accept: (layer: ObstacleLayer, index: number) => boolean = ACCEPT_ALL,
): TreeAtDistance[] {
  if (count <= 0) return [];
  const fromLayer = nearestLayerTrees(layer, changes, from, count, exclude, accept);
  if (accept !== ACCEPT_ALL && accept !== isBeech) return fromLayer;
  const woods = woodTreesStanding(changes, exclude).map((t) => ({
    id: t.id,
    x: t.x,
    z: t.z,
    distanceM: length2(t.x - from.x, t.z - from.z),
  }));
  if (woods.length === 0) return fromLayer;
  return [...fromLayer, ...woods]
    .sort((a, b) => a.distanceM - b.distanceM || a.id - b.id)
    .slice(0, count);
}

/** Nejbližší dospělé stromy vrstvy krajiny (`nearestMatureTrees` bez lesa vsi). */
function nearestLayerTrees(
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  from: { x: number; z: number },
  count: number,
  exclude: ReadonlySet<number>,
  accept: (layer: ObstacleLayer, index: number) => boolean,
): TreeAtDistance[] {
  const status = obstacleStatus(changes);
  const sacred = sacredSitesOf(layer).protectedTrees;
  const extent = layer.size * layer.cellSizeM;
  let radius = layer.cellSizeM * 2;
  for (;;) {
    const found: TreeAtDistance[] = [];
    const indices = obstaclesNear(
      layer,
      from.x - radius,
      from.z - radius,
      from.x + radius,
      from.z + radius,
    );
    for (const i of indices) {
      const id = layer.id[i]!;
      if (status.kindOf(layer, i) !== 'tree' || exclude.has(id) || sacred.has(id)) continue;
      if (!accept(layer, i)) continue;
      const x = layer.x[i]!;
      const z = layer.z[i]!;
      const distanceM = length2(x - from.x, z - from.z);
      if (distanceM <= radius) found.push({ id, x, z, distanceM });
    }
    // strom za poloměrem je dál než všechny nalezené – stačí jich mít dost uvnitř kruhu;
    // čtverec přes celou krajinu (z bodu v ní je nejdál √2 × strana) už najde všechny
    const everything = radius >= extent * 1.5;
    if (found.length >= count || everything) {
      found.sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
      return found.slice(0, count);
    }
    radius *= 2;
  }
}

/** Je strom vrstvy buk (podle modelu – `lookSpecies`)? Uhlíř pálí jen buky (crafts.md – Uhlíř). */
export function isBeech(layer: ObstacleLayer, index: number): boolean {
  return obstacleSpecies(layer, index) === 'beech';
}

/** Které dospělé stromy se počítají: všechny, duby (modla, svatyně), nebo buky (uhlíř). */
export type TreeFilter = 'all' | 'oaks' | 'beeches';

const TREE_FILTERS: Record<TreeFilter, (layer: ObstacleLayer, index: number) => boolean> = {
  all: () => true,
  oaks: isOak,
  beeches: isBeech,
};

/** Dospělé stromy, duby a buky vrstvy, které jde kácet (bez posvátných) – jednou na vrstvu. */
const layerTreeCounts = new WeakMap<ObstacleLayer, Record<TreeFilter, number>>();

function layerFellableTrees(layer: ObstacleLayer): Record<TreeFilter, number> {
  let counts = layerTreeCounts.get(layer);
  if (counts === undefined) {
    const sacred = sacredSitesOf(layer).protectedTrees;
    counts = { all: 0, oaks: 0, beeches: 0 };
    for (let i = 0; i < layer.count; i++) {
      if (obstacleKind(layer, i) !== 'tree' || sacred.has(layer.id[i]!)) continue;
      counts.all++;
      if (isOak(layer, i)) counts.oaks++;
      if (isBeech(layer, i)) counts.beeches++;
    }
    layerTreeCounts.set(layer, counts);
  }
  return counts;
}

/**
 * Kolik dospělých stromů (`filter` – všech, dubů, nebo buků) krajiny sídla jde ještě skácet – stojící dospělé
 * stromy bez těch, které patří jiné stavbě (`claimedObstacles`), a bez posvátných dubů a hájů,
 * bez ohledu na vzdálenost (forest.md – dá se ještě stavět?). Počet stromů vrstvy je
 * v mezipaměti, odečítají se jen změny vsi – celá vrstva se neprochází.
 */
export function availableTrees(
  layer: ObstacleLayer,
  state: VillageState,
  day: number,
  filter: TreeFilter = 'all',
): number {
  const changes = obstacleChangesAt(state, day);
  const status = obstacleStatus(changes);
  const sacred = sacredSitesOf(layer).protectedTrees;
  let count = layerFellableTrees(layer)[filter];
  const accept = TREE_FILTERS[filter];
  const counted = (index: number): boolean =>
    index >= 0 && !sacred.has(layer.id[index]!) && accept(layer, index);
  // odstraněné, pokácené a dorůstající stromy (seznamy změn se nepřekrývají)
  for (const list of [changes.removed, changes.stumps, changes.saplings]) {
    for (const id of list) {
      const index = obstacleIndex(layer, id);
      if (counted(index) && obstacleKind(layer, index) === 'tree') count--;
    }
  }
  const claimed = claimedObstacles(state);
  for (const id of claimed) {
    const index = obstacleIndex(layer, id);
    if (counted(index) && status.kindOf(layer, index) === 'tree') count--;
  }
  // dospělé stromy lesa vsi (fields.md – Les vsi) – dřevo vsi i pro uhlíře; duby jen z lesa krajiny
  if (filter !== 'oaks') count += woodTreesStanding(changes, claimed).length;
  return Math.max(0, count);
}

/**
 * Dospělé duby, které ves může pro modlu nebo svatyni skácet (happiness.md) – bez vrstvy (null –
 * jen testy) neomezeně. Duby se berou jen kácením (klády na hromadě se podle dřeviny nerozlišují).
 */
export function oakSupply(
  state: VillageState,
  obstacles: ObstacleLayer | null | undefined,
  day: number = state.lastDay,
): number {
  return obstacles ? availableTrees(obstacles, state, day, 'oaks') : Infinity;
}

/**
 * Dřevo, které má ves pro stavbu: celé klády na hromadě + dospělé stromy, které jde skácet.
 * Bez vrstvy překážek (null – jen testy) se kácí bez polohy – stromů je neomezeně.
 */
export function woodSupply(
  state: VillageState,
  obstacles: ObstacleLayer | null | undefined,
  day: number = state.lastDay,
): number {
  const trees = obstacles ? availableTrees(obstacles, state, day) : Infinity;
  return wholeLogs(woodLogs(state)) + trees;
}

/** Strom ke kácení v plánu dřeva stavby. */
export interface PlannedFelling {
  /** Id z vrstvy překážek; null = kácení bez polohy (ves bez vrstvy překážek). */
  id: number | null;
  distanceM: number;
  /** Skácení a dovoz (člověkodny). */
  cost: number;
}

/**
 * Plán dřeva obydlí: dospělé stromy z vyklízené plochy jdou na hromadu, stavba vezme celé klády
 * z hromady a zbytek se skácí z nejbližších dospělých stromů ke staveništi.
 */
export interface WoodPlan {
  /** Dospělé stromy na vyklízené ploše – osadníci je skácí na hromadu (1 kláda za strom). */
  clearedTrees: number;
  /** Klády z hromady (i z vyklízené plochy). */
  fromPile: number;
  /** Stromy ke kácení, nejbližší první. */
  fell: PlannedFelling[];
  /** Kolik dřeva chybí – klády ani dospělé stromy sídla nestačí (stavba nejde). */
  missing: number;
}

export interface WoodPlanOptions {
  /**
   * Vrstva překážek krajiny – stromy ke kácení. Bez ní (null, jen testy) se dřevo, které
   * nestačí z hromady, kácí bez polohy za cenu blízkého lesa.
   */
  obstacles?: ObstacleLayer | null;
  /** Dospělé stromy na vyklízené ploše (mezi `clearedIds`). */
  clearedTrees?: number;
  /** Překážky vyklízené plochy – osadníci je odstraní i s pařezy, nekácí se pro stavbu. */
  clearedIds?: readonly number[];
  /** Kolik dřeva (stromů) stavba chce – řemeslná dílna víc (crafts.md); bez údaje podle obydlí. */
  trees?: number;
  /**
   * Chůze ke stromům po pevných cestách s půdou (roads.md – kácení chůzí, `roadWalk`): cena
   * kácení podle ní místo vzdušné vzdálenosti. Bez ní (kalibrace, testy) vzdušná vzdálenost.
   */
  walk?: Walk;
}

/**
 * Co plán dřeva potřebuje vědět o vsi: klády na hromadě a (líně – jen když je co kácet) změny
 * překážek v den stavby a stromy, které patří jiným stavbám. Ze stavu vsi to složí
 * `planDwellingWood`, prohlížeč při umisťování z pohledu na ves (`planDwellingWoodFrom`).
 */
export interface WoodSource {
  /** Klády na hromadě (i necelé – stavba vezme celé kusy). */
  logs: number;
  /** Odstraněné, pokácené a dorůstající stromy v den stavby (`obstacleChangesAt`). */
  changes(): ObstacleChanges;
  /** Stromy, které patří jiným stavbám (`claimedObstacles`) – kácet se nesmí. */
  claimed(): Set<number>;
}

/**
 * Plán dřeva obydlí `type` u staveniště `position` v den `day` (forest.md – Stavby a kácení):
 * nejdřív celé klády z hromady (Martin), zbytek nejbližší stojící dospělé stromy ke staveništi,
 * které nepatří jiné stavbě (`claimedObstacles`). Stav nemění.
 */
export function planDwellingWood(
  state: VillageState,
  type: DwellingType,
  position: { x: number; z: number },
  day: number,
  options: WoodPlanOptions = {},
): WoodPlan {
  return planDwellingWoodFrom(
    type,
    position,
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    options,
  );
}

/**
 * Plán dřeva obydlí podle `source` místo stavu vsi – stejný výběr jako `planDwellingWood`.
 * Prohlížeč jím při umisťování spočítá cenu (kolik stromů se skácí a za kolik práce), i když
 * stav vsi nemá.
 */
export function planDwellingWoodFrom(
  type: DwellingType,
  position: { x: number; z: number },
  source: WoodSource,
  options: WoodPlanOptions = {},
): WoodPlan {
  return planWoodFrom(options.trees ?? DWELLING_TREES[type], position, source, options);
}

/**
 * Plán `need` stromů dřeva stavby u `position` (obydlí, ohrada, rádlo – oxen.md): nejdřív celé
 * klády z hromady, zbytek nejbližší stojící dospělé stromy, které nepatří jiné stavbě.
 */
export function planWoodFrom(
  need: number,
  position: { x: number; z: number },
  source: WoodSource,
  options: WoodPlanOptions = {},
): WoodPlan {
  const clearedTrees = options.clearedTrees ?? 0;
  const pile = wholeLogs(source.logs + logsFromClearedTrees(clearedTrees));
  const fromPile = Math.min(need, pile);
  const toFell = need - fromPile;
  if (toFell === 0) return { clearedTrees, fromPile, fell: [], missing: 0 };
  if (!options.obstacles) {
    const fell = Array.from({ length: toFell }, () => ({
      id: null,
      distanceM: 0,
      cost: fellingCost(0),
    }));
    return { clearedTrees, fromPile, fell, missing: 0 };
  }
  const exclude = source.claimed();
  for (const id of options.clearedIds ?? []) exclude.add(id);
  const trees = nearestMatureTrees(options.obstacles, source.changes(), position, toFell, exclude);
  const fell = fellingsOf(trees, position, options.walk);
  return { clearedTrees, fromPile, fell, missing: toFell - fell.length };
}

/**
 * Provede plán dřeva při zahájení stavby (mutuje stav – volat na klonu): klády z vyklízené
 * plochy na hromadu, klády stavby z hromady; vrátí dřevo stavby s vyhrazenými stromy.
 */
export function takeWood(state: VillageState, plan: WoodPlan): ConstructionWood {
  addLogs(state, logsFromClearedTrees(plan.clearedTrees));
  if (plan.fromPile > 0) state.woodLogs = Math.max(0, woodLogs(state) - plan.fromPile);
  return {
    trees: plan.fromPile + plan.fell.length,
    fromPile: plan.fromPile,
    fell: plan.fell.map(({ id, cost }) => ({ id, cost })),
    felled: 0,
  };
}

/**
 * Plán dubů modly nebo svatyně (happiness.md): nejbližší stojící dospělé duby ke staveništi, které
 * nepatří jiné stavbě a nejsou posvátné; překážky vyklízené plochy (`clearedIds`) se nekácí.
 * Klády z hromady se nepoužijí – modla a svatyně chtějí dub. Stav nemění.
 */
export function planSacredWood(
  kind: SacredBuildingKind,
  position: { x: number; z: number },
  source: Pick<WoodSource, 'changes' | 'claimed'>,
  options: { obstacles?: ObstacleLayer | null; clearedIds?: readonly number[]; walk?: Walk } = {},
): WoodPlan {
  const need = SACRED_BUILDINGS[kind].oaks;
  if (!options.obstacles) {
    const fell = Array.from({ length: need }, () => ({
      id: null,
      distanceM: 0,
      cost: fellingCost(0),
    }));
    return { clearedTrees: 0, fromPile: 0, fell, missing: 0 };
  }
  const exclude = source.claimed();
  for (const id of options.clearedIds ?? []) exclude.add(id);
  const oaks = nearestMatureTrees(
    options.obstacles,
    source.changes(),
    position,
    need,
    exclude,
    isOak,
  );
  const fell = fellingsOf(oaks, position, options.walk);
  return { clearedTrees: 0, fromPile: 0, fell, missing: need - fell.length };
}

/**
 * Stromy ke kácení s cenou: vzdálenost chůze ke stromu (`walk` – po pevných cestách s půdou,
 * roads.md), bez ní vzdušná vzdálenost.
 */
export function fellingsOf(
  trees: readonly TreeAtDistance[],
  position: { x: number; z: number },
  walk: Walk | undefined,
): PlannedFelling[] {
  const walks = walk && trees.length > 0 ? walk(position, trees) : null;
  return trees.map((t, k) => {
    const distanceM = walks ? walks[k]! : t.distanceM;
    return { id: t.id, distanceM, cost: fellingCost(distanceM) };
  });
}

/** Stojí strom v den `day` – není odstraněný ani pokácený (nebo už dorostl)? */
export function isTreeStanding(state: VillageState, id: number, day: number): boolean {
  if ((state.clearedObstacles ?? []).some((c) => c.id === id)) return false;
  const swath = state.roads?.swath?.includes(id) ?? false;
  return !(state.felledTrees ?? []).some(
    (f) => f.id === id && (swath || felledTreeStage(f, day) !== 'grown'),
  );
}

/**
 * Kácení podle odvedené práce stavby (mutuje stav): kácí se jako první část práce, strom po
 * stromu – pokácený strom nechá pařez (`fellTrees`). Vyhrazený strom, který mezitím zmizel
 * (odstranilo ho staveniště jiného obydlí), se počítá jako pokácený – patří této stavbě, na
 * hromadu za něj kláda nešla.
 */
export function fellAsWorked(state: VillageState, c: Construction, day: number): void {
  const wood = c.wood;
  if (!wood) return;
  let reached = 0;
  for (let i = 0; i < wood.fell.length; i++) {
    const tree = wood.fell[i]!;
    reached += tree.cost;
    if (i < wood.felled) continue;
    if (c.done + EPSILON < reached) return;
    if (tree.id !== null && isTreeStanding(state, tree.id, day)) {
      state.felledTrees = fellTrees(state, [tree.id], day).felledTrees ?? [];
    }
    wood.felled = i + 1;
  }
}

/**
 * Vzdálenost obydlí k okraji lesa (m): chůze (`forestWalkM` – po pěšinách a pevných
 * cestách, roads.md), bez ní (kalibrace, starší obydlí) vzdušná vzdálenost z krajiny.
 */
export function dwellingForestDistance(
  d: Pick<Dwelling, 'forestDistanceM' | 'forestWalkM'>,
): number | undefined {
  return d.forestWalkM ?? d.forestDistanceM;
}
