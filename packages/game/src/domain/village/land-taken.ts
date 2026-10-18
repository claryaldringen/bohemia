import { PART_TASKS, taskPosition, taskSpans, type PartTask } from './field-progress';
import { HAY, mowingPosition, mowingSpans } from './hay';
import { recordClearedObstacles } from './obstacles';
import { squareCareWork, squareHarvestWork, squareYieldKg } from './orchard';
import { TAKEN_LAND_MIN_SHARE } from './rules';
import type {
  ChronicleEvent,
  CropWork,
  FieldPart,
  OrchardSquare,
  TileCell,
  VillageState,
  YearPlan,
} from './types';
import { addLogs, logsFromClearedTrees } from './wood';
import { partWeight, planCrops } from './year-plan';

// Pole a sad ustupují stavbě obydlí (population.md – Obydlí na poli a v sadu; Martin, 18. 10.
// 2026: „domy by měly jít stavět na polích a v sadech. Pole a sad se prostě zmenší o plochu
// domu“). Kolik ze kterého čtverce obydlí sebere, spočítá kontrola umístění (placement.ts) –
// pozemek celé políčko, obydlí bez pozemku průnik vyklízené plochy se čtvercem. Odsud se to
// promítne do stavu vsi: díl pole nebo čtverec sadu se zmenší, pod TAKEN_LAND_MIN_SHARE políčka
// zmizí celý; s plochou ubude úměrně i úroda a práce (plán osevu i s orbou rádlem, seč sena,
// založení, výsadba, sezónní práce v sadech). Pole a sad, kterým nezbyl žádný čtverec, zaniknou;
// zbytek zůstává jedním polem / sadem, i když se tím rozpadne na nesouvislé části.

/** Kus čtverce pole nebo sadu, který stavba obydlí sebere – plocha (m²) z políčka `cellAreaM2`. */
export interface TakenLand {
  cell: TileCell;
  areaM2: number;
  cellAreaM2: number;
}

/** Plochy pod tuto mez (m²) jsou jen dotyk hranou – obydlí z čtverce nic nebere. */
export const TAKEN_LAND_EPSILON_M2 = 0.01;
const EPSILON = 1e-9;

/**
 * Kolik plochy dílu nebo čtverce (`areaM2`) zbude, když obydlí sebere `takenM2` z políčka
 * `cellAreaM2`; méně než TAKEN_LAND_MIN_SHARE políčka = 0 – díl (čtverec) zmizí celý.
 */
export function landLeftM2(areaM2: number, takenM2: number, cellAreaM2: number): number {
  const left = areaM2 - takenM2;
  return left < TAKEN_LAND_MIN_SHARE * cellAreaM2 - EPSILON ? 0 : left;
}

/** Ověří vstup – celočíselná políčka bez opakování, konečné nezáporné plochy; jinak RangeError. */
export function validateTakenLand(taken: readonly TakenLand[]): void {
  const cells = new Set<string>();
  for (const t of taken) {
    if (!Number.isInteger(t.cell.x) || !Number.isInteger(t.cell.y)) {
      throw new RangeError('Políčko zabrané obydlím musí mít celočíselné souřadnice.');
    }
    if (!Number.isFinite(t.areaM2) || t.areaM2 < 0) {
      throw new RangeError('Plocha zabraná obydlím musí být nezáporná a konečná.');
    }
    if (!Number.isFinite(t.cellAreaM2) || t.cellAreaM2 <= 0) {
      throw new RangeError('Plocha políčka musí být kladná a konečná.');
    }
    cells.add(`${t.cell.x},${t.cell.y}`);
  }
  if (cells.size !== taken.length) throw new RangeError('Políčko zabrané obydlím se opakuje.');
}

const cellKey = (cell: TileCell): string => `${cell.x},${cell.y}`;

/**
 * Pole a sady ustoupí stavbě obydlí (mutuje stav – volat na klonu): každý díl pole a čtverec
 * sadu na políčku z `taken` se zmenší o zabranou plochu, pod TAKEN_LAND_MIN_SHARE políčka zmizí
 * celý. S plochou ubude úměrně práce a úroda – plán osevu i s orbou (`taskSpans` – díl drží
 * svůj podíl hotové práce), seč sena na úhoru, rozestavěné založení pole a výsadba sadu (cena
 * i odvedená práce), sezónní práce v sadech a úroda jablek. Zmizelý zakládaný díl nebo nevysazený čtverec předá své
 * překážky stavbě obydlí – odklidí se se staveništěm bez práce navíc a dospělé stromy dají
 * klády. Pole a sad bez čtverců zaniknou i se svou stavbou. Kronika zapíše `land-taken`.
 */
export function giveWayToDwelling(
  state: VillageState,
  day: number,
  taken: readonly TakenLand[],
): void {
  if (taken.length === 0) return;
  const byCell = new Map(taken.map((t) => [cellKey(t.cell), t]));
  const fieldLoss = shrinkParts(state, day, byCell);
  const orchardLoss = shrinkOrchards(state, day, byCell);
  const events: ChronicleEvent[] = [];
  for (const [id, areaM2] of [...fieldLoss].sort((a, b) => a[0] - b[0])) {
    const gone = !state.parts.some((p) => p.fieldId === id);
    if (gone) dropField(state, id);
    events.push({ day, kind: 'land-taken', land: 'field', id, areaM2, gone });
  }
  for (const [id, areaM2] of [...orchardLoss].sort((a, b) => a[0] - b[0])) {
    const gone = !(state.orchards ?? []).some((o) => o.id === id);
    events.push({ day, kind: 'land-taken', land: 'orchard', id, areaM2, gone });
  }
  state.chronicle.push(...events);
}

/** Díly polí na zabraných políčkách – zmenší je nebo odeberou; vrátí ztrátu plochy po polích. */
function shrinkParts(
  state: VillageState,
  day: number,
  byCell: ReadonlyMap<string, TakenLand>,
): Map<number, number> {
  const loss = new Map<number, number>();
  const removed = new Set<number>();
  for (const part of state.parts) {
    const t = part.cell ? byCell.get(cellKey(part.cell)) : undefined;
    if (!t) continue;
    const left = landLeftM2(part.areaM2, t.areaM2, t.cellAreaM2);
    const lost = part.areaM2 - left;
    if (lost <= EPSILON) continue;
    const share = left > 0 ? lost / part.areaM2 : 1;
    // plán, seč a založení podle plochy před zmenšením (váha dílu v pořadí práce)
    if (state.plan) shrinkInPlan(state, state.plan, part, share, day);
    shrinkInMowing(state, part, share);
    shrinkFounding(state, part, share);
    loss.set(part.fieldId, (loss.get(part.fieldId) ?? 0) + lost);
    if (left > 0) {
      part.areaM2 = left;
      continue;
    }
    // z pořadí práce hned – další díly se počítají už bez něj
    removed.add(part.id);
    for (const plan of [state.plan, state.threshingFromPlan]) {
      if (!plan) continue;
      for (const { work } of planCrops(plan)) dropFromWork(work, new Set([part.id]));
    }
    dropFromMowing(state, part.id);
    handOverObstacles(state, part, day);
  }
  if (removed.size === 0) return loss;
  state.parts = state.parts.filter((p) => !removed.has(p.id));
  for (const share of state.labor?.shares ?? []) {
    if (share.target.kind !== 'field' || !share.target.parts) continue;
    share.target.parts = share.target.parts.filter((id) => !removed.has(id));
  }
  // založení, kterému nezbyl žádný díl a nic nezaložilo, zmizí (jinak doběhne jako hotové)
  state.constructions = state.constructions.filter(
    (c) =>
      c.kind !== 'field' ||
      c.fieldId === null ||
      !loss.has(c.fieldId) ||
      c.cost > EPSILON ||
      state.parts.some((p) => p.fieldId === c.fieldId && p.state === 'founding'),
  );
  return loss;
}

/** Potřebná a odvedená práce úlohy plodiny – orba rádlem (oxen.md) vedená zvlášť v `plough`. */
function taskWork(work: CropWork, task: PartTask): { required: number; done: number } {
  if (task === 'plough')
    return { required: work.plough?.required ?? 0, done: work.plough?.done ?? 0 };
  return { required: work.required[task], done: work.done[task] };
}

function setTaskWork(work: CropWork, task: PartTask, required: number, done: number): void {
  if (task !== 'plough') {
    work.required[task] = required;
    work.done[task] = done;
  } else if (work.plough) {
    work.plough.required = required;
    work.plough.done = done;
  }
}

/**
 * Díl ubere z práce plodiny podíl `share` (mutuje plán): v každé úloze (i v orbě) ubude potřebné
 * práce podle jeho váhy a hotové práce, kolik jí na něm bylo – čelo práce i hotové díly ostatních
 * zůstanou tam, kde byly. Výmlat jako sklizeň; váha oraných či kopaných dílů orby (setí jde za
 * obojím) ubude o váhu dílu. Sklizená plodina (úroda už je v zásobách) se nemění.
 */
function shrinkInPlan(
  state: VillageState,
  plan: YearPlan,
  part: FieldPart,
  share: number,
  day: number,
): void {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { work } of planCrops(plan)) {
    if (work.harvestedKg !== null || !work.partIds.includes(part.id)) continue;
    for (const task of PART_TASKS) {
      const span = taskSpans(work, partsById, task, day).find((s) => s.id === part.id);
      if (!span) continue;
      const { required, done } = taskWork(work, task);
      const position = taskPosition(work, task);
      const doneOnPart =
        (Math.min(span.end, Math.max(span.start, position)) - span.start) * required;
      setTaskWork(
        work,
        task,
        Math.max(0, required - share * (span.end - span.start) * required),
        Math.max(0, done - share * doneOnPart),
      );
    }
    const plough = work.plough;
    if (plough) {
      const lost = share * partWeight(part);
      if (plough.partIds.includes(part.id)) plough.weight = Math.max(0, plough.weight - lost);
      else plough.digWeight = Math.max(0, plough.digWeight - lost);
    }
    const harvest = taskSpans(work, partsById, 'harvest', day).find((s) => s.id === part.id);
    if (harvest) {
      const cut = 1 - share * (harvest.end - harvest.start);
      work.required.thresh = Math.max(0, work.required.thresh * cut);
      work.done.thresh = Math.max(0, work.done.thresh * cut);
    }
  }
}

/** Odebrané díly zmizí z pořadí práce plodiny (i z vracených přílohů a z orby). */
function dropFromWork(work: CropWork, removed: ReadonlySet<number>): void {
  work.partIds = work.partIds.filter((id) => !removed.has(id));
  const plough = work.plough;
  if (plough) {
    plough.partIds = plough.partIds.filter((id) => !removed.has(id));
    const returned = (plough.returned ?? []).filter((id) => !removed.has(id));
    if (returned.length > 0) plough.returned = returned;
    else delete plough.returned;
  }
  if (!work.reclaimIds) return;
  const reclaimIds = work.reclaimIds.filter((id) => !removed.has(id));
  if (reclaimIds.length > 0) work.reclaimIds = reclaimIds;
  else delete work.reclaimIds;
}

/**
 * Díl úhoru v letošní seči sena (oxen.md – Seno) ubere podíl `share`: potřebná práce podle jeho
 * váhy, hotová, kolik jí na něm bylo (čelo seče zůstane), a seno při plné seči podle plochy.
 * Posečené seno už je v zásobě.
 */
function shrinkInMowing(state: VillageState, part: FieldPart, share: number): void {
  const mowing = state.hay?.mowing;
  if (!mowing || !mowing.partIds.includes(part.id)) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const span = mowingSpans(mowing, partsById).find((s) => s.id === part.id);
  if (!span) return;
  const position = mowingPosition(mowing);
  const doneOnPart =
    (Math.min(span.end, Math.max(span.start, position)) - span.start) * mowing.required;
  mowing.required = Math.max(
    0,
    mowing.required - share * (span.end - span.start) * mowing.required,
  );
  mowing.done = Math.max(0, Math.min(mowing.required, mowing.done - share * doneOnPart));
  mowing.yieldKg = Math.max(0, mowing.yieldKg - (share * part.areaM2 * HAY.yieldKgPerHa) / 10_000);
}

/** Odebraný díl zmizí ze seče; seč bez dílů se zruší. */
function dropFromMowing(state: VillageState, partId: number): void {
  const hay = state.hay;
  if (!hay?.mowing) return;
  hay.mowing.partIds = hay.mowing.partIds.filter((id) => id !== partId);
  if (hay.mowing.partIds.length === 0) hay.mowing = null;
}

/** Zakládaný díl: založení se zmenší úměrně – cena i odvedená práce dílu i stavby pole. */
function shrinkFounding(state: VillageState, part: FieldPart, share: number): void {
  if (part.state !== 'founding') return;
  const cost = part.foundingCost * share;
  const done = part.foundingDone * share;
  part.foundingCost -= cost;
  part.foundingDone -= done;
  const c = state.constructions.find((x) => x.kind === 'field' && x.fieldId === part.fieldId);
  if (!c) return;
  c.cost = Math.max(0, c.cost - cost);
  c.done = Math.max(0, Math.min(c.cost, c.done - done));
}

/**
 * Překážky zmizelého zakládaného dílu nebo nevysazeného čtverce (dosud patřily jeho stavbě)
 * odklidí stavba obydlí – zmizí natrvalo a dospělé stromy dají klády na hromadu.
 */
function handOverObstacles(
  state: VillageState,
  square: Pick<FieldPart | OrchardSquare, 'obstacles' | 'trees'>,
  day: number,
): void {
  if (square.obstacles) recordClearedObstacles(state, square.obstacles, day);
  if (square.trees) addLogs(state, logsFromClearedTrees(square.trees));
}

/** Pole bez dílů zanikne i se svou stavbou (založení). */
function dropField(state: VillageState, fieldId: number): void {
  state.fields = state.fields.filter((f) => f.id !== fieldId);
  state.constructions = state.constructions.filter(
    (c) => !(c.kind === 'field' && c.fieldId === fieldId),
  );
}

/**
 * Čtverce sadů na zabraných políčkách – zmenší je nebo odeberou (výsadba úměrně, sezónní práce
 * a úroda jablek také); sad bez čtverců zanikne i se stavbou. Vrátí ztrátu plochy po sadech.
 */
function shrinkOrchards(
  state: VillageState,
  day: number,
  byCell: ReadonlyMap<string, TakenLand>,
): Map<number, number> {
  const loss = new Map<number, number>();
  if (!state.orchards) return loss;
  for (const orchard of state.orchards) {
    const kept: OrchardSquare[] = [];
    for (const square of orchard.squares) {
      const t = byCell.get(cellKey(square.cell));
      const left = t ? landLeftM2(square.areaM2, t.areaM2, t.cellAreaM2) : square.areaM2;
      const lost = square.areaM2 - left;
      if (lost <= EPSILON) {
        kept.push(square);
        continue;
      }
      const share = left > 0 ? lost / square.areaM2 : 1;
      shrinkOrchardWork(state, square, share, day);
      loss.set(orchard.id, (loss.get(orchard.id) ?? 0) + lost);
      if (left <= 0) {
        handOverObstacles(state, square, day);
        continue;
      }
      square.plantingCost -= square.plantingCost * share;
      square.plantingDone -= square.plantingDone * share;
      square.areaM2 = left;
      kept.push(square);
    }
    if (!loss.has(orchard.id)) continue;
    orchard.squares = kept;
    const c = state.constructions.find((x) => x.kind === 'orchard' && x.orchardId === orchard.id);
    if (c) {
      c.cost = kept.reduce((sum, s) => sum + s.plantingCost, 0);
      c.done = kept.reduce((sum, s) => sum + s.plantingDone, 0);
    }
  }
  const gone = new Set(state.orchards.filter((o) => o.squares.length === 0).map((o) => o.id));
  if (gone.size > 0) {
    state.orchards = state.orchards.filter((o) => !gone.has(o.id));
    state.constructions = state.constructions.filter(
      (c) => !(c.kind === 'orchard' && c.orchardId != null && gone.has(c.orchardId)),
    );
  }
  return loss;
}

/**
 * Rozběhnutá sezónní práce v sadech (sklizeň, péče) přijde o podíl čtverce – potřebná práce
 * i úroda jablek ubudou, hotový podíl zůstane (sklizená jablka už jsou v zásobách).
 */
function shrinkOrchardWork(
  state: VillageState,
  square: OrchardSquare,
  share: number,
  day: number,
): void {
  const work = state.orchardWork;
  if (!work || work.required <= 0) return;
  const part = work.task === 'harvest' ? squareHarvestWork(square, day) : squareCareWork(square);
  const progress = Math.min(1, work.done / work.required);
  work.required = Math.max(0, work.required - share * part);
  work.done = progress * work.required;
  if (work.task === 'harvest') {
    work.yieldKg = Math.max(0, work.yieldKg - share * squareYieldKg(square, day));
  }
}
