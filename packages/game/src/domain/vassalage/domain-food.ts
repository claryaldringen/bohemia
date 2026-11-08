import { dateOfDayIndex } from '../calendar';
import { craftCoverage } from '../village/crafts';
import { fieldCapacity, netYieldPerHa } from '../village/field-capacity';
import { yearlyFieldNeed } from '../village/field-food';
import { dogGrainToday } from '../village/hunt-party';
import { horseGrainToday, villageHorses } from '../village/horses';
import { LIVESTOCK } from '../village/livestock';
import { meatEnergy } from '../village/diet';
import { SEED_KG_PER_HA } from '../village/rules-fields';
import { seedStore } from '../village/seed';
import { stewardOutlook } from '../village/steward-outlook';
import { fieldSowingTargets } from '../village/simulate-plan';
import type { CattleGood, VillageState } from '../village/types';
import { seasonCrops } from '../village/year-plan';
import type { MacroGoods } from './macro';
import { DOMAIN_FOOD, VASSALAGE } from './rules-vassalage';
import { cattleSpare } from './spare';

// Jídlo domény – co ves po žních dá a co jí chybí (hillfort.md – Jídlo domény; výpočet návrh
// Clauda). Čisté funkce, vstupní stav nemění. Rozdělení mezi vsi je v `domain-allocation.ts`,
// rozhodnutí a doprava v kroku světa. Dárce má stejnou pojistku jako u dávek vazalů (`villageSpare`
// – `VASSALAGE.reserveYears` ročních potřeb osiva a jídla z pole); podle návrhu Clauda k otázce 1
// plánu jsou osivo, jídlo do žní a doplnění pojistky dohromady tato pojistka.

const DAYS_PER_YEAR = 365;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Rok `Y`, jestli je ves ve dni `day` po výmlatu letošní sklizně, jinak null: plán u výmlatu
 * (`threshingSeason`, od konce žní do 1. 10.) existuje a snopů zbývá nejvýš `sheavesDoneKg`, nebo je
 * den od `readyBy` roku `Y` (výmlat, který nestihla, ves dodělá dál – hillfort.md: nejpozději
 * k 1. 10.). Mimo září a podzim null.
 */
export function domainFoodReadyYear(state: VillageState, day: number): number | null {
  const date = dateOfDayIndex(day);
  const { month, day: dom } = DOMAIN_FOOD.readyBy;
  if (date.month > month || (date.month === month && date.day >= dom)) return date.year;
  if (!state.threshingSeason) return null;
  const sheavesKg = (state.sheaves?.grainKg ?? 0) + (state.sheaves?.legumesKg ?? 0);
  return sheavesKg <= DOMAIN_FOOD.sheavesDoneKg ? date.year : null;
}

/**
 * Osivo obilí minulého osevu (kg): součet osiva plodin, které se seje z obilí, v plánu u výmlatu
 * (i díly nad potřebu); bez něj (po 1. 10.) osev, který ves zvládne – jako ve výhledu přebytku
 * (`spare.ts`: menší z osevu podle půdy a podle práce × `SEED_KG_PER_HA`).
 */
export function lastSowingSeedKg(state: VillageState, day: number): number {
  const plan = state.threshingSeason;
  if (plan) {
    let kg = 0;
    for (const { crop, work } of seasonCrops(plan)) {
      if (seedStore(crop) === 'grain') kg += work.seedKg ?? 0;
    }
    return kg;
  }
  const outlook = stewardOutlook(state, day, craftCoverage(state, day));
  return Math.min(outlook.landHa, outlook.laborHa) * SEED_KG_PER_HA;
}

/**
 * Co ves nabízí (hillfort.md – Jídlo domény, body 1–4): obilí nad `VASSALAGE.reserveYears` ročních
 * potřeb (jídlo z pole + osivo minulého osevu) ze zásob a nevymlácených snopů; dobytek nad chovné
 * jádro (`cattleSpare`). Ves v hladu nedá nic. Napřed obilí, dobytek jen na to, co obilí nepokryje,
 * řeší rozdělení.
 */
export function domainOffer(
  state: VillageState,
  day: number,
): Pick<MacroGoods, 'grainKg' | 'cattle'> {
  if (state.hungry) return { grainKg: 0, cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 } };
  const have = Math.max(0, state.storesKg) + Math.max(0, state.sheaves?.grainKg ?? 0);
  const reserve =
    VASSALAGE.reserveYears * (yearlyFieldNeed(state, day) + lastSowingSeedKg(state, day));
  return {
    grainKg: Math.max(0, Math.floor(have - reserve + EPSILON)),
    cattle: cattleSpare(state, day),
  };
}

/**
 * Kolik jídla vsi chybí do příští sklizně (kg obilí): týž výhled, ze kterého správce kupuje obilí
 * (`fieldSowingTargets(…).shortKg`). Ves bez lidí 0.
 */
export function domainNeedKg(state: VillageState, day: number): number {
  if (state.people.length === 0) return 0;
  return fieldSowingTargets(state, day, craftCoverage(state, day)).shortKg;
}

/**
 * Kolik kg obilí je dobytek za porážku (kus × energie masa krávy – dovezený dobytek se hned porazí
 * a sní, hillfort.md).
 */
export function cattleFoodKg(cattle: Record<CattleGood, number>): number {
  const heads = cattle.cows + cattle.youngOxen + cattle.trainedOxen;
  return heads * meatEnergy(LIVESTOCK.meatKg.cow);
}

/**
 * Přehled pro panel rodu: kolik ves vypěstuje a kolik jí na rok potřebuje obilí z pole. Úroda je
 * průměrná čistá sklizeň po osivu (`fieldCapacity`), potřeba jídlo z pole a obilí koní a psů
 * dvorce. Bez `stewardOutlook` a odhadu růstu lidí – počítá se při každém uložení vsi. Ves bez lidí
 * nebo bez pole null.
 */
export function villageFoodBalance(
  state: VillageState,
  day: number,
): { growsKg: number; needsKg: number } | null {
  if (state.people.length === 0) return null;
  const capacity = fieldCapacity(state, day, craftCoverage(state, day).pottery);
  if (!capacity) return null;
  const horses = villageHorses(state);
  const animalsKg =
    ((horses.length > 0 ? horseGrainToday(horses, day) : 0) + dogGrainToday(state)) * DAYS_PER_YEAR;
  return {
    growsKg: capacity.sownHa * netYieldPerHa(capacity.fertility) * capacity.soil,
    needsKg: yearlyFieldNeed(state, day) + animalsKg,
  };
}
