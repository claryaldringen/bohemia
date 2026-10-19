import { ageGroup } from './people';
import { dailyMinPerHousehold } from './productivity';
import { LABOR_PER_DAY } from './rules';
import type { OrchardTaskName, Person, TaskName } from './types';

/**
 * Sezónní práce v rozdělení práce vsi – polní (fields.md), orba rádlem, seč sena (oxen.md),
 * porážka a uzení (diet.md) a v sadech (orchard.md). Práce se zvířaty a domácí výroba jdou bokem
 * (population.md – Práce): dojí a krmí ženy, pasou výrostci, domácí výrobu obstarají ženy.
 */
export type LaborTaskName = TaskName | OrchardTaskName | 'plough' | 'mow' | 'slaughter';

export interface DayAllocationInput {
  /** Pracovní síla vsi – dospělí (`laborPerDay`). */
  capacity: number;
  /**
   * Starší lidé po domácnostech vsi (počet, jedna položka na domácnost – `householdElders`) –
   * kryjí napřed denní minimum své domácnosti (`adultDailyMin`).
   */
  householdElders: readonly number[];
  tasks: { name: LaborTaskName; remaining: number }[];
  /** Pokrytí nádobami 0–1 – posouvá denní minimum mezi mezemi (crafts.md). */
  potteryCoverage: number;
  /**
   * Násobek veškeré práce vsi – štěstí (happiness.md – Účinek na práci) krát ostatní meze
   * produktivity; bez údaje 1.
   */
  productivity?: number;
  /**
   * Lidé na výpravách k sousedům (trade.md – Doprava, Martin 19. 10. 2026): nosiči, honáci
   * a pomocníci u vozů jsou na cestě – jejich člověkodny jdou hned po denním minimu, před
   * úlohami dne (`expeditionLaborToday`); bez údaje 0.
   */
  away?: number;
}

export interface DayAllocation {
  /** Denní minimum domácností z práce vsi – co po starších zbude na dospělé. */
  dailyMin: number;
  /** Denní minimum, které pokryli starší svou prací (mimo práci vsi – jen pro postavy). */
  eldersDailyMin: number;
  /** Práce lidí na výpravách (nejvýš `away`, po denním minimu). */
  away: number;
  tasks: Record<LaborTaskName, number>;
  /** Práce pro jednotlivé úlohy vstupu v jejich pořadí (stejný název může být víckrát – plodiny). */
  taskAmounts: number[];
  /**
   * Společná práce – co zbude po potřebných úlohách; jde napřed do staveb, pak do oprav obydlí
   * (`afterConstructions`). Ukazatel volné práce a „má na to“ (`commonLaborHistory`).
   */
  common: number;
}

/**
 * Denní rozdělení práce (population.md – Práce; Martin 19. 10. 2026: „pokud se něco staví, tak čas
 * věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“): minimum →
 * lidé na výpravách → potřebné sezónní úlohy (polní, v sadech, seč, porážka) v daném pořadí →
 * společná práce (stavby, po nich opravy obydlí – `afterConstructions`). Denní minimum domácnosti
 * kryjí napřed její starší (`adultDailyMin`).
 */
export function allocateDay(input: DayAllocationInput): DayAllocation {
  const productivity = input.productivity ?? 1;
  let left = Math.max(0, input.capacity * productivity);
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const minimum = dailyMinPerHousehold(input.potteryCoverage);
  const adults = input.householdElders.reduce(
    (sum, elders) => sum + adultDailyMin(minimum, elders, productivity),
    0,
  );
  const eldersDailyMin = minimum * input.householdElders.length - adults;
  const dailyMin = take(adults);
  // výpravy (trade.md – Doprava): nosiči jsou na cestě celé dny – po denním minimu, před vším
  // ostatním
  const away = take(input.away ?? 0);
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
    'orchard-care': 0,
    'orchard-harvest': 0,
  };
  const taskAmounts = input.tasks.map((task) => {
    const amount = take(task.remaining);
    tasks[task.name] += amount;
    return amount;
  });
  return { dailyMin, eldersDailyMin, away, tasks, taskAmounts, common: left };
}

/**
 * Kolik denního minima domácnosti (`minimum`) zbude na dospělé (population.md – Práce; Martin
 * 19. 10. 2026: „Starší lidé se zase starají o malé děti, a uvolňují práci zbytku rodiny.“; návrh
 * Clauda): starší (`elders`) ho kryjí napřed – hlídání malých dětí, oheň, vaření –, každý
 * `LABOR_PER_DAY.elder` × produktivita; dospělí dají jen zbytek. Co starším nad minimum zbude, do
 * práce vsi nejde a propadne.
 */
export function adultDailyMin(minimum: number, elders: number, productivity = 1): number {
  return Math.max(0, minimum - LABOR_PER_DAY.elder * Math.max(0, elders) * productivity);
}

/**
 * Starší lidé po domácnostech (počet, v pořadí prvního člověka domácnosti) – domácnost = lidé se
 * stejným `dwellingId`; `skip` vynechá domácnosti (dílny pracují zvlášť).
 */
export function householdElders(
  people: readonly Person[],
  day: number,
  skip: ReadonlySet<number> = new Set(),
): number[] {
  const elders = new Map<number, number>();
  for (const p of people) {
    if (skip.has(p.dwellingId)) continue;
    const add = ageGroup(p, day) === 'elder' ? 1 : 0;
    elders.set(p.dwellingId, (elders.get(p.dwellingId) ?? 0) + add);
  }
  return [...elders.values()];
}

/** Práce po stavbách – opravy obydlí a co zbude. */
export interface AfterConstructions {
  repairs: number;
  /** Co zbude po opravách (polní práce navíc – fields.md, Osev navíc; jinak propadne). */
  left: number;
}

/**
 * Práce, kterou stavby nespotřebovaly (`left`), jde do oprav obydlí podle potřeby (Martin
 * 19. 10. 2026: „Opravy obydlí zařaď až za stavbu.“); zbytek vrátí.
 */
export function afterConstructions(left: number, repairNeed: number): AfterConstructions {
  const free = Math.max(0, left);
  const repairs = Math.min(free, Math.max(0, repairNeed));
  return { repairs, left: free - repairs };
}
