import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../../calendar';
import { fieldFoodShare } from '../fields/field-food';
import { applesSpoiled, daysUntilAppleRot } from './food';
import { grainKeepInput } from '../fields/grain-pits';
import { villageApplesKg } from '../buildings/orchard';
import {
  DAIRY,
  cheeseFromMilk,
  dairyDams,
  milkEnergyBetween,
  villageCheeseKg,
  type MilkYield,
} from '../livestock/dairy';
import { legumeEnergy, legumeStorageLossPerYear, villageLegumesKg } from '../fields/legumes';
import { ageGroup, foodNeedPerDay, guestFoodNeedPerDay } from '../people/people';
import { NO_CRAFTS, storageLossPerYear } from './productivity';
import { APPLE_FOOD_VALUE, LEGUMES } from '../rules';
import { HONEY } from '../rules/rules-wares';
import type { ChronicleEvent, DietDay, Person, VillageState } from '../types';
import { sheavesOutlook } from '../fields/threshing';
import { daysUntilFoodHarvest } from './year-plan';
import { winterEstimateLosses } from '../disasters/disasters';

// Strava – obilí, luštěniny, maso, mléko a sýr, vejce, ovoce a med (diet.md). Energie (v obilních
// ekvivalentech) a bílkoviny proti potřebě: nasycení = pokrytí energie × kvalita stravy
// z bílkovin a ovoce (Martin 18. 10. 2026: maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné
// váhy). Pořadí jídla bez stropů (diet.md – Strava po vrstvách a porážka celý rok; Martin
// 18. 11. 2026: „První se musí jíst, to, co se nejdřív zkazí, protože obilí lze skladovat“,
// „Strop bych úplně zrušil, je to zbytečný výpočet navíc. Pořadí jídla je jasné: 1. maso (a to
// i ryby a drobná zvěř) 2. ovoce … 3. luštěniny 4. obilí“, „Mléko, sýr a vejce se musí jíst
// čerstvé, takže to dej na stejnou úroveň jako maso. Med … Dej ho v pořadí za obilí“): co se
// kazí, se jí hned, šetří se jen obilí (a v hladu med) rovným dílem do sklizně (`eatDiet`).
// Hladem se umírá jen z nedostatku energie (population.md – Hlad a vymření), bílkoviny a ovoce
// řídí porody a štěstí.

/**
 * diet.md – Pravidla: energie v kg obilí na kg (maso ≈ 2 000, vejce ≈ 1 430 kcal/kg proti obilí
 * 3 400; mléko a sýr – dairy.ts; ovoce APPLE_FOOD_VALUE; luštěniny LEGUMES.energy); kvalita stravy
 * 0,60 + 0,34 × pokrytí bílkovin + 0,06 × pokrytí ovoce (nejvýš 1 – samo obilí ≈ 0,8); ovoce plně
 * při 5 % energie; ovoce přidá štěstí +5; maso štěstí až +3 – plně od 20 % energie z masa, méně
 * poměrně (Martin 18. 10. 2026: „maso bude mírně zvyšovat štěstí“, čísla návrh Clauda); zásoba
 * masa se uzí a suší – ztratí 20 % ročně (návrh Clauda, Martin) – a 1. 9. se zbytek zkazí
 * (MEAT_SPOIL_DAY). Stropy podílů energie (maso 40 %, ovoce 25 %, mléko a sýr 30 %, luštěniny
 * 25 %) jsou zrušené (diet.md – Strava po vrstvách a porážka celý rok; Martin 18. 11. 2026: „Strop
 * bych úplně zrušil, je to zbytečný výpočet navíc.“) – nikdo nesní víc, než je jeho potřeba
 * energie, a samo obilí ani samo ovoce dál nenasytí plně kvůli kvalitě stravy.
 */
export const DIET = {
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
export const DAILY_MEAT_KEEP = (1 - DIET.meatLossPerYear) ** (1 / COMMON_YEAR_DAYS);
/** Sýr se suší a zraje – za rok ubude DAIRY.cheeseLossPerYear. */
export const DAILY_CHEESE_KEEP = (1 - DAIRY.cheeseLossPerYear) ** (1 / COMMON_YEAR_DAYS);

/** Denní podíl zásoby luštěnin, který zbude po ztrátě skladováním (nádoby od hrnčíře – crafts.md). */
export function legumeKeepPerDay(potteryCoverage: number): number {
  return (1 - legumeStorageLossPerYear(potteryCoverage)) ** (1 / COMMON_YEAR_DAYS);
}

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
  /**
   * Z toho čerstvé maso dne (kg – zimní porážka, ryby a drobná zvěř; diet.md, Porážka v zimě);
   * chybí = žádné.
   */
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
  /**
   * Z toho pevný příděl medu (kg – `DietInput.honeyRationKg`; jí ho všichni stejně – diet.md, Kdo
   * dostane co); zbytek je med navíc v hladu (Med v hladu – po vrstvách za obilím). Chybí = žádný.
   */
  honeyRationKg?: number;
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

/** Nic nesnědeno – nový objekt, do kterého se smí připisovat (`tierMeal`). */
export function nothingEaten(): Eaten {
  return { ...NOTHING };
}

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
  /** Totéž u luštěnin (kg) – výhled do sklizně s nimi počítá. Bez údaje žádné. */
  sheavesLegumesKg?: number;
  /** Zásoba uzeného masa (kg). */
  meatKg: number;
  fruitKg: number;
  /**
   * Čerstvé maso dne (kg – porážka v zimě i v létě, ryby a drobná zvěř; diet.md, Strava po vrstvách
   * a porážka celý rok): jí se před uzeným (`meatKg`); co se nesní, se udí. Bez údaje žádné.
   */
  freshMeatKg?: number;
  /**
   * Čerstvé maso z porážky od zítřka do sklizně (energie v kg obilí – v zimě čekající kusy, v létě
   * maso pro rod vojvody; `freshMeatAheadEnergy`) – výhled s ním počítá. Bez údaje žádné.
   */
  freshAheadEnergy?: number;
  /**
   * Ryby, které ves ještě chytí od zítřka do sklizně (energie v kg obilí – `fishAheadKg`, nejvýš
   * zbytek letošní kvóty) – výhled s nimi počítá; dnešní úlovek je v čerstvém mase dne
   * (`freshMeatKg`). Bez údaje žádné.
   */
  fishAheadEnergy?: number;
  /** Zásoba sýra (kg). */
  cheeseKg?: number;
  /** Dnes nadojené mléko (l), jeho bílkoviny (kg) a energie (kg obilí). */
  milkL?: number;
  milkProteinKg?: number;
  milkEnergy?: number;
  /** Dnes snesená vejce (kg) – jí se čerstvá, co se nesní, zkazí se. */
  eggsKg?: number;
  /** Zásoba luštěnin (kg). */
  legumesKg?: number;
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
   * do porážky) – do konce se sní aspoň rovným dílem (tempo proti zkažení – `eatDiet`).
   */
  daysToMeatEnd: number;
  /**
   * Mléko, které stáda dají od zítřka do sklizně (energie v kg obilí, za den nejvýš potřeba –
   * `milkEnergyBetween`) – výhled s ním počítá (fields.md – Osev podle stravy). Bez údaje žádné.
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
  /** Co ves dnes snědla celkem (kg; mléko v litrech) – v pořadí jídla, čerstvé maso zvlášť. */
  eaten: Eaten;
  diet: DietDay;
  /**
   * Příděl energie do sklizně podle výhledu 0–1 – průměr do sklizně; co se kazí, se dnes může jíst
   * rychleji (tempo proti zkažení). Pod 1 ves hladoví.
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

/**
 * Zásoby dne po ztrátách a jídlo mimo obilí (energie v kg obilí) – sdílí ho `eatDiet`
 * i `grainAheadForOutlookKg`, výhled a obrácený výhled tak souhlasí (návrh Clauda).
 */
interface DietPlan {
  need: number;
  /** Dní do sklizně včetně dneška (nejméně 1). */
  days: number;
  /** Zásoby po dnešní ztrátě (kg): uzené maso, sýr, luštěniny; čerstvé maso, jablka a med dne. */
  meat: number;
  fresh: number;
  fruit: number;
  cheese: number;
  legumes: number;
  honey: number;
  /** Dnešní mléko – litry, bílkoviny (kg) a energie. */
  milkL: number;
  milkProtein: number;
  milkEnergy: number;
  /** Dnešní vejce (kg) a jejich energie. */
  eggs: number;
  eggsEnergy: number;
  /** Energie ovoce, které jde dnes jíst (po zkažení 0). */
  fruitToday: number;
  /**
   * Jídlo mimo obilí a med do sklizně (energie): dnešní mléko (nejvýš potřeba dne – zbytek je sýr),
   * vejce dnes i dalších dnů, čerstvé maso dne i z porážky do sklizně, ryby od zítřka, mléko stád
   * do sklizně, uzené maso a ovoce nejvýš potřeba za dny do zkažení, sýr a luštěniny (i snopy) po
   * ztrátách – celé nejvýš potřeba za dny do sklizně.
   */
  aheadEnergy: number;
  /**
   * Tempo proti zkažení (energie za den – návrh Clauda): ovoce ÷ dny do zkažení, maso (uzené
   * i dnešní čerstvé) ÷ dny do konce masa; `spoilPace` – i s vejci dne celkem: kolik se dnes aspoň
   * sní, aby se vejce, ovoce a maso stihly sníst rovným dílem do zkažení.
   */
  fruitPace: number;
  meatPace: number;
  spoilPace: number;
  /** Pevný příděl medu dnes (kg), do sklizně (energie – jen na dny, kdy zásoba vydrží). */
  honeyEaten: number;
  honeyUntilHarvest: number;
  /** Energie celé zásoby medu – jídlo jako obilí, když jídla do sklizně není dost. */
  honeyAll: number;
}

/** Zásoby dne po ztrátách a jídlo mimo obilí do sklizně (`eatDiet`) – na zásobě obilí nezávisí. */
function dietPlan(input: DietInput): DietPlan {
  const meat = Math.max(0, input.meatKg) * DAILY_MEAT_KEEP;
  const fresh = Math.max(0, input.freshMeatKg ?? 0);
  const fruit = Math.max(0, input.fruitKg);
  const cheese = Math.max(0, input.cheeseKg ?? 0) * DAILY_CHEESE_KEEP;
  const legumes = Math.max(0, input.legumesKg ?? 0) * legumeKeepPerDay(input.potteryCoverage);
  const honey = Math.max(0, input.honeyKg ?? 0);
  const milkEnergy = Math.max(0, input.milkEnergy ?? 0);
  const eggs = Math.max(0, input.eggsKg ?? 0);
  const eggsEnergy = eggs * DIET.energy.eggs;
  const need = input.needPerDay;
  const days = Math.max(1, input.daysToHarvest);
  const rotDays = Math.max(0, input.daysToRot);
  const meatDays = Math.max(1, input.daysToMeatEnd);
  const fruitToday = rotDays > 0 ? fruitEnergy(fruit) : 0;
  // co se kazí, jen kolik se do zkažení stihne sníst plnou potřebou; mléko stád do sklizně za den
  // nejvýš potřeba (`milkEnergyBetween`), čerstvé maso z porážky – v zimě nejvýš potřeba za dny
  // zimy, v létě potřeba rodu vojvody (`freshMeatAheadEnergy`) –, ryby od zítřka nejvýš do kvóty
  // (`fishAheadKg`; dnešní jsou v čerstvém mase dne)
  const ahead =
    Math.min(milkEnergy, need) +
    eggsEnergy * days +
    meatEnergy(fresh) +
    Math.max(0, input.freshAheadEnergy ?? 0) +
    Math.max(0, input.fishAheadEnergy ?? 0) +
    Math.max(0, input.milkAheadEnergy ?? 0) +
    Math.min(meatEnergy(meat), need * Math.min(days, meatDays)) +
    Math.min(fruitToday, need * Math.min(days, rotDays)) +
    cheese * DAIRY.cheeseEnergy +
    legumeEnergy(legumes + Math.max(0, input.sheavesLegumesKg ?? 0));
  // vejce dnes, ovoce do zkažení, maso (uzené i čerstvé) do konce masa rovným dílem
  const fruitPace = rotDays > 0 ? fruitToday / rotDays : 0;
  const meatPace = meatEnergy(meat + fresh) / meatDays;
  // med pevným přídělem z toho, co je (hides-honey.md – Klát u obydlí); do sklizně jen, dokud
  // zásoba vydrží – med, který klády dají do žní, výhled nezná. Když jídla do sklizně není dost,
  // je celá zásoba jídlo jako obilí (`honeyAll` – Med v hladu)
  const honeyEaten = Math.min(honey, Math.max(0, input.honeyRationKg ?? 0));
  const honeyDays = honeyEaten > 0 ? honey / honeyEaten : 0;
  return {
    need,
    days,
    meat,
    fresh,
    fruit,
    cheese,
    legumes,
    honey,
    milkL: Math.max(0, input.milkL ?? 0),
    milkProtein: Math.max(0, input.milkProteinKg ?? 0),
    milkEnergy,
    eggs,
    eggsEnergy,
    fruitToday,
    aheadEnergy: Math.min(need * days, ahead),
    fruitPace,
    meatPace,
    spoilPace: eggsEnergy + fruitPace + meatPace,
    honeyEaten,
    honeyUntilHarvest: honeyEnergy(honeyEaten) * Math.min(days, honeyDays),
    honeyAll: honeyEnergy(honey),
  };
}

/**
 * Kolik kg ze zásoby `kg` s energií `energy` se sní, sní-li se z ní energie `eaten` – celá zásoba
 * přesně (zbytek nezůstane jen z chyb zaokrouhlení).
 */
function eatenKg(kg: number, energy: number, eaten: number): number {
  if (energy <= 0 || eaten <= 0) return 0;
  return eaten >= energy ? kg : (kg * eaten) / energy;
}

/**
 * Nejmenší obilí do sklizně (kg zrna – zásoby po dnešní ztrátě a snopy, které ves vymlátí), se
 * kterým výhled `eatDiet` dá příděl energie aspoň `outlook` (0–1) – s celou ostatní stravou
 * vstupu (`dietPlan` – mléko dne i stád do sklizně, vejce, maso i čerstvé ze zimní porážky, ovoce,
 * sýr a luštěniny). Pod plným přídělem je celá zásoba medu jídlo jako obilí (hides-honey.md – Med
 * v hladu), plný příděl počítá jen s pevným přídělem medu do sklizně – ves pak jí dosyta bez
 * zásoby medu. Přesně obrácený výhled `eatDiet` (fields.md – Osivo ze zásob, přežívací zásoba),
 * i se ztrátami skladováním do žní (`grainEatenShare`).
 */
export function grainAheadForOutlookKg(input: DietInput, outlook: number): number {
  const target = Math.min(1, outlook);
  if (input.needPerDay <= 0 || target <= 0) return 0;
  const { need, days, aheadEnergy, honeyAll, honeyUntilHarvest } = dietPlan(input);
  const honey = target < 1 ? honeyAll : honeyUntilHarvest;
  const eaten = target * need * days - aheadEnergy - honey;
  return Math.max(0, eaten) / grainEatenShare(grainKeepPerDay(input), 0, days);
}

/**
 * Jeden den jídla vsi (diet.md – Strava po vrstvách a porážka celý rok; Martin 18. 11. 2026:
 * „První se musí jíst, to, co se nejdřív zkazí, protože obilí lze skladovat“, „Pokud bude
 * přebytek masa, ať klidně všichni jedí jenom maso, pokud se tím zabrání jeho zkažení“, „Strop
 * bych úplně zrušil“): ztráty zásob (obilí podle nádob a jam, maso uzením, sýr sušením,
 * luštěniny), výhled do sklizně a jídlo dne bez stropů.
 *
 * - Výhled: jídlo mimo obilí do sklizně (`dietPlan` – `aheadEnergy`) a obilí do sklizně (i snopy)
 *   po ztrátách skladováním do dne, kdy se sní (`grainEatenShare`). Stačí-li s pevným přídělem
 *   medu na plnou potřebu, příděl je plný a obilí navíc dostanou koně (`grainSpareKg`). Jinak je
 *   celá zásoba medu jídlo jako obilí (hides-honey.md – Med v hladu): doplní-li, co chybí, ves jí
 *   dosyta, jinak příděl = (jídlo mimo obilí + obilí + celý med) ÷ potřeba do sklizně.
 * - Dnes se sní příděl × potřeba, ale aspoň tempem proti zkažení – vejce dnes, ovoce do zkažení
 *   a maso do konce rovným dílem – a nejvýš celá potřeba (návrh Clauda: co by se zkazilo, sní
 *   ostatní).
 * - Složení: pevný příděl medu (jí se, i když obilí stačí – návrh Clauda, jinak by med nikdy nedal
 *   štěstí), pak tempo proti zkažení – i v hojnosti, ať nic, co jde sníst, nepřijde nazmar; nad
 *   plnou potřebu se krátí od nejtrvanlivějšího (maso, ovoce, vejce naposled; návrh Clauda) –, pak
 *   zbytek v pořadí mléko, vejce, čerstvé maso, uzené, sýr, ovoce, luštěniny a obilí (nejvýš
 *   vymlácená zásoba); v hladu je místo pevného přídělu med za obilím – podílem na obilí a medu,
 *   které se do sklizně snědí, obojí tak vyjde na den sklizně. Nevypité mléko se zpracuje na sýr,
 *   nesnědené čerstvé maso se vyudí, nesnědená vejce se zkazí.
 */
export function eatDiet(input: DietInput): DietResult {
  const keep = grainKeepPerDay(input);
  const grain = input.grainKg * keep;
  const plan = dietPlan(input);
  const { need, meat, fresh, fruit, cheese, legumes, honey, milkProtein } = plan;
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
      eaten: nothingEaten(),
      diet: dietOf(0, 0, NOTHING),
      outlook: 1,
      grainSpareKg: ahead,
    };
  }
  const { days, aheadEnergy, honeyEaten, honeyUntilHarvest, honeyAll } = plan;
  // obilí, které se do sklizně opravdu sní – zbytek zásob mezitím ubude skladováním (rovným dílem
  // od dneška; fields.md – Přídělový systém)
  const aheadEaten = ahead * grainEatenShare(keep, 0, days);
  // obilí, které s jídlem mimo obilí a pevným přídělem medu dá do sklizně plnou potřebu
  const grainNeed = need * days - aheadEnergy - honeyUntilHarvest;
  let outlook = 1;
  let grainSpareKg = 0;
  // v hladu podíl medu na dnešním obilí a medu (celá zásoba je jídlo jako obilí); null = pevný příděl
  let honeyShare: number | null = null;
  if (aheadEaten >= grainNeed) {
    grainSpareKg = aheadEaten - grainNeed;
  } else {
    // jídla do sklizně není dost – celá zásoba medu je jídlo jako obilí (hides-honey.md – Med
    // v hladu; Martin 15. 11. 2026: „Ano – jsou to kalorie jako každé jiné.“): jí se s obilím
    // jedním přídělem, med svým podílem na obilí a medu, které se do sklizně snědí (med se nekazí)
    const honeyNeed = need * days - aheadEnergy - aheadEaten;
    if (honeyAll >= honeyNeed) {
      // med doplní, co obilí chybí – ves jí dosyta, zbytek medu zůstane
      honeyShare = honeyNeed / (aheadEaten + honeyNeed);
    } else {
      outlook = (aheadEnergy + aheadEaten + honeyAll) / (need * days);
      honeyShare = honeyAll > 0 ? honeyAll / (aheadEaten + honeyAll) : 0;
    }
  }
  // dnes příděl, ale aspoň tempem proti zkažení a nejvýš celá potřeba
  let left = Math.min(need, Math.max(outlook * need, plan.spoilPace));
  // energie jídla, které jde dnes sníst (kg obilí) – co se z ní nesní, zůstane
  const full = {
    milk: plan.milkEnergy,
    eggs: plan.eggsEnergy,
    fresh: meatEnergy(fresh),
    smoked: meatEnergy(meat),
    cheese: cheese * DAIRY.cheeseEnergy,
    fruit: plan.fruitToday,
    legumes: legumeEnergy(legumes),
  };
  const rest = { ...full };
  /** Sní z jídla `food` nejvýš `most` (energie) – nejvýš, kolik ho je a kolik dnes zbývá. */
  const eat = (food: keyof typeof full, most = Infinity): void => {
    const eaten = Math.min(rest[food], most, Math.max(0, left));
    rest[food] -= eaten;
    left -= eaten;
  };
  // pevný příděl medu jen při dostatku jídla (v hladu je celá zásoba jídlem za obilím)
  const rationE = honeyShare === null ? honeyEnergy(honeyEaten) : 0;
  const honeyRationE = Math.min(rationE, left);
  left -= honeyRationE;
  // napřed tempo proti zkažení – vejce dnes, ovoce do zkažení, maso do konce masa rovným dílem
  // (z čerstvého napřed); nevejde-li se do plné potřeby, krátí se od nejtrvanlivějšího: maso,
  // ovoce, vejce naposled (diet.md – „Nic se nezkazí, dokud to může někdo sníst“; návrh Clauda)
  eat('eggs');
  eat('fruit', plan.fruitPace);
  eat('fresh', plan.meatPace);
  eat('smoked', plan.meatPace - (full.fresh - rest.fresh));
  // zbytek dnešní energie v pořadí jídla vsi – mléko a vejce napřed (nedají se uložit). Totéž
  // pořadí má předpověď `foodLastsDays` (food-lasts.ts); rozdělení snědeného po vrstvách
  // (`tierMeal` – tier-meal.ts, `LEVELS`) dává elitě napřed maso a mléko až po něm – záměrně,
  // množství je dané. Změna pořadí od Martina na všech třech místech.
  for (const food of ['milk', 'eggs', 'fresh', 'smoked', 'cheese', 'fruit', 'legumes'] as const) {
    eat(food);
  }
  // obilí dorovná zbytek, v hladu s medem
  let honeyToday = eatenKg(honeyEaten, rationE, honeyRationE);
  let grainToday = left;
  if (honeyShare !== null) {
    honeyToday = Math.min(honey, (left * honeyShare) / HONEY.energyPerKg);
    grainToday = left - honeyEnergy(honeyToday);
  }
  grainToday = Math.max(0, Math.min(grain, grainToday));
  /** Kolik kg zásoby `kg` jídla `food` se dnes snědlo. */
  const kgOf = (food: keyof typeof full, kg: number): number =>
    eatenKg(kg, full[food], full[food] - rest[food]);
  const drunkShare = kgOf('milk', 1);
  const freshKg = kgOf('fresh', fresh);
  const smokedKg = kgOf('smoked', meat);
  // pevný příděl medu ze snědeného – v hladu se jí s obilím celá zásoba, z ní nejdřív pevný příděl
  // (všem stejně), zbytek je med navíc (po vrstvách za obilím – diet.md, Kdo dostane co)
  const honeyRationKg = Math.min(honeyToday, honeyEaten);
  const eaten: Eaten = {
    grainKg: grainToday,
    meatKg: freshKg + smokedKg,
    ...(freshKg > 0 ? { freshMeatKg: freshKg } : {}),
    fruitKg: kgOf('fruit', fruit),
    milkL: plan.milkL * drunkShare,
    milkProteinKg: milkProtein * drunkShare,
    milkEnergy: full.milk - rest.milk,
    cheeseKg: kgOf('cheese', cheese),
    eggsKg: kgOf('eggs', plan.eggs),
    legumesKg: kgOf('legumes', legumes),
    honeyKg: honeyToday,
    ...(honeyRationKg > 0 ? { honeyRationKg } : {}),
  };
  // z mléka, které se nevypilo, je sýr
  const made = cheeseFromMilk(milkProtein * (1 - drunkShare));
  return {
    // poslední den před sklizní se snědí celé zásoby – ořez chyb zaokrouhlení pod nulu
    grainKg: Math.max(0, grain - grainToday),
    // co se z čerstvého masa nesnědlo, se udí
    meatKg: Math.max(0, meat - smokedKg) + Math.max(0, fresh - freshKg),
    fruitKg: Math.max(0, fruit - eaten.fruitKg),
    cheeseKg: Math.max(0, cheese - eaten.cheeseKg) + made,
    cheeseMadeKg: made,
    legumesKg: Math.max(0, legumes - eaten.legumesKg),
    // med se nekazí – zbytek se hromadí
    honeyKg: Math.max(0, honey - honeyToday),
    eaten,
    diet: dietOf(need, input.proteinNeedPerDay ?? 0, eaten),
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
 * Dní, kdy ještě jde jíst dnešní uzené maso bez další porážky, včetně dneška – do zkažení 1. 9.
 * ráno (diet.md – Trvanlivost masa): 31. 8. → 1, 1. 9. → 0 (zkazí se ráno), 2. 9. → do příštího
 * 1. 9.
 */
export function daysUntilMeatSpoil(day: number): number {
  return isMeatSpoilDay(day) ? 0 : daysBefore(day, MEAT_SPOIL_DAY);
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
    /** Čerstvé maso dne z porážky (diet.md – Strava po vrstvách a porážka celý rok). */
    meatKg?: number;
    /**
     * Čerstvé maso z porážky od zítřka do sklizně (energie) – číslo, nebo podle dní výhledu do
     * sklizně (`freshMeatAheadEnergy`).
     */
    meatAheadEnergy?: number | ((daysToHarvest: number) => number);
    /**
     * Ryby, které ves ještě chytí od zítřka do sklizně (energie) – číslo, nebo podle dní výhledu
     * do sklizně (`fishAheadKg`; small-game.ts sem nejde – přes zboží importuje tento soubor).
     */
    fishAheadEnergy?: number | ((daysToHarvest: number) => number);
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
    freshAheadEnergy:
      typeof fresh.meatAheadEnergy === 'function'
        ? fresh.meatAheadEnergy(daysToHarvest)
        : (fresh.meatAheadEnergy ?? 0),
    fishAheadEnergy:
      typeof fresh.fishAheadEnergy === 'function'
        ? fresh.fishAheadEnergy(daysToHarvest)
        : (fresh.fishAheadEnergy ?? 0),
    fruitKg: applesSpoiled(day, potteryCoverage) ? 0 : villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: fresh.milk.liters,
    milkProteinKg: fresh.milk.proteinKg,
    milkEnergy: fresh.milk.energy,
    eggsKg: fresh.eggsKg,
    legumesKg: villageLegumesKg(state),
    // med z klátů pevným přídělem, v hladu i zásoba (hides-honey.md – Klát u obydlí, Med v hladu)
    honeyKg: state.wares?.honeyKg ?? 0,
    honeyRationKg: villageHoneyRationKg(state, day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    // výhled do sklizně s mlékem stád, jako simulace (fields.md – Osev podle stravy), za den nejvýš
    // potřeba; stáda přímo ze stavu – livestock.ts importuje tento soubor
    milkAheadEnergy: state.livestock
      ? milkEnergyBetween(
          dairyDams(state.livestock.herds, state.livestock.young),
          day + 1,
          day + daysToHarvest - 1,
          need,
        )
      : 0,
    daysToHarvest,
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage,
  });
}
