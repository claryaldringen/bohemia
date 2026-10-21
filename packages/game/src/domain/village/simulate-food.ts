// Sklizeň, výmlat a jídlo dne.
import { eatDiet, villageFoodNeed } from './diet';
import { recordFieldFood } from './field-food';
import { harvestFlax } from './flax';
import { dayMealInput, emergencySlaughter } from './emergency-slaughter';
import { drawGrainPits, settleGrainPits } from './grain-pits';
import { addSheaves } from './threshing';
import type { CraftCoverage, VillageState } from './types';
import { harvestKg, taskRemaining } from './year-plan';
import { SATIATION_EPSILON } from './simulate-plan';

/**
 * 31. 7. (po jídle dne): čistá úroda ozimu a luštěnin do snopů – vymlátí se v srpnu na humně
 * (fields.md – Ozim a jař, Luštěniny; production-chains.md – Humno), a trhání lnu – podíl oděvu,
 * na který len je (fields.md – Len).
 */
export function harvestWinter(state: VillageState, day: number): void {
  const linen = harvestFlax(state, day);
  if (linen) state.chronicle.push(linen);
  const legume = state.plan?.legume;
  if (legume && legume.harvestedKg === null) {
    const kg = harvestKg(legume, state.parts, day, 'legume');
    legume.harvestedKg = kg;
    addSheaves(state, 'legume', kg, taskRemaining(legume, 'thresh'));
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'legume' });
  }
  const winter = state.plan?.winter;
  if (!winter || winter.harvestedKg !== null) return;
  const kg = harvestKg(winter, state.parts, day);
  winter.harvestedKg = kg;
  addSheaves(state, 'winter', kg, taskRemaining(winter, 'thresh'));
  state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'winter' });
}

/**
 * 31. 8. (po jídle dne): čistá úroda jaře do snopů – vymlátí se v září na humně (production-chains.md
 * – Humno); plán (i s ozimem) jde k výmlatu.
 */
export function harvest(state: VillageState, day: number): void {
  const plan = state.plan;
  if (plan === null) return;
  const kg = harvestKg(plan, state.parts, day);
  plan.harvestedKg = kg;
  addSheaves(state, 'spring', kg, taskRemaining(plan, 'thresh'));
  // plán jen s ozimem jař nesklízí – žádná sklizeň do kroniky
  if (!plan.winter) state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  else if (plan.partIds.length > 0) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'spring' });
  }
  state.threshingFromPlan = plan;
  state.plan = null;
}

/**
 * 1. 10. (po jídle dne – den po konci okna výmlatu jaře): loňský plán u výmlatu se zahodí. Snopy,
 * které výmlat nestihl, zůstávají ve snopech a mlátí se dál (production-chains.md – Humno; dřív
 * nevymlácená část 1. 3. propadla).
 */
export function endThreshing(state: VillageState): void {
  state.threshingFromPlan = null;
}

/**
 * Krok 8: jídlo dne ze zásob (diet.md) – ovoce přednostně do zkažení, čerstvé mléko (dojí se
 * vždy celé – ženy bokem, population.md – Práce) a vejce, maso do porážky, sýr do dojení a luštěniny do sklizně, obilí dorovná;
 * vrací nasycení (energie × kvalita stravy), energii, jestli se jedlo ovoce, a podíl energie
 * z masa (štěstí) a zapíše začátek a konec hladu. Hlad začíná
 * už tehdy, když příděl energie podle výhledu do sklizně klesne pod plný – i když se dnes jí
 * dosyta ovocem a obilí nevystačí až po 1. 3.
 */
export function eat(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { satiation: number; energy: number; fruit: boolean; meat: number } {
  const milked = 1;
  const need = villageFoodNeed(state, day);
  // co zásoby ubyly dnes (prodej, platby), jde z otevřené obilné jámy (production-chains.md –
  // Obilné jámy) – ztráta zásob v jídle dne podle jam
  drawGrainPits(state);
  // nevychází-li výhled do sklizně, ves napřed porazí zvířata navíc – teprve pak šetří přídělem
  // (diet.md – Nouzová porážka)
  const emergency = emergencySlaughter(state, day, coverage.pottery, milked);
  if (emergency) state.chronicle.push(emergency);
  const meal = eatDiet(dayMealInput(state, day, coverage.pottery, milked));
  state.storesKg = meal.grainKg;
  // jámy po ztrátách a jídle dne – snědené zrno z otevřené jámy, dosloužilé prázdné se zasypou
  settleGrainPits(state, day, coverage.pottery);
  // čerstvé maso dne se snědlo, zbytek je v uzeném (diet.md – Porážka v zimě)
  delete state.freshMeatKg;
  if (state.meatKg !== undefined || meal.meatKg > 0) state.meatKg = meal.meatKg;
  if (state.cheeseKg !== undefined || meal.cheeseKg > 0) state.cheeseKg = meal.cheeseKg;
  if (state.legumesKg !== undefined || meal.legumesKg > 0) state.legumesKg = meal.legumesKg;
  if (state.applesKg !== undefined) state.applesKg = meal.fruitKg;
  state.diet = meal.diet;
  // kolik z dnešní potřeby musí dát pole – podle toho ves k 1. 9. oseje (fields.md – Kolik ves
  // oseje, Osev podle stravy)
  recordFieldFood(state, need, meal.diet);
  // příděl do sklizně podle výhledu, nebo méně, když se dnes snědlo méně energie (zásoby došly
  // a snopy se nestihly vymlátit – production-chains.md, Humno) – ves šetří i hladoví podle toho,
  // co opravdu snědla
  const ration = Math.min(meal.outlook, meal.diet.energy);
  const hungry = ration < 1 - SATIATION_EPSILON;
  // příděl do sklizně, když ves šetří – stupeň upozornění (population.md – Co hráč vidí)
  if (hungry) state.ration = ration;
  else delete state.ration;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  return {
    satiation: meal.diet.satiation,
    energy: meal.diet.energy,
    fruit: meal.diet.shares.fruit > 0,
    meat: meal.diet.shares.meat,
  };
}
