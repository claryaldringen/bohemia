import { dateOfDayIndex, dayIndexOf } from '../calendar';
import { STORAGE_LOSS_PER_YEAR } from './rules';

const HARVEST_MONTH = 8;
const HARVEST_DAY = 31;

/** Dní do konce sklizňového dne 31. 8. včetně dneška (31. 8. → 1, 1. 9. → celý rok). */
export function daysUntilHarvest(day: number): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const passed = month > HARVEST_MONTH || (month === HARVEST_MONTH && dayOfMonth > HARVEST_DAY);
  const harvestYear = passed ? year + 1 : year;
  return dayIndexOf({ year: harvestYear, month: HARVEST_MONTH, day: HARVEST_DAY }) - day + 1;
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
  return { storesKg: afterLoss - needPerDayKg * satiation, satiation };
}
