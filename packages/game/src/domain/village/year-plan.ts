import { dateOfDayIndex } from '../calendar';
import {
  distanceFactor,
  effectiveFertility,
  fallowYears,
  grossYieldPerHa,
  reclaimCostPerHa,
} from './fields';
import { FIELD_WORK_PER_HA, SEED_KG_PER_HA, UNWEEDED_YIELD, WINDOWS } from './rules';
import type { FieldPart, TaskName, YearPlan } from './types';

const M2_PER_HA = 10_000;
const MONTHS_PER_YEAR = 12;
/** Pořadí úloh – rozhoduje při shodě konce okna. */
const TASK_ORDER: readonly TaskName[] = ['reclaim', 'dig', 'sow', 'weed', 'harvest', 'thresh'];
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
  return { plannedDay: day, partIds: selected.map((p) => p.id), required, done: emptyRecord() };
}

/** Zbývající práce úlohy; setí nepředběhne hotové kopání. */
export function taskRemaining(plan: YearPlan, task: TaskName): number {
  const left = plan.required[task] - plan.done[task];
  if (task !== 'sow') return Math.max(0, left);
  const digFraction = plan.required.dig > 0 ? plan.done.dig / plan.required.dig : 1;
  const allowed = plan.required.sow * digFraction - plan.done.sow;
  return Math.max(0, Math.min(left, allowed));
}

/** Konec aktuálního úseku okna v měsících; navazující úsek od ledna se přičte (mlácení do konce února). */
function windowEnd(task: TaskName, month: number): number | null {
  const segments = WINDOWS[task];
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

function fraction(plan: YearPlan, task: TaskName): number {
  return plan.required[task] > 0 ? plan.done[task] / plan.required[task] : 1;
}

/** Čistá úroda v kg (po odečtení osiva) z vybraných dílů plánu. */
export function harvestKg(plan: YearPlan, parts: FieldPart[], day: number): number {
  const sowFrac = fraction(plan, 'sow');
  const weedFrac = fraction(plan, 'weed');
  const harvestFrac = fraction(plan, 'harvest');
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

/** Ztráta nevymlácené části úrody. */
export function threshLossKg(plan: YearPlan, harvestedKg: number): number {
  return harvestedKg * (1 - fraction(plan, 'thresh'));
}
