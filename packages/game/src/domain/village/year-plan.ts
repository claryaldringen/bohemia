import { dateOfDayIndex } from '../calendar';
import {
  distanceFactor,
  effectiveFertility,
  fallowYears,
  grossYieldPerHa,
  reclaimCostPerHa,
} from './fields';
import {
  FIELD_WORK_PER_HA,
  SEED_KG_PER_HA,
  UNWEEDED_YIELD,
  WINDOWS,
  type WindowSegment,
} from './rules';
import type { FieldPart, TaskName, YearPlan } from './types';

const M2_PER_HA = 10_000;
const MONTHS_PER_YEAR = 12;
/**
 * Pořadí úloh – rozhoduje při shodě konce okna. Na podzim vracení přílohu před kopáním, na jaře
 * setí před dalším kopáním (Ruling 14): zaseje se, co je zkopané (taskRemaining), takže pole
 * nedokopané do konce dubna dá aspoň úrodu zkopané části.
 */
export const TASK_ORDER: readonly TaskName[] = [
  'reclaim',
  'sow',
  'dig',
  'weed',
  'harvest',
  'thresh',
];
const RATE_TASKS = ['dig', 'sow', 'weed', 'harvest', 'thresh'] as const;

function emptyRecord(): Record<TaskName, number> {
  return { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
}

/** Plán prací na rok pro vybrané díly: potřebné člověkodny podle sazeb a vzdálenosti. */
export function createPlan(selected: FieldPart[], day: number): YearPlan {
  const required = emptyRecord();
  for (const part of selected) {
    const ha = part.areaM2 / M2_PER_HA;
    const factor = distanceFactor(part.distanceM);
    for (const task of RATE_TASKS) required[task] += ha * FIELD_WORK_PER_HA[task] * factor;
    if (part.state === 'fallow') {
      required.reclaim += reclaimCostPerHa(fallowYears(part, day)) * ha * factor;
    }
  }
  return {
    plannedDay: day,
    partIds: selected.map((p) => p.id),
    required,
    done: emptyRecord(),
    harvestedKg: null,
  };
}

/** Hotový podíl úlohy vůči celému plánu (0–1); úloha bez práce v plánu = 1. */
function planShare(plan: YearPlan, task: TaskName): number {
  return plan.required[task] > 0 ? Math.min(1, plan.done[task] / plan.required[task]) : 1;
}

/**
 * Kolik práce úlohy se letos opravdu dělá (Ruling 17): setí jen na zkopané části, pletí
 * a sklizeň jen na zasetou, výmlat jen sklizenou úrodu. Nezasetá půda se neplete ani nesklízí.
 */
function workableRequired(plan: YearPlan, task: TaskName): number {
  switch (task) {
    case 'sow':
      return plan.required.sow * planShare(plan, 'dig');
    case 'weed':
    case 'harvest':
      return plan.required[task] * planShare(plan, 'sow');
    case 'thresh':
      return plan.required.thresh * planShare(plan, 'harvest');
    default:
      return plan.required[task];
  }
}

/** Zbývající práce úlohy – jen na části, kam předchozí úloha došla (viz workableRequired). */
export function taskRemaining(plan: YearPlan, task: TaskName): number {
  return Math.max(0, workableRequired(plan, task) - plan.done[task]);
}

/** Hotový podíl úlohy vůči práci, která se letos dělá (0–1); bez takové práce 1. */
function workedShare(plan: YearPlan, task: TaskName): number {
  const workable = workableRequired(plan, task);
  return workable > 0 ? Math.min(1, plan.done[task] / workable) : 1;
}

/** Konec aktuálního úseku okna úlohy v měsících (viz `windowEndOf`). */
function windowEnd(task: TaskName, month: number): number | null {
  return windowEndOf(WINDOWS[task], month);
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

/** Úlohy s nedodělkem, jejichž okno dnes běží; nejbližší konec okna první. */
export function activeTasks(plan: YearPlan, day: number): TaskName[] {
  const { month } = dateOfDayIndex(day);
  const result: { task: TaskName; end: number }[] = [];
  for (const task of TASK_ORDER) {
    if (taskRemaining(plan, task) <= 0) continue;
    const end = windowEnd(task, month);
    if (end !== null) result.push({ task, end });
  }
  // Array.sort je stabilní – při shodě zůstává pořadí z TASK_ORDER.
  return result.sort((a, b) => a.end - b.end).map((r) => r.task);
}

/**
 * Čistá úroda v kg (po odečtení osiva) z vybraných dílů plánu. Pletí a sklizeň se měří jen
 * vůči zaseté části (Ruling 17) – částečné setí se tak nepromítne do úrody dvakrát.
 */
export function harvestKg(plan: YearPlan, parts: FieldPart[], day: number): number {
  const sowFrac = planShare(plan, 'sow');
  const weedFrac = workedShare(plan, 'weed');
  const harvestFrac = workedShare(plan, 'harvest');
  let total = 0;
  for (const id of plan.partIds) {
    const part = parts.find((p) => p.id === id);
    if (!part) continue;
    const ha = part.areaM2 / M2_PER_HA;
    const gross =
      grossYieldPerHa(effectiveFertility(part, day)) *
      sowFrac *
      (UNWEEDED_YIELD + (1 - UNWEEDED_YIELD) * weedFrac) *
      harvestFrac;
    total += Math.max(0, ha * gross - ha * SEED_KG_PER_HA * sowFrac);
  }
  return total;
}

/** Ztráta nevymlácené části úrody (výmlat se měří vůči sklizené části). */
export function threshLossKg(plan: YearPlan, harvestedKg: number): number {
  return harvestedKg * (1 - workedShare(plan, 'thresh'));
}
