import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../calendar';
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
/**
 * Pořadí výmlatu mezi pracemi dne (konec okna v měsících): výmlat na dnešní jídlo je
 * nejnaléhavější – před žní i ostatními úlohami; výmlat, který okno nestihl, dobíhá na podzim
 * a v zimě (září–únor) s koncem v dnešním měsíci, na jaře a v létě (březen–srpen) až po všech
 * ostatních pracích – zbytky, které se kazí, nepředběhnou setí ani žeň (jídlo hlídá výmlat na
 * dnešek; návrh Clauda).
 */
export const THRESH_URGENT_END = -1;
export const THRESH_OVERDUE_END = 99;
/** Měsíce, kdy zpožděný výmlat jde až po ostatních pracích (jaro a léto). */
const LATE_THRESH_MONTHS = { from: 3, to: 8 } as const;
/** Výmlat na jídlo vymlátí zrno na tolik dní dopředu (dnešek a zítřek – ztráty a chyby zaokrouhlení). */
const URGENT_FOOD_DAYS = 2;

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
 * z nich výmlat dá – jen když ves smí mlátit (humno, nebo rok odkladu), se ztrátami (`sheafYield`).
 * Jinak nic – snopy, které nebude kde vymlátit, ves nesní.
 */
export function sheavesOutlook(
  state: Pick<VillageState, 'sheaves' | 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
): { grainKg: number; legumesKg: number } {
  const sheaves = villageSheaves(state);
  if (!canThresh(state, day)) return { grainKg: 0, legumesKg: 0 };
  return {
    grainKg: Math.max(0, sheaves.grainKg) * sheafYield(state, day, 'grain'),
    legumesKg: Math.max(0, sheaves.legumesKg) * sheafYield(state, day, 'legumes'),
  };
}

/**
 * Kolik ze snopů druhu výmlat podle výhledu dá (0–1, návrh Clauda): v roce odkladu se, co humna
 * dnes nevezmou, mlátí hned nouzově – ta část o THRESHING.emergencyLoss méně; mimo odklad mlátí
 * jen humna – výmlat trvá práce ÷ kapacita humen dní a část, kterou humna v okně výmlatu druhu
 * nestihnou, se do výmlatu kazí (THRESHING.spoilPerMonth – průměrně polovinu doby po okně).
 */
function sheafYield(
  state: Pick<VillageState, 'sheaves' | 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
  kind: SheafKind,
): number {
  const work = THRESHED_CROPS.reduce((sum, c) => sum + sheafWork(state, c), 0);
  if (work <= EPSILON || kindWork(state, kind) <= EPSILON) return 1;
  const capacity = threshingCapacity(state, day);
  if (capacity.emergency) {
    const ground = Math.max(0, work - capacity.floorManDays) / work;
    return 1 - THRESHING.emergencyLoss * ground;
  }
  if (capacity.floorManDays <= 0) return 0;
  const days = work / capacity.floorManDays;
  const windowLeft = Math.max(
    0,
    ...THRESHED_CROPS.filter((c) => sheafKind(c) === kind && sheafWork(state, c) > EPSILON).map(
      (c) => threshWindowDaysAhead(c, day),
    ),
  );
  const late = Math.max(0, days - windowLeft);
  if (late <= 0) return 1;
  return 1 - (late / days) * (1 - DAILY_KEEP ** (late / 2));
}

/**
 * Sklizeň plodiny do snopů (mutuje stav): `kg` čisté úrody a `threshWork` práce výmlatu sklizené
 * části (člověkodny na humně – `taskRemaining(work, 'thresh')` při sklizni). Úroda bez práce
 * výmlatu (plán s výmlatem už hotovým – starší stav, testy) je vymlácená – rovnou do zásob.
 */
export function addSheaves(
  state: VillageState,
  crop: ThreshedCrop,
  kg: number,
  threshWork: number,
): void {
  const kind = sheafKind(crop);
  if (threshWork <= EPSILON) {
    if (kind === 'grain') state.storesKg += Math.max(0, kg);
    else state.legumesKg = (state.legumesKg ?? 0) + Math.max(0, kg);
    return;
  }
  const sheaves = villageSheaves(state);
  const work = { ...(sheaves.work ?? {}) };
  if (threshWork > EPSILON) work[crop] = (work[crop] ?? 0) + threshWork;
  state.sheaves = {
    grainKg: sheaves.grainKg + (kind === 'grain' ? Math.max(0, kg) : 0),
    legumesKg: sheaves.legumesKg + (kind === 'legumes' ? Math.max(0, kg) : 0),
    ...(Object.keys(work).length > 0 ? { work } : {}),
  };
}

/**
 * Díl snopů odejde (mutuje stav – migration.md, Odchod do nové vsi): snopy obilí a luštěnin
 * i jejich práce výmlatu se zmenší o podíl `grainShare` / `legumesShare` (0–1).
 */
export function takeSheaves(state: VillageState, grainShare: number, legumesShare: number): void {
  const sheaves = state.sheaves;
  if (!sheaves || (grainShare <= 0 && legumesShare <= 0)) return;
  const work = { ...(sheaves.work ?? {}) };
  for (const c of THRESHED_CROPS) {
    const share = sheafKind(c) === 'grain' ? grainShare : legumesShare;
    if (work[c] !== undefined) work[c] = work[c]! * (1 - share);
  }
  state.sheaves = {
    grainKg: sheaves.grainKg * (1 - grainShare),
    legumesKg: sheaves.legumesKg * (1 - legumesShare),
    ...(Object.keys(work).length > 0 ? { work } : {}),
  };
}

/** Konec okna výmlatu plodiny v měsících, když dnes běží (srpen 8, září 9); jinak null. */
function threshWindowEnd(crop: ThreshedCrop, month: number): number | null {
  const segments: readonly WindowSegment[] = CROP_WINDOWS[crop].thresh;
  const current = segments.find(([from, to]) => month >= from && month <= to);
  return current ? current[1] : null;
}

/** Den po posledním dni měsíce `month` roku `year` (za koncem světa konec světa). */
function afterMonth(year: number, month: number): number {
  try {
    return month === MONTHS_PER_YEAR
      ? dayIndexOf({ year: year + 1, month: 1, day: 1 })
      : dayIndexOf({ year, month: month + 1, day: 1 });
  } catch {
    return TOTAL_GAME_DAYS;
  }
}

/** Kolik dní okna výmlatu plodiny zbývá včetně dneška; mimo okno 0. */
export function threshWindowDaysLeft(crop: ThreshedCrop, day: number): number {
  const { year, month } = dateOfDayIndex(day);
  const end = threshWindowEnd(crop, month);
  return end === null ? 0 : afterMonth(year, end) - day;
}

/**
 * Kolik dní okna výmlatu plodiny má ves před sebou: v okně zbytek včetně dneška, v den sklizně
 * (zítra okno začíná – snopy jsou čerstvé) celé okno; jinak 0 – snopy jsou po okně.
 */
function threshWindowDaysAhead(crop: ThreshedCrop, day: number): number {
  const left = threshWindowDaysLeft(crop, day);
  return left > 0 ? left : threshWindowDaysLeft(crop, day + 1);
}

/** První den posledního okna výmlatu plodiny, které začalo nejpozději v den `day`. */
function lastWindowStart(crop: ThreshedCrop, day: number): number {
  const { year, month } = dateOfDayIndex(day);
  const start = CROP_WINDOWS[crop].thresh[0]![0];
  return dayIndexOf({ year: month >= start ? year : year - 1, month: start, day: 1 });
}

/**
 * Ubytek snopů dne (mutuje stav – production-chains.md, Humno): snopy druhu, který dnes nemá výmlat
 * v okně své plodiny (ves bez humna po odkladu, nebo výmlat okno nestihl), ztratí denní díl
 * THRESHING.spoilPerMonth za měsíc – i s prací výmlatu (shnilé snopy se nemlátí, vyhodí se).
 * Snopy, které se právě mlátí v okně, čekají na řadu bez ztráty.
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
  const grain = keeps('grain');
  const legumes = keeps('legumes');
  const work = { ...(sheaves.work ?? {}) };
  for (const c of THRESHED_CROPS) {
    const kept = sheafKind(c) === 'grain' ? grain : legumes;
    if (!kept && work[c] !== undefined) work[c] = work[c]! * DAILY_KEEP;
  }
  state.sheaves = {
    grainKg: grain ? sheaves.grainKg : sheaves.grainKg * DAILY_KEEP,
    legumesKg: legumes ? sheaves.legumesKg : sheaves.legumesKg * DAILY_KEEP,
    ...(Object.keys(work).length > 0 ? { work } : {}),
  };
}

/** Výmlat jedné plodiny dne – kolik práce chce a kolik z ní jde na humna. */
export interface ThreshTask {
  crop: ThreshedCrop;
  /**
   * Konec okna výmlatu v měsících (řazení prací dne); výmlat na dnešní jídlo THRESH_URGENT_END
   * (první), výmlat po konci okna v září–únoru dnešní měsíc, v březnu–srpnu THRESH_OVERDUE_END
   * (poslední).
   */
  end: number;
  /** Výmlat na dnešní jídlo – zásoby dnešní jídlo nepokryjí (production-chains.md – Humno). */
  urgent?: true;
  /** Práce, kterou výmlat dnes chce (člověkodny) – na humnech a nouzově na udusané zemi. */
  remaining: number;
  /** Z ní práce na humnech (do kapacity humen, kterou nevzal výmlat před ní). */
  floor: number;
  /** Výmlat po konci okna (humno nestačilo, nebo ves humno postavila pozdě). */
  overdue: boolean;
}

/**
 * Výmlat dne po plodinách (production-chains.md – Humno): plodina se snopy, jejichž práce zbývá,
 * když ves smí mlátit. Napřed **výmlat na dnešní jídlo** (návrh Clauda): chybí-li v zásobách zrno
 * na jídlo (`foodKg` kg – `threshForFoodKg`), vymlátí se ho tolik nejdřív – ze snopů obilí, ozim
 * první. Pak výmlat v pořadí konce okna a plodin (výmlat po okně podle THRESH_OVERDUE_END).
 * Kapacitu humen berou úlohy v tomto pořadí, co se na humna nevejde, mlátí se v roce odkladu
 * nouzově (víc práce).
 */
export function threshTasks(state: VillageState, day: number, foodKg = 0): ThreshTask[] {
  const capacity = threshingCapacity(state, day);
  if (capacity.floorManDays <= 0 && !capacity.emergency) return [];
  const month = dateOfDayIndex(day).month;
  const urgent = urgentProgress(state, foodKg, capacity);
  const pending = [
    ...[...urgent].map(([crop, work]) => ({
      crop,
      work,
      end: THRESH_URGENT_END,
      overdue: false,
      urgent: true as const,
    })),
    ...THRESHED_CROPS.flatMap((crop) => {
      const work = sheafWork(state, crop) - (urgent.get(crop) ?? 0);
      if (work <= EPSILON) return [];
      const windowEnd = threshWindowEnd(crop, month);
      const lateMonth = month >= LATE_THRESH_MONTHS.from && month <= LATE_THRESH_MONTHS.to;
      return [
        {
          crop,
          work,
          end: windowEnd ?? (lateMonth ? THRESH_OVERDUE_END : month),
          overdue: windowEnd === null,
          urgent: false as const,
        },
      ];
    }),
  ].sort((a, b) => a.end - b.end || CROP_ORDER.indexOf(a.crop) - CROP_ORDER.indexOf(b.crop));
  let floorLeft = capacity.floorManDays;
  const tasks: ThreshTask[] = [];
  for (const { crop, work, end, overdue, urgent: now } of pending) {
    const floor = Math.min(work, floorLeft);
    floorLeft -= floor;
    const ground = capacity.emergency ? (work - floor) * (1 + THRESHING.emergencyWork) : 0;
    const remaining = floor + ground;
    if (remaining > EPSILON) {
      tasks.push({ crop, end, remaining, floor, overdue, ...(now ? { urgent: true } : {}) });
    }
  }
  return tasks;
}

/**
 * Kolik zrna obilí vymlátit na jídlo (kg – výmlat na dnešní jídlo, production-chains.md – Humno):
 * co ze zásob chybí do potřeby energie vsi `needPerDayKg` na URGENT_FOOD_DAYS dní (celá potřeba
 * počítaná jako obilí – jiné jídlo potřebu obilí jen zmenší). Se zásobami na dva dny nic.
 */
export function threshForFoodKg(
  state: Pick<VillageState, 'storesKg'>,
  needPerDayKg: number,
): number {
  return Math.max(0, needPerDayKg * URGENT_FOOD_DAYS - state.storesKg);
}

/**
 * Kolik práce výmlatu (postupu, člověkodny na humně) dá `foodKg` kg zrna obilí – po plodinách
 * obilí v pořadí plodin (ozim první), nejvýš jejich zbývající práce. Nouzově vymlácené zrno je
 * o ztrátu menší – mlátí se ho víc.
 */
function urgentProgress(
  state: VillageState,
  foodKg: number,
  capacity: ThreshingCapacity,
): Map<ThreshedCrop, number> {
  const progress = new Map<ThreshedCrop, number>();
  const pool = villageSheaves(state).grainKg;
  const work = kindWork(state, 'grain');
  if (foodKg <= EPSILON || pool <= EPSILON || work <= EPSILON) return progress;
  const yieldShare = capacity.floorManDays > 0 ? 1 : 1 - THRESHING.emergencyLoss;
  let need = Math.min(work, (foodKg / (pool * yieldShare)) * work);
  for (const crop of THRESHED_CROPS) {
    if (need <= EPSILON) break;
    if (sheafKind(crop) !== 'grain') continue;
    const take = Math.min(sheafWork(state, crop), need);
    if (take <= EPSILON) continue;
    progress.set(crop, take);
    need -= take;
  }
  return progress;
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
 * Výmlat ve svém okně pro dřinu (happiness.md – dřina, production-chains.md – Humno): zbývající
 * práce výmlatu plodin, jejichž okno dnes běží (člověkodny práce vsi – bez humna v odkladu
 * nouzově), a poslední den okna. Výmlat po okně termín nemá.
 */
export function threshSeasonTasks(
  state: VillageState,
  day: number,
): { remaining: number; endDay: number }[] {
  if (!canThresh(state, day)) return [];
  const factor = builtThreshingFloorCount(state) > 0 ? 1 : 1 + THRESHING.emergencyWork;
  return THRESHED_CROPS.flatMap((crop) => {
    const work = sheafWork(state, crop);
    const left = threshWindowDaysLeft(crop, day);
    return work > EPSILON && left > 0 ? [{ remaining: work * factor, endDay: day + left - 1 }] : [];
  });
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
  /**
   * Výmlat nestihl okno, ač humno stálo celé okno, a ves mimo odklad mlátí jen na humnech – humno
   * nestačí (humno postavené až po začátku okna se nepočítá – zpoždění je z pozdní stavby).
   */
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
  const firstFloor = Math.min(
    ...(state.threshingFloors ?? []).flatMap((f) => (f.builtDay !== null ? [f.builtDay] : [])),
  );
  // výmlat po okně plodiny, jejíž celé okno humno stálo
  const overdue = THRESHED_CROPS.some(
    (c) =>
      sheafWork(state, c) > EPSILON &&
      threshWindowDaysAhead(c, day) === 0 &&
      firstFloor <= lastWindowStart(c, day),
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
