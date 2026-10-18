import type { DayAllocation, LaborTaskName } from './labor';
import { villageOrchards } from './orchard';
import { HARVEST_WORK_PER_HA } from './rules';
import type {
  Construction,
  LaborActivity,
  LaborDay,
  LaborShare,
  LaborTarget,
  VillageState,
} from './types';
import { woodFellingCost } from './wood';

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

/** Co krok práce simulace dnes rozdělil. */
export interface DayWork {
  allocation: DayAllocation;
  /** Opravy po obydlích (poměrně k potřebě). */
  repairs: { dwellingId: number; manDays: number }[];
  constructions: ConstructionWork[];
}

/** Kolik kácených stromů jedné stavby rozdělení ukáže. */
export const LABOR_TREES_SHOWN = 3;
/** Méně člověkodní se do rozdělení nezapíše. */
const MIN_MAN_DAYS = 0.001;
const HARVEST_CARRY_SHARE =
  HARVEST_WORK_PER_HA.carry / (HARVEST_WORK_PER_HA.reap + HARVEST_WORK_PER_HA.carry);

const FIELD_ACTIVITIES: readonly LaborTaskName[] = ['reclaim', 'dig', 'sow', 'weed', 'harvest'];

/**
 * Rozdělení práce dne podle míst (stav po práci dne – mutovat se smí až potom). Polní úlohy
 * plánu se dělí mezi pole podle plochy jejich dílů v plánu, sklizeň na žeň a odnos podle sazeb
 * (fields.md), výmlat se dělá u vsi. Sezónní práce v sadech podle plochy vysazených čtverců.
 */
export function laborDay(state: VillageState, day: number, work: DayWork): LaborDay {
  const shares: LaborShare[] = [];
  const add = (activity: LaborActivity, target: LaborTarget, manDays: number): void => {
    const rounded = Math.round(manDays * 1000) / 1000;
    if (rounded >= MIN_MAN_DAYS) shares.push({ activity, target, manDays: rounded });
  };
  const { allocation } = work;

  const fields = planFieldAreas(state);
  for (const task of FIELD_ACTIVITIES) {
    const amount = allocation.tasks[task];
    if (amount <= 0) continue;
    for (const { id, share } of fields) {
      const manDays = amount * share;
      if (task === 'harvest') {
        add('harvest', { kind: 'field', id }, manDays * (1 - HARVEST_CARRY_SHARE));
        add('carry', { kind: 'field', id }, manDays * HARVEST_CARRY_SHARE);
      } else {
        add(task, { kind: 'field', id }, manDays);
      }
    }
  }
  add('thresh', { kind: 'village' }, allocation.tasks.thresh);
  const orchards = orchardAreas(state);
  for (const task of ['orchard-care', 'orchard-harvest'] as const) {
    for (const { id, share } of orchards) {
      add(task, { kind: 'orchard', id }, allocation.tasks[task] * share);
    }
  }

  for (const repair of work.repairs) {
    add('repair', { kind: 'dwelling', id: repair.dwellingId }, repair.manDays);
  }
  add('domestic', { kind: 'village' }, allocation.dailyMin + allocation.domestic);

  let invested = 0;
  for (const c of work.constructions) {
    invested += c.manDays;
    for (const share of constructionShares(c)) add(share.activity, share.target, share.manDays);
  }
  add('idle', { kind: 'village' }, allocation.common - invested);
  return { day, shares };
}

/** Rozdělení práce posledního odsimulovaného dne; ves uložená před jeho zavedením null. */
export function laborReport(state: Pick<VillageState, 'labor'>): LaborDay | null {
  return state.labor ?? null;
}

/** Pole s díly v letošním plánu a jejich podíl na ploše plánu (podle id pole). */
function planFieldAreas(state: VillageState): { id: number; share: number }[] {
  const plan = state.plan;
  if (plan === null) return [];
  const inPlan = new Set(plan.partIds);
  const areas = new Map<number, number>();
  let total = 0;
  for (const part of state.parts) {
    if (!inPlan.has(part.id)) continue;
    areas.set(part.fieldId, (areas.get(part.fieldId) ?? 0) + part.areaM2);
    total += part.areaM2;
  }
  if (total <= 0) return [];
  return [...areas].sort(([a], [b]) => a - b).map(([id, area]) => ({ id, share: area / total }));
}

/** Sady s vysazenými čtverci a jejich podíl na vysazené ploše. */
function orchardAreas(state: VillageState): { id: number; share: number }[] {
  const areas = villageOrchards(state).map((o) => ({
    id: o.id,
    area: o.squares.reduce((sum, s) => sum + (s.plantedDay !== null ? s.areaM2 : 0), 0),
  }));
  const total = areas.reduce((sum, a) => sum + a.area, 0);
  if (total <= 0) return [];
  return areas.filter((a) => a.area > 0).map((a) => ({ id: a.id, share: a.area / total }));
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
  const place: LaborTarget | null =
    c.kind === 'rebuild'
      ? c.dwellingId === null
        ? null
        : { kind: 'dwelling', id: c.dwellingId }
      : { kind: 'site', id: c.id };
  if (place === null) return [];
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
    shares.push({ activity: 'build', target: place, manDays: work.manDays - fellWork });
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
