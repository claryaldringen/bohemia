import { effectiveFertility } from './fields';
import { daysUntilWinterHarvest } from './food';
import { storageLossPerYear } from './productivity';
import { LEGUMES } from './rules';
import type { FieldPart, VillageState } from './types';
import { cropGrossPerHa, cropSeedPerHa } from './year-plan';

// Luštěniny (diet.md a fields.md – Luštěniny; Martin 18. 10. 2026: bílkoviny 1,6 g/kg zůstávají,
// přidají se luštěniny jako plodina na poli). Hrách a čočka jsou jař na dílech osevu,
// sklízejí se v červenci (31. 7. do zásoby luštěnin, jako ozim) a jí se rovným dílem celý rok do
// příští sklizně. Ves jich oseje tolik, aby po obilí, mléku a vejcích pokryla bílkoviny (nejvýš
// strop podílu energie), zbytek dá maso.

const M2_PER_HA = 10_000;

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

/** Očekávaná čistá úroda luštěnin dílu (kg) při plné a včasné práci – odhad při osevu. */
export function expectedLegumeKg(part: FieldPart, day: number): number {
  return (
    (cropGrossPerHa('legume', effectiveFertility(part, day)) - cropSeedPerHa('legume')) *
    (part.areaM2 / M2_PER_HA)
  );
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
