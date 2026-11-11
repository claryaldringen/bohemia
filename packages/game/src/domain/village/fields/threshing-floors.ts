import { obstacleChangesAt } from '../core/obstacles';
import { threshingFloorEntrance } from '../paths/entrances';
import { rectangleCorners, type Point } from '../placement/polygon';
import { FELLING_MAN_DAYS_PER_TREE, HUMNO, THRESHING } from '../rules';
import type { Construction, Position, ThreshingFloor, VillageState } from '../types';
import {
  claimedObstacles,
  planWoodFrom,
  woodLogs,
  type WoodPlan,
  type WoodPlanOptions,
  type WoodSource,
} from '../forest/wood';

// Humno (production-chains.md – Humno): udusaná a vymazaná mlatová plocha s přístřeškem, kterou
// staví hráč z nabídky staveb. Stavba ze společné práce se dřevem předem jako ohrada – humno
// vznikne hned při zahájení (`builtDay` null) a zabírá půdorys, po dostavění dostane den.

/** Humna vsi – hotová i rozestavěná (vsi bez humna prázdné). */
export function villageThreshingFloors(
  state: Pick<VillageState, 'threshingFloors'>,
): ThreshingFloor[] {
  return state.threshingFloors ?? [];
}

/** Hotová humna v provozu – na nich se mlátí (opuštěné ani bouřané ne – demolition.md). */
export function builtThreshingFloors(
  state: Pick<VillageState, 'threshingFloors'>,
): ThreshingFloor[] {
  return villageThreshingFloors(state).filter(
    (f) => f.builtDay !== null && f.disusedDay === undefined,
  );
}

/**
 * Výmlat dne označí humna, na kterých se mlátilo (mutuje stav; demolition.md – Chátrání humna):
 * práci na humnech `floorManDays` zvládne jedno humno THRESHING.floorManDaysPerDay za den, mlátí se
 * na prvních humnech v pořadí – nadbytečné humno zůstane bez výmlatu a chátrá. Roční kontrola
 * označení smaže.
 */
export function markThreshed(state: VillageState, floorManDays: number): void {
  if (floorManDays <= 0) return;
  const used = Math.ceil(floorManDays / THRESHING.floorManDaysPerDay - 1e-9);
  for (const f of builtThreshingFloors(state).slice(0, Math.max(1, used))) f.threshed = true;
}

/** Půdorys humna ve světě – obdélník HUMNO.sizeM natočený jako obydlí. */
export function threshingFloorFootprint(position: Position): Point[] {
  const { x, z } = HUMNO.sizeM;
  return rectangleCorners(position.x, position.z, x, z, position.rotation);
}

/**
 * Práce na humnu bez dřeva – cena humna (rešerše 2026-10-20-production-chains.md – Humno) v sobě
 * má kácení blízkého lesa jako cena obydlí.
 */
export function threshingFloorBuildLabor(): number {
  return HUMNO.laborManDays - HUMNO.trees * FELLING_MAN_DAYS_PER_TREE;
}

/**
 * Práce na humnu (člověkodny) jako při zahájení stavby: stavba bez dřeva, překážky a les pod
 * půdorysem (`obstacleCost`) a kácení stromů z plánu dřeva – klády z hromady práci nestojí.
 */
export function threshingFloorLaborManDays(
  obstacleCost: number,
  wood: Pick<WoodPlan, 'fell'>,
): number {
  return threshingFloorBuildLabor() + obstacleCost + wood.fell.reduce((sum, t) => sum + t.cost, 0);
}

/**
 * Plán dřeva humna u `position` v den `day`: celé klády z hromady, zbytek nejbližší dospělé
 * stromy, které nepatří jiné stavbě (forest.md – Stavby a kácení). Stav nemění.
 */
export function planThreshingFloorWood(
  state: VillageState,
  position: { x: number; z: number },
  day: number,
  options: Omit<WoodPlanOptions, 'trees'> = {},
): WoodPlan {
  return planThreshingFloorWoodFrom(
    position,
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    options,
  );
}

/** Plán dřeva humna podle `source` místo stavu vsi – cena u kurzoru v prohlížeči. */
export function planThreshingFloorWoodFrom(
  position: { x: number; z: number },
  source: WoodSource,
  options: Omit<WoodPlanOptions, 'trees'> = {},
): WoodPlan {
  return planWoodFrom(HUMNO.trees, position, source, options);
}

/** Dostavěné humno (mutuje): dostane den dostavění – od něj se na něm mlátí. */
export function finishThreshingFloor(state: VillageState, c: Construction, day: number): void {
  const floor = villageThreshingFloors(state).find((f) => f.id === c.id);
  if (floor) floor.builtDay = day;
}

/**
 * Kam vozy vezou snopy z polí (production-chains.md – Humno): vstupy hotových humen, rovným dílem
 * (váha bodu jako u dosahu vozu – CartReach). Bez humna prázdné.
 */
export function threshingFloorHaulPoints(
  state: Pick<VillageState, 'threshingFloors'>,
): { x: number; z: number; weight: number }[] {
  const floors = builtThreshingFloors(state);
  return floors.map((f) => {
    const at = threshingFloorEntrance(f.position);
    return { x: at.x, z: at.z, weight: 1 / floors.length };
  });
}
