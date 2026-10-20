import { dateOfDayIndex } from '../calendar';
import { daysUntilHarvest, daysUntilWinterHarvest } from './food';
import { villageLegumesKg } from './legumes';
import { CROP_ORDER, CROP_WINDOWS, THRESHING, type WindowSegment } from './rules';
import type { Sheaves, ThreshedCrop, VillageState, YearPlan } from './types';

// Snopy a výmlat hned po žni (production-chains.md – Humno; Martin 20. 10. 2026: „Humno je
// podmínka“, „Staří slované se snažili dělat výmlat hned. Klasy neskladovali.“). Sklizeň jde do
// snopů (`VillageState.sheaves`), výmlat je převádí do zásob obilí a luštěnin podle postupu práce
// – ozim a luštěniny v srpnu, jař v září, a co okno nestihne, mlátí se dál. Mlátí se jen na
// hotovém humnu (kapacita humen se sčítá), starší ves rok od převodu i nouzově na udusané zemi
// (víc práce, méně zrna). Snopy, které se nemlátí, se kazí. Čísla jsou v THRESHING (rules.ts).

/** Plodiny, jejichž snopy se mlátí, v pořadí plodin (CROP_ORDER – ozim, luštěniny, jař). */
export const THRESHED_CROPS: readonly ThreshedCrop[] = CROP_ORDER.filter(
  (c): c is ThreshedCrop => c !== 'flax',
);

/** Druh zásoby, do které jdou snopy plodiny – obilí, nebo luštěniny. */
export type SheafKind = 'grain' | 'legumes';

/** Druh zásoby plodiny. */
export function sheafKind(crop: ThreshedCrop): SheafKind {
  return crop === 'legume' ? 'legumes' : 'grain';
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
/** Denní ubytek nemlácených snopů (podíl, který zbude) – THRESHING.spoilPerMonth spojitě. */
const DAILY_KEEP = (1 - THRESHING.spoilPerMonth) ** (MONTHS_PER_YEAR / DAYS_PER_YEAR);
/** Práce menší než tolik člověkodní je hotová. */
const EPSILON = 1e-9;

/** Snopy vsi (vsi bez snopů prázdné). */
export function villageSheaves(state: Pick<VillageState, 'sheaves'>): Sheaves {
  return state.sheaves ?? { grainKg: 0, legumesKg: 0 };
}

/** Kg snopů druhu. */
function poolKg(sheaves: Sheaves, kind: SheafKind): number {
  return kind === 'grain' ? sheaves.grainKg : sheaves.legumesKg;
}

/** Zbývající práce výmlatu plodiny (člověkodny na humně). */
export function sheafWork(state: Pick<VillageState, 'sheaves'>, crop: ThreshedCrop): number {
  return state.sheaves?.work?.[crop] ?? 0;
}

/** Zbývající práce výmlatu všech plodin druhu (člověkodny na humně). */
function kindWork(state: Pick<VillageState, 'sheaves'>, kind: SheafKind): number {
  return THRESHED_CROPS.filter((c) => sheafKind(c) === kind).reduce(
    (sum, c) => sum + sheafWork(state, c),
    0,
  );
}

/** Počet hotových humen – na nich se mlátí (production-chains.md – Humno). */
export function builtThreshingFloorCount(state: Pick<VillageState, 'threshingFloors'>): number {
  return (state.threshingFloors ?? []).filter((f) => f.builtDay !== null).length;
}

/**
 * Je den `day` v roce odkladu starší vsi (`threshingGraceUntil` – production-chains.md, Starší
 * vsi)? Nová ves odklad nemá.
 */
export function inThreshingGrace(
  state: Pick<VillageState, 'threshingGraceUntil'>,
  day: number,
): boolean {
  return state.threshingGraceUntil !== undefined && day < state.threshingGraceUntil;
}

/**
 * Jak ves v den `day` mlátí: kolik práce výmlatu za den zvládnou hotová humna (THRESHING –
 * kapacita se sčítá) a jestli smí mlátit nouzově na udusané zemi (rok odkladu – bez omezení
 * místa, o THRESHING.emergencyWork víc práce a o THRESHING.emergencyLoss méně zrna).
 */
export interface ThreshingCapacity {
  floorManDays: number;
  emergency: boolean;
}

export function threshingCapacity(
  state: Pick<VillageState, 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
): ThreshingCapacity {
  return {
    floorManDays: builtThreshingFloorCount(state) * THRESHING.floorManDaysPerDay,
    emergency: inThreshingGrace(state, day),
  };
}

/** Smí ves v den `day` mlátit – má hotové humno, nebo je v roce odkladu? */
export function canThresh(
  state: Pick<VillageState, 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
): boolean {
  const capacity = threshingCapacity(state, day);
  return capacity.floorManDays > 0 || capacity.emergency;
}

/**
 * Snopy ve výhledu jídla a plánu osevu (production-chains.md – Humno): kg zrna a luštěnin, které
 * z nich výmlat dá – jen když ves smí mlátit (humno, nebo rok odkladu); nouzový výmlat bez humna
 * dá o ztrátu méně. Jinak nic – snopy, které nebude kde vymlátit, ves nesní.
 */
export function sheavesOutlook(
  state: Pick<VillageState, 'sheaves' | 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
): { grainKg: number; legumesKg: number } {
  const sheaves = villageSheaves(state);
  if (!canThresh(state, day)) return { grainKg: 0, legumesKg: 0 };
  const yieldShare = builtThreshingFloorCount(state) > 0 ? 1 : 1 - THRESHING.emergencyLoss;
  return {
    grainKg: Math.max(0, sheaves.grainKg) * yieldShare,
    legumesKg: Math.max(0, sheaves.legumesKg) * yieldShare,
  };
}

/**
 * Sklizeň plodiny do snopů (mutuje stav): `kg` čisté úrody a `threshWork` práce výmlatu sklizené
 * části (člověkodny na humně – `taskRemaining(work, 'thresh')` při sklizni).
 */
export function addSheaves(
  state: VillageState,
  crop: ThreshedCrop,
  kg: number,
  threshWork: number,
): void {
  const sheaves = villageSheaves(state);
  const kind = sheafKind(crop);
  const work = { ...(sheaves.work ?? {}) };
  if (threshWork > EPSILON) work[crop] = (work[crop] ?? 0) + threshWork;
  state.sheaves = {
    grainKg: sheaves.grainKg + (kind === 'grain' ? Math.max(0, kg) : 0),
    legumesKg: sheaves.legumesKg + (kind === 'legumes' ? Math.max(0, kg) : 0),
    ...(Object.keys(work).length > 0 ? { work } : {}),
  };
}

/** Konec okna výmlatu plodiny v měsících, když dnes běží (srpen 8, září 9); jinak null. */
function threshWindowEnd(crop: ThreshedCrop, month: number): number | null {
  const segments: readonly WindowSegment[] = CROP_WINDOWS[crop].thresh;
  const current = segments.find(([from, to]) => month >= from && month <= to);
  return current ? current[1] : null;
}

/**
 * Ubytek snopů dne (mutuje stav – production-chains.md, Humno): snopy druhu, který dnes nemá výmlat
 * v okně své plodiny (ves bez humna po odkladu, nebo výmlat okno nestihl), ztratí denní díl
 * THRESHING.spoilPerMonth za měsíc. Snopy, které se právě mlátí v okně, čekají na řadu bez ztráty.
 */
export function spoilSheaves(state: VillageState, day: number): void {
  const sheaves = state.sheaves;
  if (!sheaves || (sheaves.grainKg <= 0 && sheaves.legumesKg <= 0)) return;
  const month = dateOfDayIndex(day).month;
  const threshing = canThresh(state, day);
  const keeps = (kind: SheafKind): boolean =>
    threshing &&
    THRESHED_CROPS.some(
      (c) =>
        sheafKind(c) === kind &&
        sheafWork(state, c) > EPSILON &&
        threshWindowEnd(c, month) !== null,
    );
  state.sheaves = {
    ...sheaves,
    grainKg: keeps('grain') ? sheaves.grainKg : sheaves.grainKg * DAILY_KEEP,
    legumesKg: keeps('legumes') ? sheaves.legumesKg : sheaves.legumesKg * DAILY_KEEP,
  };
}

/** Výmlat jedné plodiny dne – kolik práce chce a kolik z ní jde na humna. */
export interface ThreshTask {
  crop: ThreshedCrop;
  /**
   * Konec okna výmlatu v měsících (řazení prací dne); výmlat po konci okna (snopy čekají a kazí
   * se) má konec v dnešním měsíci – je nejnaléhavější.
   */
  end: number;
  /** Práce, kterou výmlat dnes chce (člověkodny) – na humnech a nouzově na udusané zemi. */
  remaining: number;
  /** Z ní práce na humnech (do kapacity humen, kterou nevzal výmlat před ní). */
  floor: number;
  /** Výmlat po konci okna (humno nestačilo, nebo ves humno postavila pozdě). */
  overdue: boolean;
}

/**
 * Výmlat dne po plodinách (production-chains.md – Humno): plodina se snopy, jejichž práce zbývá,
 * když ves smí mlátit. V pořadí konce okna (výmlat po okně první) a plodin; kapacitu humen berou
 * v tom pořadí, co se na humna nevejde, mlátí se v roce odkladu nouzově (víc práce).
 */
export function threshTasks(state: VillageState, day: number): ThreshTask[] {
  const capacity = threshingCapacity(state, day);
  if (capacity.floorManDays <= 0 && !capacity.emergency) return [];
  const month = dateOfDayIndex(day).month;
  const pending = THRESHED_CROPS.flatMap((crop) => {
    const work = sheafWork(state, crop);
    if (work <= EPSILON) return [];
    const windowEnd = threshWindowEnd(crop, month);
    return [{ crop, work, end: windowEnd ?? month, overdue: windowEnd === null }];
  }).sort((a, b) => a.end - b.end || CROP_ORDER.indexOf(a.crop) - CROP_ORDER.indexOf(b.crop));
  let floorLeft = capacity.floorManDays;
  const tasks: ThreshTask[] = [];
  for (const { crop, work, end, overdue } of pending) {
    const floor = Math.min(work, floorLeft);
    floorLeft -= floor;
    const ground = capacity.emergency ? (work - floor) * (1 + THRESHING.emergencyWork) : 0;
    const remaining = floor + ground;
    if (remaining > EPSILON) tasks.push({ crop, end, remaining, floor, overdue });
  }
  return tasks;
}

/** Práce výmlatu dne – na humnech a nouzově na udusané zemi (člověkodny práce vsi). */
export interface ThreshLabor {
  floor: number;
  ground: number;
}

/**
 * Výmlat plodiny dne (mutuje stav): práce `labor` na úloze `task` – na humnech plným tempem, zbytek
 * nouzově (o THRESHING.emergencyWork pomaleji). Snopy druhu jdou do zásob podílem postupu na
 * zbývající práci druhu (obilí ozimu a jaře dohromady), nouzově vymlácené o THRESHING.emergencyLoss
 * méně. Vrátí práci na humnech a na udusané zemi.
 */
export function threshCrop(state: VillageState, task: ThreshTask, labor: number): ThreshLabor {
  const amount = Math.max(0, Math.min(labor, task.remaining));
  const floor = Math.min(amount, task.floor);
  const ground = amount - floor;
  const groundProgress = ground / (1 + THRESHING.emergencyWork);
  const progress = Math.min(sheafWork(state, task.crop), floor + groundProgress);
  if (progress <= EPSILON) return { floor, ground };
  const sheaves = villageSheaves(state);
  const kind = sheafKind(task.crop);
  const before = kindWork(state, kind);
  const share = before - progress <= EPSILON ? 1 : progress / before;
  const pool = poolKg(sheaves, kind);
  const taken = pool * share;
  // nouzově vymlácená část dá o ztrátu méně
  const yieldShare =
    (floor + groundProgress * (1 - THRESHING.emergencyLoss)) / (floor + groundProgress);
  const threshed = taken * yieldShare;
  const work = { ...(sheaves.work ?? {}) };
  const left = (work[task.crop] ?? 0) - progress;
  if (left > EPSILON && share < 1) work[task.crop] = left;
  else delete work[task.crop];
  // celý druh vymlácený – i zbylá práce ostatních plodin druhu (zaokrouhlení) zmizí
  if (share >= 1) for (const c of THRESHED_CROPS) if (sheafKind(c) === kind) delete work[c];
  state.sheaves = {
    grainKg: kind === 'grain' ? Math.max(0, pool - taken) : sheaves.grainKg,
    legumesKg: kind === 'legumes' ? Math.max(0, pool - taken) : sheaves.legumesKg,
    ...(Object.keys(work).length > 0 ? { work } : {}),
  };
  if (kind === 'grain') state.storesKg += threshed;
  else state.legumesKg = villageLegumesKg(state) + threshed;
  return { floor, ground };
}

/**
 * Práce výmlatu, která ves čeká (člověkodny práce vsi): zbývající práce snopů, které smí mlátit –
 * na humnech plným tempem, bez humna nouzově (o THRESHING.emergencyWork víc); nejvýš kapacita
 * humen za `days` dní, mimo rok odkladu. Bez možnosti mlátit 0 (plán osevu – sowingCapacity).
 */
export function pendingThreshLabor(state: VillageState, day: number, days: number): number {
  const capacity = threshingCapacity(state, day);
  if (capacity.floorManDays <= 0 && !capacity.emergency) return 0;
  const work = THRESHED_CROPS.reduce((sum, c) => sum + sheafWork(state, c), 0);
  const onFloors = Math.min(work, capacity.floorManDays * Math.max(0, days));
  const ground = capacity.emergency ? (work - onFloors) * (1 + THRESHING.emergencyWork) : 0;
  return onFloors + ground;
}

/**
 * Odklad mlácení starší vsi (production-chains.md – Starší vsi; Martin 20. 10. 2026: „Rok
 * odkladu“): ves uložená před snopy (`sheaves` chybí) dostane prázdné snopy a rok od dneška
 * (`today`, nejdřív den po posledním dopočítaném), kdy mlátí bez humna nouzově na udusané zemi.
 * Úroda už sklizená do zásob tam zůstane. Jednou – ves se snopy se nemění.
 */
export function withThreshingGrace(
  state: VillageState,
  today: number = state.lastDay + 1,
): VillageState {
  if (state.sheaves !== undefined) return state;
  const day = Math.max(state.lastDay + 1, today);
  return {
    ...state,
    sheaves: { grainKg: 0, legumesKg: 0 },
    threshingGraceUntil: day + THRESHING.graceDays,
  };
}

/** Stav výmlatu vsi pro upozornění a panel (production-chains.md – Humno). */
export interface ThreshingStatus {
  /** Nevymlácené snopy – kg zrna obilí a luštěnin. */
  sheavesGrainKg: number;
  sheavesLegumesKg: number;
  /** Ves má snopy a nemá kde mlátit – „Snopy čekají na humno“. */
  waiting: boolean;
  /**
   * Do sklizně zbývá nejvýš THRESHING.noticeDaysBefore dní, ves nemá humno (ani rozestavěné)
   * a po sklizni by nesměla mlátit – „Před žněmi postav humno“.
   */
  floorNeeded: boolean;
  /** Ves bez humna mlátí v roce odkladu nouzově na udusané zemi. */
  emergency: boolean;
  /** Výmlat nestihl okno a ves mimo odklad mlátí jen na humnech – humno nestačí. */
  floorShort: boolean;
}

/**
 * Den příští sklizně obilí nebo luštěnin podle plánu osevu (ozim a luštěniny 31. 7., jař 31. 8.),
 * nebo null – plán nic nesklízí.
 */
function nextHarvestDay(plan: YearPlan | null, day: number): number | null {
  if (!plan) return null;
  const early = [plan.winter, plan.legume].some(
    (w) => w !== undefined && w.harvestedKg === null && w.partIds.length > 0,
  );
  const late = plan.harvestedKg === null && plan.partIds.length > 0;
  const days = [
    ...(early ? [daysUntilWinterHarvest(day)] : []),
    ...(late ? [daysUntilHarvest(day)] : []),
  ];
  return days.length > 0 ? day + Math.min(...days) - 1 : null;
}

/** Stav výmlatu vsi v den `day` (production-chains.md – Humno) – jen čte stav. */
export function threshingStatus(state: VillageState, day: number): ThreshingStatus {
  const sheaves = villageSheaves(state);
  const kg = sheaves.grainKg + sheaves.legumesKg;
  const threshing = canThresh(state, day);
  const floors = builtThreshingFloorCount(state);
  const work = THRESHED_CROPS.reduce((sum, c) => sum + sheafWork(state, c), 0);
  const harvest = nextHarvestDay(state.plan, day);
  const month = dateOfDayIndex(day).month;
  const overdue = THRESHED_CROPS.some(
    (c) => sheafWork(state, c) > EPSILON && threshWindowEnd(c, month) === null,
  );
  return {
    sheavesGrainKg: sheaves.grainKg,
    sheavesLegumesKg: sheaves.legumesKg,
    waiting: kg >= THRESHING.noticeMinKg && !threshing,
    floorNeeded:
      harvest !== null &&
      harvest - day <= THRESHING.noticeDaysBefore &&
      (state.threshingFloors ?? []).length === 0 &&
      !canThresh(state, harvest + 1),
    emergency: floors === 0 && inThreshingGrace(state, day) && work > EPSILON,
    floorShort: floors > 0 && !inThreshingGrace(state, day) && overdue,
  };
}
