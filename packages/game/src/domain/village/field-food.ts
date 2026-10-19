import { ageGroup } from './people';
import { FIELD_FOOD, FOOD_NEED_KG_PER_YEAR, SOW_RESERVE, STORES_HIGH_YEARS } from './rules';
import type { DietDay, VillageState } from './types';

// Osev podle stravy (fields.md – Kolik ves oseje; Martin 19. 10. 2026: „Zatím udělejme osev podle
// stravy“). Ves nejí jen obilí – maso, mléko a sýr, vejce a ovoce pokryjí velkou část energie
// (diet.md) a obilí s luštěninami jen dorovná zbytek. Kolik toho zbytku za uplynulý hospodářský
// rok (1. 9. – 31. 8.) potřebovala, tolik (podílem dnešní potřeby) oseje na příští rok – nejméně
// podíl FIELD_FOOD.minShare (pojistka – co maso a mléko na stropech nepokryjí). Měří se potřeba, ne
// snědené obilí: když ves hladoví, sní obilí méně, ale pole jí pořád má dát celý zbytek – jinak by
// hlad snížil osev a s ním přinesl další hlad.
// Rezerva jde do obilí: jen obilí dorovná cokoli (luštěniny mají strop), proto ves drží zásoby obilí
// na 1–1,5 roku celé potřeby z pole – výpadek masa nebo mléka (porážka dá méně, stáda uhynou)
// vydrží do další sklizně.
// Hlad, příděl a nasycení dál počítá strava ze skutečné energie (diet.ts); tady je jen plán.

/** Roční potřeba energie vsi (kg obilí) – kolik by snědla, kdyby jedla jen obilí. */
export function yearlyFoodNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/**
 * Podíl potřeby energie, který dnes nepokrylo jídlo mimo pole (maso, mléko a sýr, vejce, ovoce) –
 * ten musí dát obilí a luštěniny (0–1).
 */
export function fieldShareOf(diet: DietDay): number {
  const { meat, dairy, eggs, fruit } = diet.shares;
  return Math.max(0, 1 - (meat + dairy + eggs + fruit));
}

/**
 * Podíl potřeby energie, který ves plánuje z pole: podíl uplynulého hospodářského roku, nejméně
 * FIELD_FOOD.minShare. Bez celého změřeného roku (starší ves, první rok po založení) 1 – jako by
 * jedla jen obilí (dřívější osev).
 */
export function fieldFoodShare(state: Pick<VillageState, 'fieldFood'>): number {
  const share = state.fieldFood?.share;
  return share === undefined ? 1 : Math.min(1, Math.max(FIELD_FOOD.minShare, share));
}

/** Roční potřeba jídla z pole (kg obilí): podíl z pole × roční potřeba energie. */
export function yearlyFieldNeed(
  state: Pick<VillageState, 'people' | 'fieldFood'>,
  day: number,
): number {
  return fieldFoodShare(state) * yearlyFoodNeed(state, day);
}

/**
 * Cíl osevu obilí a luštěnin (kg obilí, luštěniny svou energií – fields.md, Kolik ves oseje):
 * roční potřeba z pole + rezerva obilí SOW_RESERVE z potřeby z pole, dokud zásoby obilí nemají
 * víc než STORES_HIGH_YEARS roční potřeby z pole, + rezerva luštěnin `legumeReserveKg` (energie
 * podle jejich vlastního pravidla – přičte se, aby luštěniny rezervu obilí neubraly). Ves bez
 * změřeného roku seje jako dřív – na celou potřebu energie, rezerva luštěnin se nepřičítá (obilí
 * má i tak dost).
 */
export function sowingTargetKg(
  state: Pick<VillageState, 'people' | 'fieldFood' | 'storesKg'>,
  day: number,
  legumeReserveKg = 0,
): number {
  const need = yearlyFieldNeed(state, day);
  const grain = state.storesKg > STORES_HIGH_YEARS * need ? need : need * (1 + SOW_RESERVE);
  return state.fieldFood?.share === undefined ? grain : grain + legumeReserveKg;
}

/**
 * Jídlo dne do součtů hospodářského roku (mutuje stav): potřeba `needPerDay` (kg obilí) a z ní
 * část, kterou nepokrylo jídlo mimo pole. Součty běží až od prvního 1. 9. (`closeFieldFoodYear`).
 */
export function recordFieldFood(state: VillageState, needPerDay: number, diet: DietDay): void {
  const year = state.fieldFood;
  if (!year || needPerDay <= 0) return;
  year.needKg += needPerDay;
  year.fieldKg += needPerDay * fieldShareOf(diet);
}

/**
 * 1. 9. před plánem osevu (mutuje stav): z celého uplynulého hospodářského roku spočítá podíl
 * jídla z pole a začne nový rok. Ves bez součtů je začne – podíl dostane až za rok (součty tak
 * vždy pokrývají celý rok i se zimou bez mléka a podzimem s ovocem).
 */
export function closeFieldFoodYear(state: VillageState): void {
  const year = state.fieldFood;
  const share = year && year.needKg > 0 ? year.fieldKg / year.needKg : year?.share;
  state.fieldFood = { needKg: 0, fieldKg: 0, ...(share !== undefined ? { share } : {}) };
}
