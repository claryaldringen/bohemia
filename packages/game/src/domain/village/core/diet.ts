import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../../calendar';
import { fieldFoodShare } from '../fields/field-food';
import { applesSpoiled, daysUntilAppleRot } from './food';
import { grainKeepInput } from '../fields/grain-pits';
import { villageApplesKg } from '../buildings/orchard';
import {
  DAIRY,
  cheeseFromMilk,
  dairyDams,
  daysUntilMilking,
  milkEnergyBetween,
  villageCheeseKg,
  type MilkYield,
} from '../livestock/dairy';
import {
  daysUntilLegumeHarvest,
  legumeEnergy,
  legumeStorageLossPerYear,
  villageLegumesKg,
} from '../fields/legumes';
import { ageGroup, foodNeedPerDay, guestFoodNeedPerDay } from '../people/people';
import { NO_CRAFTS, storageLossPerYear } from './productivity';
import { APPLE_FOOD_VALUE, LEGUMES } from '../rules';
import { HONEY } from '../rules/rules-wares';
import type { ChronicleEvent, DietDay, Person, VillageState } from '../types';
import { sheavesOutlook } from '../fields/threshing';
import { daysUntilFoodHarvest } from './year-plan';
import { winterEstimateLosses } from '../disasters/disasters';

// Strava – obilí, luštěniny, maso, mléko a sýr, vejce, ovoce (diet.md). Energie (v obilních
// ekvivalentech) a bílkoviny proti potřebě: nasycení = pokrytí energie × kvalita stravy
// z bílkovin a ovoce (Martin 18. 10. 2026: maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné
// váhy; luštěniny jako plodina na poli). Ovoce se jí přednostně, dokud nezkazí (rovným dílem do
// 1. 3.), čerstvé mléko a vejce, jak přibývají (přebytek mléka na sýr), maso rovným dílem do
// zkažení (31. 8. – uzené z podzimní porážky se šetřilo na žně; maso ze září a října do
// porážky), sýr do příštího dojení, luštěniny do příští sklizně a med z klátů pevným přídělem
// (hides-honey.md – Klát u obydlí), když jídla dost není, celá zásoba jako obilí (Med v hladu);
// obilí dorovná energii.
// Ovoce smí pokrýt nejvýš čtvrtinu potřeby energie, maso 40 %, mléko a sýr 30 %, luštěniny
// LEGUMES.energyCap.
// Hladem se umírá jen z nedostatku energie (population.md – Hlad a vymření), bílkoviny a ovoce
// řídí porody a štěstí.

/**
 * diet.md – Pravidla: stropy ovoce 25 %, masa 40 %, mléka a sýra 30 % potřeby energie, luštěnin
 * LEGUMES.energyCap; energie v kg obilí na kg (maso ≈ 2 000, vejce ≈ 1 430 kcal/kg proti obilí
 * 3 400; mléko a sýr – dairy.ts; ovoce APPLE_FOOD_VALUE; luštěniny LEGUMES.energy); kvalita stravy
 * 0,60 + 0,34 × pokrytí bílkovin + 0,06 × pokrytí ovoce (nejvýš 1 – samo obilí ≈ 0,8); ovoce plně
 * při 5 % energie; ovoce přidá štěstí +5; maso štěstí až +3 – plně od 20 % energie z masa, méně
 * poměrně (Martin 18. 10. 2026: „maso bude mírně zvyšovat štěstí“, čísla návrh Clauda); zásoba
 * masa se uzí a suší – ztratí 20 % ročně (návrh Clauda, Martin) – a 1. 9. se zbytek zkazí
 * (MEAT_SPOIL_DAY).
 */
export const DIET = {
  caps: { meat: 0.4, fruit: 0.25, dairy: 0.3, legumes: LEGUMES.energyCap },
  meatEnergy: 0.6,
  energy: { eggs: 0.42 },
  quality: { base: 0.6, protein: 0.34, fruit: 0.06 },
  fruitShare: 0.05,
  fruitHappiness: 5,
  meatHappiness: { max: 3, fullShare: 0.2 },
  meatLossPerYear: 0.2,
} as const;

/**
 * diet.md – Bílkoviny (Martin: 1,6 g na kg tělesné váhy denně; tělesná váha a obsah bílkovin podle
 * rešerše 2026-10-18-dairy-protein.md): průměrná tělesná váha skupin (kg), bílkoviny v kg na kg
 * potraviny (obilí směs, uzené maso, sýr, vejce).
 */
export const PROTEIN = {
  gPerKgBody: 1.6,
  bodyKg: { child: 20, adult: 60, elder: 58 },
  perKg: {
    grain: 0.1,
    meat: 0.17,
    cheese: DAIRY.cheeseProtein,
    eggs: 0.125,
    legumes: LEGUMES.protein,
  },
} as const;

/** Porážka (diet.md – listopad): 1. 11. ráno, před jídlem dne. */
export const SLAUGHTER_DAY = { month: 11, day: 1 } as const;
/**
 * diet.md – Trvanlivost masa (Martin 19. 10. 2026: „uzené maso určitě také nevydrží 3 roky“;
 * datum návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md): uzené a sušené maso
 * z podzimní porážky vydrží přes zimu a jaro a šetří se na žně – 1. 9. ráno se zbytek zkazí
 * (v létě žlukne tuk a maso napadá hmyz; soli bylo málo).
 */
const MEAT_SPOIL_DAY = { month: 9, day: 1 } as const;

const COMMON_YEAR_DAYS = 365;
/** Maso se uzí rovnoměrně po dnech – za rok ubude DIET.meatLossPerYear. */
const DAILY_MEAT_KEEP = (1 - DIET.meatLossPerYear) ** (1 / COMMON_YEAR_DAYS);
/** Sýr se suší a zraje – za rok ubude DAIRY.cheeseLossPerYear. */
const DAILY_CHEESE_KEEP = (1 - DAIRY.cheeseLossPerYear) ** (1 / COMMON_YEAR_DAYS);

/** Energie masa v kg obilí. */
export function meatEnergy(kg: number): number {
  return kg * DIET.meatEnergy;
}

/** Energie ovoce (jablek) v kg obilí. */
export function fruitEnergy(kg: number): number {
  return kg * APPLE_FOOD_VALUE;
}

/** Energie medu v kg obilí (HONEY.energyPerKg). */
export function honeyEnergy(kg: number): number {
  return kg * HONEY.energyPerKg;
}

/** Potřeba bílkovin člověka za den (kg) – 1,6 g na kg tělesné váhy jeho skupiny. */
export function proteinNeedPerDay(person: Person, day: number): number {
  return (PROTEIN.bodyKg[ageGroup(person, day)] * PROTEIN.gPerKgBody) / 1000;
}

/** Štěstí z masa (diet.md – Luštěniny, Martin): až +3 podle podílu energie z masa. */
export function meatHappiness(meatShare: number): number {
  const { max, fullShare } = DIET.meatHappiness;
  return max * Math.min(1, Math.max(0, meatShare) / fullShare);
}

/** Kvalita stravy 0,6–1 z pokrytí bílkovin a ovoce (0–1, ořízne se). */
export function dietQuality(proteinCoverage: number, fruitCoverage: number): number {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const { base, protein, fruit } = DIET.quality;
  return Math.min(1, base + protein * clamp(proteinCoverage) + fruit * clamp(fruitCoverage));
}

/**
 * Co se dnes snědlo (kg; mléko v litrech, `milkProteinKg` a `milkEnergy` = bílkoviny a energie
 * vypitého mléka – podle druhů).
 */
export interface Eaten {
  grainKg: number;
  /** Maso celkem (kg) – uzené i čerstvé. */
  meatKg: number;
  /** Z toho čerstvé maso ze zimní porážky (kg – diet.md, Porážka v zimě); chybí = žádné. */
  freshMeatKg?: number;
  fruitKg: number;
  milkL: number;
  milkProteinKg: number;
  milkEnergy: number;
  cheeseKg: number;
  eggsKg: number;
  legumesKg: number;
  /** Med z klátů (kg) – jen energie, bez bílkovin a bez vlivu na kvalitu stravy. */
  honeyKg: number;
}

const NOTHING: Eaten = {
  grainKg: 0,
  meatKg: 0,
  fruitKg: 0,
  milkL: 0,
  milkProteinKg: 0,
  milkEnergy: 0,
  cheeseKg: 0,
  eggsKg: 0,
  legumesKg: 0,
  honeyKg: 0,
};

/**
 * Jídlo dne z toho, co se snědlo, proti potřebě energie (kg obilí za den) a bílkovin (kg za den):
 * energie, bílkoviny, kvalita stravy, nasycení a podíly zdrojů na energii. Bez potřeby (nikdo
 * nejí) plné nasycení.
 */
export function dietOf(needPerDay: number, proteinNeedKg: number, eaten: Eaten): DietDay {
  if (needPerDay <= 0) {
    return {
      energy: 1,
      protein: 1,
      diversity: 1,
      satiation: 1,
      shares: { grain: 0, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0 },
    };
  }
  const fresh = eaten.freshMeatKg ?? 0;
  // med jen když se jedl – vsi bez medu podíl nepřibude (převod `withoutForeignGoods`)
  const honey = honeyEnergy(eaten.honeyKg) / needPerDay;
  const shares = {
    grain: eaten.grainKg / needPerDay,
    meat: meatEnergy(eaten.meatKg) / needPerDay,
    ...(fresh > 0 ? { freshMeat: meatEnergy(fresh) / needPerDay } : {}),
    dairy: (eaten.milkEnergy + eaten.cheeseKg * DAIRY.cheeseEnergy) / needPerDay,
    eggs: (eaten.eggsKg * DIET.energy.eggs) / needPerDay,
    fruit: fruitEnergy(eaten.fruitKg) / needPerDay,
    legumes: legumeEnergy(eaten.legumesKg) / needPerDay,
    ...(honey > 0 ? { honey } : {}),
  };
  const energy = Math.min(
    1,
    shares.grain + shares.meat + shares.dairy + shares.eggs + shares.fruit + shares.legumes + honey,
  );
  const proteinKg =
    eaten.grainKg * PROTEIN.perKg.grain +
    eaten.meatKg * PROTEIN.perKg.meat +
    eaten.cheeseKg * PROTEIN.perKg.cheese +
    eaten.eggsKg * PROTEIN.perKg.eggs +
    eaten.legumesKg * PROTEIN.perKg.legumes +
    eaten.milkProteinKg;
  const protein = proteinNeedKg > 0 ? Math.min(1, proteinKg / proteinNeedKg) : 1;
  const diversity = dietQuality(protein, shares.fruit / DIET.fruitShare);
  return { energy, protein, diversity, satiation: energy * diversity, shares };
}

/** Vstup jídla dne – zásoby na konci včerejška, dnešní mléko a vejce, potřeba a výhled. */
export interface DietInput {
  grainKg: number;
  /**
   * Denní podíl zásob obilí, který zbude po ztrátách skladováním (production-chains.md – Obilné
   * jámy – `grainStoresKeep`: zapečetěné jámy ztrácí méně); bez údaje podle nádob jako dřív.
   */
  grainKeepPerDay?: number;
  /**
   * Nevymlácené snopy, které ves vymlátí (kg zrna – production-chains.md, Humno; `sheavesOutlook`):
   * výhled do sklizně s nimi počítá, jí se jen vymlácené obilí (`grainKg`). Bez údaje žádné.
   */
  sheavesGrainKg?: number;
  /** Totéž u luštěnin (kg) – příděl luštěnin do sklizně s nimi počítá. Bez údaje žádné. */
  sheavesLegumesKg?: number;
  meatKg: number;
  fruitKg: number;
  /**
   * Čerstvé maso dne ze zimní porážky (kg – diet.md, Porážka v zimě): jí se napřed, uzené
   * (`meatKg`) až do stropu masa; co se nesní, se udí. Bez údaje žádné.
   */
  freshMeatKg?: number;
  /**
   * Čerstvé maso od zítřka do konce zimní porážky (energie v kg obilí, za den nejvýš strop masa –
   * `freshMeatAheadEnergy`) – výhled s ním počítá. Bez údaje žádné.
   */
  freshAheadEnergy?: number;
  /** Zásoba sýra (kg). */
  cheeseKg?: number;
  /** Dnes nadojené mléko (l), jeho bílkoviny (kg) a energie (kg obilí). */
  milkL?: number;
  milkProteinKg?: number;
  milkEnergy?: number;
  /** Dnes snesená vejce (kg) – jí se čerstvá. */
  eggsKg?: number;
  /** Zásoba luštěnin (kg). */
  legumesKg?: number;
  /** Dní do příští sklizně luštěnin včetně dneška – jí se rovným dílem do ní; bez údaje rok. */
  daysToLegumeHarvest?: number;
  /** Zásoba medu (kg – zboží vsi i s dnešním medem z klátů); bez údaje žádná. */
  honeyKg?: number;
  /**
   * Pevný příděl medu za den (kg – `villageHoneyRationKg`, hides-honey.md – Klát u obydlí): jí se
   * z toho, co je, zbytek zůstane v zásobě – když jídla do sklizně dost není, jí se i zásoba
   * (`eatDiet`, Med v hladu). Bez údaje žádný.
   */
  honeyRationKg?: number;
  /** Potřeba energie vsi za den (kg obilí). */
  needPerDay: number;
  /** Potřeba bílkovin vsi za den (kg); bez údaje bílkoviny pokryté. */
  proteinNeedPerDay?: number;
  /** Dní do sklizně včetně dneška (přídělový systém – `daysUntilFoodHarvest`). */
  daysToHarvest: number;
  /** Dní, kdy ještě jde jíst ovoce, včetně dneška (`daysUntilAppleRot`); 0 = žádné. */
  daysToRot: number;
  /**
   * Dní, kdy se ještě jí maso, včetně dneška (`daysUntilMeatEnd` – do zkažení, v září a říjnu
   * do porážky) – jí se rovným dílem do konce.
   */
  daysToMeatEnd: number;
  /** Dní do příštího začátku dojení – sýr se jí rovným dílem do něj; bez údaje rok. */
  daysToMilking?: number;
  /**
   * Mléko, které stáda dají od zítřka do sklizně (energie v kg obilí, za den nejvýš strop mléka
   * a sýra – `milkEnergyBetween`): výhled pak počítá s ním a s celou zásobou sýra (fields.md –
   * Osev podle stravy). Bez údaje dřívější výhled – mléko jen dnešní, sýr dnešním přídělem.
   */
  milkAheadEnergy?: number;
  /** Pokrytí nádobami 0–1 – ztráty zásob obilí (crafts.md). */
  potteryCoverage: number;
}

/** Výsledek jídla dne – zásoby po jídle, jídlo dne a výhled energie do sklizně. */
export interface DietResult {
  grainKg: number;
  meatKg: number;
  fruitKg: number;
  /** Zásoba sýra po jídle – i se sýrem z dnešního přebytku mléka. */
  cheeseKg: number;
  /** Kolik sýra dnes přibylo z mléka, které se nevypilo (kg). */
  cheeseMadeKg: number;
  /** Zásoba luštěnin po jídle (kg). */
  legumesKg: number;
  /** Zásoba medu po jídle (kg) – nekazí se. */
  honeyKg: number;
  diet: DietDay;
  /**
   * Nejnižší příděl energie do sklizně podle výhledu 0–1 (dnešní, nebo po zkažení ovoce, je-li
   * menší). Pod 1 ves hladoví.
   */
  outlook: number;
  /**
   * Obilí, které po dnešním jídle zbude navíc do sklizně (kg, i se snopy; po ztrátách skladováním do
   * žní, jí-li se rovným dílem) – lidé jedí napřed, z něj dostanou obilí koně (horses.md – Krmení);
   * 0, když ves šetří.
   */
  grainSpareKg: number;
}

/** Denní podíl zásob obilí, který zbude po ztrátách skladováním (jako v `eatDiet`). */
export function grainKeepPerDay(
  input: Pick<DietInput, 'grainKeepPerDay' | 'potteryCoverage'>,
): number {
  return input.grainKeepPerDay ?? (1 - storageLossPerYear(input.potteryCoverage)) ** (1 / 365);
}

/**
 * Podíl dnešního obilí (po dnešní ztrátě), který se sní, když se jí rovným dílem `count` dní od
 * dne `from` (0 = dnes) a zbytek do té doby dál ztrácí skladováním (`keep` – `grainKeepPerDay`):
 * kilo snědené za j dní potřebuje dnes keep^−j kg, podíl je tedy count ÷ Σ keep^−j. Výhled do
 * sklizně tak počítá se ztrátami do žní stejným pravidlem, jakým vzniknou (fields.md – Přídělový systém; Martin
 * 15. 11. 2026) – příděl je od začátku přesný a nekloní se.
 */
function grainEatenShare(keep: number, from: number, count: number): number {
  if (keep >= 1 || count <= 0) return 1;
  const grow = 1 / keep;
  // Σ grow^j pro j = from … from + count − 1 = grow^from × (grow^count − 1) ÷ (grow − 1)
  return (count * (grow - 1)) / (grow ** from * (grow ** count - 1));
}

/** Zásoby dne po ztrátách a příděly jídla mimo obilí (energie v kg obilí) – část `eatDiet`. */
interface DietPlan {
  meat: number;
  fresh: number;
  fruit: number;
  cheese: number;
  milkProtein: number;
  eggs: number;
  legumes: number;
  need: number;
  days: number;
  rotDays: number;
  meatDays: number;
  daysAhead: number;
  fruitRation: number;
  milkEnergy: number;
  drunkShare: number;
  milkDrunk: number;
  eggsEnergy: number;
  freshRation: number;
  smokedRation: number;
  meatRation: number;
  meatUntilHarvest: number;
  cheeseRation: number;
  legumeRation: number;
  /** Zásoba medu a kolik se ho dnes sní pevným přídělem (kg). */
  honey: number;
  honeyEaten: number;
  /** Dnešní příděl medu (energie), na kolik dní zásoba vydrží a med do sklizně. */
  honeyRation: number;
  honeyDays: number;
  honeyUntilHarvest: number;
  /** Energie celé zásoby medu – jídlo jako obilí, když jídla do sklizně není dost. */
  honeyAll: number;
  /** Sýr, luštěniny a vejce za den – počítají se i do dalších dní. */
  daily: number;
  /** Dnešní jídlo mimo obilí a med. */
  todayOther: number;
  /** Dnešní jídlo mimo obilí (i med pevným přídělem). */
  today: number;
  /** Sýr z dnešního mléka, které se nevypije (kg). */
  made: number;
  /** Mléko a sýr od zítřka do sklizně navíc proti dnešnímu přídělu sýra. */
  extraDairy: number;
}

/** Příděly jídla mimo obilí (`eatDiet`) – na zásobě obilí nezávisí. */
function dietPlan(input: DietInput): DietPlan {
  const meat = Math.max(0, input.meatKg) * DAILY_MEAT_KEEP;
  const fresh = Math.max(0, input.freshMeatKg ?? 0);
  const freshAhead = Math.max(0, input.freshAheadEnergy ?? 0);
  const fruit = Math.max(0, input.fruitKg);
  const cheese = Math.max(0, input.cheeseKg ?? 0) * DAILY_CHEESE_KEEP;
  const milkL = Math.max(0, input.milkL ?? 0);
  const milkProtein = Math.max(0, input.milkProteinKg ?? 0);
  const milkTotalEnergy = Math.max(0, input.milkEnergy ?? 0);
  const eggs = Math.max(0, input.eggsKg ?? 0);
  const legumes =
    Math.max(0, input.legumesKg ?? 0) *
    (1 - legumeStorageLossPerYear(input.potteryCoverage)) ** (1 / COMMON_YEAR_DAYS);
  const legumesAhead = legumes + Math.max(0, input.sheavesLegumesKg ?? 0);
  const need = input.needPerDay;
  const days = Math.max(1, input.daysToHarvest);
  const rotDays = Math.min(Math.max(0, input.daysToRot), days);
  // příděly (energie za den): ovoce do zkažení, čerstvé mléko a vejce, maso do porážky, sýr do
  // příštího dojení – rovným dílem, nejvýš strop
  const fruitRation =
    rotDays > 0 ? Math.min(DIET.caps.fruit * need, fruitEnergy(fruit) / rotDays) : 0;
  const milkEnergy = Math.min(DIET.caps.dairy * need, milkTotalEnergy);
  // vypitý podíl mléka – zbytek na sýr
  const drunkShare = milkTotalEnergy > 0 ? milkEnergy / milkTotalEnergy : 0;
  const milkDrunk = milkL * drunkShare;
  const eggsEnergy = eggs * DIET.energy.eggs;
  const meatDays = Math.max(1, input.daysToMeatEnd);
  // čerstvé maso ze zimní porážky napřed, uzené do stropu – rovným dílem do zkažení (diet.md –
  // Porážka v zimě); uzené, které dnes nepřijde na řadu, počká
  const freshRation = Math.min(DIET.caps.meat * need, meatEnergy(fresh));
  const smokedEven = Math.min(DIET.caps.meat * need, meatEnergy(meat) / meatDays);
  const smokedRation = Math.min(DIET.caps.meat * need - freshRation, smokedEven);
  const meatRation = freshRation + smokedRation;
  // maso jen do zkažení – do sklizně počítá jen dny, kdy ještě bude; čerstvé do konce zimní
  // porážky, vše nejvýš strop masa
  const smokedUntilHarvest = smokedEven * Math.min(days, meatDays);
  const meatUntilHarvest =
    fresh > 0 || freshAhead > 0
      ? Math.min(DIET.caps.meat * need * days, freshRation + freshAhead + smokedUntilHarvest)
      : smokedUntilHarvest;
  const cheeseRation = Math.min(
    Math.max(0, DIET.caps.dairy * need - milkEnergy),
    (cheese * DAIRY.cheeseEnergy) / Math.max(1, input.daysToMilking ?? COMMON_YEAR_DAYS),
  );
  const legumeRation = Math.min(
    DIET.caps.legumes * need,
    legumeEnergy(legumesAhead) / Math.max(1, input.daysToLegumeHarvest ?? COMMON_YEAR_DAYS),
    legumeEnergy(legumes),
  );
  // med pevným přídělem z toho, co je – bez stropu (hides-honey.md – Klát u obydlí); do sklizně
  // jen, dokud zásoba vydrží (jako maso do zkažení) – med, který klády dají do žní, výhled nezná.
  // Když jídla do sklizně není dost, je celá zásoba jídlo jako obilí (`honeyAll` – `eatDiet`)
  const honey = Math.max(0, input.honeyKg ?? 0);
  const honeyEaten = Math.min(honey, Math.max(0, input.honeyRationKg ?? 0));
  const honeyRation = honeyEnergy(honeyEaten);
  const honeyDays = honeyEaten > 0 ? honey / honeyEaten : 0;
  const honeyUntilHarvest = honeyRation * Math.min(days, honeyDays);
  const honeyAll = honeyEnergy(honey);
  // sýr, luštěniny a vejce se počítají i do dalších dní, maso a med do svého konce, mléko a ovoce
  // jen, jak opravdu přijdou
  const daily = cheeseRation + legumeRation + eggsEnergy;
  const todayOther = fruitRation + milkEnergy + meatRation + daily;
  const today = todayOther + honeyRation;
  const made = cheeseFromMilk(milkProtein * (1 - drunkShare));
  // mléko a sýr od zítřka do sklizně: s mlékem stád se počítá celá zásoba sýra (i dnešní), nejvýš
  // strop; bez mléka stád sýr dnešním přídělem (dřívější výhled) – `extraDairy` je rozdíl proti němu
  const daysAhead = days - 1;
  const extraDairy =
    input.milkAheadEnergy === undefined
      ? 0
      : Math.min(
          DIET.caps.dairy * need * daysAhead,
          (cheese - cheeseRation / DAIRY.cheeseEnergy + made) * DAIRY.cheeseEnergy +
            Math.max(0, input.milkAheadEnergy),
        ) -
        cheeseRation * daysAhead;
  return {
    meat,
    fresh,
    fruit,
    cheese,
    milkProtein,
    eggs,
    legumes,
    need,
    days,
    rotDays,
    meatDays,
    daysAhead,
    fruitRation,
    milkEnergy,
    drunkShare,
    milkDrunk,
    eggsEnergy,
    freshRation,
    smokedRation,
    meatRation,
    meatUntilHarvest,
    cheeseRation,
    legumeRation,
    honey,
    honeyEaten,
    honeyRation,
    honeyDays,
    honeyUntilHarvest,
    honeyAll,
    daily,
    todayOther,
    today,
    made,
    extraDairy,
  };
}

/**
 * Nejmenší obilí do sklizně (kg zrna – zásoby po dnešní ztrátě a snopy, které ves vymlátí), se
 * kterým výhled `eatDiet` dá příděl energie aspoň `outlook` (0–1) – s celou ostatní stravou
 * vstupu (ovoce, mléko a sýr, maso i čerstvé ze zimní porážky, vejce, luštěniny a celá zásoba
 * medu – s nejmenším obilím jídla s pevným přídělem dost není a med se jí jako obilí,
 * hides-honey.md – Med v hladu). Obrácený výpočet výhledu: rovný příděl do sklizně, a když ostatní
 * jídlo dnes dá víc než rovný příděl, příděl po zkažení ovoce (fields.md – Osivo ze zásob,
 * přežívací zásoba; návrh Clauda) – i se ztrátami skladováním do žní jako v `eatDiet`
 * (`grainEatenShare`).
 */
export function grainAheadForOutlookKg(input: DietInput, outlook: number): number {
  const target = Math.min(1, outlook);
  if (input.needPerDay <= 0 || target <= 0) return 0;
  const plan = dietPlan(input);
  const { need, days, rotDays, daysAhead, todayOther, daily, meatRation, meatDays } = plan;
  const { honeyAll } = plan;
  const keep = grainKeepPerDay(input);
  const evenShare = grainEatenShare(keep, 0, days);
  const other =
    plan.fruitRation * rotDays +
    plan.milkEnergy +
    plan.meatUntilHarvest +
    daily * days +
    plan.extraDairy +
    honeyAll;
  // rovný příděl do sklizně – ostatní jídlo dnes nedá víc než cílový příděl
  if (target * need >= todayOther) return Math.max(0, target * need * days - other) / evenShare;
  // jinak se do zkažení ovoce jí jen ostatní jídlo (dnes víc než cíl) a obilí drží příděl po
  // něm; dosáhne-li rovný příděl dnešního jídla dřív, stačí to
  const after = days - rotDays;
  const laterDairy = daysAhead > 0 ? (plan.extraDairy * after) / daysAhead : 0;
  const meatAfter = meatRation * Math.max(0, Math.min(days, meatDays) - rotDays);
  const later =
    after > 0
      ? (target * need * after - daily * after - laterDairy - meatAfter - honeyAll) /
        grainEatenShare(keep, rotDays, after)
      : 0;
  return Math.max(0, Math.min(later, (todayOther * days - other) / evenShare));
}

/**
 * Jeden den jídla (diet.md): ztráta zásob (obilí podle nádob, maso uzením, sýr sušením), pak
 * příděl. Ovoce rovným dílem do zkažení, čerstvé mléko (co se nevypije do stropu mléka a sýra,
 * zpracuje se na sýr) a vejce, maso rovným dílem do zkažení a sýr do příštího dojení, vše nejvýš
 * do svých stropů; med pevným přídělem z toho, co je (nekazí se); obilí dorovná potřebu energie.
 * Vystačí-li obilí do sklizně (s tím, co ještě přijde na řadu), jí se dosyta; jinak je celá zásoba
 * medu jídlo jako obilí a jí se s ním – kolik je do sklizně potřeba, nejvýš celá (hides-honey.md –
 * Med v hladu) – a nestačí-li ani to, energie se dělí rovně do sklizně – a když by ani tak obilí
 * a med do zkažení ovoce nebyly potřeba, jí se do té doby jen ostatní a obilí s medem zůstanou na
 * dobu po něm. Obilí do sklizně (i snopy) se počítá po ztrátách skladováním do dne, kdy se sní
 * (`grainEatenShare`), med celý.
 */
export function eatDiet(input: DietInput): DietResult {
  const keep = grainKeepPerDay(input);
  const grain = input.grainKg * keep;
  const plan = dietPlan(input);
  const { meat, fresh, fruit, cheese, milkProtein, eggs, legumes, honey, need } = plan;
  // snopy, které ves vymlátí – výhled do sklizně s nimi počítá, jí se jen vymlácené
  // (production-chains.md – Humno)
  const ahead = grain + Math.max(0, input.sheavesGrainKg ?? 0);
  if (need <= 0) {
    // nikdo nejí – mléko na sýr
    const made = cheeseFromMilk(milkProtein);
    return {
      grainKg: grain,
      meatKg: meat + fresh,
      fruitKg: fruit,
      cheeseKg: cheese + made,
      cheeseMadeKg: made,
      legumesKg: legumes,
      honeyKg: honey,
      diet: dietOf(0, 0, NOTHING),
      outlook: 1,
      grainSpareKg: ahead,
    };
  }
  const { days, rotDays, meatDays, daysAhead, fruitRation, milkEnergy, drunkShare, milkDrunk } =
    plan;
  const { freshRation, smokedRation, meatRation, meatUntilHarvest } = plan;
  const { cheeseRation, legumeRation, daily, today, made, extraDairy } = plan;
  const { honeyEaten, honeyUntilHarvest, honeyAll, todayOther } = plan;
  const grainNeed =
    (need - daily) * days -
    meatUntilHarvest -
    fruitRation * rotDays -
    milkEnergy -
    extraDairy -
    honeyUntilHarvest;
  // obilí, které se do sklizně opravdu sní – zbytek zásob mezitím ubude skladováním (rovným dílem
  // od dneška; fields.md – Přídělový systém)
  const aheadEaten = ahead * grainEatenShare(keep, 0, days);
  let outlook = 1;
  let grainToday: number;
  let honeyToday = honeyEaten;
  let grainSpareKg = 0;
  if (aheadEaten >= grainNeed) {
    grainToday = need - today;
    grainSpareKg = aheadEaten - grainNeed;
  } else {
    // jídla do sklizně není dost – celá zásoba medu je jídlo jako obilí (hides-honey.md – Med
    // v hladu; Martin 15. 11. 2026: „Ano – jsou to kalorie jako každé jiné.“): jí se s obilím
    // jedním přídělem (`pool` – energie dne z obilí a medu), med svým podílem na obilí a medu,
    // které se do sklizně snědí – obojí tak vyjde na den sklizně a obilí se sní rovným dílem,
    // jak výhled se ztrátami skladováním počítá (med se nekazí)
    let pool: number;
    let honeyShare: number;
    // med, který obilí do sklizně doplní na plný příděl
    const honeyNeed = grainNeed + honeyUntilHarvest - aheadEaten;
    if (honeyAll >= honeyNeed) {
      // med doplní, co obilí chybí – ves jí dosyta, zbytek medu zůstane
      pool = need - todayOther;
      honeyShare = honeyNeed / (aheadEaten + honeyNeed);
    } else {
      const even =
        (aheadEaten +
          fruitRation * rotDays +
          milkEnergy +
          meatUntilHarvest +
          daily * days +
          extraDairy +
          honeyAll) /
        (need * days);
      honeyShare = honeyAll > 0 ? honeyAll / (aheadEaten + honeyAll) : 0;
      if (even * need >= todayOther) {
        outlook = even;
        pool = even * need - todayOther;
      } else {
        // do zkažení ovoce jen ostatní jídlo, obilí a med zůstanou na dny po něm (obilí do té
        // doby ztrácí)
        pool = 0;
        const now = todayOther / need;
        const after = days - rotDays;
        const laterDairy = daysAhead > 0 ? (extraDairy * after) / daysAhead : 0;
        const meatAfter = meatRation * Math.max(0, Math.min(days, meatDays) - rotDays);
        const aheadLater = ahead * grainEatenShare(keep, rotDays, after);
        const later =
          after > 0
            ? (aheadLater + daily * after + laterDairy + meatAfter + honeyAll) / (need * after)
            : now;
        outlook = Math.min(now, later);
      }
    }
    honeyToday = Math.min(honey, (Math.max(0, pool) * honeyShare) / HONEY.energyPerKg);
    grainToday = pool - honeyEnergy(honeyToday);
  }
  grainToday = Math.max(0, Math.min(grain, grainToday));
  const eaten: Eaten = {
    grainKg: grainToday,
    meatKg: meatRation / DIET.meatEnergy,
    ...(freshRation > 0 ? { freshMeatKg: freshRation / DIET.meatEnergy } : {}),
    fruitKg: fruitRation / APPLE_FOOD_VALUE,
    milkL: milkDrunk,
    milkProteinKg: milkProtein * drunkShare,
    milkEnergy,
    cheeseKg: cheeseRation / DAIRY.cheeseEnergy,
    eggsKg: eggs,
    legumesKg: legumeRation / LEGUMES.energy,
    honeyKg: honeyToday,
  };
  const diet = dietOf(need, input.proteinNeedPerDay ?? 0, eaten);
  return {
    // poslední den před sklizní se snědí celé zásoby – ořez chyb zaokrouhlení pod nulu
    grainKg: Math.max(0, grain - grainToday),
    // co se z čerstvého masa nesnědlo, se udí
    meatKg:
      Math.max(0, meat - smokedRation / DIET.meatEnergy) +
      Math.max(0, fresh - freshRation / DIET.meatEnergy),
    fruitKg: Math.max(0, fruit - eaten.fruitKg),
    cheeseKg: Math.max(0, cheese - eaten.cheeseKg) + made,
    cheeseMadeKg: made,
    legumesKg: Math.max(0, legumes - eaten.legumesKg),
    // med se nekazí – zbytek se hromadí
    honeyKg: Math.max(0, honey - honeyToday),
    diet,
    outlook: Math.min(1, outlook),
    grainSpareKg,
  };
}

/**
 * Dní do příštího výročního dne `target` (měsíc a den po únoru) bez jeho dne: den před ním → 1,
 * on sám → celý rok. Bez dayIndexOf za koncem světa (podzim 1499).
 */
function daysBefore(day: number, target: { month: number; day: number }): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed = month > target.month || (month === target.month && dayOfMonth >= target.day);
  const thisYear = dayIndexOf({ year, ...target });
  const next = passed ? thisYear + COMMON_YEAR_DAYS + (isLeapYear(year + 1) ? 1 : 0) : thisYear;
  return next - day;
}

/**
 * Dní do příští porážky bez jejího dne: 31. 10. → 1, 1. 11. (porážka už proběhla ráno) → celý
 * rok.
 */
export function daysUntilSlaughter(day: number): number {
  return daysBefore(day, SLAUGHTER_DAY);
}

/**
 * Dní, kdy se ještě jí maso, včetně dneška (diet.md – Trvanlivost masa): od porážky do zkažení
 * (31. 8. → 1, 1. 11. → 304), v září a říjnu (maso ze spřežení) do porážky.
 */
export function daysUntilMeatEnd(day: number): number {
  return Math.min(daysBefore(day, MEAT_SPOIL_DAY), daysUntilSlaughter(day));
}

/** Zkazí se v tento den ráno zbytek masa (1. 9.)? */
export function isMeatSpoilDay(day: number): boolean {
  const { month, day: dayOfMonth } = dateOfDayIndex(day);
  return month === MEAT_SPOIL_DAY.month && dayOfMonth === MEAT_SPOIL_DAY.day;
}

/**
 * 1. 9. ráno (mutuje stav – diet.md, Trvanlivost masa): zbytek uzeného masa se zkazil. Vrátí
 * událost kroniky (od kila), nebo null.
 */
export function spoilMeat(state: VillageState, day: number): ChronicleEvent | null {
  const kg = state.meatKg ?? 0;
  if (!isMeatSpoilDay(day) || kg <= 0) return null;
  state.meatKg = 0;
  return kg >= 1 ? { day, kind: 'meat-spoiled', kg: Math.round(kg) } : null;
}

/**
 * Potřeba energie vsi za den (kg obilí): lidé doma (kdo je pryč na čas, jí jinde) a hosté, kteří
 * jedí ze zásob vsi (rozhodnutí 11; vassalage.md – Lidé a robota: „jídlo jim dává pánova ves“).
 */
export function villageFoodNeed(
  state: Pick<VillageState, 'people' | 'guests'>,
  day: number,
): number {
  const home = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  return state.guests === undefined ? home : home + guestFoodNeedPerDay(state, day);
}

/**
 * Pevný příděl medu vsi za den (kg – hides-honey.md, Klát u obydlí): HONEY.kgPerPersonYear za rok
 * na každého, kdo dnes jí ze zásob vsi – lidé doma a hosté jako `villageFoodNeed` (návrh Clauda) –,
 * rovným dílem po dnech roku.
 */
export function villageHoneyRationKg(
  state: Pick<VillageState, 'people' | 'guests'>,
  day: number,
): number {
  let eaters = 0;
  for (const person of state.people) if (foodNeedPerDay(person, day) > 0) eaters++;
  for (const guest of state.guests ?? []) if (guest.untilDay > day) eaters++;
  return (eaters * HONEY.kgPerPersonYear) / COMMON_YEAR_DAYS;
}

/** Potřeba bílkovin vsi za den (kg). */
export function villageProteinNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + proteinNeedPerDay(p, day), 0);
}

/** Zásoba masa vsi (kg) – u vsí bez dobytka 0. */
export function villageMeatKg(state: Pick<VillageState, 'meatKg'>): number {
  return state.meatKg ?? 0;
}

/**
 * Jídlo dne `day` ze stavu na konci předchozího dne – bez změny stavu (stejně jako krok jídla
 * simulace; mléko a vejce dne bez ohledu na práci). 1. 3. ráno ovoce shnije, v nádobách později
 * (`potteryCoverage` – crafts.md), 1. 9. ráno maso.
 */
export function villageMeal(
  state: VillageState,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
  fresh: {
    milk: MilkYield;
    eggsKg: number;
    /** Čerstvé maso dne a od zítřka ze zimní porážky (diet.md – Porážka v zimě). */
    meatKg?: number;
    meatAheadEnergy?: number;
  } = {
    milk: { liters: 0, proteinKg: 0, energy: 0 },
    eggsKg: 0,
  },
): DietResult {
  const need = villageFoodNeed(state, day);
  // jako simulace – ozim uživí srpen, když pokryje potřebu z pole (fields.md – Ozim a jař)
  const daysToHarvest = daysUntilFoodHarvest(
    state.season,
    state.parts,
    day,
    need * fieldFoodShare(state),
    // škoda zvěře a počasí, které už je vidět (disasters.md – Dopady, Úroda)
    winterEstimateLosses(state, day),
  );
  const sheaves = sheavesOutlook(state, day);
  return eatDiet({
    grainKg: state.storesKg,
    // zapečetěné obilné jámy ztrácí méně (production-chains.md – Obilné jámy)
    ...grainKeepInput(state, potteryCoverage),
    sheavesGrainKg: sheaves.grainKg,
    sheavesLegumesKg: sheaves.legumesKg,
    meatKg: isMeatSpoilDay(day) ? 0 : villageMeatKg(state),
    freshMeatKg: fresh.meatKg ?? 0,
    freshAheadEnergy: fresh.meatAheadEnergy ?? 0,
    fruitKg: applesSpoiled(day, potteryCoverage) ? 0 : villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: fresh.milk.liters,
    milkProteinKg: fresh.milk.proteinKg,
    milkEnergy: fresh.milk.energy,
    eggsKg: fresh.eggsKg,
    legumesKg: villageLegumesKg(state),
    daysToLegumeHarvest: daysUntilLegumeHarvest(day),
    // med z klátů pevným přídělem, v hladu i zásoba (hides-honey.md – Klát u obydlí, Med v hladu)
    honeyKg: state.wares?.honeyKg ?? 0,
    honeyRationKg: villageHoneyRationKg(state, day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    daysToMilking: daysUntilMilking(day),
    // výhled do sklizně s mlékem stád, jako simulace (fields.md – Osev podle stravy)
    // stáda přímo ze stavu – livestock.ts importuje tento soubor
    milkAheadEnergy: state.livestock
      ? milkEnergyBetween(
          dairyDams(state.livestock.herds, state.livestock.young),
          day + 1,
          day + daysToHarvest - 1,
          DIET.caps.dairy * need,
        )
      : 0,
    daysToHarvest,
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage,
  });
}
