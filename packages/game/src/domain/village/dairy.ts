import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import { HAY_WINTER_MONTHS } from './hay';
import type { HerdSpecies, VillageState } from './types';

// Mléko a sýr, práce se zvířaty (diet.md – Mléko a sýr, Práce se zvířaty; Martin 18. 10. 2026:
// „Ovce, kozy i krávy jsou mléčná zvířata“). Dojí se dojné kusy stáda v době dojení – krávy od
// května do podzimu, ovce a kozy po odstavu mláďat do konce léta. Mléko se pije čerstvé,
// co se nevypije, zpracuje se na sýr do zásoby. Dojení a zpracování, zimní krmení krav
// a volů a denní péče o prasata a slepice jsou práce vsi; pasení zůstává bez práce (pasou děti).

/** Druhy, které se dojí. */
export type DairySpecies = Extract<HerdSpecies, 'cow' | 'goat' | 'sheep'>;
export const DAIRY_SPECIES: readonly DairySpecies[] = ['cow', 'goat', 'sheep'];

/**
 * diet.md – Mléko a sýr (rešerše 2026-10-18-dairy-protein.md): mléko pro lidi na dojnou samici za
 * rok (po vykrmení mláděte – kráva 300 l, ovce 25 l, koza 60 l), podíl dojných kusů stáda (skot
 * 40 %, ovce a kozy 50 % – návrh Clauda), kdy se dojí (váha dne po měsících: kráva květen–září
 * naplno, říjen–listopad napůl; ovce 15. 5. – 31. 8.; koza květen–září), bílkoviny a energie
 * litru (kg bílkovin, kg obilí – 640 / 700 / 1 050 kcal na litr proti 3 400 kcal na kg obilí),
 * syřidlový sýr (25 % bílkovin, 3 000 kcal/kg ≈ 0,88 kg obilí, zpracováním zůstane 75 % bílkovin
 * mléka – kravské a kozí 10 l na kg, ovčí ≈ 6 l), zásoba sýra ztrácí 15 % ročně.
 */
export const DAIRY = {
  litersPerYear: { cow: 300, goat: 60, sheep: 25 },
  milkedShare: { cow: 0.4, goat: 0.5, sheep: 0.5 },
  proteinPerL: { cow: 0.033, goat: 0.036, sheep: 0.057 },
  energyPerL: { cow: 0.19, goat: 0.21, sheep: 0.31 },
  cheeseProtein: 0.25,
  cheeseEnergy: 0.88,
  cheeseProteinKept: 0.75,
  cheeseLossPerYear: 0.15,
} as const satisfies {
  litersPerYear: Record<DairySpecies, number>;
  milkedShare: Record<DairySpecies, number>;
  proteinPerL: Record<DairySpecies, number>;
  energyPerL: Record<DairySpecies, number>;
  cheeseProtein: number;
  cheeseEnergy: number;
  cheeseProteinKept: number;
  cheeseLossPerYear: number;
};

/** Váha dojení dne po druzích: 1 = plná dojivost, 0,5 = napůl, 0 = nedojí se. */
function milkingWeight(species: DairySpecies, month: number, dayOfMonth: number): number {
  if (species === 'cow') {
    if (month >= 5 && month <= 9) return 1;
    return month === 10 || month === 11 ? 0.5 : 0;
  }
  if (species === 'goat') return month >= 5 && month <= 9 ? 1 : 0;
  if (month === 5) return dayOfMonth >= 15 ? 1 : 0;
  return month >= 6 && month <= 8 ? 1 : 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Součet vah dojení za rok (nepřestupný) – podle něj se roční dojivost dělí na dny. */
const SEASON_WEIGHT: Record<DairySpecies, number> = (() => {
  const total = (species: DairySpecies): number => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= MONTH_DAYS[m - 1]!; d++) sum += milkingWeight(species, m, d);
    }
    return sum;
  };
  return { cow: total('cow'), goat: total('goat'), sheep: total('sheep') };
})();

/**
 * diet.md – Práce se zvířaty (rešerše, člověkoden = 10 hodin): dojení na dojný kus a den
 * (kráva 2 × 5 min, koza 0,013, ovce 0,005 čd), sýr 1 člověkoden na 100 l zpracovaného mléka
 * (návrh Clauda), zimní krmení, voda a kydání krávy nebo vola 20 min denně (listopad–březen),
 * ovce nebo kozy 3 min (Martin 19. 10. 2026 – v zimě jedí seno taky; návrh Clauda), prase u domu
 * 2 min, slepice půl minuty denně (návrh Clauda).
 */
export const ANIMAL_CARE = {
  milkingPerHead: { cow: 0.017, goat: 0.013, sheep: 0.005 },
  cheesePerL: 0.01,
  winterPerHead: 0.033,
  smallWinterPerHead: 0.005,
  pigPerHead: 0.0033,
  henPerHead: 0.0008,
} as const;

/** Den roku v nepřestupném roce (0–364) – 29. 2. jako 28. 2. (v únoru se nedojí). */
function commonDayOfYear(month: number, dayOfMonth: number): number {
  let index = Math.min(dayOfMonth, MONTH_DAYS[month - 1]!) - 1;
  for (let m = 1; m < month; m++) index += MONTH_DAYS[m - 1]!;
  return index;
}

/** Měsíce, kdy se nějaký druh dojí (kráva květen–listopad, koza a ovce uvnitř). */
const MILKING_MONTHS = { from: 5, to: 11 } as const;

/**
 * Kumulované váhy dojení po dnech nepřestupného roku: `[druh][i]` = součet vah dnů 0 až i;
 * `days[i]` = kolik z nich je v měsících dojení. Váhy jsou násobky 0,5 – součty jsou přesné.
 */
const CUMULATIVE: { species: Record<DairySpecies, number[]>; days: number[] } = (() => {
  const species = { cow: [] as number[], goat: [] as number[], sheep: [] as number[] };
  const days: number[] = [];
  const sum = { cow: 0, goat: 0, sheep: 0 };
  let milkingDays = 0;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= MONTH_DAYS[m - 1]!; d++) {
      for (const s of DAIRY_SPECIES) {
        sum[s] += milkingWeight(s, m, d);
        species[s].push(sum[s]);
      }
      if (m >= MILKING_MONTHS.from && m <= MILKING_MONTHS.to) milkingDays++;
      days.push(milkingDays);
    }
  }
  return { species, days };
})();

/** Počet dní v měsících dojení za rok. */
const MILKING_MONTH_DAYS = CUMULATIVE.days[CUMULATIVE.days.length - 1]!;

/** Kolik dní v měsících dojení uplynulo do konce dne `day` včetně (od začátku letopočtu). */
function milkingDaysThrough(day: number): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  return year * MILKING_MONTH_DAYS + CUMULATIVE.days[commonDayOfYear(month, dayOfMonth)]!;
}

/**
 * Mléko, které stáda `herds` dají ode dne `from` do dne `to` včetně (energie v kg obilí) – každý
 * den nejvýš `capPerDay` (víc se nevypije). Pro výhled jídla do sklizně (diet.md – Hlad, osev podle
 * stravy): strop se počítá na dny v měsících dojení, ne po dnech (stačí odhad). Bez dnů 0.
 */
export function milkEnergyBetween(
  herds: Record<HerdSpecies, number>,
  from: number,
  to: number,
  capPerDay: number,
): number {
  if (to < from) return 0;
  const start = dateOfDayIndex(from - 1);
  const end = dateOfDayIndex(to);
  const startIndex = commonDayOfYear(start.month, start.day);
  const endIndex = commonDayOfYear(end.month, end.day);
  let energy = 0;
  for (const species of DAIRY_SPECIES) {
    const cumulative = CUMULATIVE.species[species];
    const weight =
      (end.year - start.year) * SEASON_WEIGHT[species] +
      cumulative[endIndex]! -
      cumulative[startIndex]!;
    if (weight <= 0) continue;
    const liters =
      (herds[species] * DAIRY.milkedShare[species] * DAIRY.litersPerYear[species] * weight) /
      SEASON_WEIGHT[species];
    energy += liters * DAIRY.energyPerL[species];
  }
  const milkingDays = milkingDaysThrough(to) - milkingDaysThrough(from - 1);
  return milkingDays > 0 ? Math.min(energy, Math.max(0, capPerDay) * milkingDays) : 0;
}

/** Dojí se druh v den? */
export function isMilkingSeason(species: DairySpecies, day: number): boolean {
  const { month, day: dayOfMonth } = dateOfDayIndex(day);
  return milkingWeight(species, month, dayOfMonth) > 0;
}

/** Mléko za den: litry, bílkoviny (kg) a energie (kg obilí). */
export interface MilkYield {
  liters: number;
  proteinKg: number;
  energy: number;
}

/** Možné mléko dne ze stád (bez ohledu na práci). */
export function dailyMilk(herds: Record<HerdSpecies, number>, day: number): MilkYield {
  const { month, day: dayOfMonth } = dateOfDayIndex(day);
  let liters = 0;
  let proteinKg = 0;
  let energy = 0;
  for (const species of DAIRY_SPECIES) {
    const weight = milkingWeight(species, month, dayOfMonth);
    if (weight <= 0) continue;
    const l =
      (herds[species] * DAIRY.milkedShare[species] * DAIRY.litersPerYear[species] * weight) /
      SEASON_WEIGHT[species];
    liters += l;
    proteinKg += l * DAIRY.proteinPerL[species];
    energy += l * DAIRY.energyPerL[species];
  }
  return { liters, proteinKg, energy };
}

/** Mléko stád za rok (litry, kg bílkovin a energie v kg obilí). */
export function yearlyMilk(herds: Record<HerdSpecies, number>): MilkYield {
  let liters = 0;
  let proteinKg = 0;
  let energy = 0;
  for (const species of DAIRY_SPECIES) {
    const l = herds[species] * DAIRY.milkedShare[species] * DAIRY.litersPerYear[species];
    liters += l;
    proteinKg += l * DAIRY.proteinPerL[species];
    energy += l * DAIRY.energyPerL[species];
  }
  return { liters, proteinKg, energy };
}

/** Sýr z mléka s `proteinKg` bílkovin (kg) – zpracováním zůstane 75 % bílkovin, sýr má 25 %. */
export function cheeseFromMilk(proteinKg: number): number {
  return (proteinKg * DAIRY.cheeseProteinKept) / DAIRY.cheeseProtein;
}

/** Kolik práce se zvířaty ves dnes potřebuje (člověkodny) – dojení a ostatní péče. */
export interface AnimalCareNeed {
  milking: number;
  care: number;
}

/**
 * Práce se zvířaty dne: dojení dojných kusů v době dojení a výroba sýra z `cheeseMilkL` litrů,
 * zimní péče o krávy a voly (`oxen` – spřežení a telata ve výcviku), ovce a kozy, denní péče
 * o prasata a slepice (`hens`).
 */
export function animalCareNeed(
  herds: Record<HerdSpecies, number>,
  oxen: number,
  hens: number,
  day: number,
  cheeseMilkL = 0,
): AnimalCareNeed {
  let milking = cheeseMilkL * ANIMAL_CARE.cheesePerL;
  for (const species of DAIRY_SPECIES) {
    if (!isMilkingSeason(species, day)) continue;
    milking += herds[species] * DAIRY.milkedShare[species] * ANIMAL_CARE.milkingPerHead[species];
  }
  const winter = HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const care =
    (winter
      ? (herds.cow + oxen) * ANIMAL_CARE.winterPerHead +
        (herds.sheep + herds.goat) * ANIMAL_CARE.smallWinterPerHead
      : 0) +
    herds.pig * ANIMAL_CARE.pigPerHead +
    hens * ANIMAL_CARE.henPerHead;
  return { milking, care };
}

/** Zásoba sýra (kg) – u vsí bez mléka 0. */
export function villageCheeseKg(state: Pick<VillageState, 'cheeseKg'>): number {
  return state.cheeseKg ?? 0;
}

/** Začátek dojení naplno (1. 5.) – sýr vydrží do něj a jí se rovným dílem až do něj. */
export const MILKING_START = { month: 5, day: 1 } as const;

const COMMON_YEAR_DAYS = 365;

/**
 * Dní do příštího začátku dojení (1. 5.) bez jeho dne – sýr se jí rovným dílem do něj (v době
 * dojení skoro celý rok, takže se ho jí málo). Bez dayIndexOf za koncem světa.
 */
export function daysUntilMilking(day: number): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed =
    month > MILKING_START.month ||
    (month === MILKING_START.month && dayOfMonth >= MILKING_START.day);
  const thisYear = dayIndexOf({ year, ...MILKING_START });
  const next = passed ? thisYear + COMMON_YEAR_DAYS + (isLeapYear(year + 1) ? 1 : 0) : thisYear;
  return next - day;
}
