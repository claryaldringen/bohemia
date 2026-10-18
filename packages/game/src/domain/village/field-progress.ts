import { dateOfDayIndex } from '../calendar';
import { distanceFactor, isWeedFree, partWalkDistance } from './fields';
import { partStage } from './summary';
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
 * Co je na dílu pole vidět (fields.md – Co hráč vidí; názvy jako `FieldLook` scény): `bare` –
 * rozrytý drn (zakládaný a připravený díl, nově založený díl před kopáním), `plowed` – zkopaný,
 * `sown` – zasetý, `sprouted` – vzešlé osení, `green` – zelené obilí, `ripe` – zralé obilí,
 * `harvesting` – sklizeno, panáky snopů na poli (do konce sklizně plodiny), `stubble` –
 * strniště (po sklizni a loňské před kopáním), `young-fallow` – mladý příloh, `pasture` –
 * spásaný drn přílohu, který se vrací do osevu. Starší příloh (pastvina, seno) scéna doplní
 * sama podle data.
 */
export type FieldPartLook =
  | 'bare'
  | 'plowed'
  | 'sown'
  | 'sprouted'
  | 'green'
  | 'ripe'
  | 'harvesting'
  | 'stubble'
  | 'young-fallow'
  | 'pasture';

/**
 * Vzhled dílu: `look`, u rozpracovaného dílu (čelo práce) i `work` – kolik práce dnešní úlohy je
 * na něm hotovo 0–1 (hotová část má `look`) a `before` – vzhled zbytku.
 */
export interface PartView {
  look: FieldPartLook;
  work?: number;
  before?: FieldPartLook;
}

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
  return (part.areaM2 / M2_PER_HA) * distanceFactor(partWalkDistance(part));
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
const NATURAL_STAGE: Record<Crop, readonly FieldPartLook[]> = {
  // leden … prosinec
  winter: [
    'sprouted',
    'sprouted',
    'sprouted',
    'green',
    'green',
    'green',
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
    'green',
    'green',
    'green',
    'ripe',
    'sprouted',
    'sprouted',
    'sprouted',
    'sprouted',
  ],
};

/** Kolik práce úlohy je na dílu hotovo 0–1; díl, kterého se úloha netýká, null. */
function shareOn(span: PartSpan | undefined, position: number): number | null {
  if (!span) return null;
  return Math.min(1, Math.max(0, (position - span.start) / (span.end - span.start)));
}

/** Úseky dílů úlohy podle id. */
function spansById(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  task: PartTask,
  day: number,
): Map<number, PartSpan> {
  return new Map(taskSpans(work, partsById, task, day).map((span) => [span.id, span]));
}

/** Hotovo, nebo rozpracovaný díl s podílem práce. */
const DONE = 1 - EPSILON;

/**
 * Vzhled dílů jedné plodiny plánu: sklizeň > setí > kopání (a vrácení přílohu) – co je nejdál,
 * to je vidět; rozpracovaný díl úlohy má `work` a `before`. Před kopáním je díl, jak ho práce
 * zastihla: loňské strniště (díl v osevu), drn pastviny (vrací se z přílohu), nebo rozrytý drn
 * (nově založený díl).
 */
function cropLooks(
  crop: Crop,
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
  views: Map<number, PartView>,
): void {
  const month = dateOfDayIndex(day).month;
  const harvested = work.harvestedKg !== null;
  const spans = Object.fromEntries(
    (['reclaim', 'dig', 'sow', 'harvest'] as const).map((task) => [
      task,
      { byId: spansById(work, partsById, task, day), at: taskPosition(work, task) },
    ]),
  ) as Record<'reclaim' | 'dig' | 'sow' | 'harvest', { byId: Map<number, PartSpan>; at: number }>;
  const share = (task: keyof typeof spans, id: number): number | null =>
    shareOn(spans[task].byId.get(id), spans[task].at);
  const reclaimIds = new Set(work.reclaimIds ?? []);
  for (const id of work.partIds) {
    const part = partsById.get(id);
    if (!part || part.state !== 'sown') continue;
    const untouched: FieldPartLook = reclaimIds.has(id)
      ? 'pasture'
      : part.sownYears > 0
        ? 'stubble'
        : 'bare';
    const harvest = share('harvest', id) ?? 0;
    const sow = share('sow', id) ?? 0;
    const dig = Math.max(share('dig', id) ?? 0, share('reclaim', id) ?? 0);
    let view: PartView;
    if (harvested) view = { look: 'stubble' };
    else if (harvest >= DONE) view = { look: 'harvesting' };
    else if (harvest > EPSILON) view = { look: 'harvesting', work: harvest, before: 'ripe' };
    else if (sow >= DONE) view = { look: NATURAL_STAGE[crop][month - 1]! };
    else if (sow > EPSILON) view = { look: 'sown', work: sow, before: 'plowed' };
    else if (dig >= DONE) view = { look: 'plowed' };
    else if (dig > EPSILON) view = { look: 'plowed', work: dig, before: untouched };
    else view = { look: untouched };
    views.set(id, view);
  }
}

/** Krok podílu práce rozpracovaného dílu – scéna se nepřestavuje při každém dotazu. */
const WORK_STEP = 20;

/**
 * Vzhled dílů pole v den `day` (fields.md – Postup práce po čtvercích): díl id → vzhled.
 * Zakládané díly (rozrytý drn, rozpracovaný s podílem založení – zakládá se od nejbližšího
 * k obydlí, nezačatý má podíl 0), připravené (rozrytý drn), díly plánu podle toho, kam došlo
 * kopání, setí a sklizeň jejich plodiny (po sklizni jaře 31. 8. je plán u výmlatu), mladý
 * příloh. Starší příloh (pastvina, louka na seno) se nevrací – vzhled doplní scéna podle data.
 * Podíl práce je po dvacetinách (začatá práce aspoň jedna dvacetina).
 */
export function fieldPartLooks(state: VillageState, day: number): Map<number, PartView> {
  const views = new Map<number, PartView>();
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const plan = state.plan ?? state.threshingFromPlan;
  for (const { crop, work } of plan ? planCrops(plan) : []) {
    cropLooks(crop, work, partsById, day, views);
  }
  for (const part of state.parts) {
    if (views.has(part.id)) continue;
    if (part.state === 'founding') {
      const work = part.foundingCost > 0 ? part.foundingDone / part.foundingCost : 0;
      views.set(part.id, { look: 'bare', work: Math.min(1, work) });
    } else if (part.state === 'ready' || part.state === 'sown') {
      views.set(part.id, { look: 'bare' });
    } else if (partStage(part, day) === 'young-fallow') {
      views.set(part.id, { look: 'young-fallow' });
    }
  }
  // po dvacetinách; začatá práce aspoň jedna dvacetina (nezačatý díl má 0 – jen vytyčený)
  for (const view of views.values()) {
    if (view.work === undefined || view.work <= 0) continue;
    const step = Math.round(view.work * WORK_STEP) / WORK_STEP;
    view.work = Math.min(1, Math.max(1 / WORK_STEP, step));
  }
  return views;
}
