import { dateOfDayIndex } from '../calendar';
import {
  distanceFactor,
  partWalkDistance,
  effectiveFertility,
  fallowStage,
  grossYieldPerHa,
  isWeedFree,
  reclaimCostPerHa,
} from './fields';
import { daysUntilHarvest, daysUntilWinterHarvest } from './food';
import { isPloughable, ploughWorkPerHa } from './plough';
import { fieldWorkPerHa } from './productivity';
import { CROP_WINDOWS, SEED_KG_PER_HA, UNWEEDED_YIELD, type WindowSegment } from './rules';
import type { Crop, CropWork, FieldPart, FieldTask, TaskName, YearPlan } from './types';

const M2_PER_HA = 10_000;
const MONTHS_PER_YEAR = 12;
/**
 * Pořadí úloh – rozhoduje při shodě konce okna. Na podzim vracení přílohu před kopáním, na jaře
 * setí před dalším kopáním (Ruling 14): zaseje se, co je zkopané (taskRemaining), takže pole
 * nedokopané do konce dubna dá aspoň úrodu zkopané části. Totéž platí pro ozim na podzim.
 */
export const TASK_ORDER: readonly TaskName[] = [
  'reclaim',
  'sow',
  'dig',
  'weed',
  'harvest',
  'thresh',
];
const RATE_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];

export function emptyTaskRecord(): Record<TaskName, number> {
  return { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
}

/** Práce dílu za rok po úlohách a orba rádlem (`plough` – jen díly, které orá spřežení). */
export type PartWork = Record<TaskName, number> & { plough: number };

/**
 * Váha dílu v polních pracích – plocha × příplatek za vzdálenost chůze po pěšinách (ha, paths.md)
 * – stejný příplatek jako v `partWork`.
 */
export function partWeight(part: FieldPart): number {
  return (part.areaM2 / M2_PER_HA) * distanceFactor(partWalkDistance(part));
}

/**
 * Člověkodny prací jednoho dílu za rok podle sazeb (meze podle pokrytí nástroji) a vzdálenosti.
 * První sezónu po vymýcení lesa se díl neplete; příloh stojí navíc vrácení podle stadia (mladý
 * příloh nic, louka drn, křoviny a mladý les jako jejich založení – fields.md, Zarůstání).
 * S `plough` (ves má spřežení – oxen.md) díl, který rádlo zvládne, místo kopání orá.
 */
export function partWork(
  part: FieldPart,
  day: number,
  toolCoverage: number,
  plough = false,
): PartWork {
  const work: PartWork = { ...emptyTaskRecord(), plough: 0 };
  const ha = part.areaM2 / M2_PER_HA;
  const factor = distanceFactor(partWalkDistance(part));
  const weedFree = isWeedFree(part, day);
  for (const task of RATE_TASKS) {
    if (task === 'weed' && weedFree) continue;
    work[task] = ha * fieldWorkPerHa(task, toolCoverage) * factor;
  }
  if (part.state === 'fallow') {
    work.reclaim = reclaimCostPerHa(fallowStage(part, day), toolCoverage) * ha * factor;
  }
  if (plough && isPloughable(part, day)) {
    work.plough = ha * ploughWorkPerHa(toolCoverage) * factor;
    work.dig = 0;
  }
  return work;
}

/** Pořadí dílů, ve kterém k nim postupuje práce plodiny. */
export type WorkOrder = (parts: readonly FieldPart[]) => FieldPart[];

/** Dřívější pořadí práce: nejblíž obydlím první, při shodě podle id. */
export const nearestFirst: WorkOrder = (parts) =>
  [...parts].sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);

/**
 * Práce jedné plodiny pro vybrané díly (viz `partWork`). Díly se seřadí, jak k nim práce
 * postupuje (fields.md – Postup práce po čtvercích): ves s hospodářstvími po úsecích od domu ven
 * (`workOrder` v holdings.ts), jinak nejblíž obydlím první, při shodě podle id. S `plough` orá
 * spřežení díly, které rádlo zvládne (`plough` v práci plodiny).
 */
export function createCropWork(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): CropWork {
  const required = emptyTaskRecord();
  const ordered = order(selected);
  const reclaimIds: number[] = [];
  const ploughIds: number[] = [];
  let ploughRequired = 0;
  let ploughWeight = 0;
  let digWeight = 0;
  for (const part of ordered) {
    const work = partWork(part, day, toolCoverage, plough);
    for (const task of TASK_ORDER) required[task] += work[task];
    if (work.reclaim > 0) reclaimIds.push(part.id);
    if (work.plough > 0) {
      ploughIds.push(part.id);
      ploughRequired += work.plough;
      ploughWeight += partWeight(part);
    } else {
      digWeight += partWeight(part);
    }
  }
  return {
    partIds: ordered.map((p) => p.id),
    ...(reclaimIds.length > 0 ? { reclaimIds } : {}),
    required,
    done: emptyTaskRecord(),
    harvestedKg: null,
    ...(ploughIds.length > 0
      ? {
          plough: {
            partIds: ploughIds,
            required: ploughRequired,
            done: 0,
            weight: ploughWeight,
            digWeight,
          },
        }
      : {}),
  };
}

/** Plán prací na rok jen s jaří (tvar plánu z doby před ozimem). */
export function createPlan(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): YearPlan {
  return { plannedDay: day, ...createCropWork(selected, day, toolCoverage, plough, order) };
}

/** Roční plán s ozimem a jaří (fields.md – Ozim a jař); bez ozimu bez `winter`. */
export function createYearPlan(
  crops: { winter: FieldPart[]; spring: FieldPart[] },
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): YearPlan {
  const plan = createPlan(crops.spring, day, toolCoverage, plough, order);
  if (crops.winter.length > 0) {
    plan.winter = createCropWork(crops.winter, day, toolCoverage, plough, order);
  }
  return plan;
}

/**
 * Přidá do práce plodiny další díly (mutuje `work`) – nová dávka jde na konec, seřazená `order`.
 * S `plough` je orá spřežení (díly, které
 * rádlo zvládne) – plodina bez orby ji dostane; `parts` (díly vsi) pak určí váhu dílů, které se
 * u ní dosud kopaly (bez nich 0 – setí jde jen za orbou přidaných dílů).
 */
export function addToCropWork(
  work: CropWork,
  added: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  parts?: ReadonlyMap<number, FieldPart>,
  order: WorkOrder = nearestFirst,
): void {
  const extra = createCropWork(added, day, toolCoverage, plough, order);
  // váha dílů, které se u plodiny dosud kopaly – před přidáním nových dílů
  const dugBefore = work.plough
    ? work.plough.digWeight
    : work.partIds.reduce((sum, id) => {
        const part = parts?.get(id);
        return sum + (part ? partWeight(part) : 0);
      }, 0);
  for (const task of TASK_ORDER) work.required[task] += extra.required[task];
  work.partIds.push(...extra.partIds);
  if (extra.reclaimIds) work.reclaimIds = [...(work.reclaimIds ?? []), ...extra.reclaimIds];
  const addedDig =
    extra.plough?.digWeight ?? added.reduce((sum, part) => sum + partWeight(part), 0);
  if (work.plough) {
    work.plough.digWeight = dugBefore + addedDig;
    if (extra.plough) {
      work.plough.partIds.push(...extra.plough.partIds);
      work.plough.required += extra.plough.required;
      work.plough.weight += extra.plough.weight;
    }
  } else if (extra.plough) {
    work.plough = { ...extra.plough, digWeight: dugBefore + addedDig };
  }
}

/** Práce plánu po plodinách v pořadí ozim, jař (ozim jen, když ho plán má). */
export function planCrops(plan: YearPlan): { crop: Crop; work: CropWork }[] {
  const crops: { crop: Crop; work: CropWork }[] = [];
  if (plan.winter) crops.push({ crop: 'winter', work: plan.winter });
  crops.push({ crop: 'spring', work: plan });
  return crops;
}

/** Všechny díly plánu – ozim i jař. */
export function planPartIds(plan: YearPlan): number[] {
  return [...(plan.winter?.partIds ?? []), ...plan.partIds];
}

/** Hotový podíl úlohy vůči celé práci plodiny (0–1); úloha bez práce = 1. */
function planShare(work: CropWork, task: TaskName): number {
  return work.required[task] > 0 ? Math.min(1, work.done[task] / work.required[task]) : 1;
}

/** Hotový podíl orby (0–1); plodina bez orby 1. */
function ploughShare(work: CropWork): number {
  const plough = work.plough;
  return plough && plough.required > 0 ? Math.min(1, plough.done / plough.required) : 1;
}

/**
 * Zpracovaný podíl půdy plodiny (0–1) – zkopaná a zoraná část podle vah dílů (oxen.md: seje se,
 * co je zkopané nebo zorané). Bez orby podíl kopání.
 */
export function tilledShare(work: CropWork): number {
  const plough = work.plough;
  if (!plough) return planShare(work, 'dig');
  const total = plough.weight + plough.digWeight;
  if (total <= 0) return 1;
  return (planShare(work, 'dig') * plough.digWeight + ploughShare(work) * plough.weight) / total;
}

/**
 * Kolik práce úlohy se letos opravdu dělá (Ruling 17): setí jen na zkopané (zorané) části, pletí
 * a sklizeň jen na zasetou, výmlat jen sklizenou úrodu. Nezasetá půda se neplete ani nesklízí.
 */
function workableRequired(work: CropWork, task: TaskName): number {
  switch (task) {
    case 'sow':
      return work.required.sow * tilledShare(work);
    case 'weed':
    case 'harvest':
      return work.required[task] * planShare(work, 'sow');
    case 'thresh':
      return work.required.thresh * planShare(work, 'harvest');
    default:
      return work.required[task];
  }
}

/** Zbývající práce úlohy – jen na části, kam předchozí úloha došla (viz workableRequired). */
export function taskRemaining(work: CropWork, task: TaskName): number {
  return Math.max(0, workableRequired(work, task) - work.done[task]);
}

/** Polní úloha plodiny – úlohy plánu a orba rádlem (oxen.md). */
export type CropTask = TaskName | 'plough';

/** Zbývající orba plodiny (člověkodny); bez orby 0. */
export function ploughRemaining(work: CropWork): number {
  const plough = work.plough;
  return plough ? Math.max(0, plough.required - plough.done) : 0;
}

/** Zbývající práce úlohy nebo orby (viz `taskRemaining`). */
export function cropTaskRemaining(work: CropWork, task: CropTask): number {
  return task === 'plough' ? ploughRemaining(work) : taskRemaining(work, task);
}

/** Odvedená práce úlohy nebo orby (člověkodny). */
export function cropTaskDone(work: CropWork, task: CropTask): number {
  return task === 'plough' ? (work.plough?.done ?? 0) : work.done[task];
}

/** Vloží práci do úlohy nebo orby, nejvýš do potřebné (mutuje `work`). */
export function addCropTaskWork(work: CropWork, task: CropTask, amount: number): void {
  if (task === 'plough') {
    if (work.plough) work.plough.done = Math.min(work.plough.required, work.plough.done + amount);
    return;
  }
  work.done[task] = Math.min(work.required[task], work.done[task] + amount);
}

/** Okna úlohy plodiny – orba v oknech kopání. */
export function cropTaskWindows(crop: Crop, task: CropTask): readonly WindowSegment[] {
  return CROP_WINDOWS[crop][task === 'plough' ? 'dig' : task];
}

/** Hotový podíl úlohy vůči práci, která se letos dělá (0–1); bez takové práce 1. */
function workedShare(work: CropWork, task: TaskName): number {
  const workable = workableRequired(work, task);
  return workable > 0 ? Math.min(1, work.done[task] / workable) : 1;
}

/** Konec aktuálního úseku okna úlohy plodiny v měsících (viz `windowEndOf`). */
export function taskWindowEnd(task: TaskName, month: number, crop: Crop = 'spring'): number | null {
  return windowEndOf(CROP_WINDOWS[crop][task], month);
}

/**
 * Konec aktuálního úseku okna v měsících; navazující úsek od ledna se přičte (mlácení do konce
 * února = 14). Mimo okno null. Podle konce se řadí sezónní práce – nejbližší konec první.
 */
export function windowEndOf(segments: readonly WindowSegment[], month: number): number | null {
  const current = segments.find(([from, to]) => month >= from && month <= to);
  if (!current) return null;
  const [, to] = current;
  if (to === MONTHS_PER_YEAR) {
    const next = segments.find(([from]) => from === 1);
    if (next) return MONTHS_PER_YEAR + next[1];
  }
  return to;
}

/** Úlohy plodiny s nedodělkem, jejichž okno dnes běží; nejbližší konec okna první. */
export function activeTasks(work: CropWork, day: number, crop: Crop = 'spring'): TaskName[] {
  const { month } = dateOfDayIndex(day);
  const result: { task: TaskName; end: number }[] = [];
  for (const task of TASK_ORDER) {
    if (taskRemaining(work, task) <= 0) continue;
    const end = taskWindowEnd(task, month, crop);
    if (end !== null) result.push({ task, end });
  }
  // Array.sort je stabilní – při shodě zůstává pořadí z TASK_ORDER.
  return result.sort((a, b) => a.end - b.end).map((r) => r.task);
}

/**
 * Čistá úroda v kg (po odečtení osiva) z dílů práce plodiny. Pletí a sklizeň se měří jen
 * vůči zaseté části (Ruling 17) – částečné setí se tak nepromítne do úrody dvakrát. Díl
 * v první sezóně po vymýcení lesa pletí nepotřebuje, nedodělané pletí ostatních ho nesráží.
 */
export function harvestKg(work: CropWork, parts: FieldPart[], day: number): number {
  return cropYieldKg(work, parts, day, planShare(work, 'sow'), workedShare(work, 'harvest'));
}

function cropYieldKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  sowFrac: number,
  harvestFrac: number,
): number {
  const weedFrac = workedShare(work, 'weed');
  // díly plánu podle id najednou – hledat každý v celém poli by bylo kvadratické
  const wanted = new Set(work.partIds);
  const byId = new Map<number, FieldPart>();
  for (const part of parts) if (wanted.has(part.id)) byId.set(part.id, part);
  let total = 0;
  for (const id of work.partIds) {
    const part = byId.get(id);
    if (!part) continue;
    const ha = part.areaM2 / M2_PER_HA;
    const weeded = isWeedFree(part, day) ? 1 : weedFrac;
    const gross =
      grossYieldPerHa(effectiveFertility(part, day)) *
      sowFrac *
      (UNWEEDED_YIELD + (1 - UNWEEDED_YIELD) * weeded) *
      harvestFrac;
    total += Math.max(0, ha * gross - ha * SEED_KG_PER_HA * sowFrac);
  }
  return total;
}

/**
 * Odhad čisté úrody ozimu pro příděl: sklizeň celá, pletí jen kolik je hotové (před pletím
 * neopletá úroda – opatrně) a setí do konce okna setí celé, potom jen zasetá část.
 */
export function expectedWinterKg(work: CropWork, parts: FieldPart[], day: number): number {
  const sowing = taskWindowEnd('sow', dateOfDayIndex(day).month, 'winter') !== null;
  return cropYieldKg(work, parts, day, sowing ? 1 : planShare(work, 'sow'), 1);
}

/**
 * Dní do sklizně, se kterou počítá přídělový systém (fields.md – Ozim a jař): do sklizně ozimu
 * (31. 7.), když ji ves ještě čeká a podle odhadu (`expectedWinterKg`) uživí ves od 1. 8. do
 * sklizně jaře; jinak do sklizně jaře (31. 8.).
 */
export function daysUntilFoodHarvest(
  plan: YearPlan | null,
  parts: FieldPart[],
  day: number,
  needPerDayKg: number,
): number {
  const late = daysUntilHarvest(day);
  const winter = plan?.winter;
  if (!winter || winter.harvestedKg !== null || winter.partIds.length === 0) return late;
  const early = daysUntilWinterHarvest(day);
  if (early >= late) return late;
  return expectedWinterKg(winter, parts, day) >= needPerDayKg * (late - early) ? early : late;
}

/** Ztráta nevymlácené části úrody (výmlat se měří vůči sklizené části). */
export function threshLossKg(work: CropWork, harvestedKg: number): number {
  return harvestedKg * (1 - workedShare(work, 'thresh'));
}
