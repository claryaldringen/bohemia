// Dvě zásoby uzeného (diet.md – Pořadí jídla, Uzené z porážky 1. 11. rovným dílem; Martin
// 18. 11. 2026 na otázku „Má se uzené z porážky 1. 11. sníst hned, nebo pomaleji, rozložené přes
// zimu a jaro?“: „Uzené rozlož“): `meatKg` je uzené celé, `slaughterMeatKg` jeho část – zásoba
// z porážky 1. 11., která se jí rovným dílem do konce masa; ostatní uzené se jí hned. Součet drží
// `meatKg` – kdo maso ubírá mimo jídlo (oheň, prodej, kořist, odchod), bere `takeVillageMeatKg`.
// Bez dalších importů, ať ho smějí číst i moduly, které diet.ts sám importuje.
import type { VillageState } from '../types';

/**
 * Zásoba uzeného z porážky 1. 11. ve vsi (kg – část zásoby masa, nejvýš celá): jí se rovným dílem
 * do konce masa, zbytek uzeného hned. Ves před převodem 0.
 */
export function villageSlaughterMeatKg(
  state: Pick<VillageState, 'meatKg' | 'slaughterMeatKg'>,
): number {
  return Math.min(Math.max(0, state.slaughterMeatKg ?? 0), Math.max(0, state.meatKg ?? 0));
}

/**
 * Ubere ze zásoby masa vsi `kg` (mutuje – oheň, prodej, kořist, odchod, dvorec nového vojvody):
 * součet zůstane přesný a zásoba z porážky 1. 11. ubude poměrně jako ostatní uzené. Přidává se
 * přímo do `meatKg` (ostatní uzené).
 */
export function takeVillageMeatKg(
  state: Pick<VillageState, 'meatKg' | 'slaughterMeatKg'>,
  kg: number,
): void {
  const total = Math.max(0, state.meatKg ?? 0);
  if (kg <= 0 || total <= 0) return;
  const left = Math.max(0, total - kg);
  if (state.slaughterMeatKg !== undefined) {
    state.slaughterMeatKg = villageSlaughterMeatKg(state) * (left / total);
  }
  state.meatKg = left;
}
