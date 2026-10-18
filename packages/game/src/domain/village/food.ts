import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import { storageLossPerYear } from './productivity';
import {
  APPLE_FOOD_VALUE,
  APPLE_POTTERY_KEEP_DAY,
  APPLE_ROT_DAY,
  HARVEST_DAY,
  WINTER_HARVEST_DAY,
} from './rules';

const COMMON_YEAR_DAYS = 365;

/** Dní do konce dne `target` (měsíc a den po únoru) včetně dneška; po něm do příštího roku. */
function daysUntilYearly(day: number, target: { month: number; day: number }): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed = month > target.month || (month === target.month && dayOfMonth > target.day);
  const thisYear = dayIndexOf({ year, ...target });
  // Příští termín je o rok dál, s přestupným únorem příštího roku o den víc. Bez dayIndexOf –
  // na podzim 1499 by sahal na rok 1500, který už ve světě není.
  const next = passed ? thisYear + COMMON_YEAR_DAYS + (isLeapYear(year + 1) ? 1 : 0) : thisYear;
  return next - day + 1;
}

/** Dní do konce sklizňového dne jaře 31. 8. včetně dneška (31. 8. → 1, 1. 9. → celý rok). */
export function daysUntilHarvest(day: number): number {
  return daysUntilYearly(day, HARVEST_DAY);
}

/** Dní do konce sklizně ozimu 31. 7. včetně dneška (31. 7. → 1, 1. 8. → skoro rok). */
export function daysUntilWinterHarvest(day: number): number {
  return daysUntilYearly(day, WINTER_HARVEST_DAY);
}

/**
 * Jeden den jídla: nejdřív ztráta zásob (meze podle pokrytí nádobami – bez hrnčíře 10 % ročně,
 * rovnoměrně), pak příděl. Vystačí-li zásoby do sklizně, jí se dosyta; jinak se zbytek dělí
 * rovně do sklizně.
 */
export function eatDay(
  storesKg: number,
  needPerDayKg: number,
  daysToHarvest: number,
  potteryCoverage: number,
): { storesKg: number; satiation: number } {
  const afterLoss = storesKg * (1 - storageLossPerYear(potteryCoverage)) ** (1 / 365);
  const needUntilHarvest = needPerDayKg * daysToHarvest;
  if (afterLoss >= needUntilHarvest) {
    return { storesKg: afterLoss - needPerDayKg, satiation: 1 };
  }
  const satiation = afterLoss / needUntilHarvest;
  // poslední den před sklizní se snědí celé zásoby – ořez chyby zaokrouhlení pod nulu
  return { storesKg: Math.max(0, afterLoss - needPerDayKg * satiation), satiation };
}

/** Dní od 1. 3. do 1. 5. – o tolik déle vydrží jablka v nádobách (březen a duben, vždy 61). */
const POTTERY_KEEP_SPAN_DAYS =
  dayIndexOf({ year: 501, ...APPLE_POTTERY_KEEP_DAY }) -
  dayIndexOf({ year: 501, ...APPLE_ROT_DAY });

/**
 * O kolik celých dní po 1. 3. jablka vydrží v nádobách (crafts.md – Účinek, orchard.md): plné
 * pokrytí nádobami do 1. 5., částečné poměrně (pokrytí × 61 dní, zaokrouhleno), bez hrnčíře 0.
 */
export function appleKeepDays(potteryCoverage: number): number {
  return Math.round(Math.min(1, Math.max(0, potteryCoverage)) * POTTERY_KEEP_SPAN_DAYS);
}

/**
 * Kolik dní ještě jde jíst jablka včetně dneška – do dne, kdy před jídlem shnijí: příštího 1. 3.,
 * s nádobami až o `appleKeepDays` později (orchard.md, crafts.md). Jablka jsou jen od sklizně
 * v září do zkažení.
 */
export function daysUntilAppleRot(day: number, potteryCoverage = 0): number {
  const { year } = dateOfDayIndex(day);
  const keep = appleKeepDays(potteryCoverage);
  const thisYear = dayIndexOf({ year, ...APPLE_ROT_DAY }) + keep;
  if (day < thisYear) return thisYear - day;
  // 1. 3. příštího roku – bez dayIndexOf (na podzim 1499 by sahal mimo svět)
  const nextRot =
    dayIndexOf({ year, month: 12, day: 31 }) + 1 + JANUARY_DAYS + (isLeapYear(year + 1) ? 29 : 28);
  return nextRot + keep - day;
}

/** Shnijí v tento den ráno jablka (1. 3., s nádobami později)? Pak se ten den už nejí. */
export function isAppleRotDay(day: number, potteryCoverage = 0): boolean {
  const { year } = dateOfDayIndex(day);
  return day === dayIndexOf({ year, ...APPLE_ROT_DAY }) + appleKeepDays(potteryCoverage);
}

/**
 * Jsou v tento den ráno jablka už zkažená? Od dne zkažení podle dnešního pokrytí nádobami do
 * 1. 5. včetně – jablka z loňské sklizně tu už nikdo nejí. Pokrytí se mění den po dni, proto
 * se nehlídá jen jeden den (den zkažení se může posunout před dnešek).
 */
export function applesSpoiled(day: number, potteryCoverage = 0): boolean {
  const { year } = dateOfDayIndex(day);
  const rot = dayIndexOf({ year, ...APPLE_ROT_DAY });
  return day >= rot + appleKeepDays(potteryCoverage) && day <= rot + POTTERY_KEEP_SPAN_DAYS;
}

/** Dní v lednu – 1. 3. příštího roku je 31 + únor dní po Silvestru. */
const JANUARY_DAYS = 31;

/** Výsledek jídla dne se zásobami obilí i jablek. */
export interface MealResult {
  storesKg: number;
  applesKg: number;
  satiation: number;
  /**
   * Nejnižší příděl do sklizně podle výhledu 0–1: dnešní nasycení, nebo příděl obilí po tom, co
   * jablka 1. 3. shnijí, je-li menší. Pod 1 ves hladoví (upozornění hned, ne až 1. 3.).
   */
  outlook: number;
}

/**
 * Jeden den jídla se sadem (orchard.md – Jídlo): nejdřív ztráta zásob obilí (meze podle pokrytí
 * nádobami jako `eatDay`; jablka ztrátu nemají, celá shnijí 1. 3.), pak příděl. Jablka (1 kg = APPLE_FOOD_VALUE kg obilí) se jí
 * přednostně a jen do konce února (`daysToRot`). Vystačí-li jídlo do sklizně, jí se dosyta.
 * Když ne, dělí se rovně do sklizně – pokud se při takovém přídělu stihnou snědat všechna
 * jablka; jinak se do zkažení jí jen jablka (rovným dílem, nejvýš dosyta) a obilí zůstane na
 * dobu po nich. Bez jablek přesně jako `eatDay`.
 */
export function eatMeal(
  storesKg: number,
  applesKg: number,
  needPerDayKg: number,
  daysToHarvest: number,
  daysToRot: number,
  potteryCoverage: number,
): MealResult {
  if (applesKg <= 0 || daysToRot <= 0) {
    const meal = eatDay(storesKg, needPerDayKg, daysToHarvest, potteryCoverage);
    return { ...meal, applesKg: Math.max(0, applesKg), outlook: meal.satiation };
  }
  const grain = storesKg * (1 - storageLossPerYear(potteryCoverage)) ** (1 / 365);
  if (needPerDayKg <= 0) return { storesKg: grain, applesKg, satiation: 1, outlook: 1 };
  const apples = applesKg * APPLE_FOOD_VALUE; // v kg obilí
  const need = needPerDayKg;
  const rotDays = Math.min(daysToRot, daysToHarvest);
  let satiation = 1;
  let outlook = 1;
  if (grain + Math.min(apples, need * rotDays) < need * daysToHarvest) {
    const even = (grain + apples) / (need * daysToHarvest);
    if (apples <= even * need * rotDays) {
      satiation = Math.min(1, even);
      outlook = satiation;
    } else {
      // do zkažení jen jablka, obilí zůstane na dny po nich – výhled je příděl obilí potom
      satiation = Math.min(1, apples / (need * rotDays));
      const after = daysToHarvest - rotDays;
      outlook = after > 0 ? Math.min(satiation, grain / (need * after)) : satiation;
    }
  }
  const eaten = need * satiation;
  const fromApples = Math.min(apples, eaten);
  return {
    storesKg: Math.max(0, grain - (eaten - fromApples)),
    applesKg: Math.max(0, (apples - fromApples) / APPLE_FOOD_VALUE),
    satiation,
    outlook,
  };
}
