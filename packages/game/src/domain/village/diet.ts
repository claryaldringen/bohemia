import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import { applesSpoiled, daysUntilAppleRot } from './food';
import { villageApplesKg } from './orchard';
import { DAIRY, cheeseFromMilk, daysUntilMilking, villageCheeseKg, type MilkYield } from './dairy';
import {
  daysUntilLegumeHarvest,
  legumeEnergy,
  legumeStorageLossPerYear,
  villageLegumesKg,
} from './legumes';
import { ageGroup, foodNeedPerDay } from './people';
import { NO_CRAFTS, storageLossPerYear } from './productivity';
import { honeyEnergy } from './goods';
import { APPLE_FOOD_VALUE, FOREIGN_GOODS, LEGUMES } from './rules';
import type { DietDay, Person, VillageState } from './types';
import { daysUntilFoodHarvest } from './year-plan';

// Strava – obilí, luštěniny, maso, mléko a sýr, vejce, ovoce (diet.md). Energie (v obilních
// ekvivalentech) a bílkoviny proti potřebě: nasycení = pokrytí energie × kvalita stravy
// z bílkovin a ovoce (Martin 18. 10. 2026: maso a mléko kvůli bílkovinám – 1,6 g na kg tělesné
// váhy; luštěniny jako plodina na poli). Ovoce se jí přednostně, dokud nezkazí (rovným dílem do
// 1. 3.), čerstvé mléko a vejce, jak přibývají (přebytek mléka na sýr), maso rovným dílem do
// příští porážky, sýr do příštího dojení a luštěniny do příští sklizně; obilí dorovná energii.
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
 * masa se uzí a suší – ztratí 20 % ročně (návrh Clauda, Martin).
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

/** Porážka (diet.md – listopad): 1. 11. ráno, před jídlem dne – maso se jí rovným dílem do ní. */
export const SLAUGHTER_DAY = { month: 11, day: 1 } as const;

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
  meatKg: number;
  fruitKg: number;
  milkL: number;
  milkProteinKg: number;
  milkEnergy: number;
  cheeseKg: number;
  eggsKg: number;
  legumesKg: number;
  /** Med ze zboží zvenku (trade.md); bez údaje žádný. */
  honeyKg?: number;
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
  const honey = honeyEnergy(eaten.honeyKg ?? 0) / needPerDay;
  const shares = {
    grain: eaten.grainKg / needPerDay,
    meat: meatEnergy(eaten.meatKg) / needPerDay,
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
  meatKg: number;
  fruitKg: number;
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
  /** Zásoba medu (kg – zboží zvenku, trade.md) – jí se rovným dílem do roka; bez údaje žádný. */
  honeyKg?: number;
  /** Dní do příští sklizně luštěnin včetně dneška – jí se rovným dílem do ní; bez údaje rok. */
  daysToLegumeHarvest?: number;
  /** Potřeba energie vsi za den (kg obilí). */
  needPerDay: number;
  /** Potřeba bílkovin vsi za den (kg); bez údaje bílkoviny pokryté. */
  proteinNeedPerDay?: number;
  /** Dní do sklizně včetně dneška (přídělový systém – `daysUntilFoodHarvest`). */
  daysToHarvest: number;
  /** Dní, kdy ještě jde jíst ovoce, včetně dneška (`daysUntilAppleRot`); 0 = žádné. */
  daysToRot: number;
  /** Dní do příští porážky (bez jejího dne) – maso se jí rovným dílem do ní. */
  daysToSlaughter: number;
  /** Dní do příštího začátku dojení – sýr se jí rovným dílem do něj; bez údaje rok. */
  daysToMilking?: number;
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
  /** Zásoba medu po jídle (kg). */
  honeyKg: number;
  diet: DietDay;
  /**
   * Nejnižší příděl energie do sklizně podle výhledu 0–1 (dnešní, nebo po zkažení ovoce, je-li
   * menší). Pod 1 ves hladoví.
   */
  outlook: number;
}

/**
 * Jeden den jídla (diet.md): ztráta zásob (obilí podle nádob, maso uzením, sýr sušením), pak
 * příděl. Ovoce rovným dílem do zkažení, čerstvé mléko (co se nevypije do stropu mléka a sýra,
 * zpracuje se na sýr) a vejce, maso rovným dílem do porážky a sýr do příštího dojení, vše nejvýš
 * do svých stropů; obilí dorovná potřebu energie. Vystačí-li obilí do sklizně (s tím, co ještě
 * přijde na řadu), jí se dosyta; jinak se energie dělí rovně do sklizně – a když by ani tak obilí
 * do zkažení ovoce nebylo potřeba, jí se do té doby jen ostatní a obilí zůstane na dobu po něm.
 */
export function eatDiet(input: DietInput): DietResult {
  const grain = input.grainKg * (1 - storageLossPerYear(input.potteryCoverage)) ** (1 / 365);
  const meat = Math.max(0, input.meatKg) * DAILY_MEAT_KEEP;
  const fruit = Math.max(0, input.fruitKg);
  const cheese = Math.max(0, input.cheeseKg ?? 0) * DAILY_CHEESE_KEEP;
  const milkL = Math.max(0, input.milkL ?? 0);
  const milkProtein = Math.max(0, input.milkProteinKg ?? 0);
  const milkTotalEnergy = Math.max(0, input.milkEnergy ?? 0);
  const eggs = Math.max(0, input.eggsKg ?? 0);
  const legumes =
    Math.max(0, input.legumesKg ?? 0) *
    (1 - legumeStorageLossPerYear(input.potteryCoverage)) ** (1 / COMMON_YEAR_DAYS);
  const honey = Math.max(0, input.honeyKg ?? 0);
  const need = input.needPerDay;
  if (need <= 0) {
    // nikdo nejí – mléko na sýr
    const made = cheeseFromMilk(milkProtein);
    return {
      grainKg: grain,
      meatKg: meat,
      fruitKg: fruit,
      cheeseKg: cheese + made,
      cheeseMadeKg: made,
      legumesKg: legumes,
      honeyKg: honey,
      diet: dietOf(0, 0, NOTHING),
      outlook: 1,
    };
  }
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
  const meatRation = Math.min(
    DIET.caps.meat * need,
    meatEnergy(meat) / Math.max(1, input.daysToSlaughter),
  );
  const cheeseRation = Math.min(
    Math.max(0, DIET.caps.dairy * need - milkEnergy),
    (cheese * DAIRY.cheeseEnergy) / Math.max(1, input.daysToMilking ?? COMMON_YEAR_DAYS),
  );
  const legumeRation = Math.min(
    DIET.caps.legumes * need,
    legumeEnergy(legumes) / Math.max(1, input.daysToLegumeHarvest ?? COMMON_YEAR_DAYS),
  );
  // med ze zboží zvenku rovným dílem do roka, nejvýš FOREIGN_GOODS.honeyCap (trade.md)
  const honeyRation = Math.min(
    FOREIGN_GOODS.honeyCap * need,
    honeyEnergy(honey) / FOREIGN_GOODS.honeyDays,
  );
  // maso, sýr, luštěniny, med a vejce se počítají i do dalších dní, mléko a ovoce jen, jak
  // opravdu přijdou
  const daily = meatRation + cheeseRation + legumeRation + honeyRation + eggsEnergy;
  const today = fruitRation + milkEnergy + daily;
  const grainNeed = (need - daily) * days - fruitRation * rotDays - milkEnergy;
  let outlook = 1;
  let grainToday: number;
  if (grain >= grainNeed) {
    grainToday = need - today;
  } else {
    const even = (grain + fruitRation * rotDays + milkEnergy + daily * days) / (need * days);
    if (even * need >= today) {
      outlook = even;
      grainToday = even * need - today;
    } else {
      // do zkažení ovoce jen ostatní jídlo, obilí zůstane na dny po něm
      grainToday = 0;
      const now = today / need;
      const after = days - rotDays;
      const later = after > 0 ? (grain + daily * after) / (need * after) : now;
      outlook = Math.min(now, later);
    }
  }
  grainToday = Math.max(0, Math.min(grain, grainToday));
  const eaten: Eaten = {
    grainKg: grainToday,
    meatKg: meatRation / DIET.meatEnergy,
    fruitKg: fruitRation / APPLE_FOOD_VALUE,
    milkL: milkDrunk,
    milkProteinKg: milkProtein * drunkShare,
    milkEnergy,
    cheeseKg: cheeseRation / DAIRY.cheeseEnergy,
    eggsKg: eggs,
    legumesKg: legumeRation / LEGUMES.energy,
    ...(honeyRation > 0 ? { honeyKg: honeyRation / FOREIGN_GOODS.honeyEnergy } : {}),
  };
  const made = cheeseFromMilk(milkProtein * (1 - drunkShare));
  const diet = dietOf(need, input.proteinNeedPerDay ?? 0, eaten);
  return {
    // poslední den před sklizní se snědí celé zásoby – ořez chyb zaokrouhlení pod nulu
    grainKg: Math.max(0, grain - grainToday),
    meatKg: Math.max(0, meat - eaten.meatKg),
    fruitKg: Math.max(0, fruit - eaten.fruitKg),
    cheeseKg: Math.max(0, cheese - eaten.cheeseKg) + made,
    cheeseMadeKg: made,
    legumesKg: Math.max(0, legumes - eaten.legumesKg),
    honeyKg: Math.max(0, honey - (eaten.honeyKg ?? 0)),
    diet,
    outlook: Math.min(1, outlook),
  };
}

/**
 * Dní do příští porážky bez jejího dne: 31. 10. → 1, 1. 11. (porážka už proběhla ráno) → celý
 * rok. Bez dayIndexOf za koncem světa (podzim 1499).
 */
export function daysUntilSlaughter(day: number): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed =
    month > SLAUGHTER_DAY.month ||
    (month === SLAUGHTER_DAY.month && dayOfMonth >= SLAUGHTER_DAY.day);
  const thisYear = dayIndexOf({ year, ...SLAUGHTER_DAY });
  const next = passed ? thisYear + COMMON_YEAR_DAYS + (isLeapYear(year + 1) ? 1 : 0) : thisYear;
  return next - day;
}

/** Potřeba energie vsi za den (kg obilí). */
export function villageFoodNeed(state: Pick<VillageState, 'people'>, day: number): number {
  return state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
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
 * (`potteryCoverage` – crafts.md).
 */
export function villageMeal(
  state: VillageState,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
  fresh: { milk: MilkYield; eggsKg: number } = {
    milk: { liters: 0, proteinKg: 0, energy: 0 },
    eggsKg: 0,
  },
): DietResult {
  const need = villageFoodNeed(state, day);
  return eatDiet({
    grainKg: state.storesKg,
    meatKg: villageMeatKg(state),
    fruitKg: applesSpoiled(day, potteryCoverage) ? 0 : villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: fresh.milk.liters,
    milkProteinKg: fresh.milk.proteinKg,
    milkEnergy: fresh.milk.energy,
    eggsKg: fresh.eggsKg,
    legumesKg: villageLegumesKg(state),
    daysToLegumeHarvest: daysUntilLegumeHarvest(day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    daysToMilking: daysUntilMilking(day),
    daysToHarvest: daysUntilFoodHarvest(state.plan, state.parts, day, need),
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToSlaughter: daysUntilSlaughter(day),
    potteryCoverage,
  });
}
