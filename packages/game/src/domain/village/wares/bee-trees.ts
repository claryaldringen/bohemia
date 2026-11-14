import { dateOfDayIndex } from '../../calendar';
import { beeTreeSpots, tileCenterWorld, type Landscape } from '../../landscape';
import { WATER_FETCHING } from '../rules/rules-people';
import { BEE_TREE_HARVEST, HIVES } from '../rules/rules-wares';
import type { VillageState } from '../types';
import { beesFlying, ensureWares } from './wares';

const walkCache = new WeakMap<Landscape, readonly number[]>();

/**
 * Vzdálenosti (m, vzestupně) od středu vsi k brtím krajiny – přímo, ne po pěšinách (hides-honey.md
 * – Brtě). Krajina bez typu `wild-bees` dá `[]`. Pamatuje se podle krajiny.
 */
export function beeTreeWalksM(landscape: Landscape): readonly number[] {
  const cached = walkCache.get(landscape);
  if (cached) return cached;
  const { x, y } = landscape.villageSite;
  const center = tileCenterWorld(landscape, x, y);
  const walks = beeTreeSpots(landscape)
    .map((s) => Math.hypot(s.x - center.x, s.z - center.z))
    .sort((a, b) => a - b);
  walkCache.set(landscape, walks);
  return walks;
}

/** Každá brť přibývá jako klát – rovným dílem po dny sezóny (hides-honey.md – Brtě). */
export function beeTreesDay(state: VillageState, day: number, walksM: readonly number[]): void {
  if (walksM.length === 0 || !beesFlying(day)) return;
  const trees = (ensureWares(state).beeTrees ??= { honeyKg: 0, waxKg: 0 });
  trees.honeyKg += (walksM.length * HIVES.honeyKgPerYear) / HIVES.seasonDays;
  trees.waxKg += (walksM.length * HIVES.waxKgPerYear) / HIVES.seasonDays;
}

/**
 * Od 1. 10. ves vybere všechny brtě najednou, když má práci na obchůzku tam a zpátky (chůzí jako
 * voda); vrací spotřebované člověkodny. Jinak 0 a med zůstane v brtích.
 */
export function collectBeeTrees(
  state: VillageState,
  day: number,
  labor: number,
  walksM: readonly number[],
): number {
  const trees = state.wares?.beeTrees;
  if (!trees || (trees.honeyKg <= 0 && trees.waxKg <= 0)) return 0;
  const { month } = dateOfDayIndex(day);
  if (month < BEE_TREE_HARVEST.month) return 0;
  let needed = 0;
  for (const walk of walksM) {
    needed += (2 * walk) / WATER_FETCHING.speedMps / 3600 / WATER_FETCHING.dayHours;
  }
  if (labor < needed) return 0;
  const wares = ensureWares(state);
  wares.honeyKg += trees.honeyKg;
  wares.waxKg += trees.waxKg;
  trees.honeyKg = 0;
  trees.waxKg = 0;
  return needed;
}
