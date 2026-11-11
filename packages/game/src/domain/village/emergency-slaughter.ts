import { dateOfDayIndex } from '../calendar';
import { dailyMilk, dairyDams, milkEnergyBetween } from './dairy';
import { DIET, eatDiet, meatEnergy, type DietInput, type DietResult } from './diet';
import { breedingCows } from './husbandry';
import {
  HERD_SPECIES,
  LIVESTOCK,
  butcher,
  noteSlaughtered,
  isSlaughterSeason,
  pigForestHa,
  villageDams,
  villageHerds,
} from './livestock';
import { EMERGENCY_SLAUGHTER } from './rules';
import { baseMealInput } from './meal-input';
import { uneatenSeedKg } from './seed';
import type { ChronicleEvent, HerdSpecies, VillageState } from './types';
import { woolSheep } from './wool';

// Nouzová porážka (diet.md – Nouzová porážka; Martin 19. 10. 2026: „Ano, udělej to všechno“,
// podrobnosti návrh Clauda). Ves, které výhled jídla do sklizně nevychází, nejdřív porazí
// zvířata navíc a teprve potom, když maso nestačí, ubírá z přídělu. Prasata první (žerou les,
// ne seno) nad chovné prasnice (polovina toho, kolik prasat uživí les – Martin 19. 10. 2026), pak
// kozy, ovce nad ovce na vlnu a krávy nad chovné (mléko a voly – přednost stád, oxen.md); chovný
// pár každého druhu zůstává,
// spřežení a telata ve výcviku jsou v ohradách mimo stáda. Letošní mláďata ne – kromě selat od 1. 9.
// (Martin 19. 10. 2026: „Ano ke všem návrhům“ – maso se 1. 9. kazí a do podzimní porážky ves
// hladoví; nad chovnými prasnicemi jsou v září skoro jen selata). Maso jde do zásoby jako z podzimní
// porážky (stejná výtěžnost, uzení, zkažení 1. 9.) a jí se rovným dílem do zkažení – nejvýš strop
// masa ve stravě (DIET.caps.meat), ten platí i v nouzi. Podíl jídla z pole (fields.md – Osev podle
// stravy) ho počítá jako jídlo z pole.

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
 * luštěniny do sklizně. `dams` – dojné samice, se kterými se počítá (bez údaje dojné samice vsi –
 * `villageDams`).
 */
export function dayMealInput(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
  dams: Record<HerdSpecies, number> = villageDams(state),
): DietInput {
  const base = baseMealInput(state, day, potteryCoverage, milked, dams);
  // hromadu osiva okna setí a osivo jen na setí ves nejí – zbytek zásob je jídlo, příděl podle něj
  // (fields.md – Osivo bez cíle osevu)
  return { ...base, grainKg: Math.max(0, base.grainKg - uneatenSeedKg(state)) };
}

/**
 * Vstup jídla dne `input` s jinými dojnými samicemi `dams` – přepočte jen mléko dne a mléko do
 * sklizně; ostatní na samicích nezávisí. Totéž jako `dayMealInput(…, dams)` nad týmž stavem.
 */
function withMealDams(
  input: DietInput,
  dams: Record<HerdSpecies, number>,
  day: number,
  milked: number,
): DietInput {
  const milk = dailyMilk(dams, day);
  return {
    ...input,
    milkL: milk.liters * milked,
    milkProteinKg: milk.proteinKg * milked,
    milkEnergy: milk.energy * milked,
    milkAheadEnergy: milkEnergyBetween(
      dams,
      day + 1,
      day + input.daysToHarvest - 1,
      DIET.caps.dairy * input.needPerDay,
    ),
  };
}

/**
 * Chovné prasnice – kolik prasat nouzová porážka nechá: EMERGENCY_SLAUGHTER.pigForestShare toho,
 * kolik prasat uživí les (tatáž nosnost jako u podzimní porážky – `winterTargets`), aspoň chovný
 * pár. Stádo se z nich na jaře obnoví (diet.md – Nouzová porážka).
 */
export function emergencyPigFloor(state: VillageState): number {
  const forestPigs = pigForestHa(state) / LIVESTOCK.forestHaPerPig;
  return Math.max(LIVESTOCK.breedingMin, EMERGENCY_SLAUGHTER.pigForestShare * forestPigs);
}

/**
 * Smějí dnes na nouzovou porážku letošní selata? Od 1. 9. (EMERGENCY_SLAUGHTER.pigletsFromMonth)
 * do konce roku – po podzimní porážce (1. 11.) letošní mláďata nejsou (diet.md – Nouzová porážka).
 */
export function pigletsSpared(day: number): boolean {
  return dateOfDayIndex(day).month < EMERGENCY_SLAUGHTER.pigletsFromMonth;
}

/** Letošní mláďata druhu, která nouzová porážka dnes chrání (selata od 1. 9. ne). */
function protectedYoung(state: VillageState, species: HerdSpecies, day: number): number {
  if (species === 'pig' && !pigletsSpared(day)) return 0;
  return state.livestock?.young[species] ?? 0;
}

/**
 * Kolik kusů každého druhu smí jít na nouzovou porážku: u prasat nad chovné prasnice
 * (`emergencyPigFloor`), u koz nad chovný pár, u krav nad krávy na mléko a voly
 * (`breedingCows`), u ovcí nad ovce na vlnu (`woolSheep` – diet.md, Oděv). Letošní mláďata (od
 * jara do podzimní porážky) ne – jsou malá a dorůstají v příští stádo; kromě selat od 1. 9.
 * (`pigletsSpared`), ta se do prasat nad chovnými prasnicemi počítají.
 */
export function emergencySpare(state: VillageState, day: number): Record<HerdSpecies, number> {
  const herds = villageHerds(state);
  const floor: Record<HerdSpecies, number> = {
    pig: emergencyPigFloor(state),
    goat: LIVESTOCK.breedingMin,
    cow: Math.max(LIVESTOCK.breedingMin, breedingCows(state)),
    sheep: Math.max(LIVESTOCK.breedingMin, woolSheep(state, day)),
  };
  const spare = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  for (const species of HERD_SPECIES) {
    spare[species] = Math.max(
      0,
      herds[species] - protectedYoung(state, species, day) - floor[species],
    );
  }
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
  todayInput?: DietInput,
): EmergencyPlan | null {
  if (!state.livestock || state.people.length === 0) return null;
  // vstup jídla dne bez porážky – jídlo dne ho předá, ať se nepočítá dvakrát
  const base = todayInput ?? dayMealInput(state, day, potteryCoverage, milked);
  const today = eatDiet(base);
  if (today.outlook >= 1 - EPSILON) return null;
  const spare = emergencySpare(state, day);
  const maxKg = HERD_SPECIES.reduce((sum, s) => sum + spare[s] * LIVESTOCK.meatKg[s], 0);
  if (maxKg < MIN_KG) return null;
  const herds = villageHerds(state);
  const young = state.livestock.young;
  const meal = (kg: number, reserve: number): DietResult => {
    const killed = animalsFor(kg, spare);
    const after = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    const youngAfter = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    for (const s of HERD_SPECIES) {
      after[s] = herds[s] - killed[s];
      youngAfter[s] = herds[s] > 0 ? (young[s] * after[s]) / herds[s] : 0;
    }
    // zabitím dojnic ubude mléka – mláďata ubudou poměrně jako při porážce
    const input = withMealDams(base, dairyDams(after, youngAfter), day, milked);
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
 * propadá. Mláďata ubudou poměrně, jen selata (od 1. 9.) jdou napřed. Vrátí událost kroniky, nebo null.
 * `todayInput` – vstup jídla dne ze stavu před porážkou (`dayMealInput`), bez údaje se spočte.
 */
export function emergencySlaughter(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
  todayInput?: DietInput,
): ChronicleEvent | null {
  const plan = emergencySlaughterPlan(state, day, potteryCoverage, milked, todayInput);
  const livestock = state.livestock;
  if (!plan || !livestock) return null;
  const animals: Partial<Record<HerdSpecies, number>> = {};
  for (const species of HERD_SPECIES) {
    const killed = plan.animals[species];
    if (killed <= 0) continue;
    const herd = livestock.herds[species];
    const left = Math.max(0, herd - killed);
    if (species === 'pig' && !pigletsSpared(day)) {
      // selata první (Martin 31. 10. 2026) – od 1. 9. jdou napřed letošní selata, teprve zbytek
      // porážky ubere dospělým prasatům
      livestock.young.pig = Math.max(0, livestock.young.pig - killed);
    } else {
      livestock.young[species] *= herd > 0 ? left / herd : 0;
    }
    // kusy čekající na zimní porážku jdou první (diet.md – Porážka v zimě)
    if (livestock.culling) {
      livestock.culling[species] = Math.max(0, livestock.culling[species] - killed);
    }
    livestock.herds[species] = left;
    animals[species] = Math.round(killed * 100) / 100;
    noteSlaughtered(state, day, species, herd - left);
  }
  if (!isSlaughterSeason(day) && !livestock.slaughterWork?.emergency) {
    livestock.slaughterWork = { required: 0, done: 0, emergency: true };
  }
  butcher(state, plan.kg);
  // maso z nouze kryje schodek jídla z pole – podíl jídla z pole ho počítá jako potřebu z pole
  // (měří se potřeba, ne snědené obilí – fields.md, Osev podle stravy); jinak by nouzová porážka
  // snížila potřebu z pole ve výhledu zásob k sklizni. Maso se sní do konce hospodářského roku (1. 9.).
  if (state.fieldFood) state.fieldFood.fieldKg += meatEnergy(plan.kg);
  return { day, kind: 'emergency-slaughter', kg: Math.round(plan.kg), animals };
}
