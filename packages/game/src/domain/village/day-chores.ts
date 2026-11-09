// Skladba denního minima podle ročního období (population.md – Skladba dne podle ročního období;
// Martin 9. 11. 2026: „v létě se nosí voda, v zimě se nosí dřevo – pokud je sníh, voda se nosit
// nemusí“, „O žních … se omezuje i vaření“). Jedno místo pravdy pro práci dne, plán osevu, dílny
// a dvorec.

import { dateOfDayIndex } from '../calendar';
import { harvestHandsDay } from './harvest-hands';
import { HARVEST_CHORES, type DayChores } from './labor';
import { DAY_CHORES } from './rules';
import { snowLies } from './snow';
import type { VillageState } from './types';
import { weatherOf } from './weather';

const HEATING_MONTHS: ReadonlySet<number> = new Set(DAY_CHORES.heatingMonths);

/**
 * Skladba dne `day` (DAY_CHORES): žňový den (`harvest` – `harvestHandsDay`) – poloviční minimum,
 * voda se domů nenosí; topná sezóna – dříví k okraji lesa; když leží sníh (`snowLies` se zimou
 * roku z počasí kraje – dlouhá zima sníh vrátí, holomráz ho vezme), voda se nenosí.
 */
export function dayChores(
  state: VillageState,
  day: number,
  harvest: boolean = harvestHandsDay(state, day),
): DayChores {
  const { year, month } = dateOfDayIndex(day);
  const wood = HEATING_MONTHS.has(month);
  if (harvest) return wood ? { ...HARVEST_CHORES, wood } : HARVEST_CHORES;
  const snow = snowLies(day, weatherOf(state, year).winter);
  return { minimumShare: 1, water: !snow, wood };
}
