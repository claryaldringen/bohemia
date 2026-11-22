// Cíl ovoce vsi (orchard.md – Jídlo; steward.md – Sad a jabloně u cest; Martin 22. 11. 2026:
// „U těch jablek - tam nejde ani tak o jablka, ale o práci. Pokud jablka zůstanou na stromech, je
// to ok. Pokud shnijí ta, co lidé nasbírali (utratili za ně práci) je to špatně“): jablka, která
// ves sní, než se zkazí. Podle něj správce sází jabloně u cest a sad a podle něj se sklízí.
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { DIET } from '../core/diet';
import { daysUntilAppleRot } from '../core/food';
import { yearlyFoodNeed } from '../fields/field-food';
import { APPLE_FOOD_VALUE, ORCHARD_WINDOWS } from '../rules';
import type { VillageState } from '../types';
import { seasonBounds } from './orchard';

const DAYS_PER_YEAR = 365;
/** Začátek sklizně jablek (1. 9.) – od něj ves jí jablka do zkažení. */
const HARVEST_START = seasonBounds(ORCHARD_WINDOWS.harvest).start;

/**
 * Cíl ovoce (kg jablek): kolik jablek ves sní od začátku sklizně (1. 9.) do dne, kdy shnijí
 * (1. 3., s nádobami až 1. 5. – `daysUntilAppleRot`), podle pravidla jídla (diet.md – Pořadí
 * jídla; Martin 22. 11. 2026: „Ano“ na otázku „Mají jablka nahrazovat obilí jen tak, aby lidé
 * nepřišli o bílkoviny?“ – „ves sází jen tolik stromů, kolik jablek sní, aniž by přišla
 * o bílkoviny, a zbytek obilí jí jako dnes“): jablka do 5 % potřeby energie (`DIET.fruitShare`)
 * každý den do zkažení – potřeba lidí za rok (`yearlyFoodNeed`) rovným dílem na dny. Návrh Clauda:
 * jablka navíc při přebytku bílkovin cíl nepočítá – odhad přebytku ze stád 1. 9. (roční průměr
 * i maso porážky 1. 11.) ve Vlkově přebytek nadsadil a nasbíraná jablka shnila (D115 kolo 1);
 * ves je sní ze zásoby, když přebytek opravdu má (`eatDiet`). Lidé a nádoby dnešní; den určí jen
 * rok sklizně.
 */
export function fruitTargetKg(
  state: Pick<VillageState, 'people'>,
  day: number,
  potteryCoverage: number,
): number {
  const { year } = dateOfDayIndex(day);
  const days = daysUntilAppleRot(dayIndexOf({ year, ...HARVEST_START }), potteryCoverage);
  return (DIET.fruitShare * yearlyFoodNeed(state, day) * days) / DAYS_PER_YEAR / APPLE_FOOD_VALUE;
}
