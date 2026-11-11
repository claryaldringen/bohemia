import { daysUntilWinterHarvest } from './food';
import { storageLossPerYear } from './productivity';
import { LEGUMES } from './rules';
import type { VillageState } from './types';

// Luštěniny (diet.md a fields.md – Luštěniny, Zahrádka u obydlí). Z polí jsou vyřazené (Martin
// 9. 11. 2026: „Luštěniny jsou podle mě píčovina.“) – nové přibývají jen ze zahrádek u obydlí.
// Zásoba se jí rovným dílem celý rok do příští sklizně (31. 7.); obchod, platby a dávky
// luštěninami platí dál.

/** Energie luštěnin v kg obilí. */
export function legumeEnergy(kg: number): number {
  return kg * LEGUMES.energy;
}

/** Zásoba luštěnin vsi (kg) – u vsí bez luštěnin 0. */
export function villageLegumesKg(state: Pick<VillageState, 'legumesKg'>): number {
  return state.legumesKg ?? 0;
}

/** Dní do příští sklizně luštěnin (31. 7.) včetně dneška – jí se rovným dílem do ní. */
export function daysUntilLegumeHarvest(day: number): number {
  return daysUntilWinterHarvest(day);
}

/**
 * Ztráta zásoby luštěnin za rok – jako obilí (rešerše: zrnokaz napadá semena na poli, ve skladu
 * se nemnoží), s nádobami od hrnčíře menší (meze).
 */
export function legumeStorageLossPerYear(potteryCoverage: number): number {
  return storageLossPerYear(potteryCoverage);
}

/**
 * Kolik luštěnin ves sní za rok ze zásoby (kg) – rovným dílem do příští sklizně, přepočteno na
 * rok. Odhad pro bilanci bílkovin (livestock.ts – kolik masa ještě chybí).
 */
export function legumeSupplyPerYear(
  state: Pick<VillageState, 'legumesKg'>,
  day: number,
  daysPerYear: number,
): number {
  return (villageLegumesKg(state) * daysPerYear) / daysUntilLegumeHarvest(day);
}
