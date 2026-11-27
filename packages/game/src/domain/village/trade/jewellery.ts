// Kapacita šperkaře (plán 6, issue #13; gold.md – Pravidla 4): šperkař zlato nevyrábí, jen
// zpracovává kov vsi – `VillageState.jewelleryG` je počet gramů, na který výhoda ještě platí.
import { GOLD } from '../rules/rules-gold';
import type { VillageState } from '../types';
import { roundGold } from './market-prices';

/** Zbytek pod touto mezí je jen šum desetinných čísel (jako v `trade.ts`). */
const EPSILON = 1e-9;

/**
 * Kov vsi pro šperkaře (g; gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 6): zlato i se zlomkem pod
 * minci + celé mince × `GOLD.coinGrams` (2,4 g), na setiny.
 */
export function jewelleryMaterialG(state: Pick<VillageState, 'gold' | 'coins'>): number {
  return roundGold((state.gold ?? 0) + Math.floor(state.coins ?? 0) * GOLD.coinGrams);
}

/** Použitelná kapacita výhody (g): min(`jewelleryG`, kov vsi). */
export function jewelleryOf(state: Pick<VillageState, 'gold' | 'coins' | 'jewelleryG'>): number {
  return Math.max(0, Math.min(state.jewelleryG ?? 0, jewelleryMaterialG(state)));
}

/**
 * Kapacita bez šumu plovoucí čárky: co je od setin gramu jen o šum (`EPSILON`), zaokrouhlí `roundGold`
 * (7,2 − 2,4 = 4,800000000000001 je 4,8); zlomek pod setinu z práce šperkaře (`workJeweller`) zůstane.
 */
function withoutNoise(grams: number): number {
  const rounded = roundGold(grams);
  return Math.abs(grams - rounded) < EPSILON ? rounded : grams;
}

/** Ubere kapacitu vsi nebo výpravy na trhu (mutuje) – bez šumu (`withoutNoise`); nula pole smaže. */
export function useJewellery(holder: Pick<VillageState, 'jewelleryG'>, grams: number): void {
  const next = withoutNoise((holder.jewelleryG ?? 0) - grams);
  if (next > EPSILON) holder.jewelleryG = next;
  else delete holder.jewelleryG;
}

/** Přidá kapacitu (návrat výpravy; mutuje stav), nejvýš do kovu vsi – bez šumu (`withoutNoise`). */
export function addJewellery(state: VillageState, grams: number): void {
  const next = Math.min(withoutNoise((state.jewelleryG ?? 0) + grams), jewelleryMaterialG(state));
  if (next > EPSILON) state.jewelleryG = next;
  else delete state.jewelleryG;
}
