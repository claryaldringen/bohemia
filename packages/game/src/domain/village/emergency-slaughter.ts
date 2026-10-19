import { dateOfDayIndex } from '../calendar';
import { dailyMilk, daysUntilMilking, milkEnergyBetween, villageCheeseKg } from './dairy';
import {
  DIET,
  daysUntilMeatEnd,
  eatDiet,
  meatEnergy,
  villageFoodNeed,
  villageMeatKg,
  villageProteinNeed,
  type DietInput,
  type DietResult,
} from './diet';
import { fieldFoodShare } from './field-food';
import { daysUntilAppleRot } from './food';
import { breedingCows } from './husbandry';
import { daysUntilLegumeHarvest, villageLegumesKg } from './legumes';
import {
  HERD_SPECIES,
  LIVESTOCK,
  SLAUGHTER_MONTH,
  butcher,
  dailyEggsKg,
  villageHerds,
} from './livestock';
import { villageApplesKg } from './orchard';
import { EMERGENCY_SLAUGHTER } from './rules';
import type { ChronicleEvent, HerdSpecies, VillageState } from './types';
import { woolSheep } from './wool';
import { daysUntilFoodHarvest } from './year-plan';

// Nouzová porážka (diet.md – Nouzová porážka; Martin 19. 10. 2026: „Ano, udělej to všechno“,
// podrobnosti návrh Clauda). Ves, které výhled jídla do sklizně nevychází, nejdřív porazí
// zvířata navíc a teprve potom, když maso nestačí, ubírá z přídělu. Prasata první (žerou les,
// ne seno), pak kozy, krávy nad chovné (mléko a voly) a ovce nad ovce na vlnu; chovný pár každého
// druhu zůstává, spřežení a telata ve výcviku jsou v ohradách mimo stáda. Maso jde do zásoby jako
// z podzimní porážky (stejná výtěžnost, uzení, zkažení 1. 9.) a jí se rovným dílem do zkažení
// – nejvýš strop masa ve stravě (DIET.caps.meat), ten platí i v nouzi. Osev podle stravy ho
// počítá jako jídlo z pole.

/** Méně masa (kg) se jako porážka nebere – chyby desetinných čísel. */
const MIN_KG = 0.5;
/** Tolerance výhledu – plný příděl je od 1 − EPSILON. */
const EPSILON = 1e-9;
/** Přesnost hledání masa (kg). */
const SEARCH_KG = 0.05;
const SEARCH_STEPS = 60;

/**
 * Vstup jídla dne (`eatDiet`) ze stavu na konci předchozího dne – co ves dnes jí a s čím do
 * sklizně počítá: dnešní mléko (podojený podíl `milked`) a vejce, mléko stád do sklizně,
 * ovoce do zkažení (nádoby od hrnčíře – `potteryCoverage`), maso do zkažení, sýr do dojení,
 * luštěniny do sklizně. `herds` – stáda, se kterými se počítá (bez údaje stáda vsi).
 */
export function dayMealInput(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
  herds: Record<HerdSpecies, number> = villageHerds(state),
): DietInput {
  const need = villageFoodNeed(state, day);
  const milk = dailyMilk(herds, day);
  // ozim uživí srpen, když pokryje potřebu z pole, na kterou ves osévala (fields.md – Ozim a jař)
  const daysToHarvest = daysUntilFoodHarvest(
    state.plan,
    state.parts,
    day,
    need * fieldFoodShare(state),
  );
  return {
    grainKg: state.storesKg,
    meatKg: villageMeatKg(state),
    fruitKg: villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: milk.liters * milked,
    milkProteinKg: milk.proteinKg * milked,
    milkEnergy: milk.energy * milked,
    eggsKg: dailyEggsKg(state),
    legumesKg: villageLegumesKg(state),
    daysToLegumeHarvest: daysUntilLegumeHarvest(day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    daysToMilking: daysUntilMilking(day),
    // výhled do sklizně počítá s mlékem stád (fields.md – Osev podle stravy)
    milkAheadEnergy: milkEnergyBetween(
      herds,
      day + 1,
      day + daysToHarvest - 1,
      DIET.caps.dairy * need,
    ),
    daysToHarvest,
    // jablka v nádobách od hrnčíře vydrží déle (crafts.md)
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage,
  };
}

/**
 * Kolik kusů každého druhu smí jít na nouzovou porážku: nad chovný pár, u krav nad krávy na mléko
 * a voly (`breedingCows`), u ovcí nad ovce na vlnu (`woolSheep` – diet.md, Oděv).
 */
export function emergencySpare(state: VillageState, day: number): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const floor: Record<HerdSpecies, number> = {
    pig: LIVESTOCK.breedingMin,
    goat: LIVESTOCK.breedingMin,
    cow: Math.max(LIVESTOCK.breedingMin, breedingCows(state)),
    sheep: Math.max(LIVESTOCK.breedingMin, woolSheep(state, day)),
  };
  const spare = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  for (const species of HERD_SPECIES) spare[species] = Math.max(0, herds[species] - floor[species]);
  return spare;
}

/** Kusy na porážku za `kg` masa – v pořadí EMERGENCY_SLAUGHTER.order, nejvýš `spare`. */
function animalsFor(kg: number, spare: Record<HerdSpecies, number>): Record<HerdSpecies, number> {
  const killed = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  let left = kg;
  for (const species of EMERGENCY_SLAUGHTER.order) {
    if (left <= 0) break;
    const heads = Math.min(spare[species], left / LIVESTOCK.meatKg[species]);
    killed[species] = heads;
    left -= heads * LIVESTOCK.meatKg[species];
  }
  return killed;
}

/** Výsledek nouzové porážky – kolik masa a kusů (pro test a kroniku). */
export interface EmergencyPlan {
  kg: number;
  animals: Record<HerdSpecies, number>;
}

/**
 * Kolik zvířat ves dnes porazí navíc (bez změny stavu): nic, když výhled jídla do sklizně
 * vychází. Jinak nejméně masa, se kterým výhled vyjde i s rezervou EMERGENCY_SLAUGHTER.reserveShare
 * potřeby do sklizně (ztráty zásob a uzení výhled nezná – bez rezervy by se poráželo den co den po
 * kouscích); když ani všechna zvířata navíc nestačí nebo maso narazí na strop ve stravě, tolik,
 * kolik ještě pomůže – zbytek ves ušetří na přídělu; taková porážka jen, zvedne-li příděl aspoň
 * o EMERGENCY_SLAUGHTER.minGain. Zabitím dojnic ubude i mléka do sklizně, výhled s tím počítá.
 */
export function emergencySlaughterPlan(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
): EmergencyPlan | null {
  if (!state.livestock || state.people.length === 0) return null;
  const today = eatDiet(dayMealInput(state, day, potteryCoverage, milked));
  if (today.outlook >= 1 - EPSILON) return null;
  const spare = emergencySpare(state, day);
  const maxKg = HERD_SPECIES.reduce((sum, s) => sum + spare[s] * LIVESTOCK.meatKg[s], 0);
  if (maxKg < MIN_KG) return null;
  const herds = villageHerds(state);
  const meal = (kg: number, reserve: number): DietResult => {
    const killed = animalsFor(kg, spare);
    const after = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    for (const s of HERD_SPECIES) after[s] = herds[s] - killed[s];
    const input = dayMealInput(state, day, potteryCoverage, milked, after);
    const reserveKg = reserve * input.needPerDay * input.daysToHarvest;
    return eatDiet({
      ...input,
      grainKg: Math.max(0, input.grainKg - reserveKg),
      meatKg: input.meatKg + kg,
    });
  };
  const reserve = EMERGENCY_SLAUGHTER.reserveShare;
  const best = meal(maxKg, reserve).outlook;
  // cíl: plný příděl i s rezervou, nebo co nejvíc, kolik maso pod stropem a zvířata navíc dají
  const target = Math.min(1, best) - EPSILON;
  if (meal(0, reserve).outlook >= target) return null;
  let lo = 0;
  let hi = maxKg;
  for (let i = 0; i < SEARCH_STEPS && hi - lo > SEARCH_KG; i++) {
    const mid = (lo + hi) / 2;
    if (meal(mid, reserve).outlook >= target) hi = mid;
    else lo = mid;
  }
  if (hi < MIN_KG) return null;
  // schodek celý nepokrytý (málo zvířat navíc, strop masa) – porážka jen, když příděl znatelně
  // zvedne (EMERGENCY_SLAUGHTER.minGain); jinak by ves porážela po kusech
  const after = meal(hi, 0).outlook;
  if (after < 1 - EPSILON && after < today.outlook + EMERGENCY_SLAUGHTER.minGain) return null;
  return { kg: hi, animals: animalsFor(hi, spare) };
}

/**
 * Nouzová porážka dne (mutuje stav – diet.md, Nouzová porážka): před jídlem dne, když výhled do
 * sklizně nevychází, porazí zvířata navíc (`emergencySlaughterPlan`). Maso do zásoby a práce
 * porážky a uzení (1 člověkoden na LIVESTOCK.slaughterKgPerManDay kg) jako při podzimní porážce –
 * mimo listopad jako nouzová práce (`slaughterWork.emergency`), nedodělek listopadové porážky
 * propadá. Mláďata ubudou poměrně. Vrátí událost kroniky, nebo null.
 */
export function emergencySlaughter(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
): ChronicleEvent | null {
  const plan = emergencySlaughterPlan(state, day, potteryCoverage, milked);
  const livestock = state.livestock;
  if (!plan || !livestock) return null;
  const animals: Partial<Record<HerdSpecies, number>> = {};
  for (const species of HERD_SPECIES) {
    const killed = plan.animals[species];
    if (killed <= 0) continue;
    const herd = livestock.herds[species];
    const left = Math.max(0, herd - killed);
    livestock.young[species] *= herd > 0 ? left / herd : 0;
    livestock.herds[species] = left;
    animals[species] = Math.round(killed * 100) / 100;
  }
  if (dateOfDayIndex(day).month !== SLAUGHTER_MONTH && !livestock.slaughterWork?.emergency) {
    livestock.slaughterWork = { required: 0, done: 0, emergency: true };
  }
  butcher(state, plan.kg);
  // maso z nouze kryje schodek jídla z pole – osev podle stravy ho počítá jako potřebu z pole
  // (měří se potřeba, ne snědené obilí – fields.md, Osev podle stravy); jinak by nouzová porážka
  // snížila příští osev a přinesla další nouzi. Maso se sní do konce hospodářského roku (1. 9.).
  if (state.fieldFood) state.fieldFood.fieldKg += meatEnergy(plan.kg);
  return { day, kind: 'emergency-slaughter', kg: Math.round(plan.kg), animals };
}
