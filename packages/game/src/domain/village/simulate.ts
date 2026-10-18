import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { villageCemeteries } from './cemetery';
import { cloneState } from './clone';
import {
  applyRepairs,
  qualifyingDwellings,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
} from './dwellings';
import { endOfSeason, expectedNetKg, sowingOrder } from './fields';
import { daysUntilAppleRot, eatMeal } from './food';
import { isToilDay, updateHappiness, villageLaborFactor, windowEndDay } from './happiness';
import { recordClearedObstacles } from './obstacles';
import { allocateDay, type LaborTaskName } from './labor';
import { laborDay, type ConstructionWork } from './labor-report';
import {
  ORCHARD_TASK_NAMES,
  isOrchardPlanted,
  orchardPlantingNeed,
  orchardSeasonDay,
  orchardWorkRemaining,
  plantOrchard,
  villageApplesKg,
  workOrchards,
} from './orchard';
import { ageGroup, foodNeedPerDay, isAdult, laborPerDay, occupants } from './people';
import { isVillageExtinct } from './extinction';
import { householdBreaksUp, inLuckyYears, nextStarvationDays, populationDay } from './population';
import { NO_CRAFTS, dailyMinPerHousehold } from './productivity';
import {
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  CROP_ORDER,
  CROP_WINDOWS,
  FOOD_NEED_KG_PER_YEAR,
  FOREST_BONUS,
  HARVEST_DAY,
  ORCHARD_WINDOWS,
  PEAK_CAPACITY_SHARE,
  PLANNING_DAY,
  SOW_RESERVE,
  STORES_HIGH_YEARS,
  THRESH_END_DAY,
  WINDOWS,
  WINTER_HARVEST_DAY,
  WINTER_WINDOWS,
  dwellingBuildLabor,
} from './rules';
import {
  chooseCrops,
  orchardOnlyLoad,
  planLoad,
  windowDaysLeft,
  type SowingCapacity,
} from './sowing';
import type {
  ChronicleEvent,
  Construction,
  Crop,
  CropWork,
  Dwelling,
  FieldPart,
  TaskName,
  VillageState,
} from './types';
import {
  addLogs,
  fellAsWorked,
  fuelExtraPerDay,
  logsFromClearedTrees,
  planDwellingWood,
  rotLogs,
  takeWood,
  woodFellingCost,
} from './wood';
import {
  TASK_ORDER,
  activeTasks,
  addToCropWork,
  createPlan,
  createYearPlan,
  daysUntilFoodHarvest,
  harvestKg,
  planCrops,
  planPartIds,
  taskRemaining,
  taskWindowEnd,
  threshLossKg,
  windowEndOf,
} from './year-plan';

type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

// Řemesla zatím nejsou (crafts.md) – práce i ztráty se počítají s pokrytím NO_CRAFTS, tedy
// s horními mezemi (`worst`). Až řemesla vzniknou, pokrytí se spočítá ze stavu vsi tady.

/** Díl hotový nejpozději v posledním měsíci setí (duben) jde ještě do letošního plánu. */
const LAST_JOIN_MONTH = Math.max(...WINDOWS.sow.map(([, to]) => to));
/** Okno bonusu vymýceného lesa trvá roky × 365 dní. */
const DAYS_PER_BONUS_YEAR = 365;
/** Tolerance, pod kterou se nasycení ještě bere jako plné. */
const SATIATION_EPSILON = 1e-9;

/**
 * Dopočítá ves do dne `toDay` včetně – den po dni od `lastDay + 1`. Vstup nemění.
 * Výsledek nezávisí na tom, po jakých kouscích se dopočítává (náhoda dne je ze seedu a dne;
 * kronika se zkrátí na posledních CHRONICLE_MAX_EVENTS událostí – simulace ji nečte).
 * `obstacles` = vrstva překážek krajiny sídla: přestavby podle ní vyhradí stromy ke kácení
 * (forest.md). Povinná – `null` (kácení bez polohy) jen v testech; volající ji musí dávat vždy
 * stejně, jinak výsledek na kouscích závisí.
 * Vymřelá ves (`extinctDay`) se už nesimuluje – jen se posune `lastDay`; lidé, pole, stavby,
 * zásoby i klády stojí, jak byly v den vymření.
 * RangeError, když `toDay` leží za koncem světa nebo před už odsimulovaným dnem.
 */
export function advanceVillage(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
): VillageState {
  if (!Number.isInteger(toDay) || toDay >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${toDay} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
  if (toDay < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, nelze zpět na ${toDay}.`);
  }
  const next = cloneState(state);
  for (let day = next.lastDay + 1; day <= toDay && !isVillageExtinct(next); day++) {
    simulateDay(next, day, obstacles);
  }
  next.lastDay = toDay;
  trimChronicle(next);
  return next;
}

/** Kronika drží jen posledních CHRONICLE_MAX_EVENTS událostí (mutuje stav). */
function trimChronicle(state: VillageState): void {
  const excess = state.chronicle.length - CHRONICLE_MAX_EVENTS;
  if (excess > 0) state.chronicle.splice(0, excess);
}

/** Jeden den vsi v pevném pořadí kroků (mutuje stav). */
function simulateDay(state: VillageState, day: number, obstacles: ObstacleLayer | null): void {
  const date = dateOfDayIndex(day);
  rotLogs(state);
  // sady: shnilá jablka, konec péče a stárnutí (1. 3.), začátek a konec sklizně a péče
  state.chronicle.push(...orchardSeasonDay(state, day));
  if (isOn(date, PLANNING_DAY)) planYear(state, day);
  if (date.month >= PLANNING_DAY.month || date.month <= LAST_JOIN_MONTH) {
    joinFinishedParts(state, day);
  }
  const toil = work(state, day);
  finishConstructions(state, day);
  decideRebuilds(state, day, obstacles);
  occupyEmptyDwellings(state, day);
  const satiation = eat(state, day);
  // nahromaděný hlad se počítá z dnešního jídla – úmrtí dne podle něj (population.md); v hájení
  // zůstává pod prahem, aby po něm lidé umírali postupně
  state.starvationDays = nextStarvationDays(
    state.starvationDays ?? 0,
    satiation,
    inLuckyYears(state.foundedDay, day),
  );
  const events = populationDay(state, day, satiation);
  state.chronicle.push(...events);
  // štěstí na konci dne – hlad, úmrtí, přeplněnost, dřina, zásoby a posvátná místa (happiness.md)
  updateHappiness(state, day, { satiation, events, toil });
  if (state.people.length === 0) {
    // zemřel poslední člověk – ves vymřela, dál se nesimuluje (ani sklizeň dne)
    state.extinctDay = day;
    state.chronicle.push({ day, kind: 'village-extinct' });
    return;
  }
  // Sklizeň a ztráta nevymláceného až po jídle (Ruling 13) – 31. 8. se jí ještě z loňských
  // zásob, jak počítá daysUntilHarvest (31. 8. → 1 den); ozim stejně 31. 7.
  if (isOn(date, WINTER_HARVEST_DAY)) harvestWinter(state, day);
  if (isOn(date, HARVEST_DAY)) harvest(state, day);
  if (isOn(date, THRESH_END_DAY)) endThreshing(state);
}

function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

// --- plán osevu -------------------------------------------------------------------------

/**
 * Krok 1 (1. 9.): konec hospodářského roku pro všechny díly a nový plán osevu – ves rozhodne, co
 * oseje ozimem a co jaří (fields.md – Ozim a jař).
 */
function planYear(state: VillageState, day: number): void {
  for (const part of state.parts) endOfSeason(part, day);
  const crops = chooseCrops(sowingOrder(state.parts), {
    targetKg: sowingTarget(state, day),
    startKg: 0,
    capacity: sowingCapacity(state, day),
    load: orchardOnlyLoad(orchardHarvestLoad(state)),
    allowWinter: true,
    day,
    toolCoverage: NO_CRAFTS.tools,
  });
  // plán vzniká před změnou stavu dílů – vrácení přílohu se počítá jen u dílů v přílohu
  state.plan = createYearPlan(crops, day, NO_CRAFTS.tools);
  const chosen = new Set([...crops.winter, ...crops.spring].map((p) => p.id));
  for (const part of state.parts) {
    if (chosen.has(part.id) || (part.state !== 'sown' && part.state !== 'ready')) continue;
    // nevybraný osev i nevyužitý hotový díl jdou do přílohu a začnou zarůstat
    part.state = 'fallow';
    part.fallowSinceDay = day;
    part.sownYears = 0;
    delete part.crop;
  }
  sow(crops.winter, day, 'winter');
  sow(crops.spring, day, 'spring');
}

/**
 * Krok 2 (1. 9. – 30. 4.): díly hotové v předchozích dnech jdou do letošního plánu jako jař,
 * když plán cíl nepokrývá a jař se vejde do zbývající práce – bez plánu ho založí. Díly hotové
 * po dubnu čekají na 1. 9.
 */
function joinFinishedParts(state: VillageState, day: number): void {
  const ready = state.parts.filter((p) => p.state === 'ready');
  if (ready.length === 0) return;
  const plan = state.plan;
  const inPlan = new Set(plan ? planPartIds(plan) : []);
  // díly plánu (oseté) se počítají do cíle první – nové přibudou, jen když ho nepokryjí
  const startKg = state.parts
    .filter((p) => inPlan.has(p.id))
    .reduce((sum, p) => sum + expectedNetKg(p, day), 0);
  const { spring } = chooseCrops(sowingOrder(ready), {
    targetKg: sowingTarget(state, day),
    startKg,
    capacity: sowingCapacity(state, day),
    load: planLoad(plan, orchardHarvestLoad(state)),
    allowWinter: false,
    day,
    toolCoverage: NO_CRAFTS.tools,
  });
  if (spring.length === 0) return;
  if (plan === null) state.plan = createPlan(spring, day, NO_CRAFTS.tools);
  else addToCropWork(plan, spring, day, NO_CRAFTS.tools);
  sow(spring, day, 'spring');
}

/** Cíl osevu: roční potřeba + rezerva, při velkých zásobách jen potřeba. */
function sowingTarget(state: VillageState, day: number): number {
  const need = state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  return state.storesKg > STORES_HIGH_YEARS * need ? need : need * (1 + SOW_RESERVE);
}

/**
 * Seje se, co je zkopané do včerejška (TASK_ORDER) – v okně setí proto plán počítá s jedním dnem
 * méně, aby se zasel i pruh zkopaný poslední den kopání.
 */
const SOW_AFTER_DIG_DAYS = 1;

/**
 * Volná práce vsi ve špičkách polních prací od dneška do konce hospodářského roku: všechna
 * práce po denním minimu (PEAK_CAPACITY_SHARE) krát dny oken – podzim pro ozim (září–říjen)
 * a celý podzim (září–listopad), jaro (březen–duben), červenec a srpen (sklizně).
 */
function sowingCapacity(state: VillageState, day: number): SowingCapacity {
  // práci násobí štěstí vsi (happiness.md)
  const capacity =
    state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0) * villageLaborFactor(state);
  const dailyMin = dailyMinPerHousehold(NO_CRAFTS.pottery) * householdCount(state);
  const free = Math.max(0, capacity - dailyMin) * PEAK_CAPACITY_SHARE;
  const days = (segments: Parameters<typeof windowDaysLeft>[1], sowing = false): number =>
    free * Math.max(0, windowDaysLeft(day, segments) - (sowing ? SOW_AFTER_DIG_DAYS : 0));
  return {
    autumnWinter: days(WINTER_WINDOWS.sow, true),
    autumn: days(WINDOWS.reclaim),
    spring: days(WINDOWS.sow, true),
    july: days(WINTER_WINDOWS.harvest),
    august: days(WINDOWS.harvest),
  };
}

/** Zbývající sklizeň jablek (září–říjen) – ves s ní při plánu osevu počítá (orchard.md). */
function orchardHarvestLoad(state: VillageState): number {
  const work = state.orchardWork;
  return work?.task === 'harvest' ? orchardWorkRemaining(work) : 0;
}

/** Do kdy platí okno bonusu úrodnosti lesa vymýceného v den `day`. */
function forestBonusUntil(day: number): number {
  return day + FOREST_BONUS.windowYears * DAYS_PER_BONUS_YEAR;
}

/** Vybrané díly se osejí plodinou `crop` (příloh se vrací do osevu). */
function sow(parts: FieldPart[], day: number, crop: Crop): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      part.fallowSinceDay = null;
      part.sownYears = 0;
    }
    part.state = 'sown';
    part.crop = crop;
  }
}

// --- práce ------------------------------------------------------------------------------

/** Obydlí, ve kterých někdo bydlí (pořadí podle stavu). */
function occupiedDwellings(state: VillageState): Dwelling[] {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings.filter((d) => occupied.has(d.id));
}

/**
 * Počet domácností – i zakladatelů, kteří do dostavění první zemnice bydlí na staveništi
 * (denní minimum a domácí práce mají taky). Ve vsi s hotovými obydlími = obývaná obydlí.
 */
function householdCount(state: VillageState): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/** Polní úloha dne: práce plodiny, kterou dostane, a konec jejího okna pro pořadí. */
interface FieldTaskEntry {
  name: TaskName;
  crop: Crop;
  remaining: number;
  work: CropWork;
  end: number;
  rank: number;
}

/**
 * Polní úlohy dne: práce plánu po plodinách (bez výmlatu – úroda plánu ještě neroste) a výmlat
 * loňské úrody obou plodin. Nejbližší konec okna první, při shodě ozim před jaří a pořadí úloh
 * (TASK_ORDER).
 */
function fieldTasks(state: VillageState, day: number): FieldTaskEntry[] {
  const month = dateOfDayIndex(day).month;
  const entries: FieldTaskEntry[] = [];
  const add = (crop: Crop, work: CropWork, name: TaskName): void => {
    const end = taskWindowEnd(name, month, crop);
    if (end === null) return;
    const rank = CROP_ORDER.indexOf(crop) * TASK_ORDER.length + TASK_ORDER.indexOf(name);
    entries.push({ name, crop, remaining: taskRemaining(work, name), work, end, rank });
  };
  if (state.plan !== null) {
    for (const { crop, work } of planCrops(state.plan)) {
      for (const name of activeTasks(work, day, crop)) if (name !== 'thresh') add(crop, work, name);
    }
  }
  if (state.threshingFromPlan !== null) {
    for (const { crop, work } of planCrops(state.threshingFromPlan)) {
      if (activeTasks(work, day, crop).includes('thresh')) add(crop, work, 'thresh');
    }
  }
  return entries.sort((a, b) => a.end - b.end || a.rank - b.rank);
}

/**
 * Krok 3: rozdělení práce vsi. Polní úlohy obou plodin (`fieldTasks`), sezónní práce v sadech
 * podle konce svého okna (sklizeň jablek po ozimu, před podzimním kopáním jaře, péče až po
 * výmlatu); opravy obydlí poměrně k potřebě; společná práce do staveb. Veškerou práci násobí
 * štěstí (happiness.md). Vrací, jestli ves dnes nestíhá polní práce v období (dřina).
 */
function work(state: VillageState, day: number): boolean {
  const owned = fieldTasks(state, day);
  const tasks: { name: LaborTaskName; remaining: number }[] = owned.map(({ name, remaining }) => ({
    name,
    remaining,
  }));
  const orchard = orchardTask(state, day);
  const orchardAt = orchard ? orchardPosition(owned, orchard) : -1;
  if (orchard) tasks.splice(orchardAt, 0, orchard);

  const households = occupiedDwellings(state);
  const repairNeeds = households.map((d) => repairNeedPerDay(d, day));
  const repairNeed = repairNeeds.reduce((sum, n) => sum + n, 0);
  const allocation = allocateDay({
    capacity: state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0),
    households: householdCount(state),
    people: state.people.length,
    tasks,
    repairNeed,
    domesticBacklog: state.domesticBacklog,
    potteryCoverage: NO_CRAFTS.pottery,
    fuelExtra: fuelExtraPerDay(state),
    productivity: villageLaborFactor(state),
  });

  // polní práce dne – i odkud kam došla (rozdělení práce po dílech pro postavy, labor-report.ts)
  const fieldWork = owned.map((task, i) => {
    const amount = allocation.taskAmounts[orchard && i >= orchardAt ? i + 1 : i] ?? 0;
    const before = task.work.done[task.name];
    task.work.done[task.name] = Math.min(task.work.required[task.name], before + amount);
    return { task: task.name, work: task.work, before, after: task.work.done[task.name], amount };
  });
  if (orchard) workOrchards(state, allocation.taskAmounts[orchardAt] ?? 0);
  const repairs = households.map((d, i) => {
    const need = repairNeeds[i] ?? 0;
    const manDays = repairNeed > 0 ? (allocation.repairs * need) / repairNeed : 0;
    applyRepairs(d, manDays, need);
    return { dwellingId: d.id, manDays };
  });
  decayEmptyDwellings(state, day, new Set(households.map((d) => d.id)));
  state.domesticBacklog = allocation.domesticBacklog;
  const constructions = build(state, day, allocation.common);
  state.labor = laborDay(state, day, { allocation, fieldWork, repairs, constructions });
  state.commonLaborHistory.push(allocation.common);
  if (state.commonLaborHistory.length > COMMON_LABOR_HISTORY_DAYS) {
    state.commonLaborHistory.splice(0, state.commonLaborHistory.length - COMMON_LABOR_HISTORY_DAYS);
  }
  // dřina: stihne ves dnešním tempem polní práce obou plodin do konce jejich oken?
  const pace = fieldWork.reduce((sum, task) => sum + task.amount, 0);
  const seasonTasks = owned.map((task) => ({
    remaining: taskRemaining(task.work, task.name),
    endDay: windowEndDay(CROP_WINDOWS[task.crop][task.name], day) ?? day,
  }));
  return isToilDay(seasonTasks, pace, day);
}

/**
 * Kam mezi polní úlohy patří práce v sadech: polní úlohy s dřívějším koncem okna mají přednost.
 * Při shodě konce jde sklizeň jablek před ozim (jablka zrají v září a do konce října spadnou –
 * ozim dostane zbytek podzimu, se kterým plán osevu počítá), péče až po výmlatu.
 */
function orchardPosition(
  owned: readonly FieldTaskEntry[],
  orchard: { name: LaborTaskName; end: number },
): number {
  const beforeTie = orchard.name === ORCHARD_TASK_NAMES.harvest;
  return owned.filter((t) => t.end < orchard.end || (!beforeTie && t.end === orchard.end)).length;
}

/** Sezónní práce v sadech dnes (sklizeň, nebo péče) s koncem okna pro pořadí; jinak null. */
function orchardTask(
  state: VillageState,
  day: number,
): { name: LaborTaskName; remaining: number; end: number } | null {
  const work = state.orchardWork;
  const remaining = orchardWorkRemaining(work);
  if (!work || remaining <= 0) return null;
  const end = windowEndOf(ORCHARD_WINDOWS[work.task], dateOfDayIndex(day).month);
  if (end === null) return null;
  return { name: ORCHARD_TASK_NAMES[work.task], remaining, end };
}

/**
 * Opuštěná obydlí se neopravují ani nepřestavují: rozestavěná přestavba prázdného obydlí se
 * opustí (nebere společnou práci, klády, které vzala z hromady, se na ni vrátí, vyhrazené stromy
 * se uvolní), obydlí chátrá a na nule zanikne.
 */
function decayEmptyDwellings(state: VillageState, day: number, occupied: Set<number>): void {
  state.constructions = state.constructions.filter((c) => {
    const abandoned = c.kind === 'rebuild' && c.dwellingId !== null && !occupied.has(c.dwellingId);
    if (abandoned && c.wood) addLogs(state, c.wood.fromPile);
    return !abandoned;
  });
  const gone = new Set<number>();
  for (const d of state.dwellings) {
    if (occupied.has(d.id)) continue;
    applyRepairs(d, 0, repairNeedPerDay(d, day));
    if (d.condition <= 0) gone.add(d.id);
  }
  if (gone.size === 0) return;
  state.dwellings = state.dwellings.filter((d) => !gone.has(d.id));
}

/**
 * Kolik práce stavbě dnes chybí; pole = zbývající zakládání jeho nehotových dílů, sad =
 * zbývající výsadba (jen v oknech výsadby – mimo ně stavba čeká).
 */
function constructionNeed(
  state: VillageState,
  c: Construction,
  day: number,
  founding: FoundingIndex,
): number {
  if (c.kind === 'orchard') return orchardPlantingNeed(state, c, day);
  if (c.kind !== 'field') return Math.max(0, c.cost - c.done);
  return foundingParts(founding, c).reduce((sum, p) => sum + (p.foundingCost - p.foundingDone), 0);
}

/**
 * Zakládané díly po polích (v pořadí dílů ve stavu) – jeden průchod díly na krok místo průchodu
 * na každou stavbu pole (s tisíci dílů to byla třetina času simulace). Bez stavby pole prázdné.
 */
type FoundingIndex = ReadonlyMap<number, readonly FieldPart[]>;

function foundingIndex(state: VillageState): FoundingIndex {
  const byField = new Map<number, FieldPart[]>();
  if (!state.constructions.some((c) => c.kind === 'field')) return byField;
  for (const p of state.parts) {
    if (p.state !== 'founding') continue;
    const list = byField.get(p.fieldId);
    if (list) list.push(p);
    else byField.set(p.fieldId, [p]);
  }
  return byField;
}

/** Zakládané díly stavby pole – stav znovu, protože založení mění díl na připravený. */
function foundingParts(founding: FoundingIndex, c: Construction): FieldPart[] {
  if (c.fieldId === null) return [];
  return (founding.get(c.fieldId) ?? []).filter((p) => p.state === 'founding');
}

/**
 * Společná práce rovným dílem do rozestavěných staveb: stavba, které stačí méně, si vezme jen
 * to, co potřebuje, a zbytek se znovu rozdělí mezi ostatní; co zbude po všech, propadne.
 * Vrátí, kolik práce šlo do které stavby (rozdělení práce dne pro scénu – labor-report.ts).
 */
function build(state: VillageState, day: number, common: number): ConstructionWork[] {
  const founding = foundingIndex(state);
  let active = state.constructions
    .map((c) => ({ c, need: constructionNeed(state, c, day, founding) }))
    .filter((x) => x.need > 0);
  const invested: ConstructionWork[] = [];
  const put = (c: Construction, amount: number, completes: boolean): void => {
    invested.push({
      construction: c,
      manDays: amount,
      doneBefore: c.done,
      felledBefore: c.wood?.felled ?? 0,
    });
    invest(state, day, c, amount, completes, founding);
  };
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) put(x.c, share, false);
      return invested;
    }
    for (const x of saturated) {
      put(x.c, x.need, true);
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return invested;
}

/** Vloží práci do stavby; `completes` = dostala vše, co jí chybělo. */
function invest(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
  founding: FoundingIndex,
): void {
  if (c.kind === 'orchard') {
    plantOrchard(state, day, c, amount, completes);
    return;
  }
  if (c.kind !== 'field') {
    c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
    // dřevo se kácí jako první část práce stavby (forest.md)
    fellAsWorked(state, c, day);
    return;
  }
  // pole zakládá díly od nejbližšího k obydlí; přebytek dne teče do dalšího dílu
  const parts = foundingParts(founding, c).sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  let left = amount;
  let used = 0;
  for (const part of parts) {
    const need = part.foundingCost - part.foundingDone;
    if (completes || left >= need) {
      left -= need;
      used += need;
      part.foundingDone = part.foundingCost;
      part.state = 'ready';
      if (part.surface === 'forest') part.bonusUntilDay = forestBonusUntil(day);
      // založený díl: stromy, kameny a keře z něj zmizí natrvalo (fields.md – Zakládání),
      // dospělé stromy dají klády na hromadu (forest.md – Mýcení)
      if (part.obstacles) {
        recordClearedObstacles(state, part.obstacles, day);
        delete part.obstacles;
      }
      if (part.trees) {
        addLogs(state, logsFromClearedTrees(part.trees));
        delete part.trees;
      }
    } else {
      part.foundingDone += left;
      used += left;
      break;
    }
  }
  // průběh stavby jen z jejích dílů – pole mohlo mít díly založené dřív (rozšíření, sloučení)
  c.done = Math.min(c.cost, c.done + used);
}

// --- stavby a domácnosti ------------------------------------------------------------------

function isFinished(state: VillageState, c: Construction, founding: FoundingIndex): boolean {
  if (c.kind === 'field') return foundingParts(founding, c).length === 0;
  if (c.kind === 'orchard') return isOrchardPlanted(state, c);
  return c.done >= c.cost;
}

/**
 * Krok 4: dokončené stavby – nové obydlí, přestavěné obydlí, založené pole, vysazený sad
 * a pohřebiště. První zemnice dostane id domácnosti zakladatelů (`dwellingId` stavby) – ti už
 * v ní bydlí, nikdo se nestěhuje. Do jiného nového obydlí se stěhuje mladý pár.
 */
function finishConstructions(state: VillageState, day: number): void {
  const unfinished: Construction[] = [];
  const founding = foundingIndex(state);
  for (const c of state.constructions) {
    if (!isFinished(state, c, founding)) {
      unfinished.push(c);
      continue;
    }
    if (c.kind === 'field' || c.kind === 'orchard') {
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'cemetery') {
      finishCemetery(state, day, c);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'idol' || c.kind === 'shrine') {
      // dostavěná modla nebo svatyně – přidává štěstí (happiness.md)
      if (c.position !== null) {
        (state.sacredBuildings ??= []).push({
          id: c.id,
          kind: c.kind,
          position: { ...c.position },
          builtDay: day,
        });
      }
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.dwellingType === null) throw new Error(`Stavba ${c.id} nemá typ obydlí.`);
    if (c.kind === 'rebuild') {
      const dwelling = state.dwellings.find((d) => d.id === c.dwellingId);
      if (dwelling) {
        dwelling.type = c.dwellingType;
        dwelling.builtDay = day;
        dwelling.condition = 1;
      }
      state.chronicle.push(finishedEvent(day, c, c.dwellingId));
      continue;
    }
    if (c.position === null) throw new Error(`Stavba obydlí ${c.id} nemá polohu.`);
    const dwelling: Dwelling = {
      id: c.dwellingId ?? state.nextId++,
      type: c.dwellingType,
      builtDay: day,
      condition: 1,
      position: { ...c.position },
      ...(c.plot ? { plot: { cell: { ...c.plot.cell }, variant: c.plot.variant } } : {}),
      ...(c.forestDistanceM === undefined ? {} : { forestDistanceM: c.forestDistanceM }),
    };
    state.dwellings.push(dwelling);
    state.chronicle.push(finishedEvent(day, c, dwelling.id));
    if (c.dwellingId === null) moveInYoungestPair(state, day, dwelling.id);
  }
  state.constructions = unfinished;
}

/**
 * Dokončené založení hřbitova (hřbitov přijímá mrtvé), nebo rozšíření (jeho čtverce se začnou
 * počítat – stavba je pozná podle `constructionId`). Překážky na dostavěných čtvercích zmizí
 * natrvalo jako u založeného dílu pole (fields.md – Zakládání).
 */
function finishCemetery(state: VillageState, day: number, c: Construction): void {
  const cemetery = villageCemeteries(state).find((x) => x.id === c.cemeteryId);
  if (!cemetery) return;
  const extension = cemetery.squares.filter((s) => s.constructionId === c.id);
  const finished =
    extension.length > 0
      ? extension
      : cemetery.squares.filter((s) => s.constructionId === undefined);
  for (const square of finished) {
    if (square.trees) {
      addLogs(state, logsFromClearedTrees(square.trees));
      delete square.trees;
    }
    if (!square.obstacles) continue;
    recordClearedObstacles(state, square.obstacles, day);
    delete square.obstacles;
  }
  if (extension.length === 0) {
    cemetery.builtDay = day;
    return;
  }
  for (const square of extension) delete square.constructionId;
}

function finishedEvent(day: number, c: Construction, dwellingId: number | null): ChronicleEvent {
  return {
    day,
    kind: 'construction-finished',
    constructionKind: c.kind,
    dwellingId,
    fieldId: c.kind === 'field' ? c.fieldId : null,
  };
}

/**
 * Dva nejmladší lidé 14–44 z první domácnosti, která splňuje podmínku nového obydlí a dva
 * takové lidi může uvolnit, se přestěhují do obydlí `dwellingId` (při shodě data narození
 * mladší = vyšší id). Domácnosti se zkoušejí v pořadí `qualifyingDwellings`. Pár neodejde, když
 * by se zbytek domácnosti hned rozpadl (zůstali by jen starší a děti) – rozpad by zbytek večer
 * přestěhoval za párem a druhý den by se pár stěhoval znovu. S podmínkou čtyř dospělých 14–44
 * to nenastane; kontrola to hlídá i pro případ, že se podmínka změní.
 */
function moveInYoungestPair(state: VillageState, day: number, dwellingId: number): void {
  for (const source of qualifyingDwellings(state, day)) {
    const members = occupants(state, source.id);
    const movers = members
      .filter((p) => isAdult(p, day))
      .sort((a, b) => b.bornDay - a.bornDay || b.id - a.id)
      .slice(0, 2);
    if (movers.length < 2) continue;
    const staying = members.filter((p) => !movers.includes(p));
    if (householdBreaksUp(staying, day)) continue;
    for (const p of movers) p.dwellingId = dwellingId;
    state.chronicle.push({ day, kind: 'household-founded', dwellingId });
    return;
  }
}

/**
 * Krok 5: obyvatelé dožilého nebo zchátralého obydlí se rozhodnou ho přestavět. Přestavba bere
 * dřevo jako nová stavba (forest.md): klády z hromady, zbytek vyhradí mezi nejbližšími dospělými
 * stromy k obydlí. Nezastaví ji ani nedostatek dřeva – vezme, co je.
 */
function decideRebuilds(state: VillageState, day: number, obstacles: ObstacleLayer | null): void {
  const rebuilding = new Set(
    state.constructions.filter((c) => c.kind === 'rebuild').map((c) => c.dwellingId),
  );
  const history = state.commonLaborHistory;
  const averageCommon =
    history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
  for (const d of occupiedDwellings(state)) {
    if (rebuilding.has(d.id) || !wantsRebuild(d, day)) continue;
    const type = rebuildType(d.type, averageCommon);
    const plan = planDwellingWood(state, type, d.position, day, { obstacles });
    const wood = takeWood(state, plan);
    state.constructions.push({
      id: state.nextId++,
      kind: 'rebuild',
      startedDay: day,
      cost: dwellingBuildLabor(type) + woodFellingCost(wood),
      done: 0,
      dwellingType: type,
      position: null,
      dwellingId: d.id,
      fieldId: null,
      wood,
    });
    state.chronicle.push({ day, kind: 'rebuild-decided', dwellingId: d.id, type });
  }
}

/**
 * Krok 6: prázdné obydlí obsadí první domácnost, která splňuje podmínku nového obydlí a má dva
 * lidi 14–44.
 */
function occupyEmptyDwellings(state: VillageState, day: number): void {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const empty = state.dwellings.filter((d) => !occupied.has(d.id)).sort((a, b) => a.id - b.id);
  for (const d of empty) moveInYoungestPair(state, day, d.id);
}

// --- sklizeň a jídlo --------------------------------------------------------------------

/** 31. 7. (po jídle dne): čistá úroda ozimu do zásob (fields.md – Ozim a jař). */
function harvestWinter(state: VillageState, day: number): void {
  const winter = state.plan?.winter;
  if (!winter || winter.harvestedKg !== null) return;
  const kg = harvestKg(winter, state.parts, day);
  state.storesKg += kg;
  winter.harvestedKg = kg;
  state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'winter' });
}

/** 31. 8. (po jídle dne): čistá úroda jaře do zásob, plán (i s ozimem) jde k výmlatu. */
function harvest(state: VillageState, day: number): void {
  const plan = state.plan;
  if (plan === null) return;
  const kg = harvestKg(plan, state.parts, day);
  state.storesKg += kg;
  plan.harvestedKg = kg;
  // plán jen s ozimem jař nesklízí – žádná sklizeň do kroniky
  if (!plan.winter) state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  else if (plan.partIds.length > 0) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'spring' });
  }
  state.threshingFromPlan = plan;
  state.plan = null;
}

/** 1. 3. (po jídle dne): nevymlácená část úrody obou plodin se zkazila. */
function endThreshing(state: VillageState): void {
  const threshing = state.threshingFromPlan;
  if (threshing === null) return;
  const loss = planCrops(threshing).reduce(
    (sum, { work }) => sum + threshLossKg(work, work.harvestedKg ?? 0),
    0,
  );
  state.storesKg = Math.max(0, state.storesKg - loss);
  state.threshingFromPlan = null;
}

/**
 * Krok 8: jídlo dne ze zásob – jablka přednostně (orchard.md); vrací nasycení a zapíše začátek
 * a konec hladu. Hlad začíná už tehdy, když příděl podle výhledu do sklizně klesne pod plný – i
 * když se dnes jí dosyta jablky a obilí nevystačí až po 1. 3. (bez jablek totéž co nasycení).
 */
function eat(state: VillageState, day: number): number {
  const need = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  const meal = eatMeal(
    state.storesKg,
    villageApplesKg(state),
    need,
    daysUntilFoodHarvest(state.plan, state.parts, day, need),
    daysUntilAppleRot(day),
    NO_CRAFTS.pottery,
  );
  const { storesKg, satiation } = meal;
  state.storesKg = storesKg;
  if (state.applesKg !== undefined) state.applesKg = meal.applesKg;
  const hungry = meal.outlook < 1 - SATIATION_EPSILON;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  return satiation;
}
