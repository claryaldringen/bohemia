import { length2, obstacleIndex, obstaclesNear, type ObstacleLayer } from '../landscape';
import { distanceFactor } from './fields';
import {
  fellTrees,
  obstacleChangesAt,
  obstacleStatus,
  treeRegrowth,
  type ObstacleChanges,
  type TreeAtDistance,
} from './obstacles';
import {
  DOMESTIC,
  DWELLING_TREES,
  FELLING_MAN_DAYS_PER_TREE,
  FUEL_DOMESTIC_SHARE,
  LOG_ROT_PER_YEAR,
  LOGS_PER_CLEARED_TREE,
} from './rules';
import type { Construction, ConstructionWood, DwellingType, VillageState } from './types';

// Les a dřevo (forest.md): hromada klád u vsi, dřevo staveb (nejdřív z hromady, zbytek se kácí
// z nejbližších dospělých stromů ke staveništi), hnití klád a palivo. Stromy ke kácení se
// vybírají jednou při zahájení stavby (vyhradí se) – simulace pak kácí jen podle uložených id,
// nikdy neprochází celou vrstvu překážek (desítky tisíc stromů) den po dni.

/** Tolerance proti chybám desetinných čísel (celé klády, práce stavby). */
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

/** Stromy vyhrazené rozestavěnými stavbami, které ještě stojí (nepokácené). */
export function reservedTrees(state: Pick<VillageState, 'constructions'>): Set<number> {
  const reserved = new Set<number>();
  for (const c of state.constructions) {
    if (!c.wood) continue;
    for (let i = c.wood.felled; i < c.wood.fell.length; i++) {
      const id = c.wood.fell[i]!.id;
      if (id !== null) reserved.add(id);
    }
  }
  return reserved;
}

/**
 * Nejbližší stojící dospělé stromy k bodu (nejbližší první, při shodě menší id) bez stromů
 * z `exclude` – jako `matureTreesByDistance`, ale hledá po políčkách v rostoucím čtverci, takže
 * neprochází celou vrstvu. Když dospělých stromů není dost, vrátí všechny.
 */
export function nearestMatureTrees(
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  from: { x: number; z: number },
  count: number,
  exclude: ReadonlySet<number> = new Set(),
): TreeAtDistance[] {
  if (count <= 0) return [];
  const status = obstacleStatus(changes);
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
      if (status.kindOf(layer, i) !== 'tree' || exclude.has(id)) continue;
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

/**
 * Kolik dospělých stromů krajiny sídla jde ještě skácet – všechny stojící dospělé stromy bez
 * vyhrazených stavbami, bez ohledu na vzdálenost (forest.md – dá se ještě stavět?). Prochází
 * celou vrstvu – volat jen při akci hráče nebo pohledu na ves, ne den po dni.
 */
export function availableTrees(layer: ObstacleLayer, state: VillageState, day: number): number {
  const changes = obstacleChangesAt(state, day);
  const status = obstacleStatus(changes);
  let count = 0;
  for (let i = 0; i < layer.count; i++) if (status.kindOf(layer, i) === 'tree') count++;
  for (const id of reservedTrees(state)) {
    const index = obstacleIndex(layer, id);
    if (index >= 0 && status.kindOf(layer, index) === 'tree') count--;
  }
  return Math.max(0, count);
}

/**
 * Dřevo, které má ves pro stavbu: celé klády na hromadě + dospělé stromy, které jde skácet.
 * Bez vrstvy překážek (testy, kalibrace) se kácí bez polohy – stromů je neomezeně.
 */
export function woodSupply(
  state: VillageState,
  obstacles: ObstacleLayer | undefined,
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
   * Vrstva překážek krajiny – stromy ke kácení. Bez ní (testy, kalibrace) se dřevo, které
   * nestačí z hromady, kácí bez polohy za cenu blízkého lesa.
   */
  obstacles?: ObstacleLayer;
  /** Dospělé stromy na vyklízené ploše (mezi `clearedIds`). */
  clearedTrees?: number;
  /** Překážky vyklízené plochy – osadníci je odstraní i s pařezy, nekácí se pro stavbu. */
  clearedIds?: readonly number[];
}

/**
 * Plán dřeva obydlí `type` u staveniště `position` v den `day` (forest.md – Stavby a kácení):
 * nejdřív celé klády z hromady (Martin), zbytek nejbližší stojící dospělé stromy ke staveništi,
 * které nevyhradila jiná stavba. Stav nemění.
 */
export function planDwellingWood(
  state: VillageState,
  type: DwellingType,
  position: { x: number; z: number },
  day: number,
  options: WoodPlanOptions = {},
): WoodPlan {
  const need = DWELLING_TREES[type];
  const clearedTrees = options.clearedTrees ?? 0;
  const pile = wholeLogs(woodLogs(state) + logsFromClearedTrees(clearedTrees));
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
  const exclude = reservedTrees(state);
  for (const id of options.clearedIds ?? []) exclude.add(id);
  const trees = nearestMatureTrees(
    options.obstacles,
    obstacleChangesAt(state, day),
    position,
    toFell,
    exclude,
  );
  const fell = trees.map((t) => ({
    id: t.id,
    distanceM: t.distanceM,
    cost: fellingCost(t.distanceM),
  }));
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

/** Stojí strom v den `day` – není odstraněný ani pokácený (nebo už dorostl)? */
function isStanding(state: VillageState, id: number, day: number): boolean {
  if ((state.clearedObstacles ?? []).some((c) => c.id === id)) return false;
  return !(state.felledTrees ?? []).some(
    (f) => f.id === id && treeRegrowth(f.day, day) !== 'grown',
  );
}

/**
 * Kácení podle odvedené práce stavby (mutuje stav): kácí se jako první část práce, strom po
 * stromu – pokácený strom nechá pařez (`fellTrees`). Vyhrazený strom, který mezitím zmizel
 * (vymýtilo ho pole nebo jiné staveniště a jeho kláda šla na hromadu), stavba nahradí kládou
 * z hromady.
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
    if (tree.id !== null) {
      if (isStanding(state, tree.id, day)) {
        state.felledTrees = fellTrees(state, [tree.id], day).felledTrees ?? [];
      } else {
        state.woodLogs = Math.max(0, woodLogs(state) - 1);
      }
    }
    wood.felled = i + 1;
  }
}

/**
 * Práce navíc na palivu za den (forest.md – Palivo): palivová část domácí výroby domácnosti je
 * o 1 % dražší za každých 10 m nad 100 m od jejího obydlí k nejbližšímu okraji lesa.
 * Zakladatelé, kteří bydlí na staveništi první zemnice, se počítají od staveniště.
 */
export function fuelExtraPerDay(state: VillageState): number {
  // běžný případ (les blízko všech obydlí) bez počítání domácností – volá se každý den
  const far = (distance: number | undefined): boolean => distanceFactor(distance ?? 0) > 1;
  if (
    !state.dwellings.some((d) => far(d.forestDistanceM)) &&
    !state.constructions.some((c) => far(c.forestDistanceM))
  ) {
    return 0;
  }
  const members = new Map<number, number>();
  for (const p of state.people) members.set(p.dwellingId, (members.get(p.dwellingId) ?? 0) + 1);
  let extra = 0;
  for (const [householdId, count] of members) {
    const distance =
      state.dwellings.find((d) => d.id === householdId)?.forestDistanceM ??
      state.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === householdId)
        ?.forestDistanceM ??
      0;
    const surcharge = distanceFactor(distance) - 1;
    if (surcharge <= 0) continue;
    const domestic = DOMESTIC.perHousehold + DOMESTIC.perPerson * count;
    extra += FUEL_DOMESTIC_SHARE * domestic * surcharge;
  }
  return extra;
}
