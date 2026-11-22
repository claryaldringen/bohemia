// Cíl ovoce vsi (orchard.md – Jídlo; steward.md – Sad a jabloně u cest; Martin 22. 11. 2026:
// „U těch jablek - tam nejde ani tak o jablka, ale o práci. Pokud jablka zůstanou na stromech, je
// to ok. Pokud shnijí ta, co lidé nasbírali (utratili za ně práci) je to špatně“): jablka, která
// ves sní, než se zkazí. Podle něj správce sází jabloně u cest a sad a podle něj se sklízí.
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { DIET, villageFoodNeed } from '../core/diet';
import { daysUntilAppleRot } from '../core/food';
import { APPLE_FOOD_VALUE, ORCHARD_WINDOWS } from '../rules';
import type { VillageState } from '../types';
import { seasonBounds } from './orchard';

/** Začátek sklizně jablek (1. 9.) – od něj ves jí jablka do zkažení. */
const HARVEST_START = seasonBounds(ORCHARD_WINDOWS.harvest).start;

/**
 * Jablka (kg), která ves sní ode dne `from` (včetně) do dne, kdy shnijí (1. 3., s nádobami až
 * 1. 5. – `daysUntilAppleRot`), podle pravidla jídla (diet.md – Pořadí jídla; Martin 22. 11. 2026:
 * „Ano“ na otázku „Mají jablka nahrazovat obilí jen tak, aby lidé nepřišli o bílkoviny?“): 5 %
 * potřeby energie (`DIET.fruitShare`) každého dne – potřeba dne jako jídlo dne (`villageFoodNeed`
 * – lidé doma podle věku toho dne a hosté), s dnešními lidmi (kdo se narodí, přibude, nebo kdo
 * umře, odhad nezná). Návrh Clauda: jablka navíc při přebytku bílkovin nepočítá – odhad přebytku
 * ze stád 1. 9. ve Vlkově přebytek nadsadil a nasbíraná jablka shnila (D115 kolo 1); ves je sní ze
 * zásoby, když přebytek opravdu má (`eatDiet`).
 */
export function fruitEatenUntilRotKg(
  state: Pick<VillageState, 'people' | 'guests'>,
  from: number,
  potteryCoverage: number,
): number {
  const days = daysUntilAppleRot(from, potteryCoverage);
  let need = 0;
  for (let d = from; d < from + days; d++) need += villageFoodNeed(state, d);
  return (DIET.fruitShare * need) / APPLE_FOOD_VALUE;
}

/**
 * Cíl ovoce (kg jablek): kolik jablek ves sní od začátku sklizně (1. 9. roku dne `day`) do zkažení
 * – `fruitEatenUntilRotKg` od 1. 9. (sezónní potřeba po dnech, ne roční průměr). Podle něj správce
 * sází (steward-extras.ts); sklizeň se každý den řídí jablky, která ves sní od toho dne
 * (`orchardSeasonDay`).
 */
export function fruitTargetKg(
  state: Pick<VillageState, 'people' | 'guests'>,
  day: number,
  potteryCoverage: number,
): number {
  const { year } = dateOfDayIndex(day);
  return fruitEatenUntilRotKg(state, dayIndexOf({ year, ...HARVEST_START }), potteryCoverage);
}
