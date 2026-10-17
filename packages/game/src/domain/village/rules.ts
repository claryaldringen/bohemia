import type { DwellingType, FieldSurface, TaskName } from './types';

// Číselná pravidla simulace vsi – hodnoty ze specifikace (docs/design/population.md, fields.md).
export const DWELLINGS = {
  zemnice: {
    capacity: 6,
    cost: 60,
    lifespanYears: 15,
    repairAtEndOfLifePerYear: 35,
    childDeathFactor: 1,
  },
  polozemnice: {
    capacity: 8,
    cost: 220,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 40,
    childDeathFactor: 0.8,
  },
} as const;
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
};
export const AGE = { olderChild: 7, adult: 14, elder: 45 } as const;
export const LABOR_PER_DAY = { olderChild: 0.3, adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
export const BIRTHS_PER_PAIR_PER_YEAR = 1 / 3;
export const CHILD_DEATH_BEFORE_ADULT = 0.4; // → ročně 1 − 0,6^(1/14)
export const ADULT_DEATHS_PER_YEAR = 0.015;
export const ELDER_DEATHS_PER_YEAR = 0.08;
export const CROWDED_BIRTH_FACTOR = 0.3;
export const CROWDED_DEATH_FACTOR = 1.5;
export const LUCKY_YEARS = 30;
export const LUCKY_CHILD_DEATH_FACTOR = 0.5;
export const HUNGER = { birthsStopAt: 0.5, birthsFullAt: 0.95, deathExtraAtZero: 3 } as const;
export const UNLOCK_MIN_ADULTS = 4;
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
export const STORAGE_LOSS_PER_YEAR = 0.1;
export const START_STORES_MONTHS = 18;
export const SOW_RESERVE = 0.1;
export const STORES_HIGH_YEARS = 1.5;
export const YIELD_BASE_KG_PER_HA = 760; // × (0,4 + 0,6 × úrodnost / 100)
export const SEED_KG_PER_HA = 175;
export const UNWEEDED_YIELD = 0.6; // neopletý díl dá 60 % (návrh Clauda, kalibrace)
export const FERTILITY = {
  sowDepletion: 0.12,
  fallowRecovery: 0.05,
  sowableMin: 0.7,
  fallowReady: 0.95,
  forestBonus: 20,
  forestBonusYears: 3,
} as const;
export const FIELD_WORK_PER_HA = { dig: 80, sow: 10, weed: 30, harvest: 50, thresh: 30 } as const; // sklizeň 30 + odnos 20
export const RECLAIM_COST_PER_HA = [
  { maxYears: 2, cost: 0 },
  { maxYears: 5, cost: 40 },
  { maxYears: 10, cost: 60 },
  { maxYears: 15, cost: 150 },
  { maxYears: Infinity, cost: 250 },
] as const;
export const FOUNDING_COST_PER_HA: Record<FieldSurface, number> = {
  meadow: 40,
  shrub: 150,
  forest: 250,
};
export const OBSTACLE_COST = {
  stone: 1,
  boulder: 8,
  tree: 3,
  youngTree: 1,
  snag: 3,
  fallenTree: 2,
  stump: 2,
  shrub: 0.5,
} as const;
export const DISTANCE = { freeM: 100, percentPer10M: 1 } as const;
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
export const DAILY_MIN_PER_HOUSEHOLD = 0.5;
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.12, backlogMaxDays: 60 } as const;
export const COMMON_LABOR_HISTORY_DAYS = 30;
// Okna prací (měsíce včetně); kopání, které se na podzim nestihne, pokračuje v březnu–dubnu.
export const WINDOWS: Record<TaskName, readonly (readonly [number, number])[]> = {
  reclaim: [[9, 11]],
  dig: [
    [9, 11],
    [3, 4],
  ],
  sow: [[3, 4]],
  weed: [[5, 6]],
  harvest: [[7, 8]],
  thresh: [
    [11, 12],
    [1, 2],
  ],
};

/** Roční úmrtnost dětí – za AGE.adult let vymře CHILD_DEATH_BEFORE_ADULT dětí. */
export function childDeathsPerYear(): number {
  return 1 - (1 - CHILD_DEATH_BEFORE_ADULT) ** (1 / AGE.adult);
}
