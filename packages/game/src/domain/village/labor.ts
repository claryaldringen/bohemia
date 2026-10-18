import { dailyMinPerHousehold } from './productivity';
import { DOMESTIC } from './rules';
import type { OrchardTaskName, TaskName } from './types';

/**
 * Sezónní práce v rozdělení práce vsi – polní (fields.md), orba rádlem, seč sena (oxen.md),
 * porážka a uzení, dojení a péče o zvířata (diet.md) a v sadech (orchard.md).
 */
export type LaborTaskName =
  TaskName | OrchardTaskName | 'plough' | 'mow' | 'slaughter' | 'milking' | 'animal-care';

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
  /**
   * Násobek veškeré práce vsi – štěstí (happiness.md – Účinek na práci) krát ostatní meze
   * produktivity; bez údaje 1.
   */
  productivity?: number;
}

export interface DayAllocation {
  dailyMin: number;
  tasks: Record<LaborTaskName, number>;
  /** Práce pro jednotlivé úlohy vstupu v jejich pořadí (stejný název může být víckrát – plodiny). */
  taskAmounts: number[];
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
  let left = Math.max(0, input.capacity * (input.productivity ?? 1));
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
    plough: 0,
    mow: 0,
    slaughter: 0,
    milking: 0,
    'animal-care': 0,
    'orchard-care': 0,
    'orchard-harvest': 0,
  };
  const taskAmounts = input.tasks.map((task) => {
    const amount = take(task.remaining);
    tasks[task.name] += amount;
    return amount;
  });
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
  return { dailyMin, tasks, taskAmounts, repairs, domestic, domesticBacklog, common: left };
}
