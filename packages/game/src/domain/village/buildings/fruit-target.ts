// Cíl ovoce vsi (orchard.md – Jídlo; steward.md – Sad a jabloně u cest; Martin 22. 11. 2026:
// „U těch jablek - tam nejde ani tak o jablka, ale o práci. Pokud jablka zůstanou na stromech, je
// to ok. Pokud shnijí ta, co lidé nasbírali (utratili za ně práci) je to špatně“): jablka, která
// ves sní, než se zkazí. Podle něj správce sází jabloně u cest a sad a podle něj se sklízí.
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { DIET, meatEnergy } from '../core/diet';
import { daysUntilAppleRot } from '../core/food';
import { yearlyFoodNeed } from '../fields/field-food';
import { yearlyMilk } from '../livestock/dairy';
import { dailyEggsKg, HERD_SPECIES, villageDams, yearlyMeatPerHead } from '../livestock/livestock';
import { APPLE_FOOD_VALUE, ORCHARD_WINDOWS } from '../rules';
import type { VillageState } from '../types';
import { seasonBounds } from './orchard';

const DAYS_PER_YEAR = 365;
/** Začátek sklizně jablek (1. 9.) – od něj ves jí jablka do zkažení. */
const HARVEST_START = seasonBounds(ORCHARD_WINDOWS.harvest).start;

/**
 * Cíl ovoce (kg jablek): kolik jablek ves sní od začátku sklizně (1. 9.) do dne, kdy shnijí
 * (1. 3., s nádobami až 1. 5. – `daysUntilAppleRot`), v pořadí jídla – napřed maso, mléko a sýr
 * a vejce, pak ovoce rovným dílem do zkažení, až po něm luštěniny a obilí (diet.md – Pořadí jídla;
 * Martin 18. 11. 2026 bez stropů). Návrh Clauda: potřeba lidí vsi (`yearlyFoodNeed`) bez energie,
 * kterou stáda a slepice dají za rok (mléko dojných samic – `yearlyMilk`, maso mláďat nad chovné
 * stádo – `yearlyMeatPerHead`, vejce dne), rozložená rovným dílem na dny roku – na dny od sklizně
 * do zkažení. Lidé, stáda a nádoby dnešní; den určí jen rok sklizně (stejný počet dní do zkažení
 * kdykoli v roce).
 */
export function fruitTargetKg(
  state: Pick<VillageState, 'people' | 'livestock' | 'dwellings' | 'wildlife'>,
  day: number,
  potteryCoverage: number,
): number {
  const { year } = dateOfDayIndex(day);
  const days = daysUntilAppleRot(dayIndexOf({ year, ...HARVEST_START }), potteryCoverage);
  const herds = state.livestock?.herds;
  const meatKg = herds
    ? HERD_SPECIES.reduce((sum, s) => sum + herds[s] * yearlyMeatPerHead(s), 0)
    : 0;
  const animal =
    yearlyMilk(villageDams(state)).energy +
    meatEnergy(meatKg) +
    dailyEggsKg(state) * DAYS_PER_YEAR * DIET.energy.eggs;
  const fruitEnergy = (Math.max(0, yearlyFoodNeed(state, day) - animal) * days) / DAYS_PER_YEAR;
  return fruitEnergy / APPLE_FOOD_VALUE;
}
