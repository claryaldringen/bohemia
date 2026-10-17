import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../calendar';
import type { CalendarDate } from '../calendar';
import { villageCemeteries } from './cemetery';
import {
  applyRepairs,
  qualifyingDwellings,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
} from './dwellings';
import { endOfSeason, fallowYears, selectPartsToSow } from './fields';
import { daysUntilAppleRot, daysUntilHarvest, eatMeal } from './food';
import { recordClearedObstacles } from './obstacles';
import { allocateDay, type LaborTaskName } from './labor';
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
import { ageGroup, foodNeedPerDay, isFertileAdult, laborPerDay, occupants } from './people';
import { householdBreaksUp, populationDay } from './population';
import {
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  DAILY_MIN_PER_HOUSEHOLD,
  DWELLINGS,
  FERTILITY,
  FIELD_WORK_PER_HA,
  FOOD_NEED_KG_PER_YEAR,
  FOREST_AFTER_YEARS,
  HARVEST_DAY,
  ORCHARD_WINDOWS,
  PEAK_CAPACITY_SHARE,
  PLANNING_DAY,
  SOW_RESERVE,
  SPRING_DIG_SHARE,
  STORES_HIGH_YEARS,
  THRESH_END_DAY,
  WINDOWS,
} from './rules';
import type {
  ChronicleEvent,
  Construction,
  Dwelling,
  FieldPart,
  TaskName,
  VillageState,
  YearPlan,
} from './types';
import {
  TASK_ORDER,
  activeTasks,
  createPlan,
  harvestKg,
  taskRemaining,
  threshLossKg,
  windowEndOf,
} from './year-plan';

type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

/** Díl hotový nejpozději v posledním měsíci setí (duben) jde ještě do letošního plánu. */
const LAST_JOIN_MONTH = Math.max(...WINDOWS.sow.map(([, to]) => to));
/** Bonus vymýceného lesa trvá roky × 365 dní. */
const DAYS_PER_BONUS_YEAR = 365;
/** Tolerance, pod kterou se nasycení ještě bere jako plné. */
const SATIATION_EPSILON = 1e-9;

/**
 * Dopočítá ves do dne `toDay` včetně – den po dni od `lastDay + 1`. Vstup nemění.
 * Výsledek nezávisí na tom, po jakých kouscích se dopočítává (náhoda dne je ze seedu a dne;
 * kronika se zkrátí na posledních CHRONICLE_MAX_EVENTS událostí – simulace ji nečte).
 * RangeError, když `toDay` leží za koncem světa nebo před už odsimulovaným dnem.
 */
export function advanceVillage(state: VillageState, toDay: number): VillageState {
  if (!Number.isInteger(toDay) || toDay >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${toDay} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
  if (toDay < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, nelze zpět na ${toDay}.`);
  }
  const next = structuredClone(state);
  for (let day = next.lastDay + 1; day <= toDay; day++) simulateDay(next, day);
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
function simulateDay(state: VillageState, day: number): void {
  const date = dateOfDayIndex(day);
  // sady: shnilá jablka, konec péče a stárnutí (1. 3.), začátek a konec sklizně a péče
  state.chronicle.push(...orchardSeasonDay(state, day));
  if (isOn(date, PLANNING_DAY)) planYear(state, day, date.year);
  if (date.month >= PLANNING_DAY.month || date.month <= LAST_JOIN_MONTH) {
    joinFinishedParts(state, day, date.year);
  }
  work(state, day);
  finishConstructions(state, day);
  decideRebuilds(state, day);
  occupyEmptyDwellings(state, day);
  const satiation = eat(state, day);
  state.chronicle.push(...populationDay(state, day, satiation));
  // Sklizeň a ztráta nevymláceného až po jídle (Ruling 13) – 31. 8. se jí ještě z loňských
  // zásob, jak počítá daysUntilHarvest (31. 8. → 1 den).
  if (isOn(date, HARVEST_DAY)) harvest(state, day);
  if (isOn(date, THRESH_END_DAY)) endThreshing(state);
}

function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

// --- plán osevu -------------------------------------------------------------------------

/** Krok 1 (1. 9.): konec hospodářského roku pro všechny díly a nový plán osevu. */
function planYear(state: VillageState, day: number, year: number): void {
  for (const part of state.parts) {
    const event = endOfSeason(part, day);
    if (event) state.chronicle.push(event);
  }
  const { targetKg, maxHa } = sowingLimits(state, day, year);
  const selected = selectPartsToSow(state.parts, targetKg, maxHa, day);
  // plán vzniká před změnou stavu dílů – vrácení přílohu se počítá jen u dílů v přílohu
  state.plan = createPlan(selected, day);
  const chosen = new Set(selected.map((p) => p.id));
  for (const part of state.parts) {
    if (chosen.has(part.id) || (part.state !== 'sown' && part.state !== 'ready')) continue;
    // nevybraný osev i nevyužitý hotový díl jdou do přílohu a začnou zarůstat
    part.state = 'fallow';
    part.fallowSinceDay = day;
    part.sownYears = 0;
  }
  sow(selected, day);
}

/**
 * Krok 2 (1. 9. – 30. 4.): díly hotové v předchozích dnech jdou do letošního plánu, když ho
 * plán nepokrývá – bez plánu ho založí. Díly hotové po dubnu čekají na 1. 9.
 */
function joinFinishedParts(state: VillageState, day: number, year: number): void {
  if (!state.parts.some((p) => p.state === 'ready')) return;
  const { targetKg, maxHa } = sowingLimits(state, day, year);
  const plan = state.plan;
  if (plan === null) {
    const selected = selectPartsToSow(state.parts, targetKg, maxHa, day);
    if (selected.length === 0) return;
    state.plan = createPlan(selected, day);
    sow(selected, day);
    return;
  }
  // díly plánu (oseté) jdou ve výběru první – nové díly přibudou, jen když cíl nepokryjí
  const inPlan = new Set(plan.partIds);
  const candidates = state.parts.filter((p) => inPlan.has(p.id) || p.state === 'ready');
  const added = selectPartsToSow(candidates, targetKg, maxHa, day).filter((p) => !inPlan.has(p.id));
  if (added.length === 0) return;
  const extra = createPlan(added, day);
  for (const task of TASK_ORDER) plan.required[task] += extra.required[task];
  plan.partIds.push(...extra.partIds);
  sow(added, day);
}

/**
 * Cíl osevu (roční potřeba + rezerva, při velkých zásobách jen potřeba) a nejvýš kolik
 * hektarů stihne práce ve špičkách – jarní kopání se setím a letní sklizeň.
 */
function sowingLimits(
  state: VillageState,
  day: number,
  year: number,
): { targetKg: number; maxHa: number } {
  const need = state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  const targetKg = state.storesKg > STORES_HIGH_YEARS * need ? need : need * (1 + SOW_RESERVE);
  const capacity = state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  const dailyMin = DAILY_MIN_PER_HOUSEHOLD * householdCount(state);
  const free = Math.max(0, capacity - dailyMin) * PEAK_CAPACITY_SHARE;
  const springCap = free * windowDays(year, WINDOWS.sow);
  const summerCap = free * windowDays(year, WINDOWS.harvest);
  const maxHa = Math.min(
    springCap / (FIELD_WORK_PER_HA.dig * SPRING_DIG_SHARE + FIELD_WORK_PER_HA.sow),
    summerCap / FIELD_WORK_PER_HA.harvest,
  );
  return { targetKg, maxHa };
}

/**
 * Počet dní v měsíčních oknech. Okna setí a sklizně nezahrnují únor, takže jejich délka na
 * roku nezávisí – stačí letošní rok (příští by v roce 1499 ležel mimo svět).
 */
function windowDays(year: number, segments: readonly (readonly [number, number])[]): number {
  let days = 0;
  for (const [from, to] of segments) {
    const end =
      to < 12
        ? dayIndexOf({ year, month: to + 1, day: 1 })
        : dayIndexOf({ year, month: 12, day: 31 }) + 1;
    days += end - dayIndexOf({ year, month: from, day: 1 });
  }
  return days;
}

/** Do kdy platí bonus úrodnosti lesa vymýceného v den `day`. */
function forestBonusUntil(day: number): number {
  return day + FERTILITY.forestBonusYears * DAYS_PER_BONUS_YEAR;
}

/** Vybrané díly se osejí; příloh starší 15 let se vrací z lesa a dostane bonus úrodnosti. */
function sow(parts: FieldPart[], day: number): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      if (fallowYears(part, day) >= FOREST_AFTER_YEARS) part.bonusUntilDay = forestBonusUntil(day);
      part.fallowSinceDay = null;
      part.sownYears = 0;
    }
    part.state = 'sown';
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

/**
 * Krok 3: rozdělení práce vsi. Polní úlohy plánu (bez výmlatu – úroda plánu ještě neroste)
 * a výmlat loňské úrody, sezónní práce v sadech podle konce svého okna (sklizeň jablek před
 * podzimním kopáním, péče až po výmlatu); opravy obydlí poměrně k potřebě; společná práce do
 * staveb.
 */
function work(state: VillageState, day: number): void {
  const owned: { name: TaskName; remaining: number; plan: YearPlan }[] = [];
  const plan = state.plan;
  if (plan !== null) {
    for (const name of activeTasks(plan, day)) {
      if (name !== 'thresh') owned.push({ name, remaining: taskRemaining(plan, name), plan });
    }
  }
  const threshing = state.threshingFromPlan;
  if (threshing !== null && activeTasks(threshing, day).includes('thresh')) {
    owned.push({ name: 'thresh', remaining: taskRemaining(threshing, 'thresh'), plan: threshing });
  }

  const tasks: { name: LaborTaskName; remaining: number }[] = owned.map(({ name, remaining }) => ({
    name,
    remaining,
  }));
  const orchard = orchardTask(state, day);
  if (orchard) {
    // polní úlohy se stejným nebo dřívějším koncem okna mají přednost (výmlat před péčí)
    const month = dateOfDayIndex(day).month;
    const after = owned.findIndex((t) => (windowEndOf(WINDOWS[t.name], month) ?? 0) > orchard.end);
    tasks.splice(after < 0 ? tasks.length : after, 0, orchard);
  }

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
  });

  for (const task of owned) {
    const done = task.plan.done[task.name] + allocation.tasks[task.name];
    task.plan.done[task.name] = Math.min(task.plan.required[task.name], done);
  }
  if (orchard) workOrchards(state, allocation.tasks[orchard.name]);
  households.forEach((d, i) => {
    const need = repairNeeds[i] ?? 0;
    applyRepairs(d, repairNeed > 0 ? (allocation.repairs * need) / repairNeed : 0, need);
  });
  decayEmptyDwellings(state, day, new Set(households.map((d) => d.id)));
  state.domesticBacklog = allocation.domesticBacklog;
  build(state, day, allocation.common);
  state.commonLaborHistory.push(allocation.common);
  if (state.commonLaborHistory.length > COMMON_LABOR_HISTORY_DAYS) {
    state.commonLaborHistory.splice(0, state.commonLaborHistory.length - COMMON_LABOR_HISTORY_DAYS);
  }
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
 * opustí (nebere společnou práci), obydlí chátrá a na nule zanikne.
 */
function decayEmptyDwellings(state: VillageState, day: number, occupied: Set<number>): void {
  state.constructions = state.constructions.filter(
    (c) => !(c.kind === 'rebuild' && c.dwellingId !== null && !occupied.has(c.dwellingId)),
  );
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
function constructionNeed(state: VillageState, c: Construction, day: number): number {
  if (c.kind === 'orchard') return orchardPlantingNeed(state, c, day);
  if (c.kind !== 'field') return Math.max(0, c.cost - c.done);
  return foundingParts(state, c).reduce((sum, p) => sum + (p.foundingCost - p.foundingDone), 0);
}

function foundingParts(state: VillageState, c: Construction): FieldPart[] {
  return state.parts.filter((p) => p.fieldId === c.fieldId && p.state === 'founding');
}

/**
 * Společná práce rovným dílem do rozestavěných staveb: stavba, které stačí méně, si vezme jen
 * to, co potřebuje, a zbytek se znovu rozdělí mezi ostatní; co zbude po všech, propadne.
 */
function build(state: VillageState, day: number, common: number): void {
  let active = state.constructions
    .map((c) => ({ c, need: constructionNeed(state, c, day) }))
    .filter((x) => x.need > 0);
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) invest(state, day, x.c, share, false);
      return;
    }
    for (const x of saturated) {
      invest(state, day, x.c, x.need, true);
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
}

/** Vloží práci do stavby; `completes` = dostala vše, co jí chybělo. */
function invest(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
): void {
  if (c.kind === 'orchard') {
    plantOrchard(state, day, c, amount, completes);
    return;
  }
  if (c.kind !== 'field') {
    c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
    return;
  }
  // pole zakládá díly od nejbližšího k obydlí; přebytek dne teče do dalšího dílu
  const parts = foundingParts(state, c).sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  let left = amount;
  for (const part of parts) {
    const need = part.foundingCost - part.foundingDone;
    if (completes || left >= need) {
      left -= need;
      part.foundingDone = part.foundingCost;
      part.state = 'ready';
      if (part.surface === 'forest') part.bonusUntilDay = forestBonusUntil(day);
      // založený díl: stromy, kameny a keře z něj zmizí natrvalo (fields.md – Zakládání)
      if (part.obstacles) {
        recordClearedObstacles(state, part.obstacles, day);
        delete part.obstacles;
      }
    } else {
      part.foundingDone += left;
      break;
    }
  }
  c.done = state.parts
    .filter((p) => p.fieldId === c.fieldId)
    .reduce((sum, p) => sum + p.foundingDone, 0);
}

// --- stavby a domácnosti ------------------------------------------------------------------

function isFinished(state: VillageState, c: Construction): boolean {
  if (c.kind === 'field') return foundingParts(state, c).length === 0;
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
  for (const c of state.constructions) {
    if (!isFinished(state, c)) {
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
      .filter((p) => isFertileAdult(p, day))
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

/** Krok 5: obyvatelé dožilého nebo zchátralého obydlí se rozhodnou ho přestavět. */
function decideRebuilds(state: VillageState, day: number): void {
  const rebuilding = new Set(
    state.constructions.filter((c) => c.kind === 'rebuild').map((c) => c.dwellingId),
  );
  const history = state.commonLaborHistory;
  const averageCommon =
    history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
  for (const d of occupiedDwellings(state)) {
    if (rebuilding.has(d.id) || !wantsRebuild(d, day)) continue;
    const type = rebuildType(d.type, averageCommon);
    state.constructions.push({
      id: state.nextId++,
      kind: 'rebuild',
      startedDay: day,
      cost: DWELLINGS[type].cost,
      done: 0,
      dwellingType: type,
      position: null,
      dwellingId: d.id,
      fieldId: null,
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

/** 31. 8. (po jídle dne): čistá úroda do zásob, plán jde k výmlatu. */
function harvest(state: VillageState, day: number): void {
  const plan = state.plan;
  if (plan === null) return;
  const kg = harvestKg(plan, state.parts, day);
  state.storesKg += kg;
  plan.harvestedKg = kg;
  state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  state.threshingFromPlan = plan;
  state.plan = null;
}

/** 1. 3. (po jídle dne): nevymlácená část úrody se zkazila. */
function endThreshing(state: VillageState): void {
  const threshing = state.threshingFromPlan;
  if (threshing === null) return;
  const loss = threshLossKg(threshing, threshing.harvestedKg ?? 0);
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
    daysUntilHarvest(day),
    daysUntilAppleRot(day),
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
