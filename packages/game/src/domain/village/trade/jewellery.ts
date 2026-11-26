// Kapacita šperkaře (plán 6, issue #13; gold.md – Pravidla 4): šperkař zlato nevyrábí, jen
// zpracovává kov vsi – `VillageState.jewelleryG` je počet gramů, na který výhoda ještě platí.
import { GOLD } from '../rules/rules-gold';
import type { VillageState } from '../types';

/** Zbytek pod touto mezí je jen šum desetinných čísel (jako v `trade.ts`). */
const EPSILON = 1e-9;

/** Kov vsi pro šperkaře (g): celé gramy zlata + mince × `GOLD.coinGrams`. */
export function jewelleryMaterialG(state: Pick<VillageState, 'gold' | 'coins'>): number {
  return Math.floor((state.gold ?? 0) + EPSILON) + Math.floor(state.coins ?? 0) * GOLD.coinGrams;
}

/** Použitelná kapacita výhody (g): min(`jewelleryG`, kov vsi). */
export function jewelleryOf(state: Pick<VillageState, 'gold' | 'coins' | 'jewelleryG'>): number {
  return Math.max(0, Math.min(state.jewelleryG ?? 0, jewelleryMaterialG(state)));
}

/** Ubere kapacitu (mutuje stav); nula pole smaže. */
export function useJewellery(state: VillageState, grams: number): void {
  const next = (state.jewelleryG ?? 0) - grams;
  if (next > EPSILON) state.jewelleryG = next;
  else delete state.jewelleryG;
}

/** Přidá kapacitu (návrat výpravy; mutuje stav), nejvýš do kovu vsi. */
export function addJewellery(state: VillageState, grams: number): void {
  const next = Math.min((state.jewelleryG ?? 0) + grams, jewelleryMaterialG(state));
  if (next > EPSILON) state.jewelleryG = next;
  else delete state.jewelleryG;
}
