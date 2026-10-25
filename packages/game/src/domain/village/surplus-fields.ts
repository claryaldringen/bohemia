import { dateOfDayIndex } from '../calendar';
import {
  nextSowing,
  onTurn,
  sowingCropToday,
  sowParts,
  surplusOrder,
  windowOpen,
} from './rotation';
import { ploughLayout } from './plough-blocks';
import { CROP_ORDER } from './rules';
import type { CropWork, FieldPart, SeasonCrop, SurplusCrop, VillageState } from './types';
import {
  TASK_ORDER,
  activeTasks,
  addCropTaskWork,
  addToCropWork,
  createCropWork,
  cropTaskDone,
  cropTaskRemaining,
  cropTaskWindows,
  partWork,
  putSeasonCrop,
  seasonPartIds,
  springCrop,
  surplusCrop,
  windowEndOf,
  type CropTask,
} from './year-plan';

// Díly nad potřebu (fields.md – Osevní postup po dílech a setí do konce okna, bod 3; Martin
// 25. 10. 2026: „stavby mají pořád přednost, ale vesničané neví dopředu že budou něco stavět,
// takže ve chvíli, kdy stavba přijde, prostě vesnice o část úrody přijde.“). Nutné díly (potřeba
// úrody proti hladu) jsou sezónní úlohy dne a jdou před stavbami; ostatní díly na řadě – jen obilí
// – dostanou práci, která zbude po stavbách a opravách obydlí: příprava půdy, setí, pletí, žně
// a odnos. Výmlat na humně je společný (humno nerozlišuje, odkud snopy jsou).

/** Tolerance porovnání práce (člověkodny). */
const EPSILON = 1e-9;
/** Obilí nad potřebu v pořadí, ve kterém dostává práci – ozim napřed (jeho okno končí dřív). */
const SURPLUS_CROPS: readonly SurplusCrop[] = ['winter', 'spring'];
/** Příprava půdy dílu – orba před kopáním (`fieldTasks`); plodina se buď orá, nebo kope. */
const PREP_TASKS: readonly CropTask[] = ['reclaim', 'plough', 'dig'];

/** Vstup kroku dílů nad potřebu. */
export interface SurplusFieldInput {
  /** Práce, kterou dnes nespotřebovaly stavby a opravy obydlí – člověkodny. */
  labor: number;
  /**
   * Dny spřežení, které po nutné orbě dnes zbyly (`ploughCapacityPerDay` – dny párů při plném
   * výkonu); spřežení, která dnes vozí, neorají (0).
   */
  teamDays: number;
  /** Výkon orby plodiny dnes – délka brázdy pásu a cesta k bloku (`ploughDayFactor`). */
  ploughFactor: (work: CropWork) => number;
  toolCoverage: number;
  /**
   * Nutné díly výběru čekají, až je čelo práce vezme (`seasonDay`) – díl nad potřebu dnes
   * nezačne: díly nad potřebu berou práci až za čelem nutných dílů.
   */
  neededWaiting: boolean;
}

/** Polní práce dne na obilí nad potřebu: úloha plodiny a kolik z ní bylo hotové před a po. */
export interface SurplusFieldWork {
  task: CropTask;
  work: CropWork;
  before: number;
  after: number;
  amount: number;
}

/** Úloha dne obilí nad potřebu s koncem okna a pořadím jako v `fieldTasks`. */
interface SurplusTask {
  name: CropTask;
  work: SeasonCrop;
  end: number;
  rank: number;
}

/**
 * Úlohy obilí nad potřebu, jejichž okno dnes běží (bez výmlatu – ten je společný na humně):
 * nejbližší konec okna první, při shodě ozim před jaří a pořadí úloh (orba před kopáním) – jako
 * nutné úlohy dne (`fieldTasks`).
 */
function surplusTasks(state: VillageState, day: number): SurplusTask[] {
  const month = dateOfDayIndex(day).month;
  const tasks: SurplusTask[] = [];
  for (const crop of SURPLUS_CROPS) {
    const work = surplusCrop(state.season, crop);
    if (!work) continue;
    const names: CropTask[] = activeTasks(work, day, crop).filter((name) => name !== 'thresh');
    if (cropTaskRemaining(work, 'plough') > EPSILON) names.push('plough');
    for (const name of names) {
      const end = windowEndOf(cropTaskWindows(crop, name), month);
      if (end === null) continue;
      const order =
        TASK_ORDER.indexOf(name === 'plough' ? 'dig' : name) - (name === 'plough' ? 0.5 : 0);
      tasks.push({ name, work, end, rank: CROP_ORDER.indexOf(crop) * TASK_ORDER.length + order });
    }
  }
  return tasks.sort((a, b) => a.end - b.end || a.rank - b.rank);
}

/** Zbývající příprava půdy plodiny – díl na ní je rozpracovaný. */
function prepLeft(work: CropWork): number {
  return PREP_TASKS.reduce((sum, task) => sum + cropTaskRemaining(work, task), 0);
}

/**
 * Smí na dílu dnes začít obilí `crop` nad potřebu: plodina dne podle postupu dílu
 * (`sowingCropToday`) a příloh, který se musí vrátit, jen v okně vracení přílohu.
 */
function startsToday(
  part: FieldPart,
  crop: SurplusCrop,
  day: number,
  toolCoverage: number,
  plough: boolean,
): boolean {
  if (sowingCropToday(nextSowing(part), day) !== crop) return false;
  if (windowOpen(crop, 'reclaim', day)) return true;
  return partWork(part, day, toolCoverage, plough, crop).reclaim <= EPSILON;
}

/**
 * Chce dnes obilí nad potřebu orat spřežením (oxen.md – Jen rádlo)? Ano, když ves orá a ozim
 * nebo jař nad potřebu má orbu v okně, nebo může začít další díl – pak voli nejedou s vozem
 * (wagons.md – Co vozy vozí). Stejné podmínky jako `surplusFieldDay` (bez práce dne).
 */
export function surplusWantsTeam(
  state: VillageState,
  day: number,
  neededWaiting: boolean,
): boolean {
  const season = state.season;
  if (!season || springCrop(season).plough === undefined) return false;
  const month = dateOfDayIndex(day).month;
  for (const crop of SURPLUS_CROPS) {
    const work = surplusCrop(season, crop);
    if (!work || windowEndOf(cropTaskWindows(crop, 'plough'), month) === null) continue;
    if (cropTaskRemaining(work, 'plough') > EPSILON) return true;
  }
  if (neededWaiting || sowingCropToday('first', day) === null) return false;
  const used = new Set(seasonPartIds(season));
  return state.parts.some((p) => {
    if (used.has(p.id)) return false;
    const kind = nextSowing(p);
    return onTurn(kind) && sowingCropToday(kind, day) !== null;
  });
}

/** Pás orby, do kterého díl `part` patří mezi díly `candidates` (`ploughLayout`) – díly pásu. */
function bandWith(part: FieldPart, candidates: readonly FieldPart[]): FieldPart[] {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const band = ploughLayout(candidates).bands.find((b) => b.partIds.includes(part.id));
  return band ? band.partIds.flatMap((id) => byId.get(id) ?? []) : [part];
}

/**
 * Krok dílů nad potřebu (fields.md – Osevní postup po dílech, bod 3; mutuje stav): práce, která
 * zbyla po stavbách a opravách obydlí, jde napřed na úlohy ozimu a jaře nad potřebu (příprava
 * půdy, setí, pletí, žně a odnos – v pořadí jako nutné úlohy dne), pak na další díly na řadě
 * v pořadí přílohové soustavy od domu (`surplusOrder`) – jen obilí, plodina dne podle postupu
 * dílu, nejvýš jeden rozpracovaný díl na plodinu (další začne, až má předchozí hotovou přípravu
 * půdy). Orba jen dny spřežení, které po nutné orbě zbyly. Nový díl nezačne, dokud nutné díly
 * čekají na čelo práce. Vrací práci dne pro rozdělení práce (labor-report.ts) a kolik práce
 * díly nad potřebu dostaly.
 */
export function surplusFieldDay(
  state: VillageState,
  day: number,
  input: SurplusFieldInput,
): { fieldWork: SurplusFieldWork[]; labor: number } {
  const fieldWork: SurplusFieldWork[] = [];
  const season = state.season;
  if (!season || input.labor <= EPSILON) return { fieldWork, labor: 0 };
  let left = input.labor;
  let teams = input.teamDays;
  const put = (work: SeasonCrop, task: CropTask): void => {
    if (left <= EPSILON) return;
    let wanted = Math.min(left, cropTaskRemaining(work, task));
    let factor = 1;
    if (task === 'plough') {
      if (teams <= EPSILON) return;
      factor = input.ploughFactor(work);
      wanted = Math.min(wanted, teams * factor);
    }
    if (wanted <= EPSILON) return;
    const before = cropTaskDone(work, task);
    addCropTaskWork(work, task, wanted);
    const after = cropTaskDone(work, task);
    if (after - before <= EPSILON) return;
    fieldWork.push({ task, work, before, after, amount: after - before });
    left -= after - before;
    if (task === 'plough') teams -= (after - before) / factor;
  };
  for (const task of surplusTasks(state, day)) put(task.work, task.name);

  // nové díly nad potřebu – až za čelem nutných dílů, v oknech přípravy půdy a setí
  if (input.neededWaiting || left <= EPSILON || sowingCropToday('first', day) === null) {
    return { fieldWork, labor: input.labor - left };
  }
  // ves se spřežením orá všechno (oxen.md – Jen rádlo): plodina se buď celá orá, nebo celá kope
  const plough = springCrop(season).plough !== undefined;
  const used = new Set(seasonPartIds(season));
  let order: FieldPart[] | null = null;
  for (const crop of SURPLUS_CROPS) {
    while (left > EPSILON && (!plough || teams > EPSILON)) {
      const existing = surplusCrop(season, crop);
      if (existing && prepLeft(existing) > EPSILON) break;
      order ??= surplusOrder(state, used);
      const startable = (p: FieldPart): boolean =>
        !used.has(p.id) && startsToday(p, crop, day, input.toolCoverage, plough);
      const part = order.find(startable);
      if (!part) break;
      // se spřežením přibude díl s celým svým pásem dílů na řadě – brázda jako u nutných dílů
      // (oxen.md – Co nejdelší brázda; návrh Clauda, 25. 10. 2026), jinak jeden díl
      const unit = plough ? bandWith(part, order.filter(startable)) : [part];
      for (const p of unit) used.add(p.id);
      // pořadí práce je dané (orba podle pásu)
      const asIs = (parts: readonly FieldPart[]): FieldPart[] => [...parts];
      if (existing) addToCropWork(existing, unit, day, input.toolCoverage, asIs, crop);
      else {
        const fresh = createCropWork(unit, day, input.toolCoverage, plough, asIs, crop);
        putSeasonCrop(season, { crop, surplus: true, ...fresh });
      }
      sowParts(unit, crop);
      const work = surplusCrop(season, crop)!;
      for (const task of PREP_TASKS) put(work, task);
    }
  }
  return { fieldWork, labor: input.labor - left };
}
