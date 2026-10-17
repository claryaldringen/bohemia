import { DAILY_MIN_PER_HOUSEHOLD, DOMESTIC } from './rules';
import type { TaskName } from './types';

export interface DayAllocationInput {
  capacity: number;
  households: number;
  people: number;
  tasks: { name: TaskName; remaining: number }[];
  repairNeed: number;
  domesticBacklog: number;
  /** Práce navíc na palivu za den – ves daleko od lesa (forest.md – Palivo); bez údaje 0. */
  fuelExtra?: number;
}

export interface DayAllocation {
  dailyMin: number;
  tasks: Record<TaskName, number>;
  repairs: number;
  domestic: number;
  domesticBacklog: number;
  common: number;
}

/** Denní rozdělení práce: minimum → úlohy v daném pořadí → opravy → domácí výroba → společná práce. */
export function allocateDay(input: DayAllocationInput): DayAllocation {
  let left = Math.max(0, input.capacity);
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const dailyMin = take(DAILY_MIN_PER_HOUSEHOLD * input.households);
  const tasks: Record<TaskName, number> = {
    reclaim: 0,
    dig: 0,
    sow: 0,
    weed: 0,
    harvest: 0,
    thresh: 0,
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
