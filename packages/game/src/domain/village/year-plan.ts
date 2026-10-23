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
import { PLOUGH_SOD_FACTOR, hasSod, ploughWorkPerHa } from './plough';
import { ploughLayout } from './plough-blocks';
import { fieldWorkPerHa } from './productivity';
import {
  CROP_WINDOWS,
  FLAX,
  LEGUMES,
  SEED_KG_PER_HA,
  UNWEEDED_YIELD,
  YIELD_BASE_KG_PER_HA,
  type WindowSegment,
  CART_TRAMPLE,
} from './rules';
import type {
  Crop,
  CropWork,
  FieldPart,
  FieldTask,
  TaskName,
  VillageState,
  YearPlan,
} from './types';

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

/** Práce dílu za rok po úlohách a orba rádlem (`plough` – jen ves, která orá spřežením). */
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
 * příloh nic, louka drn, křoviny a mladý les jako jejich založení – fields.md, Zarůstání), drn
 * louky založené rádlem jako vrácení louky. S `plough` (ves má spřežení – oxen.md, Jen rádlo) se
 * díl orá místo kopání, i drn: ten rozorá orba křížem (`PLOUGH_SOD_FACTOR`× víc orby, motyka na
 * drn nejde); křoviny a mladý les se klučí ručně jako dřív.
 */
export function partWork(
  part: FieldPart,
  day: number,
  toolCoverage: number,
  plough = false,
  crop: Crop = 'spring',
): PartWork {
  const work: PartWork = { ...emptyTaskRecord(), plough: 0 };
  const ha = part.areaM2 / M2_PER_HA;
  const factor = distanceFactor(partWalkDistance(part));
  const weedFree = isWeedFree(part, day);
  for (const task of RATE_TASKS) {
    if (task === 'weed' && weedFree) continue;
    work[task] = ha * fieldWorkPerHa(task, toolCoverage, crop) * factor;
  }
  if (part.state === 'fallow') {
    work.reclaim = reclaimCostPerHa(fallowStage(part, day), toolCoverage) * ha * factor;
  } else if (part.sod) {
    work.reclaim = reclaimCostPerHa('meadow', toolCoverage) * ha * factor;
  }
  if (plough) {
    const sod = hasSod(part, day);
    if (sod) work.reclaim = 0;
    work.plough = ha * ploughWorkPerHa(toolCoverage) * factor * (sod ? PLOUGH_SOD_FACTOR : 1);
    work.dig = 0;
  }
  return work;
}

/**
 * Plodina, kterou letos oralo spřežení, dokončí motyka (mutuje `work`) – ves přišla o poslední
 * spřežení (oxen.md – Jen rádlo). Díly, kam orba došla, zůstanou zorané; zbytek se dokope:
 * kopání celé plodiny podle sazby motyky (drn s vrácením louky) s hotovým podílem, kam došla
 * orba – po dílech stejně (díl s drnem má v orbě větší váhu, v kopání ne). Plodina pak orbu nemá.
 */
export function ploughToHoe(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  toolCoverage: number,
  crop: Crop,
): void {
  const plough = work.plough;
  if (!plough) return;
  const sod = new Set(plough.sodIds ?? []);
  const parts = plough.partIds.flatMap((id) => {
    const part = partsById.get(id);
    return part ? [part] : [];
  });
  const ploughWeights = parts.map((p) => partWeight(p) * (sod.has(p.id) ? PLOUGH_SOD_FACTOR : 1));
  const ploughTotal = ploughWeights.reduce((sum, w) => sum + w, 0);
  const position = plough.required > 0 ? Math.min(1, plough.done / plough.required) : 1;
  const dig = fieldWorkPerHa('dig', toolCoverage, crop);
  const drn = reclaimCostPerHa('meadow', toolCoverage);
  let hoe = 0;
  let weight = 0;
  let doneWeight = 0;
  let start = 0;
  parts.forEach((part, i) => {
    const w = partWeight(part);
    const span = ploughTotal > 0 ? ploughWeights[i]! / ploughTotal : 0;
    const done = span > 0 ? Math.min(1, Math.max(0, (position - start) / span)) : 1;
    start += span;
    hoe += w * (dig + (sod.has(part.id) ? drn : 0));
    weight += w;
    doneWeight += w * done;
  });
  work.required.dig += hoe;
  work.done.dig += weight > 0 ? (doneWeight / weight) * hoe : hoe;
  delete work.plough;
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
 * spřežení všechny díly (`plough` v práci plodiny – i bez dílů, ať k ní přidané díly orá taky).
 */
export function createCropWork(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
  crop: Crop = 'spring',
): CropWork {
  const required = emptyTaskRecord();
  // spřežení orá po souvislých blocích a pásech podél brázdy (oxen.md – Co nejdelší brázda)
  const layout = plough ? ploughLayout(selected) : null;
  const ordered = layout ? layout.order : order(selected);
  const reclaimIds: number[] = [];
  const sodIds: number[] = [];
  let ploughRequired = 0;
  let ploughWeight = 0;
  for (const part of ordered) {
    const work = partWork(part, day, toolCoverage, plough, crop);
    for (const task of TASK_ORDER) required[task] += work[task];
    if (work.reclaim > 0) reclaimIds.push(part.id);
    if (!plough) continue;
    ploughRequired += work.plough;
    ploughWeight += partWeight(part);
    if (hasSod(part, day)) sodIds.push(part.id);
  }
  const partIds = ordered.map((p) => p.id);
  return {
    partIds,
    ...(reclaimIds.length > 0 ? { reclaimIds } : {}),
    required,
    done: emptyTaskRecord(),
    harvestedKg: null,
    ...(plough
      ? {
          plough: {
            partIds: [...partIds],
            required: ploughRequired,
            done: 0,
            weight: ploughWeight,
            ...(sodIds.length > 0 ? { sodIds } : {}),
            bands: layout!.bands,
          },
        }
      : {}),
  };
}

/**
 * Plán prací na rok jen s jaří (tvar plánu z doby před ozimem); s `plough` ves letos orá rádlem
 * (`ard`).
 */
export function createPlan(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): YearPlan {
  return {
    plannedDay: day,
    ...(plough ? { ard: true as const } : {}),
    ...createCropWork(selected, day, toolCoverage, plough, order, 'spring'),
  };
}

/**
 * Roční plán s ozimem, jaří, luštěninami a lnem (fields.md – Ozim a jař, Luštěniny, Len); bez
 * ozimu bez `winter`, bez luštěnin bez `legume`, bez lnu bez `flax`.
 */
export function createYearPlan(
  crops: { winter: FieldPart[]; spring: FieldPart[]; legume?: FieldPart[]; flax?: FieldPart[] },
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): YearPlan {
  const plan = createPlan(crops.spring, day, toolCoverage, plough, order);
  if (crops.winter.length > 0) {
    plan.winter = createCropWork(crops.winter, day, toolCoverage, plough, order, 'winter');
  }
  if (crops.legume && crops.legume.length > 0) {
    plan.legume = createCropWork(crops.legume, day, toolCoverage, plough, order, 'legume');
  }
  if (crops.flax && crops.flax.length > 0) {
    plan.flax = createCropWork(crops.flax, day, toolCoverage, plough, order, 'flax');
  }
  return plan;
}

/**
 * Přidá do práce plodiny `crop` další díly (mutuje `work`) – nová dávka jde na konec, seřazená
 * `order`.
 * Plodina, kterou orá spřežení (`plough`), přidané díly orá taky, jinak je kope motyka (oxen.md –
 * Jen rádlo: plodina se buď celá orá, nebo celá kope).
 */
export function addToCropWork(
  work: CropWork,
  added: FieldPart[],
  day: number,
  toolCoverage: number,
  order: WorkOrder = nearestFirst,
  crop: Crop = 'spring',
): void {
  const plough = work.plough;
  const extra = createCropWork(added, day, toolCoverage, plough !== undefined, order, crop);
  for (const task of TASK_ORDER) work.required[task] += extra.required[task];
  work.partIds.push(...extra.partIds);
  if (extra.reclaimIds) work.reclaimIds = [...(work.reclaimIds ?? []), ...extra.reclaimIds];
  if (!plough || !extra.plough) return;
  plough.partIds.push(...extra.plough.partIds);
  plough.required += extra.plough.required;
  plough.weight += extra.plough.weight;
  if (extra.plough.sodIds) plough.sodIds = [...(plough.sodIds ?? []), ...extra.plough.sodIds];
  // přidané díly – další bloky orby na konci
  if (plough.bands && extra.plough.bands) {
    const next = plough.bands.reduce((max, b) => Math.max(max, b.block + 1), 0);
    plough.bands.push(...extra.plough.bands.map((b) => ({ ...b, block: b.block + next })));
  }
}

/**
 * Práce plánu po plodinách v pořadí ozim, luštěniny, len, jař (ozim, luštěniny a len jen, když je
 * plán má).
 */
export function planCrops(plan: YearPlan): { crop: Crop; work: CropWork }[] {
  const crops: { crop: Crop; work: CropWork }[] = [];
  if (plan.winter) crops.push({ crop: 'winter', work: plan.winter });
  if (plan.legume) crops.push({ crop: 'legume', work: plan.legume });
  if (plan.flax) crops.push({ crop: 'flax', work: plan.flax });
  crops.push({ crop: 'spring', work: plan });
  return crops;
}

/**
 * Ves letos orá rádlem (oxen.md – Jen rádlo): letošní plán (po sklizni ten, který se mlátí)
 * vznikl se spřežením – i když ho po ztrátě spřežení dokončila motyka; plán starší vsi, když
 * v něm spřežení oralo. Ve scéně má pak celé pole kulaté rohy.
 */
export function ploughsThisYear(state: Pick<VillageState, 'plan' | 'threshingFromPlan'>): boolean {
  const plan = state.plan ?? state.threshingFromPlan;
  if (!plan) return false;
  return plan.ard === true || planCrops(plan).some(({ work }) => work.plough !== undefined);
}

/** Všechny díly plánu – ozim, luštěniny, len i jař. */
export function planPartIds(plan: YearPlan): number[] {
  return [
    ...(plan.winter?.partIds ?? []),
    ...(plan.legume?.partIds ?? []),
    ...(plan.flax?.partIds ?? []),
    ...plan.partIds,
  ];
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
 * Zpracovaný podíl půdy plodiny (0–1) – seje se, co je zorané, bez orby co je zkopané (oxen.md –
 * Jen rádlo). Plán starší vsi, kde spřežení oralo jen část dílů, váží orbu a kopání vahami dílů.
 */
export function tilledShare(work: CropWork): number {
  const plough = work.plough;
  if (!plough) return planShare(work, 'dig');
  const digWeight = plough.digWeight ?? 0;
  if (digWeight <= 0) return ploughShare(work);
  const total = plough.weight + digWeight;
  return (planShare(work, 'dig') * digWeight + ploughShare(work) * plough.weight) / total;
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

/**
 * Zbývající potřebná práce úlohy nebo orby – bez přípravy půdy dílů osevu navíc, která čeká na
 * volnou práci po stavbách (`CropWork.extraLeft`, fields.md – Osev navíc).
 */
export function neededTaskRemaining(work: CropWork, task: CropTask): number {
  const remaining = cropTaskRemaining(work, task);
  if (task !== 'reclaim' && task !== 'dig' && task !== 'plough') return remaining;
  return Math.max(0, remaining - (work.extraLeft?.[task] ?? 0));
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
export function harvestKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  crop: Crop = 'spring',
): number {
  return cropYieldKg(work, parts, day, planShare(work, 'sow'), workedShare(work, 'harvest'), crop);
}

/**
 * Hrubá úroda plodiny na hektar při úrodnosti (luštěniny podíl úrody obilí – LEGUMES; len kg
 * třeného lnu – FLAX, s úrodností jako obilí).
 */
export function cropGrossPerHa(crop: Crop, fertility: number): number {
  const grain = grossYieldPerHa(fertility);
  if (crop === 'legume') return grain * LEGUMES.yieldShare;
  if (crop === 'flax') return (grain / YIELD_BASE_KG_PER_HA) * FLAX.fiberKgPerHa;
  return grain;
}

/** Osivo plodiny na hektar (kg) – len seje semeno z vlastní úrody, zásoby neubírá (FLAX). */
export function cropSeedPerHa(crop: Crop): number {
  if (crop === 'legume') return LEGUMES.seedKgPerHa;
  if (crop === 'flax') return 0;
  return SEED_KG_PER_HA;
}

/** Podíl úrody neopletého dílu plodiny (luštěniny a len plevel snášejí hůř). */
function unweededYield(crop: Crop): number {
  if (crop === 'legume') return LEGUMES.unweededYield;
  if (crop === 'flax') return FLAX.unweededYield;
  return UNWEEDED_YIELD;
}

function cropYieldKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  sowFrac: number,
  harvestFrac: number,
  crop: Crop = 'spring',
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
    // pošlapaná plocha (vůz přes zaseté pole – wagons.md) úrodu nedá
    const trampled = 1 - CART_TRAMPLE.lossShare * Math.min(1, (part.trampledM2 ?? 0) / part.areaM2);
    const unweeded = unweededYield(crop);
    const gross =
      cropGrossPerHa(crop, effectiveFertility(part, day)) *
      sowFrac *
      (unweeded + (1 - unweeded) * weeded) *
      trampled *
      harvestFrac;
    total += Math.max(0, ha * gross - ha * cropSeedPerHa(crop) * sowFrac);
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
 * sklizně jaře; jinak do sklizně jaře (31. 8.). `needPerDayKg` = denní potřeba, kterou má ozim
 * pokrýt – simulace dává potřebu z pole (potřeba × `fieldFoodShare`), na kterou ves osévala.
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
