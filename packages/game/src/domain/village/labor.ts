import { dailyMinPerHousehold } from './productivity';
import { DOMESTIC } from './rules';
import type { OrchardTaskName, TaskName } from './types';

/** Sezónní práce v rozdělení práce vsi – polní (fields.md) a v sadech (orchard.md). */
export type LaborTaskName = TaskName | OrchardTaskName;

export interface DayAllocationInput {
  capacity: number;
  households: number;
  people: number;
  tasks: { name: LaborTaskName; remaining: number }[];
  repairNeed: number;
  domesticBacklog: number;
  /** Pokrytí nádobami 0–1 – posouvá denní minimum mezi mezemi (crafts.md). */
  potteryCoverage: number;
  /** Práce navíc na palivu za den – ves daleko od lesa (forest.md – Palivo); bez údaje 0. */
  fuelExtra?: number;
}

export interface DayAllocation {
  dailyMin: number;
  tasks: Record<LaborTaskName, number>;
  repairs: number;
  domestic: number;
  domesticBacklog: number;
  common: number;
}

/**
 * Denní rozdělení práce: minimum → sezónní úlohy (polní i v sadech) v daném pořadí → opravy →
 * domácí výroba → společná práce.
 */
export function allocateDay(input: DayAllocationInput): DayAllocation {
  let left = Math.max(0, input.capacity);
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const dailyMin = take(dailyMinPerHousehold(input.potteryCoverage) * input.households);
  const tasks: Record<LaborTaskName, number> = {
    reclaim: 0,
    dig: 0,
    sow: 0,
    weed: 0,
    harvest: 0,
    thresh: 0,
    'orchard-care': 0,
    'orchard-harvest': 0,
  };
  for (const task of input.tasks) tasks[task.name] += take(task.remaining);
  const repairs = take(input.repairNeed);
  const todayNeed =
    DOMESTIC.perHousehold * input.households +
    DOMESTIC.perPerson * input.people +
    Math.max(0, input.fuelExtra ?? 0);
  const domestic = take(todayNeed + input.domesticBacklog);
  const domesticBacklog = Math.max(
    0,
    Math.min(DOMESTIC.backlogMaxDays * todayNeed, input.domesticBacklog + todayNeed - domestic),
  );
  return { dailyMin, tasks, repairs, domestic, domesticBacklog, common: left };
}
