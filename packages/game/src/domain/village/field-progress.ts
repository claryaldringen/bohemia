import { dateOfDayIndex } from '../calendar';
import { distanceFactor, isWeedFree } from './fields';
import type { Crop, CropWork, FieldPart, VillageState } from './types';
import { planCrops, taskRemaining, taskWindowEnd } from './year-plan';

// Postup práce po čtvercích (fields.md – Postup práce po čtvercích; Martin, 18. 10. 2026): plán
// vede práci za celou plodinu, díl po dílu ji odvozuje odsud – díly plodiny v pořadí `partIds`
// (nejblíž obydlím první), každý s vahou své práce (plocha × vzdálenost). Při podílu hotové
// úlohy 40 % je hotových prvních 40 % váhy, další díl je čelo práce (rozpracovaný), zbytek čeká.
// Jen čte stav – simulace z toho nic nepočítá.

/** Polní úlohy, které postupují po dílech (výmlat se dělá u vsi). */
export type PartTask = 'reclaim' | 'dig' | 'sow' | 'weed' | 'harvest';
export const PART_TASKS: readonly PartTask[] = ['reclaim', 'dig', 'sow', 'weed', 'harvest'];

/**
 * Viditelný stav osetého dílu (fields.md – Co hráč vidí): `bare` – úloha k němu ještě nedošla
 * (loňské strniště, pastvina), `plowed` – zkopaný, `sown` – zasetý, `sprouted` – vzešlé osení,
 * `growing` – zelené obilí, `ripe` – zralé, nesklizené obilí, `stubble` – strniště po sklizni.
 * Kopání, setí a sklizeň mění stav, až k dílu dojde práce; vzejití a zrání jdou podle kalendáře,
 * sníh přidávají roční období ve scéně.
 */
export type CropState = 'bare' | 'plowed' | 'sown' | 'sprouted' | 'growing' | 'ripe' | 'stubble';

/** Úsek dílu v pořadí úlohy – od–do jako podíl celé práce úlohy (0–1). */
export interface PartSpan {
  id: number;
  fieldId: number;
  start: number;
  end: number;
}

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel u hranic úseků. */
const EPSILON = 1e-9;

/** Váha dílu v úloze – jeho práce (plocha × vzdálenost); díl, kterého se úloha netýká, 0. */
function partWeight(work: CropWork, part: FieldPart, task: PartTask, day: number): number {
  if (task === 'reclaim' && !(work.reclaimIds ?? []).includes(part.id)) return 0;
  if (task === 'weed' && isWeedFree(part, day)) return 0;
  return (part.areaM2 / M2_PER_HA) * distanceFactor(part.distanceM);
}

/** Úseky dílů práce plodiny v úloze v pořadí postupu (díly s nulovou vahou vynechané). */
export function taskSpans(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): PartSpan[] {
  const weighted = work.partIds.flatMap((id) => {
    const part = partsById.get(id);
    const weight = part ? partWeight(work, part, task, day) : 0;
    return part && weight > 0 ? [{ part, weight }] : [];
  });
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let start = 0;
  return weighted.map(({ part, weight }) => {
    const end = start + weight / total;
    const span = { id: part.id, fieldId: part.fieldId, start, end };
    start = end;
    return span;
  });
}

/** Kam úloha došla – podíl hotové práce úlohy 0–1 (úloha bez práce 1). */
export function taskPosition(work: CropWork, task: PartTask, done = work.done[task]): number {
  return work.required[task] > 0 ? Math.min(1, done / work.required[task]) : 1;
}

/** Díl je v úloze hotový – úloha došla za jeho konec. */
function isDone(span: PartSpan, position: number): boolean {
  return span.end <= position + EPSILON;
}

/**
 * Díly, na kterých se v úloze dnes pracovalo – úseky, přes které úloha přešla z `before` do
 * `after` (hotová práce v člověkodnech), s podílem dnešní práce na každém.
 */
export function partsWorked(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
  before: number,
  after: number,
): { id: number; fieldId: number; share: number }[] {
  const from = taskPosition(work, task, before);
  const to = taskPosition(work, task, after);
  if (to - from <= EPSILON) return [];
  return taskSpans(work, partsById, task, day).flatMap((span) => {
    const overlap = Math.min(to, span.end) - Math.max(from, span.start);
    return overlap > EPSILON
      ? [{ id: span.id, fieldId: span.fieldId, share: overlap / (to - from) }]
      : [];
  });
}

/** Čelo úlohy – první díl, ke kterému práce ještě nedošla celá; hotová úloha null. */
export function frontierPart(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): number | null {
  const position = taskPosition(work, task);
  return taskSpans(work, partsById, task, day).find((s) => !isDone(s, position))?.id ?? null;
}

/**
 * Čela polních prací dne: pro každou plodinu plánu a úlohu, jejíž okno dnes běží a která má
 * nedodělek, díl, na kterém se pracuje. Díl id → úlohy.
 */
export function fieldFrontiers(state: VillageState, day: number): Map<number, PartTask[]> {
  const frontiers = new Map<number, PartTask[]>();
  if (state.plan === null) return frontiers;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const month = dateOfDayIndex(day).month;
  for (const { crop, work } of planCrops(state.plan)) {
    for (const task of PART_TASKS) {
      if (taskWindowEnd(task, month, crop) === null || taskRemaining(work, task) <= 0) continue;
      const id = frontierPart(work, partsById, task, day);
      if (id === null) continue;
      frontiers.set(id, [...(frontiers.get(id) ?? []), task]);
    }
  }
  return frontiers;
}

/**
 * Přirozené stadium zasetého dílu podle kalendáře (měsíc 1–12): v měsíci, kdy setí začíná,
 * zasetý; pak vzešlé osení (ozim přes zimu), od jara zelené obilí, v měsíci sklizně zralé.
 */
const NATURAL_STAGE: Record<Crop, readonly CropState[]> = {
  //       led         úno         bře         dub        kvě        čer        čec      srp      zář     říj         lis         pro
  winter: [
    'sprouted',
    'sprouted',
    'sprouted',
    'growing',
    'growing',
    'growing',
    'ripe',
    'ripe',
    'sown',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
  spring: [
    'sprouted',
    'sprouted',
    'sown',
    'sprouted',
    'growing',
    'growing',
    'growing',
    'ripe',
    'sprouted',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
};

/** Díly práce plodiny, ke kterým úloha už celá došla. */
function reachedIds(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): Set<number> {
  const position = taskPosition(work, task);
  return new Set(
    taskSpans(work, partsById, task, day)
      .filter((span) => isDone(span, position))
      .map((span) => span.id),
  );
}

/**
 * Viditelný stav obilí na osetých dílech v den `day` (viz `CropState`): díl id → stav. Díly plánu
 * podle toho, kam došlo kopání, setí a sklizeň jejich plodiny (po sklizni jaře 31. 8. je plán
 * u výmlatu); osetý díl mimo plán (nemělo by nastat) holá zem.
 */
export function fieldCropStates(state: VillageState, day: number): Map<number, CropState> {
  const states = new Map<number, CropState>();
  const plan = state.plan ?? state.threshingFromPlan;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const month = dateOfDayIndex(day).month;
  for (const { crop, work } of plan ? planCrops(plan) : []) {
    const harvested = reachedIds(work, partsById, 'harvest', day);
    const sown = reachedIds(work, partsById, 'sow', day);
    const dug = reachedIds(work, partsById, 'dig', day);
    for (const id of work.partIds) {
      if (partsById.get(id)?.state !== 'sown') continue;
      if (work.harvestedKg !== null || harvested.has(id)) states.set(id, 'stubble');
      else if (sown.has(id)) states.set(id, NATURAL_STAGE[crop][month - 1]!);
      else states.set(id, dug.has(id) ? 'plowed' : 'bare');
    }
  }
  for (const part of state.parts) {
    if (part.state === 'sown' && !states.has(part.id)) states.set(part.id, 'bare');
  }
  return states;
}

/** Viditelný stav obilí jednoho dílu (viz `fieldCropStates`); mimo osev null. */
export function partCropState(state: VillageState, part: FieldPart, day: number): CropState | null {
  return part.state === 'sown' ? (fieldCropStates(state, day).get(part.id) ?? 'bare') : null;
}
