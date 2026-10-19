import { dateOfDayIndex } from '../calendar';
import { fallowStage, partOvergrowthYears, sowingGroup } from './fields';
import { dropFromWork } from './land-taken';
import { CROP_WINDOWS } from './rules';
import type {
  Crop,
  CropWork,
  ExtraPart,
  ExtraTask,
  FieldPart,
  VillageState,
  YearPlan,
} from './types';
import { addLogs, logsFromClearedTrees } from './wood';
import { woodMatureShare, woodTreesOnArea } from './woods';
import {
  TASK_ORDER,
  addCropTaskWork,
  addToCropWork,
  createCropWork,
  cropTaskDone,
  partWeight,
  partWork,
  cropTaskRemaining,
  windowEndOf,
  type CropTask,
  type PartWork,
  type WorkOrder,
} from './year-plan';

// Osev navíc (fields.md – Kolik ves oseje, Osev navíc; Martin 19. 10. 2026: „Vesničané se snaží
// vyrobit co nejvíce jídla (později přibudou nejspíš i jiné suroviny), ale pokud se něco staví, tak
// čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad.“). Potřebný
// osev je plán k 1. 9. (`chooseCrops`); ostatní díly, které ves smí osít, čekají v `YearPlan.extra`
// v pořadí výběru a dostanou jen práci, která zbude po stavbách – jen obilí. Díl, na kterém práce
// začala, patří k ozimu nebo jaři plánu jako potřebný (setí, pletí, sklizeň i výmlat mají přednost).

/** Tolerance porovnání práce (člověkodny). */
const EPSILON = 1e-9;
/** Měsíce, kdy osev navíc nezačne až do dalšího plánu (květen–srpen) – seznam se smaže. */
const CLOSED_MONTHS: readonly [number, number] = [5, 8];

/**
 * Vybrané díly se osejí plodinou `crop` (příloh se vrací do osevu – zarůstání začne znovu); díl
 * z přílohu si pamatuje, jak ležel, kdyby ho plán podle zásob zase ubral (fields.md – Osev podle
 * zásob).
 */
export function sowParts(parts: readonly FieldPart[], crop: Crop): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      part.fallowBeforePlan = {
        sinceDay: part.fallowSinceDay,
        ...(part.overgrowthYears !== undefined ? { overgrowthYears: part.overgrowthYears } : {}),
      };
      part.fallowSinceDay = null;
      part.sownYears = 0;
      delete part.overgrowthYears;
    }
    part.state = 'sown';
    part.crop = crop;
  }
}

/**
 * Klády z vracených dílů v mladém lese (fields.md – Zarůstání): dospělých stromů jako v lese vsi
 * stejného stáří (`woodMatureShare` × hustota lesa) – za každý celý strom kláda (forest.md –
 * Mýcení). Díly ve stavu před osevem.
 */
export function reclaimedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    if (part.state !== 'fallow' || fallowStage(part, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(partOvergrowthYears(part));
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/**
 * Díl, který jde do osevu navíc (při plánu nevybraný, nebo ubraný z plánu): díl z přílohu jen id,
 * osévaný nebo připravený s léty v řadě, se kterými se po začátku práce osévá dál.
 */
export function extraPartOf(part: FieldPart): ExtraPart {
  return part.state === 'fallow' || part.fallowBeforePlan
    ? { id: part.id }
    : { id: part.id, sownYears: part.sownYears };
}

/**
 * Přidá díly do osevu navíc (mutuje plán) – na začátek (`front`, ubrané z plánu: ve výběru byly
 * před ostatními), nebo na konec; díl, který na seznamu už je, se nepřidá.
 */
export function queueExtraParts(plan: YearPlan, parts: readonly ExtraPart[], front = false): void {
  const queued = new Set((plan.extra ?? []).map((e) => e.id));
  const added = parts.filter((e) => !queued.has(e.id));
  if (added.length === 0) return;
  plan.extra = front ? [...added, ...(plan.extra ?? [])] : [...(plan.extra ?? []), ...added];
}

/** Díly, které ves zařadila do potřebného osevu, z osevu navíc zmizí (mutuje plán). */
export function unqueueExtraParts(plan: YearPlan, ids: ReadonlySet<number>): void {
  if (!plan.extra) return;
  const left = plan.extra.filter((e) => !ids.has(e.id));
  if (left.length > 0) plan.extra = left;
  else delete plan.extra;
}

/** Díl smí do osevu navíc: připravený, nebo příloh, který smí osít (přílohová soustava). */
function isWaiting(part: FieldPart): boolean {
  return (part.state === 'fallow' || part.state === 'ready') && sowingGroup(part) !== null;
}

/** Okno úlohy plodiny dnes běží. */
function windowOpen(crop: Crop, task: 'reclaim' | 'dig' | 'sow', day: number): boolean {
  return windowEndOf(CROP_WINDOWS[crop][task], dateOfDayIndex(day).month) !== null;
}

/**
 * Plodina, kterou dnes začíná osev navíc (fields.md – Osev navíc): ozim, dokud po dnešku zbývá
 * den setí ozimu (zaseje se, co je zkopané do včerejška), potom jař v oknech kopání jaře – na
 * jaře jen dokud po dnešku zbývá den setí. Jinak null (díly navíc čekají; po dubnu zůstanou ladem).
 */
export function extraSowingCrop(day: number): 'winter' | 'spring' | null {
  if (windowOpen('winter', 'sow', day) && windowOpen('winter', 'sow', day + 1)) return 'winter';
  if (!windowOpen('spring', 'dig', day)) return null;
  return !windowOpen('spring', 'sow', day) || windowOpen('spring', 'sow', day + 1)
    ? 'spring'
    : null;
}

/** Vstup kroku osevu navíc. */
export interface ExtraSowingInput {
  /** Práce, kterou dnes nespotřebovaly stavby (a opravy obydlí) – člověkodny. */
  labor: number;
  /**
   * Kapacita spřežení, která po orbě potřebného osevu dnes zbyla (člověkodny orby při plném
   * výkonu – `ploughCapacityPerDay`); spřežení, která dnes vozí, neorají (0).
   */
  ploughCap: number;
  /** Výkon orby plodiny dnes – délka brázdy pásu a cesta k bloku (`ploughDayFactor`). */
  ploughFactor: (work: CropWork) => number;
  toolCoverage: number;
  /** Pořadí práce dílů (po úsecích hospodářství) – spočítá se, jen když se nějaký díl přidá. */
  order: () => WorkOrder;
}

/** Polní práce navíc dne: úloha plodiny a kolik z ní bylo hotové před a po (člověkodny). */
export interface ExtraFieldWork {
  task: CropTask;
  work: CropWork;
  before: number;
  after: number;
  amount: number;
}

/** Díl, na kterém má dnes začít práce navíc: stav jako při plánu (`probe`) a jeho práce za rok. */
interface Picked {
  entry: ExtraPart;
  part: FieldPart;
  probe: FieldPart;
  work: PartWork;
}

/** Díl ve stavu, ve kterém ho plán bere: osévaný či připravený díl zase osévaný (kopie). */
function planState(part: FieldPart, entry: ExtraPart): FieldPart {
  if (entry.sownYears === undefined || part.state !== 'fallow') return { ...part };
  return { ...part, state: 'sown', fallowSinceDay: null, sownYears: entry.sownYears };
}

/** Na dílu začala práce navíc – osévá se plodinou `crop` (mutuje díl). */
function startPart(part: FieldPart, entry: ExtraPart, crop: Crop): void {
  if (entry.sownYears !== undefined && part.state === 'fallow') {
    // osévaný díl jen od plánu ležel ladem – osévá se dál, jako by ho plán vybral
    part.state = 'sown';
    part.fallowSinceDay = null;
    part.sownYears = entry.sownYears;
  }
  sowParts([part], crop);
}

/** Uložené pole dílu, které začátek práce mění – kdyby práce na dílu nakonec nezačala. */
type PartSnapshot = Pick<
  FieldPart,
  'state' | 'crop' | 'fallowSinceDay' | 'sownYears' | 'overgrowthYears' | 'fallowBeforePlan'
>;

function snapshotOf(part: FieldPart): PartSnapshot {
  return {
    state: part.state,
    crop: part.crop,
    fallowSinceDay: part.fallowSinceDay,
    sownYears: part.sownYears,
    overgrowthYears: part.overgrowthYears,
    fallowBeforePlan: part.fallowBeforePlan,
  };
}

function restore(part: FieldPart, snapshot: PartSnapshot): void {
  part.state = snapshot.state;
  part.fallowSinceDay = snapshot.fallowSinceDay;
  part.sownYears = snapshot.sownYears;
  for (const key of ['crop', 'overgrowthYears', 'fallowBeforePlan'] as const) {
    if (snapshot[key] === undefined) delete part[key];
  }
  if (snapshot.crop !== undefined) part.crop = snapshot.crop;
  if (snapshot.overgrowthYears !== undefined) part.overgrowthYears = snapshot.overgrowthYears;
  if (snapshot.fallowBeforePlan !== undefined) part.fallowBeforePlan = snapshot.fallowBeforePlan;
}

/**
 * Díly, na kterých práce dnes nakonec nezačala, z práce plodiny zase zmizí (mutuje `work`) –
 * přesně o jejich práci; hotová práce se jich netýká (žádná úloha na ně nedošla).
 */
function removeUnstarted(work: CropWork, picked: readonly Picked[]): void {
  for (const { work: part, probe } of picked) {
    for (const task of TASK_ORDER) {
      work.required[task] = Math.max(0, work.required[task] - part[task]);
      work.done[task] = Math.min(work.done[task], work.required[task]);
    }
    const plough = work.plough;
    if (plough) {
      plough.required = Math.max(0, plough.required - part.plough);
      plough.done = Math.min(plough.done, plough.required);
      plough.weight = Math.max(0, plough.weight - partWeight(probe));
    }
  }
  dropFromWork(work, new Set(picked.map((p) => p.part.id)));
}

/** Úlohy přípravy půdy dílů navíc, které čekají na volnou práci (`CropWork.extraLeft`). */
const EXTRA_TASKS: readonly ExtraTask[] = ['reclaim', 'dig', 'plough'];

/** Práce přípravy půdy dílů navíc, která ještě čeká (nejvýš zbývající práce úlohy). */
function extraLeftOf(work: CropWork, task: ExtraTask): number {
  return Math.min(work.extraLeft?.[task] ?? 0, cropTaskRemaining(work, task));
}

/**
 * Chce dnes osev navíc orat spřežením (fields.md – Osev navíc, oxen.md – Jen rádlo)? Ano, když
 * čekají díly navíc nebo jejich příprava a plodina dne se orá – pak voli nejedou s vozem
 * (wagons.md – Co vozy vozí). Stejné podmínky jako začátek `extraSowingDay` (bez práce dne).
 */
export function extraSowingWantsTeam(state: VillageState, day: number): boolean {
  const plan = state.plan;
  if (!plan) return false;
  const month = dateOfDayIndex(day).month;
  if (month >= CLOSED_MONTHS[0] && month <= CLOSED_MONTHS[1]) return false;
  const crop = extraSowingCrop(day);
  if (crop === null) return false;
  const existing = crop === 'winter' ? (plan.winter ?? null) : plan;
  if (!plan.extra && !existing?.extraLeft) return false;
  return (existing ?? plan).plough !== undefined;
}

/**
 * Krok osevu navíc (fields.md – Osev navíc; mutuje stav): práce, kterou nespotřebovaly stavby, jde
 * napřed na přípravu půdy začatých dílů navíc (`CropWork.extraLeft`), pak na další díly navíc
 * v pořadí výběru – vrácení přílohu (jen v jeho okně) a kopání, nebo orba spřežením, která po
 * potřebném osevu zbyla. Díly, na kterých práce začala, se osejí plodinou dne (`extraSowingCrop`)
 * a přidají se k její práci v plánu – setí, pletí, sklizeň a výmlat jsou pak potřebné, příprava
 * půdy dál čeká na volnou práci. Díl, na který dnes práce nedošla, čeká dál. Po dubnu se seznam
 * smaže. Vrací práci dne pro rozdělení práce (labor-report.ts) a kolik práce navíc ves odvedla.
 */
export function extraSowingDay(
  state: VillageState,
  day: number,
  input: ExtraSowingInput,
): { fieldWork: ExtraFieldWork[]; labor: number } {
  const none = { fieldWork: [], labor: 0 };
  const plan = state.plan;
  if (!plan) return none;
  const month = dateOfDayIndex(day).month;
  if (month >= CLOSED_MONTHS[0] && month <= CLOSED_MONTHS[1]) {
    // po dubnu osev navíc nezačne ani se nedokope – zbylé díly leží ladem do dalšího plánu
    delete plan.extra;
    for (const work of [plan, plan.winter]) if (work) delete work.extraLeft;
    return none;
  }
  const crop = extraSowingCrop(day);
  if (crop === null || input.labor <= EPSILON) return none;
  const existing = crop === 'winter' ? (plan.winter ?? null) : plan;
  if (!plan.extra && !existing?.extraLeft) return none;
  // ves se spřežením orá všechno (oxen.md – Jen rádlo): plodina se buď celá orá, nebo celá kope
  const ploughs = (existing ?? plan).plough !== undefined;
  if (ploughs && input.ploughCap <= EPSILON) return none;
  const reclaimOpen = windowOpen(crop, 'reclaim', day);
  const till: ExtraTask = ploughs ? 'plough' : 'dig';
  // co čeká z dřívějška, a potřebná práce, která čekat nesmí (zůstane, jak byla)
  const waitingWork = (task: ExtraTask): number => (existing ? extraLeftOf(existing, task) : 0);
  const neededLeft = Object.fromEntries(
    EXTRA_TASKS.map((t) => [t, existing ? cropTaskRemaining(existing, t) - waitingWork(t) : 0]),
  ) as Record<ExtraTask, number>;
  const oldReclaim = reclaimOpen ? waitingWork('reclaim') : 0;
  const oldTill = waitingWork(till);

  // díly v pořadí výběru, dokud stačí práce (a kapacita spřežení) – poslední jen začatý
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const picked: Picked[] = [];
  const waiting = new Set<number>();
  let labor = input.labor - oldReclaim - oldTill;
  let teams = ploughs ? input.ploughCap - oldTill : Infinity;
  for (const entry of plan.extra ?? []) {
    const part = partsById.get(entry.id);
    if (!part || !isWaiting(part)) continue;
    if (labor <= EPSILON || teams <= EPSILON) {
      waiting.add(entry.id);
      continue;
    }
    const probe = planState(part, entry);
    const work = partWork(probe, day, input.toolCoverage, ploughs, crop);
    // příloh, který se musí vrátit, mimo okno vrácení nezačne (na jaře jen díly bez drnu)
    if (work.reclaim > EPSILON && !reclaimOpen) {
      waiting.add(entry.id);
      continue;
    }
    picked.push({ entry, part, probe, work });
    labor -= work.reclaim + work.dig + work.plough;
    teams -= work.plough;
  }
  const keep = (ids: ReadonlySet<number>): void => {
    const left = (plan.extra ?? []).filter((e) => ids.has(e.id));
    if (left.length > 0) plan.extra = left;
    else delete plan.extra;
  };
  if (picked.length === 0 && oldReclaim + oldTill <= EPSILON) {
    keep(waiting);
    return none;
  }

  const work =
    existing ?? createCropWork([], day, input.toolCoverage, ploughs, input.order(), crop);
  if (!existing) plan.winter = work;
  const snapshots = picked.map((p) => snapshotOf(p.part));
  if (picked.length > 0) {
    addToCropWork(
      work,
      picked.map((p) => p.probe),
      day,
      input.toolCoverage,
      input.order(),
      crop,
    );
  }
  for (const p of picked) startPart(p.part, p.entry, crop);

  const fieldWork: ExtraFieldWork[] = [];
  let left = input.labor;
  const put = (task: CropTask, wanted: number): number => {
    if (wanted <= EPSILON) return 0;
    const before = cropTaskDone(work, task);
    addCropTaskWork(work, task, wanted);
    const after = cropTaskDone(work, task);
    if (after - before <= EPSILON) return 0;
    fieldWork.push({ task, work, before, after, amount: after - before });
    left -= after - before;
    return after - before;
  };
  // potřebná práce dostala dnes všechno (práce zbyla) – co ještě zbývá, patří dílům navíc
  const reclaimed = reclaimOpen
    ? put('reclaim', Math.min(left, cropTaskRemaining(work, 'reclaim') - neededLeft.reclaim))
    : 0;
  const tillCap = ploughs ? input.ploughCap * input.ploughFactor(work) : Infinity;
  const tilled = put(
    till,
    Math.min(left, tillCap, cropTaskRemaining(work, till) - neededLeft[till]),
  );

  // práce dílům po pořadí: napřed co čekalo, pak nové díly – díl, na který dnes nedošla (spřežení
  // zorala méně, než se čekalo), nezačal a vrátí se mezi díly navíc, jak byl
  const started = startedInOrder(
    picked,
    Math.max(0, reclaimed - oldReclaim),
    Math.max(0, tilled - oldTill),
  );
  const unstarted = picked.filter((_, i) => !started[i]);
  if (unstarted.length > 0) {
    removeUnstarted(work, unstarted);
    picked.forEach((p, i) => {
      if (!started[i]) restore(p.part, snapshots[i]!);
    });
  }
  for (const p of unstarted) waiting.add(p.entry.id);
  if (!existing && work.partIds.length === 0) {
    delete plan.winter;
  } else {
    // příprava půdy začatých dílů navíc dál čeká na volnou práci – potřebná práce zůstala
    const extraLeft: Partial<Record<ExtraTask, number>> = {};
    for (const task of EXTRA_TASKS) {
      const rest = cropTaskRemaining(work, task) - Math.max(0, neededLeft[task]);
      if (rest > EPSILON) extraLeft[task] = rest;
    }
    if (Object.keys(extraLeft).length > 0) work.extraLeft = extraLeft;
    else delete work.extraLeft;
  }
  keep(waiting);
  // vrácený mladý les dá za dospělé stromy klády (fields.md – Zarůstání, forest.md – Mýcení)
  const begun = picked.filter((_, i) => started[i]).map((p) => p.probe);
  addLogs(state, reclaimedLogs(begun, day));
  return { fieldWork, labor: input.labor - left };
}

/**
 * Na kterých dílech dnes práce navíc začala: vrácení přílohu a kopání (orba) po dílech v pořadí
 * výběru – díl začal, když na něj došla některá z nich.
 */
function startedInOrder(picked: readonly Picked[], reclaimed: number, tilled: number): boolean[] {
  let reclaim = reclaimed;
  let till = tilled;
  return picked.map(({ work }) => {
    const tillage = work.dig + work.plough;
    const got =
      (work.reclaim > EPSILON && reclaim > EPSILON) || (tillage > EPSILON && till > EPSILON);
    reclaim = Math.max(0, reclaim - work.reclaim);
    till = Math.max(0, till - tillage);
    return got;
  });
}
