import { ageGroup } from './people';
import { dailyMinPerHousehold } from './productivity';
import { LABOR_PER_DAY, WATER_FETCHING } from './rules';
import type { Dwelling, OrchardTaskName, Person, TaskName } from './types';

/**
 * Sezónní práce v rozdělení práce vsi – polní (fields.md), orba rádlem, seč sena (oxen.md),
 * porážka a uzení (diet.md), v sadech (orchard.md) a ukládání zrna do obilných jam
 * (production-chains.md – Obilné jámy). Práce se zvířaty a domácí výroba jdou bokem
 * (population.md – Práce): dojí a krmí ženy, pasou výrostci, domácí výrobu obstarají ženy.
 */
export type LaborTaskName =
  TaskName | OrchardTaskName | 'plough' | 'mow' | 'slaughter' | 'grain-pit';

/**
 * Lehčí polní práce, které smějí dělat i ženy řemeslníků (crafts.md – Kdo dělá řemeslo; Martin
 * 22. 10. 2026: „setí, žně, mlácení zrna, v případě potřeby i okopávání motykou. Nekovou,
 * nekácí, neorou, nestaví.“): setí, okopávání, žně a výmlat.
 */
export const LIGHT_LABOR_TASKS: ReadonlySet<LaborTaskName> = new Set<LaborTaskName>([
  'sow',
  'weed',
  'harvest',
  'thresh',
]);

export interface DayAllocationInput {
  /** Pracovní síla vsi – dospělí (`laborPerDay`). */
  capacity: number;
  /**
   * Starší lidé po domácnostech vsi (počet, jedna položka na domácnost – `householdElders`) –
   * kryjí napřed denní minimum své domácnosti (`adultDailyMin`).
   */
  householdElders: readonly number[];
  /**
   * Lehčí práce žen řemeslníků (`craftLightLabor`, člověkodny před štěstím) – samostatný zásobník
   * mimo `capacity`: pokryje jen úlohy z `LIGHT_LABOR_TASKS`, nikdy orbu, kácení ani stavby;
   * co nevyužijí, propadne. Bez údaje 0.
   */
  light?: number;
  /**
   * Přirážka denního minima za chůzi pro vodu po domácnostech (člověkodny, ve stejném pořadí jako
   * `householdElders` – `householdWaterLabor`); bez údaje 0. Kryjí ji starší jako zbytek minima.
   */
  householdWater?: readonly number[];
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
  /**
   * Sedláci s vozy pro uhlí a rudu kováře (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026:
   * „přiveze uhlí sedlák s vozem (a odečte se jeho práce)“): jízda je domluvená předem – jde
   * z práce vsi po výpravách, před úlohami dne; bez údaje 0.
   */
  carting?: number;
}

export interface DayAllocation {
  /** Denní minimum domácností z práce vsi – co po starších zbude na dospělé. */
  dailyMin: number;
  /** Denní minimum, které pokryli starší svou prací (mimo práci vsi – jen pro postavy). */
  eldersDailyMin: number;
  /** Práce lidí na výpravách (nejvýš `away`, po denním minimu). */
  away: number;
  /** Práce sedláků s vozy pro uhlí a rudu (nejvýš `carting`, po výpravách). */
  carting: number;
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
 * věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“): minimum
 * (s přirážkou za chůzi pro vodu – `householdWater`) →
 * lidé na výpravách → sedláci s vozy pro kováře → potřebné sezónní úlohy (polní, v sadech, seč, porážka) v daném pořadí →
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
  const water = input.householdWater ?? [];
  let minimums = 0;
  let adults = 0;
  input.householdElders.forEach((elders, k) => {
    // denní minimum domácnosti s přirážkou za vodu (population.md – Práce)
    const own = minimum + (water[k] ?? 0);
    minimums += own;
    adults += adultDailyMin(own, elders, productivity);
  });
  const eldersDailyMin = minimums - adults;
  const dailyMin = take(adults);
  // výpravy (trade.md – Doprava): nosiči jsou na cestě celé dny – po denním minimu, před vším
  // ostatním
  const away = take(input.away ?? 0);
  // sedláci s vozy pro kováře (crafts.md – Uhlí a ruda kováře) – po výpravách, před úlohami
  const carting = take(input.carting ?? 0);
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
    'grain-pit': 0,
    'orchard-care': 0,
    'orchard-harvest': 0,
  };
  // lehká práce žen řemeslníků – jen na lehké úlohy, napřed ta, pak obecná kapacita
  let lightLeft = Math.max(0, (input.light ?? 0) * productivity);
  const taskAmounts = input.tasks.map((task) => {
    let amount = 0;
    if (LIGHT_LABOR_TASKS.has(task.name)) {
      amount = Math.min(task.remaining, lightLeft);
      lightLeft -= amount;
    }
    amount += take(task.remaining - amount);
    tasks[task.name] += amount;
    return amount;
  });
  return { dailyMin, eldersDailyMin, away, carting, tasks, taskAmounts, common: left };
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
 * Domácnosti vsi – lidé se stejným `dwellingId` v pořadí prvního člověka domácnosti; `skip`
 * vynechá domácnosti (dílny pracují zvlášť).
 */
function householdsOf(people: readonly Person[], skip: ReadonlySet<number>): Map<number, Person[]> {
  const households = new Map<number, Person[]>();
  for (const p of people) {
    if (skip.has(p.dwellingId)) continue;
    const members = households.get(p.dwellingId);
    if (members) members.push(p);
    else households.set(p.dwellingId, [p]);
  }
  return households;
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
  return [...householdsOf(people, skip).values()].map(
    (members) => members.filter((p) => ageGroup(p, day) === 'elder').length,
  );
}

/**
 * Přirážka denního minima za chůzi pro vodu po domácnostech (člověkodny za den, ve stejném pořadí
 * jako `householdElders`): podle lidí domácnosti a chůze jejího obydlí k vodě
 * (`Dwelling.waterWalkM` – `waterFetchingLabor`). Domácnost bez obydlí (zakladatelé na staveništi)
 * nebo bez změřené chůze 0.
 */
export function householdWaterLabor(
  people: readonly Person[],
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
): number[] {
  return householdWater(people, dwellings, skip).map((h) => h.labor);
}

/** Domácnost a její chůze pro vodu (`householdWater`). */
export interface HouseholdWater {
  dwellingId: number;
  people: number;
  /** Přirážka denního minima za chůzi pro vodu (čd za den – `waterFetchingLabor`). */
  labor: number;
}

/**
 * Domácnosti a jejich přirážka za chůzi pro vodu (ve stejném pořadí jako `householdElders`) –
 * podklad pro vodu vozem (wagons.md – Co vozy vozí, cart-jobs.ts).
 */
export function householdWater(
  people: readonly Person[],
  dwellings: readonly Pick<Dwelling, 'id' | 'waterWalkM'>[],
  skip: ReadonlySet<number> = new Set(),
): HouseholdWater[] {
  const walks = new Map(dwellings.map((d) => [d.id, d.waterWalkM]));
  return [...householdsOf(people, skip)].map(([id, members]) => ({
    dwellingId: id,
    people: members.length,
    labor: waterFetchingLabor(members.length, walks.get(id)),
  }));
}

/**
 * Chůze pro vodu nad denní minimum (člověkodny za den; population.md – Práce, paths.md – Pochůzky
 * pro vodu; Martin 19. 10. 2026, čísla návrh Clauda – WATER_FETCHING): domácnost `people` lidí
 * chodí `tripsPerPerson` cesty na člověka tam a zpět k vodě `walkM` m chůze daleko; prvních
 * `includedM` je v ceně denního minima: cesty × 2 × max(0, chůze − includedM) ÷ rychlost ÷ délka
 * dne. Bez změřené chůze (bez krajiny – kalibrace, testy) 0.
 */
export function waterFetchingLabor(people: number, walkM: number | undefined): number {
  if (walkM === undefined || people <= 0) return 0;
  const extraM = Math.max(0, walkM - WATER_FETCHING.includedM);
  const trips = WATER_FETCHING.tripsPerPerson * people;
  return (trips * 2 * extraM) / WATER_FETCHING.speedMps / (WATER_FETCHING.dayHours * 3600);
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
