import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import { APPLE_FOOD_VALUE, APPLE_ROT_DAY, HARVEST_DAY, STORAGE_LOSS_PER_YEAR } from './rules';

const COMMON_YEAR_DAYS = 365;

/** Dní do konce sklizňového dne 31. 8. včetně dneška (31. 8. → 1, 1. 9. → celý rok). */
export function daysUntilHarvest(day: number): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed =
    month > HARVEST_DAY.month || (month === HARVEST_DAY.month && dayOfMonth > HARVEST_DAY.day);
  const harvest = dayIndexOf({ year, ...HARVEST_DAY });
  // Příští sklizeň je o rok dál, s přestupným únorem příštího roku o den víc. Bez dayIndexOf –
  // na podzim 1499 by sahal na rok 1500, který už ve světě není.
  const next = passed ? harvest + COMMON_YEAR_DAYS + (isLeapYear(year + 1) ? 1 : 0) : harvest;
  return next - day + 1;
}

/**
 * Jeden den jídla: nejdřív ztráta zásob (10 % ročně rovnoměrně), pak příděl.
 * Vystačí-li zásoby do sklizně, jí se dosyta; jinak se zbytek dělí rovně do sklizně.
 */
export function eatDay(
  storesKg: number,
  needPerDayKg: number,
  daysToHarvest: number,
): { storesKg: number; satiation: number } {
  const afterLoss = storesKg * (1 - STORAGE_LOSS_PER_YEAR) ** (1 / 365);
  const needUntilHarvest = needPerDayKg * daysToHarvest;
  if (afterLoss >= needUntilHarvest) {
    return { storesKg: afterLoss - needPerDayKg, satiation: 1 };
  }
  const satiation = afterLoss / needUntilHarvest;
  // poslední den před sklizní se snědí celé zásoby – ořez chyby zaokrouhlení pod nulu
  return { storesKg: Math.max(0, afterLoss - needPerDayKg * satiation), satiation };
}

/**
 * Kolik dní ještě jde jíst jablka včetně dneška – do příštího 1. 3., kdy před jídlem shnijí
 * (orchard.md). Jablka jsou jen od sklizně v září do konce února.
 */
export function daysUntilAppleRot(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  if (month < APPLE_ROT_DAY.month) return dayIndexOf({ year, ...APPLE_ROT_DAY }) - day;
  // 1. 3. příštího roku – bez dayIndexOf (na podzim 1499 by sahal mimo svět)
  const nextRot =
    dayIndexOf({ year, month: 12, day: 31 }) + 1 + JANUARY_DAYS + (isLeapYear(year + 1) ? 29 : 28);
  return nextRot - day;
}

/** Shnijí v tento den ráno jablka (1. 3.)? Pak se ten den už nejí. */
export function isAppleRotDay(day: number): boolean {
  const { month, day: dayOfMonth } = dateOfDayIndex(day);
  return month === APPLE_ROT_DAY.month && dayOfMonth === APPLE_ROT_DAY.day;
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
 * Jeden den jídla se sadem (orchard.md – Jídlo): nejdřív ztráta zásob obilí (jablka ztrátu
 * nemají, celá shnijí 1. 3.), pak příděl. Jablka (1 kg = APPLE_FOOD_VALUE kg obilí) se jí
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
): MealResult {
  if (applesKg <= 0 || daysToRot <= 0) {
    const meal = eatDay(storesKg, needPerDayKg, daysToHarvest);
    return { ...meal, applesKg: Math.max(0, applesKg), outlook: meal.satiation };
  }
  const grain = storesKg * (1 - STORAGE_LOSS_PER_YEAR) ** (1 / 365);
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
