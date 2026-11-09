// Sklizeň, výmlat a jídlo dne.
import { eatDiet, villageFoodNeed, type DietInput } from './diet';
import { recordFieldFood } from './field-food';
import { harvestFlax } from './flax';
import { harvestGardens } from './garden';
import type { Landscape } from '../landscape';
import { dayMealInput, emergencySlaughter } from './emergency-slaughter';
import { drawGrainPits, settleGrainPits } from './grain-pits';
import { feedHorseGrain } from './horse-feed';
import { feedDogs } from './manor-dogs';
import { dayPartLosses } from './disasters';
import { addSheaves } from './threshing';
import { villageLegumesKg } from './legumes';
import { threshWorkFactor } from './weather-effects';
import type { CraftCoverage, CropWork, ThreshedCrop, VillageState } from './types';
import {
  harvestKg,
  seasonCrop,
  springCrop,
  taskRemaining,
  threshRemainingAfter,
  type PartLosses,
} from './year-plan';
import { EPSILON, SATIATION_EPSILON } from './simulate-plan';

/**
 * Práce výmlatu sklizené části – v deštivém létě o 20 % víc (vlhké snopy – disasters.md, Léto).
 */
function threshWork(state: VillageState, day: number, work: number): number {
  return work * threshWorkFactor(state, day);
}

/**
 * Žeň plodiny do snopů (mutuje stav i `work` – fields.md, Žně i v srpnu): úroda podle hotové práce
 * žně bez té, která už šla do snopů 31. 7. (`CropWork.sheaved`), s výmlatem jen této části. Když
 * okno žně ještě běží (`final` false – 31. 7.) a žeň není hotová, plodina zůstává na poli: zapíše
 * se `sheaved` a zbytek se žne v srpnu; jinak je sklizená (`harvestedKg` – celá úroda) a nesklizené
 * propadne. Vrací úrodu, která dnes šla do snopů (kg).
 */
function sheaveCrop(
  state: VillageState,
  day: number,
  crop: ThreshedCrop,
  work: CropWork,
  final: boolean,
  losses: PartLosses | undefined,
): number {
  const from = work.sheaved?.harvest ?? 0;
  const kg = harvestKg(
    work,
    state.parts,
    day,
    crop === 'legume' ? 'legume' : 'spring',
    losses,
    from,
  );
  addSheaves(state, crop, kg, threshWork(state, day, threshRemainingAfter(work, from)));
  const total = (work.sheaved?.kg ?? 0) + kg;
  if (final || taskRemaining(work, 'harvest') <= EPSILON) work.harvestedKg = total;
  else work.sheaved = { harvest: work.done.harvest, kg: total };
  return kg;
}

/**
 * Žeň ozimu, luštěnin a lnu (po jídle dne): úroda ozimu a luštěnin do snopů – vymlátí se hned po
 * žni na humně (fields.md – Ozim a jař, Luštěniny; production-chains.md – Humno), a trhání lnu –
 * podíl oděvu, na který len ze zahrádek (`gardenFlaxKg`) a z pole je (fields.md – Len, Zahrádka
 * u obydlí). 31. 7. (`final` false) do snopů, co červenec sklidil (nedosklizená plodina zůstává na
 * poli a žne se v srpnu, len z pole se přičte po dotrhání); 31. 8. (`final`) zbytek žatý v srpnu
 * (fields.md – Žně i v srpnu). Luštěniny a len na poli jen dorůstající ve starších vsích.
 */
function harvestEarlyCrops(
  state: VillageState,
  day: number,
  final: boolean,
  gardenFlaxKg: number | null,
): void {
  const linen = harvestFlax(state, day, final, gardenFlaxKg);
  if (linen) state.chronicle.push(linen);
  // 31. 7. nedosklizená plodina s nulovou úrodou do kroniky nejde (zapíše se 31. 8.)
  const record = (work: CropWork): boolean => final || work.harvestedKg !== null;
  const legume = state.season ? seasonCrop(state.season, 'legume') : undefined;
  if (legume && legume.harvestedKg === null) {
    const losses = dayPartLosses(state, day, 'legume', legume.partIds, undefined);
    const kg = sheaveCrop(state, day, 'legume', legume, final, losses);
    if (record(legume) || Math.round(kg) > 0) {
      state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'legume' });
    }
  }
  const winter = state.season ? seasonCrop(state.season, 'winter') : undefined;
  if (winter && winter.harvestedKg === null) {
    const losses = dayPartLosses(
      state,
      day,
      'winter',
      winter.partIds,
      state.wildlife?.damage?.parts,
    );
    const kg = sheaveCrop(state, day, 'winter', winter, final, losses);
    if (record(winter) || Math.round(kg) > 0) {
      state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'winter' });
    }
  }
}

/**
 * 31. 7. (po jídle dne): sklizeň zahrádek u obydlí (`harvestGardens` – fields.md, Zahrádka
 * u obydlí; `landscape` – úrodnost políček pozemků) a červencová žeň ozimu, luštěnin a lnu
 * (`harvestEarlyCrops`).
 */
export function harvestWinter(
  state: VillageState,
  day: number,
  landscape: Landscape | null = null,
): void {
  harvestEarlyCrops(state, day, false, harvestGardens(state, day, landscape));
}

/**
 * 31. 8. (po jídle dne): úroda jaře do snopů – vymlátí se v září na humně (production-chains.md
 * – Humno) – i se zbytkem ozimu, luštěnin a lnu žatým v srpnu; plán (i s ozimem) jde k výmlatu.
 */
export function harvest(state: VillageState, day: number): void {
  const plan = state.season;
  if (plan === null) return;
  // co červenec nedosklidil – ozim, luštěniny a len žaté v srpnu – napřed (pořadí CROP_ORDER)
  harvestEarlyCrops(state, day, true, null);
  const spring = springCrop(plan);
  const losses = dayPartLosses(state, day, 'spring', spring.partIds, state.wildlife?.damage?.parts);
  spring.harvestedKg = harvestKg(spring, state.parts, day, 'spring', losses);
  addSheaves(
    state,
    'spring',
    spring.harvestedKg,
    threshWork(state, day, taskRemaining(spring, 'thresh')),
  );
  const kg = spring.harvestedKg;
  // plán jen s ozimem jař nesklízí – žádná sklizeň do kroniky
  if (!seasonCrop(plan, 'winter'))
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  else if (kg > 0 || spring.partIds.length > 0) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'spring' });
  }
  state.threshingSeason = plan;
  state.season = null;
}

/**
 * 1. 10. (po jídle dne – den po konci okna výmlatu jaře): loňský plán u výmlatu se zahodí. Snopy,
 * které výmlat nestihl, zůstávají ve snopech a mlátí se dál (production-chains.md – Humno; dřív
 * nevymlácená část 1. 3. propadla).
 */
export function endThreshing(state: VillageState): void {
  state.threshingSeason = null;
}

/** Jedla by ves se vstupem jídla `input` plně – příděl do sklizně i dnešní energie celé? */
function eatsFull(input: DietInput): boolean {
  const meal = eatDiet(input);
  return Math.min(meal.outlook, meal.diet.energy) >= 1 - SATIATION_EPSILON;
}

/**
 * Krok 8: jídlo dne ze zásob (diet.md) – ovoce přednostně do zkažení, čerstvé mléko (dojí se
 * vždy celé – ženy bokem, population.md – Práce) a vejce, maso do porážky, sýr do dojení a luštěniny do sklizně, obilí dorovná;
 * vrací nasycení (energie × kvalita stravy), energii, jestli se jedlo ovoce, a podíl energie
 * z masa (štěstí) a zapíše začátek a konec hladu. Hlad začíná
 * už tehdy, když příděl energie podle výhledu do sklizně klesne pod plný – i když se dnes jí
 * dosyta ovocem a obilí nevystačí až po 1. 3. Po lidech dostanou obilí jezdečtí koně
 * (`feedHorseGrain`).
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
  // vstup jídla dne se spočte jednou pro porážku i jídlo; po porážce celý znovu – porážka mění
  // stáda (mléko), maso i potřebu z pole (výhled do sklizně) a je jen pár dní za rok
  let mealInput = dayMealInput(state, day, coverage.pottery, milked);
  const emergency = emergencySlaughter(state, day, coverage.pottery, milked, mealInput);
  if (emergency) {
    state.chronicle.push(emergency);
    mealInput = dayMealInput(state, day, coverage.pottery, milked);
  }
  // osivo, které ves nejí (fields.md – Úroda, Osivo ze zásob), zůstane v zásobách
  const seedGrain = state.storesKg - mealInput.grainKg;
  const seedLegumes = villageLegumesKg(state) - (mealInput.legumesKg ?? 0);
  const meal = eatDiet(mealInput);
  state.storesKg = meal.grainKg + seedGrain;
  // jámy po ztrátách a jídle dne – snědené zrno z otevřené jámy, dosloužilé prázdné se zasypou
  settleGrainPits(state, day, coverage.pottery);
  // čerstvé maso dne se snědlo, zbytek je v uzeném (diet.md – Porážka v zimě)
  delete state.freshMeatKg;
  if (state.meatKg !== undefined || meal.meatKg > 0) state.meatKg = meal.meatKg;
  if (state.cheeseKg !== undefined || meal.cheeseKg > 0) state.cheeseKg = meal.cheeseKg;
  if (state.legumesKg !== undefined || meal.legumesKg > 0) {
    state.legumesKg = meal.legumesKg + seedLegumes;
  }
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
  // šetří jen kvůli osivu, které nejí – se snědeným osivem by jedla plně (absence.md – Upozornění
  // vsi do kroniky): stejný vstup jídla se zrnem celých zásob, jen v den, kdy ves šetří
  if (
    hungry &&
    seedGrain > EPSILON &&
    eatsFull({ ...mealInput, grainKg: mealInput.grainKg + seedGrain })
  ) {
    state.seedRation = true;
  } else delete state.seedRation;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  // obilí koní po lidech – jen co lidem do sklizně zbude navíc (horses.md – Krmení)
  feedHorseGrain(state, day, meal.grainSpareKg, mealInput.daysToHarvest);
  // a psi dvorce po koních (wildlife.md – Psi)
  feedDogs(state, day, meal.grainSpareKg, mealInput.daysToHarvest);
  return {
    satiation: meal.diet.satiation,
    energy: meal.diet.energy,
    fruit: meal.diet.shares.fruit > 0,
    meat: meal.diet.shares.meat,
  };
}
