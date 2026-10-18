import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import { applesSpoiled, daysUntilAppleRot } from './food';
import { villageApplesKg } from './orchard';
import { foodNeedPerDay } from './people';
import { NO_CRAFTS, storageLossPerYear } from './productivity';
import { APPLE_FOOD_VALUE } from './rules';
import type { DietDay, VillageState } from './types';
import { daysUntilFoodHarvest } from './year-plan';

// Strava – obilí, maso, ovoce (diet.md, schváleno 18. 10. 2026). Energie (v obilních
// ekvivalentech) proti potřebě a pestrost stravy: nasycení = pokrytí energie × pestrost. Ovoce
// se jí přednostně, dokud nezkazí (rovným dílem do 1. 3.), maso rovným dílem do příští porážky,
// obilí dorovná; ovoce smí pokrýt nejvýš čtvrtinu potřeby energie, maso 40 %. Hladem se umírá
// jen z nedostatku energie (population.md – Hlad a vymření), pestrost řídí porody a štěstí.

/**
 * diet.md – Pravidla (návrh Clauda, Martin schválil): plná strava = 75 % energie z obilí, 20 %
 * z masa, 5 % z ovoce; pestrost 0,80 + 0,14 × pokrytí masa + 0,06 × pokrytí ovoce (pokrytí =
 * snědené ÷ podíl ve stravě, nejvýš 1); strop ovoce 25 %, masa 40 % potřeby energie; energie
 * masa 0,6 kg obilí na kg (ovoce APPLE_FOOD_VALUE); ovoce přidá štěstí +5; zásoba masa se uzí
 * a suší – ztratí 20 % ročně.
 */
export const DIET = {
  shares: { grain: 0.75, meat: 0.2, fruit: 0.05 },
  diversity: { base: 0.8, meat: 0.14, fruit: 0.06 },
  caps: { meat: 0.4, fruit: 0.25 },
  meatEnergy: 0.6,
  fruitHappiness: 5,
  meatLossPerYear: 0.2,
} as const;

/** Porážka (diet.md – listopad): 1. 11. ráno, před jídlem dne – maso se jí rovným dílem do ní. */
export const SLAUGHTER_DAY = { month: 11, day: 1 } as const;

const COMMON_YEAR_DAYS = 365;
/** Maso se uzí rovnoměrně po dnech – za rok ubude DIET.meatLossPerYear. */
const DAILY_MEAT_KEEP = (1 - DIET.meatLossPerYear) ** (1 / COMMON_YEAR_DAYS);

/** Energie masa v kg obilí. */
export function meatEnergy(kg: number): number {
  return kg * DIET.meatEnergy;
}

/** Energie ovoce (jablek) v kg obilí. */
export function fruitEnergy(kg: number): number {
  return kg * APPLE_FOOD_VALUE;
}

/** Pestrost stravy 0,8–1 z pokrytí masa a ovoce (0–1, ořízne se). */
export function dietDiversity(meatCoverage: number, fruitCoverage: number): number {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const { base, meat, fruit } = DIET.diversity;
  return base + meat * clamp(meatCoverage) + fruit * clamp(fruitCoverage);
}

/**
 * Jídlo dne z toho, co se snědlo (kg obilí, masa a jablek) proti potřebě energie (kg obilí za den):
 * energie, pestrost (pokrytí masa a ovoce proti jejich podílu v plné stravě), nasycení a podíly.
 * Bez potřeby (nikdo nejí) plné nasycení.
 */
export function dietOf(
  needPerDay: number,
  grainKg: number,
  meatKg: number,
  fruitKg: number,
): DietDay {
  if (needPerDay <= 0) {
    return { energy: 1, diversity: 1, satiation: 1, shares: { grain: 0, meat: 0, fruit: 0 } };
  }
  const grain = grainKg / needPerDay;
  const meat = meatEnergy(meatKg) / needPerDay;
  const fruit = fruitEnergy(fruitKg) / needPerDay;
  const energy = Math.min(1, grain + meat + fruit);
  const diversity = dietDiversity(meat / DIET.shares.meat, fruit / DIET.shares.fruit);
  return { energy, diversity, satiation: energy * diversity, shares: { grain, meat, fruit } };
}

/** Vstup jídla dne – zásoby na konci včerejška, potřeba a výhled. */
export interface DietInput {
  grainKg: number;
  meatKg: number;
  fruitKg: number;
  /** Potřeba energie vsi za den (kg obilí). */
  needPerDay: number;
  /** Dní do sklizně včetně dneška (přídělový systém – `daysUntilFoodHarvest`). */
  daysToHarvest: number;
  /** Dní, kdy ještě jde jíst ovoce, včetně dneška (`daysUntilAppleRot`); 0 = žádné. */
  daysToRot: number;
  /** Dní do příští porážky (bez jejího dne) – maso se jí rovným dílem do ní. */
  daysToSlaughter: number;
  /** Pokrytí nádobami 0–1 – ztráty zásob obilí (crafts.md). */
  potteryCoverage: number;
}

/** Výsledek jídla dne – zásoby po jídle, jídlo dne a výhled energie do sklizně. */
export interface DietResult {
  grainKg: number;
  meatKg: number;
  fruitKg: number;
  diet: DietDay;
  /**
   * Nejnižší příděl energie do sklizně podle výhledu 0–1 (dnešní, nebo po zkažení ovoce, je-li
   * menší). Pod 1 ves hladoví.
   */
  outlook: number;
}

/**
 * Jeden den jídla (diet.md): ztráta zásob (obilí podle nádob, maso uzením), pak příděl. Ovoce
 * rovným dílem do zkažení a maso rovným dílem do porážky, oboje nejvýš do svého stropu; obilí
 * dorovná potřebu energie. Vystačí-li obilí do sklizně (s masem a ovocem, které ještě přijdou na
 * řadu), jí se dosyta; jinak se energie dělí rovně do sklizně – a když by ani tak obilí do zkažení
 * ovoce nebylo potřeba, jí se do té doby jen maso a ovoce a obilí zůstane na dobu po nich.
 */
export function eatDiet(input: DietInput): DietResult {
  const grain = input.grainKg * (1 - storageLossPerYear(input.potteryCoverage)) ** (1 / 365);
  const meat = Math.max(0, input.meatKg) * DAILY_MEAT_KEEP;
  const fruit = Math.max(0, input.fruitKg);
  const need = input.needPerDay;
  if (need <= 0) {
    return {
      grainKg: grain,
      meatKg: meat,
      fruitKg: fruit,
      diet: dietOf(0, 0, 0, 0),
      outlook: 1,
    };
  }
  const days = Math.max(1, input.daysToHarvest);
  const rotDays = Math.min(Math.max(0, input.daysToRot), days);
  // příděly ovoce a masa (energie za den) – rovným dílem, nejvýš strop
  const fruitRation =
    rotDays > 0 ? Math.min(DIET.caps.fruit * need, fruitEnergy(fruit) / rotDays) : 0;
  const meatRation = Math.min(
    DIET.caps.meat * need,
    meatEnergy(meat) / Math.max(1, input.daysToSlaughter),
  );
  // obilí potřebné do sklizně, když se jí dosyta (ovoce jen do zkažení)
  const grainNeed = (need - meatRation) * days - fruitRation * rotDays;
  let outlook = 1;
  let grainToday: number;
  if (grain >= grainNeed) {
    grainToday = need - meatRation - fruitRation;
  } else {
    const even = (grain + fruitRation * rotDays + meatRation * days) / (need * days);
    if (even * need >= fruitRation + meatRation) {
      outlook = even;
      grainToday = even * need - fruitRation - meatRation;
    } else {
      // do zkažení ovoce jen maso a ovoce, obilí zůstane na dny po něm
      grainToday = 0;
      const today = (fruitRation + meatRation) / need;
      const after = days - rotDays;
      const later = after > 0 ? (grain + meatRation * after) / (need * after) : today;
      outlook = Math.min(today, later);
    }
  }
  grainToday = Math.max(0, Math.min(grain, grainToday));
  const meatKg = meatRation / DIET.meatEnergy;
  const fruitKg = fruitRation / APPLE_FOOD_VALUE;
  const diet = dietOf(need, grainToday, meatKg, fruitKg);
  return {
    // poslední den před sklizní se snědí celé zásoby – ořez chyb zaokrouhlení pod nulu
    grainKg: Math.max(0, grain - grainToday),
    meatKg: Math.max(0, meat - meatKg),
    fruitKg: Math.max(0, fruit - fruitKg),
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

/** Zásoba masa vsi (kg) – u vsí bez dobytka 0. */
export function villageMeatKg(state: Pick<VillageState, 'meatKg'>): number {
  return state.meatKg ?? 0;
}

/**
 * Jídlo dne `day` ze stavu na konci předchozího dne – bez změny stavu (stejně jako krok jídla
 * simulace, jen bez vajec dne). 1. 3. ráno ovoce shnije, v nádobách později (`potteryCoverage`
 * – crafts.md).
 */
export function villageMeal(
  state: VillageState,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): DietResult {
  const need = villageFoodNeed(state, day);
  return eatDiet({
    grainKg: state.storesKg,
    meatKg: villageMeatKg(state),
    fruitKg: applesSpoiled(day, potteryCoverage) ? 0 : villageApplesKg(state),
    needPerDay: need,
    daysToHarvest: daysUntilFoodHarvest(state.plan, state.parts, day, need),
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToSlaughter: daysUntilSlaughter(day),
    potteryCoverage,
  });
}
