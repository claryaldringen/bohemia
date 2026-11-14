import { HIVES } from '../rules/rules-wares';
import type { VillageState } from '../types';
import { beesFlying, ensureWares } from './wares';

/** Klát u každého obydlí dává med a vosk rovným dílem po dny sezóny (hides-honey.md – Klát u obydlí). */
export function hivesDay(state: VillageState, day: number): void {
  const hives = state.dwellings.length;
  if (hives === 0 || !beesFlying(day)) return;
  const wares = ensureWares(state);
  wares.honeyKg += (hives * HIVES.honeyKgPerYear) / HIVES.seasonDays;
  wares.waxKg += (hives * HIVES.waxKgPerYear) / HIVES.seasonDays;
}
