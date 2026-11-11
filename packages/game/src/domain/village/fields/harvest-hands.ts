// Žně a výmlat všemi rukama (fields.md – Žně všemi rukama; Martin 24. 10. 2026: „Dílny i vojvodova
// rodina“) – jedno místo pravdy pro kapacitu práce v oknech (`sowingCapacity`) i práci dne (`work()`).
import { dateOfDayIndex } from '../../calendar';
import { ageGroup, ageYears } from '../people/people';
import {
  CROP_ORDER,
  CROP_WINDOWS,
  HARVEST_HELPERS,
  HARVEST_THRESH_WINDOWS,
  LABOR_PER_DAY,
  type WindowSegment,
} from '../rules';
import { herdingDay, isYoungster, type HerdingState } from '../livestock/herding';
import { lordTraineeIds } from '../people/lord';
import { HARVEST_CHORES, householdMinimum } from '../core/labor';
import { villageOxen } from '../livestock/oxen';
import { dailyMinPerHousehold } from '../core/productivity';
import { sheafWork, threshTasks, THRESHED_CROPS } from './threshing';
import type { Person, VillageState } from '../types';
import { activeTasks, cropTaskRemaining, cropsAfield } from '../core/year-plan';

const EPSILON = 1e-9;

const inSegments = (segments: readonly WindowSegment[], month: number): boolean =>
  segments.some(([from, to]) => month >= from && month <= to);

/**
 * Měsíce oken žní a výmlatu hned po žni všech plodin (CROP_WINDOWS, HARVEST_THRESH_WINDOWS – ozim,
 * luštěniny a len žeň v červenci a srpnu, výmlat v srpnu a září – fields.md, Žně i v srpnu; jař
 * žeň v srpnu a září, výmlat v září a říjnu – Žeň jaře i v září). Výmlat v zimě (listopad–únor)
 * žňový den nemá (fields.md – Pořadí důležitosti polních prací a výmlat do zimy, návrh Clauda).
 */
export const HARVEST_HANDS_MONTHS: ReadonlySet<number> = new Set(
  CROP_ORDER.flatMap((crop) =>
    Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (month) =>
        inSegments(CROP_WINDOWS[crop].harvest, month) ||
        inSegments(HARVEST_THRESH_WINDOWS[crop], month),
    ),
  ),
);

/**
 * Je dnes žňový den (fields.md – Žně všemi rukama)? Měsíc okna žní nebo výmlatu hned po žni
 * (`HARVEST_THRESH_WINDOWS`) a ves má v jeho
 * okně ještě co sklízet (plán) nebo opravdu jde mlátit (snopy a humno či nouzový výmlat –
 * `threshTasks`; ves bez humna se snopy, které nesmí mlátit, žňový den nemá) – pak jdou na pole i
 * řemeslníci se syny (jinak dělají řemeslo) a vojvodova rodina, když ves žně sama nestíhá
 * (`manorLabor` – `help`).
 */
export function harvestHandsDay(state: VillageState, day: number): boolean {
  const { month } = dateOfDayIndex(day);
  if (!HARVEST_HANDS_MONTHS.has(month)) return false;
  // i jař, kterou srpen nedosklidil – v září se dožíná (fields.md – Žeň jaře i v září)
  for (const { crop, work, late } of cropsAfield(state)) {
    if (
      activeTasks(work, day, crop, false, late).includes('harvest') &&
      cropTaskRemaining(work, 'harvest') > 0
    ) {
      return true;
    }
  }
  if (
    !THRESHED_CROPS.some(
      (crop) => inSegments(HARVEST_THRESH_WINDOWS[crop], month) && sheafWork(state, crop) > EPSILON,
    )
  ) {
    return false;
  }
  return threshTasks(state, day).some((task) => task.remaining > EPSILON);
}

/**
 * Výrostek od `HARVEST_HELPERS.youthFromAge` let do dospělosti nebo starší – ve žních dá
 * `HARVEST_HELPERS.perDay` (vázání, odnos, paběrky; fields.md – Žně všemi rukama).
 */
export function isHarvestHelper(person: Person, day: number): boolean {
  const group = ageGroup(person, day);
  return (
    group === 'elder' ||
    (group === 'child' && ageYears(person.bornDay, day) >= HARVEST_HELPERS.youthFromAge)
  );
}

/**
 * Práce výrostků a starších ve žních (čd za den před štěstím) – lidé mimo `apart` (cvičící
 * vojvodova rodina – chlapci cvičí vždy, starší kryjí dvorec). Každý dá **celkem** `perDay`
 * (Martin 24. 10. 2026: „po 0,5 čd“), ne k tomu, co už dělá: starší kryje denní minimum domácnosti
 * (`adultDailyMin`) – žeň dá jen to, co mu nad minimum zbude; výrostek 7–13 let pasoucí stáda
 * (`herdingDay`) má za sebou svůj podíl pasení, žeň dá zbytek do `perDay`.
 */
export function harvestHelperLabor(
  state: Pick<VillageState, 'people' | 'dwellings' | 'livestock' | 'pens'> & HerdingState,
  day: number,
  apart: ReadonlySet<number> = new Set(),
  productivity = 1,
  potteryCoverage = 0,
): number {
  let youths = 0;
  const elders = new Map<number, number>();
  for (const p of state.people) {
    if (apart.has(p.id) || !isHarvestHelper(p, day)) continue;
    if (ageGroup(p, day) === 'elder') elders.set(p.dwellingId, (elders.get(p.dwellingId) ?? 0) + 1);
    else youths++;
  }
  let total = youths * HARVEST_HELPERS.perDay;
  if (youths > 0) {
    total -= Math.min(total, herdingDay(state, day, villageOxen(state)).free);
  }
  if (elders.size > 0 && productivity > 0) {
    // žňový den (population.md – Skladba dne podle ročního období): poloviční minimum, voda se
    // domů nenosí
    const minimum = dailyMinPerHousehold(potteryCoverage);
    const members = new Map<number, number>();
    for (const p of state.people) members.set(p.dwellingId, (members.get(p.dwellingId) ?? 0) + 1);
    const dwellings = new Map(state.dwellings.map((d) => [d.id, d]));
    for (const [id, count] of elders) {
      const own = householdMinimum(
        minimum,
        members.get(id) ?? 0,
        dwellings.get(id),
        HARVEST_CHORES,
      );
      // starší kryjí minimum po `elder` × produktivita; nad ně žeň
      const spare = count * LABOR_PER_DAY.elder - own / productivity;
      total += Math.min(count * HARVEST_HELPERS.perDay, Math.max(0, spare));
    }
  }
  return total;
}

/**
 * Děti při pletí (fields.md – Pletí – děti; Martin 25. 10. 2026: „Pletí se často účastnily děti.“):
 * výrostci 7–13 let (bez cvičících synů vojvodovy rodiny), kteří dnes nepasou – pasáci mají
 * přednost (`herdingDay`; pasou nejstarší, plejí mladší). Každé dá `WEEDING_CHILDREN.perDay`.
 * Vrátí věk plejících dětí (roky), od nejstaršího.
 */
export function weedingChildren(
  state: Pick<VillageState, 'livestock' | 'pens'> & HerdingState,
  day: number,
): number[] {
  const family = lordTraineeIds(state, day);
  const ages = state.people
    .filter((p) => isYoungster(p, day) && !family.has(p.id))
    .map((p) => ageYears(p.bornDay, day))
    .sort((a, b) => b - a);
  if (ages.length === 0) return [];
  return ages.slice(herdingDay(state, day, villageOxen(state)).freeHerders.children);
}
