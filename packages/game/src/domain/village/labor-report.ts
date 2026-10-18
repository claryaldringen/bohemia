import type { WorkshopDay } from './crafts';
import { isVillageExtinct } from './extinction';
import type { DayAllocation, LaborTaskName } from './labor';
import { villageOrchards } from './orchard';
import { NO_CRAFTS, withinBounds } from './productivity';
import { HARVEST_WORK_PER_HA, ROAD_APPLES } from './rules';
import { mowingSquaresWorked } from './hay';
import type {
  Construction,
  CropWork,
  HayMowing,
  LaborActivity,
  LaborDay,
  LaborShare,
  LaborTarget,
  VillageState,
  YearPlan,
} from './types';
import { woodFellingCost } from './wood';
import { partsWorked, type PartTask } from './field-progress';
import { planPartIds, type CropTask } from './year-plan';

/** Hektar v m² – plocha sadu na jabloň u cesty. */
const M2_PER_HA = 10_000;

// Rozdělení práce posledního odsimulovaného dne po činnostech a místech – jen pro zobrazení
// (postavy ve scéně, villagers.md). Vzniká v kroku práce simulace ze stejného rozdělení, které
// simulace použila; simulace ho nečte. Žádná nová pravidla – jen kam práce dne šla.

/** Práce vložená dnes do jedné stavby a stav stavby před ní (kácení jde první – forest.md). */
export interface ConstructionWork {
  construction: Construction;
  manDays: number;
  doneBefore: number;
  felledBefore: number;
}

/** Polní úloha dne: práce plodiny a kolik z ní bylo hotové před a po dnešní práci (člověkodny). */
export interface FieldTaskWork {
  task: CropTask;
  work: CropWork;
  before: number;
  after: number;
}

/** Co krok práce simulace dnes rozdělil. */
export interface DayWork {
  allocation: DayAllocation;
  /** Polní úlohy dne po plodinách (bez nich se práce polí dělí podle plochy plánu). */
  fieldWork?: FieldTaskWork[];
  /** Opravy po obydlích (poměrně k potřebě). */
  repairs: { dwellingId: number; manDays: number }[];
  constructions: ConstructionWork[];
  /** Seč sena dne – kolik bylo posečeno před a po dnešní práci (oxen.md). */
  mowing?: { mowing: HayMowing; before: number; after: number };
  /** Práce řemeslníků po dílnách (crafts.md); bez údaje žádná. */
  workshops?: WorkshopDay[];
  /** Pokrytí nástroji dne – podíl žně a odnosu na sklizni (meze); bez údaje 0. */
  toolCoverage?: number;
}

/** Kolik kácených stromů jedné stavby rozdělení ukáže. */
export const LABOR_TREES_SHOWN = 3;
/** Méně člověkodní se do rozdělení nezapíše. */
const MIN_MAN_DAYS = 0.001;
/** Podíl odnosu na práci sklizně podle pokrytí nástroji (srp s železem žne rychleji – meze). */
function harvestCarryShare(toolCoverage: number): number {
  const carry = withinBounds(HARVEST_WORK_PER_HA.carry, toolCoverage);
  return carry / (withinBounds(HARVEST_WORK_PER_HA.reap, toolCoverage) + carry);
}

const FIELD_ACTIVITIES: readonly LaborTaskName[] = ['reclaim', 'dig', 'sow', 'weed', 'harvest'];

/**
 * Rozdělení práce dne podle míst (stav po práci dne – mutovat se smí až potom). Polní úlohy jdou
 * na díly, přes které dnes práce postoupila (čelo práce – field-progress.ts), sečtené po polích
 * s id těch dílů v cíli; sklizeň na žeň a odnos podle sazeb (fields.md), výmlat se dělá u vsi.
 * Sezónní práce v sadech podle plochy vysazených čtverců.
 */
export function laborDay(state: VillageState, day: number, work: DayWork): LaborDay {
  const shares: LaborShare[] = [];
  const add = (
    activity: LaborActivity,
    target: LaborTarget,
    manDays: number,
    construction?: number,
  ): void => {
    const rounded = Math.round(manDays * 1000) / 1000;
    if (rounded < MIN_MAN_DAYS) return;
    shares.push({
      activity,
      target,
      manDays: rounded,
      ...(construction === undefined ? {} : { construction }),
    });
  };
  const { allocation } = work;
  const carryShare = harvestCarryShare(work.toolCoverage ?? NO_CRAFTS.tools);

  for (const { task, fieldId, manDays, parts } of fieldShares(state, day, work)) {
    const target: LaborTarget =
      parts.length > 0 ? { kind: 'field', id: fieldId, parts } : { kind: 'field', id: fieldId };
    if (task === 'harvest') {
      add('harvest', target, manDays * (1 - carryShare));
      add('carry', target, manDays * carryShare);
    } else {
      add(task, target, manDays);
    }
  }
  add('thresh', { kind: 'village' }, allocation.tasks.thresh);
  for (const share of mowingShares(state, work)) add('mow', share.target, share.manDays);
  add('slaughter', { kind: 'village' }, allocation.tasks.slaughter);
  // dojení u domů, zimní péče o krávy a voly u ohrady (když ves nějakou má – diet.md)
  const pen = (state.pens ?? []).find((p) => p.builtDay !== null);
  add('milking', { kind: 'village' }, allocation.tasks.milking);
  add(
    'animal-care',
    pen ? { kind: 'pen', id: pen.id } : { kind: 'village' },
    allocation.tasks['animal-care'],
  );
  const orchards = orchardAreas(state);
  for (const task of ['orchard-care', 'orchard-harvest'] as const) {
    for (const { target, share } of orchards) {
      add(task, target, allocation.tasks[task] * share);
    }
  }

  for (const repair of work.repairs) {
    add('repair', { kind: 'dwelling', id: repair.dwellingId }, repair.manDays);
  }
  const workshops = work.workshops ?? [];
  // minimum a domácí výroba vsi i domácností dílen
  add(
    'domestic',
    { kind: 'village' },
    allocation.dailyMin + allocation.domestic + workshops.reduce((sum, w) => sum + w.domestic, 0),
  );
  // řemeslníci: uhlíř a hrnčíř kácejí u svého stromu, výroba v dílně – uhlíř u milíře, v lese
  // u lesního milíře, a sází mladé buky na pařezy (crafts.md – Uhlíř)
  for (const w of workshops) {
    const place: LaborTarget = { kind: 'dwelling', id: w.dwellingId };
    add(
      'fell',
      w.fellingTrees.length > 0 ? { kind: 'trees', ids: w.fellingTrees } : place,
      w.felling,
    );
    const kiln: LaborTarget = w.kilnSite
      ? { kind: 'kiln', id: w.dwellingId, x: w.kilnSite.x, z: w.kilnSite.z }
      : place;
    add('craft', kiln, w.making);
    if (w.planting) {
      const stumps = w.plantedTrees ?? [];
      add('plant', stumps.length > 0 ? { kind: 'trees', ids: stumps } : place, w.planting);
    }
  }

  let invested = 0;
  for (const c of work.constructions) {
    invested += c.manDays;
    for (const share of constructionShares(c)) {
      add(share.activity, share.target, share.manDays, c.construction.id);
    }
  }
  add('idle', { kind: 'village' }, allocation.common - invested);
  return { day, shares };
}

/**
 * Polní práce dne po polích: s polními úlohami po plodinách na díly, přes které práce dnes
 * postoupila (podíl podle úseku dílu), jinak (starší volání) poměrně k ploše polí v plánu.
 */
function fieldShares(
  state: VillageState,
  day: number,
  work: DayWork,
): { task: PartTask; fieldId: number; manDays: number; parts: number[] }[] {
  const { allocation, fieldWork } = work;
  if (!fieldWork) {
    const fields = FIELD_ACTIVITIES.some((t) => allocation.tasks[t] > 0)
      ? planFieldAreas(state)
      : [];
    return FIELD_ACTIVITIES.flatMap((task) =>
      fields.map(({ id, share }) => ({
        task: task as PartTask,
        fieldId: id,
        manDays: allocation.tasks[task] * share,
        parts: [],
      })),
    );
  }
  if (!fieldWork.some(({ task, before, after }) => task !== 'thresh' && after > before)) return [];
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const shares = new Map<
    string,
    { task: PartTask; fieldId: number; manDays: number; parts: number[] }
  >();
  for (const { task, work: crop, before, after } of fieldWork) {
    if (task === 'thresh' || after - before <= 0) continue;
    for (const part of partsWorked(crop, partsById, task, day, before, after)) {
      const key = `${task}:${part.fieldId}`;
      const share = shares.get(key) ?? { task, fieldId: part.fieldId, manDays: 0, parts: [] };
      share.manDays += (after - before) * part.share;
      if (!share.parts.includes(part.id)) share.parts.push(part.id);
      shares.set(key, share);
    }
  }
  return [...shares.values()];
}

/**
 * Seč dne na louky, přes které dnes postoupila: díly úhoru po polích, přirozené louky zvlášť
 * (podíl podle úseku louky).
 */
function mowingShares(
  state: VillageState,
  work: DayWork,
): { target: LaborTarget; manDays: number }[] {
  const day = work.mowing;
  if (!day || day.after - day.before <= 0) return [];
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const fields = new Map<number, { manDays: number; parts: number[] }>();
  const meadow = { manDays: 0, cells: [] as { x: number; y: number }[] };
  for (const sq of mowingSquaresWorked(day.mowing, partsById, day.before, day.after)) {
    const manDays = (day.after - day.before) * sq.share;
    if (sq.partId !== undefined && sq.fieldId !== undefined) {
      const share = fields.get(sq.fieldId) ?? { manDays: 0, parts: [] };
      share.manDays += manDays;
      share.parts.push(sq.partId);
      fields.set(sq.fieldId, share);
    } else if (sq.cell) {
      meadow.manDays += manDays;
      meadow.cells.push(sq.cell);
    }
  }
  const shares: { target: LaborTarget; manDays: number }[] = [...fields].map(([id, share]) => ({
    target: { kind: 'field', id, parts: share.parts },
    manDays: share.manDays,
  }));
  if (meadow.cells.length > 0) {
    shares.push({ target: { kind: 'meadow', cells: meadow.cells }, manDays: meadow.manDays });
  }
  return shares;
}

/**
 * Rozdělení práce posledního odsimulovaného dne; ves uložená před jeho zavedením null. Vymřelá
 * ves nepracuje – její poslední den (kdy ještě někdo pracoval) se už neukazuje.
 */
export function laborReport(state: Pick<VillageState, 'labor' | 'extinctDay'>): LaborDay | null {
  if (isVillageExtinct(state)) return null;
  return state.labor ?? null;
}

/**
 * Podíly polí na ploše plánu se počítají jednou na plán – díly plánu jen přibývají
 * (`joinFinishedParts`) a plocha ani pole dílu se nemění; simulace se ptá každý den.
 */
const planAreas = new WeakMap<
  YearPlan,
  { parts: number; shares: { id: number; share: number }[] }
>();

/** Pole s díly v letošním plánu a jejich podíl na ploše plánu (podle id pole). */
function planFieldAreas(state: VillageState): { id: number; share: number }[] {
  const plan = state.plan;
  if (plan === null) return [];
  const cached = planAreas.get(plan);
  const partIds = planPartIds(plan);
  if (cached && cached.parts === partIds.length) return cached.shares;
  const inPlan = new Set(partIds);
  const areas = new Map<number, number>();
  let total = 0;
  for (const part of state.parts) {
    if (!inPlan.has(part.id)) continue;
    areas.set(part.fieldId, (areas.get(part.fieldId) ?? 0) + part.areaM2);
    total += part.areaM2;
  }
  const shares =
    total <= 0
      ? []
      : [...areas].sort(([a], [b]) => a - b).map(([id, area]) => ({ id, share: area / total }));
  planAreas.set(plan, { parts: partIds.length, shares });
  return shares;
}

/**
 * Sady s vysazenými čtverci a úseky cest s vysazenými jabloněmi (roads.md – jabloň jako sad na
 * strom, ≈ 1/180 ha) a jejich podíl na vysazené ploše.
 */
function orchardAreas(state: VillageState): { target: LaborTarget; share: number }[] {
  const areas: { target: LaborTarget; area: number }[] = villageOrchards(state).map((o) => ({
    target: { kind: 'orchard', id: o.id },
    area: o.squares.reduce((sum, s) => sum + (s.plantedDay !== null ? s.areaM2 : 0), 0),
  }));
  const perApple = M2_PER_HA / ROAD_APPLES.treesPerHa;
  const byRoad = new Map<number, number>();
  for (const apple of state.roads?.apples ?? []) {
    if (apple.plantedDay === null) continue;
    byRoad.set(apple.roadId, (byRoad.get(apple.roadId) ?? 0) + perApple);
  }
  for (const [id, area] of byRoad) areas.push({ target: { kind: 'road', id }, area });
  const total = areas.reduce((sum, a) => sum + a.area, 0);
  if (total <= 0) return [];
  return areas.filter((a) => a.area > 0).map((a) => ({ target: a.target, share: a.area / total }));
}

/**
 * Práce jedné stavby po místech: obydlí a přestavba nejdřív kácejí své stromy (forest.md) –
 * u stromů, které ještě stojí (nebo u posledního skáceného, když dnes kácení skončilo), zbytek
 * se staví na staveništi / u obydlí. Pole, sad a hřbitov se dělají na svém místě.
 */
function constructionShares(work: ConstructionWork): LaborShare[] {
  const c = work.construction;
  if (c.kind === 'field') {
    return c.fieldId === null
      ? []
      : [
          {
            activity: 'found-field',
            target: { kind: 'field', id: c.fieldId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'orchard') {
    return c.orchardId === null || c.orchardId === undefined
      ? []
      : [
          {
            activity: 'orchard-plant',
            target: { kind: 'orchard', id: c.orchardId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'pen' || c.kind === 'ard') {
    if (c.penId === null || c.penId === undefined) return [];
    return penShares(work, { kind: 'pen', id: c.penId });
  }
  if (c.kind === 'road-apples') {
    const roadId = c.roadIds?.[0];
    return roadId === undefined
      ? []
      : [
          {
            activity: 'orchard-plant',
            target: { kind: 'road', id: roadId },
            manDays: work.manDays,
          },
        ];
  }
  if (c.kind === 'road') {
    // vylepšení pevné cesty (roads.md) – kácení dřeva hatě, pak práce na úseku
    const roadId = c.roadIds?.[0];
    return roadId === undefined ? [] : penShares(work, { kind: 'road', id: roadId }, 'build');
  }
  if (c.kind === 'cemetery') {
    return c.cemeteryId === null || c.cemeteryId === undefined
      ? []
      : [
          {
            activity: 'cemetery',
            target: { kind: 'cemetery', id: c.cemeteryId },
            manDays: work.manDays,
          },
        ];
  }
  // přestavba na místě pracuje u obydlí, přestavba na novém pozemku (polozemnice bez pozemku) na
  // staveništi
  const place: LaborTarget | null =
    c.kind === 'rebuild' && c.position === null
      ? c.dwellingId === null
        ? null
        : { kind: 'dwelling', id: c.dwellingId }
      : { kind: 'site', id: c.id };
  if (place === null) return [];
  return penShares(work, place, 'build');
}

/**
 * Práce stavby se dřevem po místech: nejdřív kácení jejích stromů (forest.md), zbytek na místě
 * stavby – obydlí a staveniště (`build`), ohrada a rádlo (`pen`).
 */
function penShares(
  work: ConstructionWork,
  place: LaborTarget,
  activity: LaborActivity = 'pen',
): LaborShare[] {
  const c = work.construction;
  const felling = woodFellingCost(c.wood);
  const fellWork = Math.max(
    0,
    Math.min(work.manDays, Math.min(c.done, felling) - Math.min(work.doneBefore, felling)),
  );
  const shares: LaborShare[] = [];
  if (fellWork > 0) {
    const trees = fellingTrees(work);
    shares.push({
      activity: 'fell',
      target: trees.length > 0 ? { kind: 'trees', ids: trees } : place,
      manDays: fellWork,
    });
  }
  if (work.manDays - fellWork > 0) {
    shares.push({ activity, target: place, manDays: work.manDays - fellWork });
  }
  return shares;
}

/** Stromy, u kterých se dnes kácelo: ještě stojící v pořadí kácení, jinak poslední skácený. */
function fellingTrees(work: ConstructionWork): number[] {
  const wood = work.construction.wood;
  if (!wood) return [];
  const standing = wood.fell
    .slice(wood.felled, wood.felled + LABOR_TREES_SHOWN)
    .flatMap((t) => (t.id === null ? [] : [t.id]));
  if (standing.length > 0) return standing;
  const last = wood.fell
    .slice(work.felledBefore, wood.felled)
    .flatMap((t) => (t.id === null ? [] : [t.id]));
  return last.slice(-1);
}
