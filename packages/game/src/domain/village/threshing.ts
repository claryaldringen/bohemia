import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../calendar';
import { addThreshedGrain } from './grain-pits';
import { villageLegumesKg } from './legumes';
import { CROP_ORDER, CROP_WINDOWS, PLANNING_DAY, THRESHING, type WindowSegment } from './rules';
import type { Sheaves, ThreshedCrop, VillageState } from './types';
import { cropTaskRemaining, cropsAfield } from './year-plan';

// Snopy a výmlat (production-chains.md – Humno; Martin 20. 10. 2026: „Humno je podmínka“; fields.md
// – Pořadí důležitosti polních prací a výmlat do zimy, Martin 9. 11. 2026: „Výmlat prý počká i
// docela hluboko do zimy“). Sklizeň jde do snopů (`VillageState.sheaves`), výmlat je převádí do
// zásob obilí a luštěnin podle postupu práce – ozim a luštěniny od srpna, jař od září, do konce
// února; co okno nestihne, mlátí se dál. Na humnech plným tempem (kapacita humen se sčítá), jinak
// nouzově na udusané zemi (víc práce, méně zrna). Snopy v okně čekají bez ztráty, po něm se kazí.
// Čísla jsou v THRESHING (rules.ts).

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
 * Pořadí výmlatu mezi výmlatem plodin dne (konec okna v měsících – humna berou snopy v tomto
 * pořadí): výmlat na dnešní jídlo první, výmlat, který okno nestihl (březen–srpen), poslední.
 * Mezi ostatními pracemi dne řadí výmlat skupina (`DAY_WORK_ORDER` – výmlat na dnešní jídlo první,
 * ostatní výmlat za polními pracemi).
 */
export const THRESH_URGENT_END = -1;
export const THRESH_OVERDUE_END = 99;
/** Výmlat na jídlo vymlátí zrno na tolik dní dopředu (dnešek a zítřek – ztráty a chyby zaokrouhlení). */
const URGENT_FOOD_DAYS = 2;

/** Část stavu vsi, ze které se počítá výmlat dne a výhled snopů. */
type ThreshState = Pick<VillageState, 'sheaves' | 'threshingFloors' | 'threshingGraceUntil'>;

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
  return (state.threshingFloors ?? []).filter(
    (f) => f.builtDay !== null && f.disusedDay === undefined,
  ).length;
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
  void day; // kapacita už na dni nezávisí (rok odkladu ztratil význam)
  return {
    floorManDays: builtThreshingFloorCount(state) * THRESHING.floorManDaysPerDay,
    // bez humna i přebytek nad kapacitu humna se mlátí vždy nouzově (Martin 21. 10. 2026: „Ať
    // mlátí aspoň nouzově“) – ves s humnem nesmí být na tom hůř než ves bez něj
    emergency: true,
  };
}

/** Smí ves v den `day` mlátit – hotové humno, nebo nouzově na udusané zemi (vždy). */
export function canThresh(
  state: Pick<VillageState, 'threshingFloors' | 'threshingGraceUntil'>,
  day: number,
): boolean {
  const capacity = threshingCapacity(state, day);
  return capacity.floorManDays > 0 || capacity.emergency;
}

/** Stav vsi pro výhled snopů – snopy a humna, ruce pro výmlat a plán (žeň jaře v srpnu). */
type OutlookState = ThreshState &
  Pick<VillageState, 'threshHands' | 'season'> &
  Partial<Pick<VillageState, 'threshingSeason'>>;

/**
 * Snopy ve výhledu jídla a plánu osevu (production-chains.md – Humno): kg zrna a luštěnin, které
 * z nich výmlat dá – jen když ves smí mlátit (humno, nebo bez něj nouzově), se ztrátami
 * (`sheafYields`). Jinak nic – snopy, které nebude kde vymlátit, ves nesní.
 */
export function sheavesOutlook(
  state: OutlookState,
  day: number,
): { grainKg: number; legumesKg: number } {
  const sheaves = villageSheaves(state);
  if (!canThresh(state, day)) return { grainKg: 0, legumesKg: 0 };
  const yields = sheafYields(state, day);
  return {
    grainKg: Math.max(0, sheaves.grainKg) * yields.grain,
    legumesKg: Math.max(0, sheaves.legumesKg) * yields.legumes,
  };
}

/**
 * Nejdelší výhled výmlatu (dny) – mez výpočtu, ne pravidlo: co ruce nestihnou ani za rok, výhled
 * nepočítá (ves bez rukou pro výmlat by jinak počítala donekonečna).
 */
const OUTLOOK_MAX_DAYS = DAYS_PER_YEAR;

/** Ruce pro výmlat za den a práce, která má před výmlatem přednost (člověkodny za den, dny). */
interface ThreshHands {
  perDay: number;
  aheadPerDay: number;
  aheadDays: number;
}

/**
 * Ruce pro výmlat (návrh Clauda): práce vsi ve žních (`VillageState.threshHands` –
 * `harvestLaborPerDay`) bez zbytku žně rozloženého do konce okna žně jaře (září) – jaře
 * i ozimu, luštěnin a lnu, které červenec nedosklidil (fields.md – Žně i v srpnu), v září jaře,
 * kterou srpen nedosklidil (Žeň jaře i v září); žeň má přednost před výmlatem (`work()`), po
 * jejím okně dostane výmlat všechno.
 */
function threshHands(state: OutlookState, day: number, perDay: number): ThreshHands {
  const segments = CROP_WINDOWS.spring.harvest;
  const { year, month } = dateOfDayIndex(day);
  const current = segments.find(([from, to]) => month >= from && month <= to);
  let ahead = 0;
  if (current) {
    // i jař, kterou srpen nedosklidil (fields.md – Žeň jaře i v září)
    for (const { crop, work, late } of cropsAfield(state)) {
      // v září se žne jen jař, kterou srpen nedosklidil – plodiny letošní práce až za rok
      const reaping =
        (late || month !== PLANNING_DAY.month) &&
        CROP_WINDOWS[crop].harvest.some(([from, to]) => month >= from && month <= to);
      if (reaping) ahead += cropTaskRemaining(work, 'harvest');
    }
  }
  const aheadDays = current && ahead > EPSILON ? afterMonth(year, current[1]) - day : 0;
  return { perDay, aheadPerDay: aheadDays > 0 ? ahead / aheadDays : 0, aheadDays };
}

/**
 * Dny okna výmlatu plodiny, které má ves před sebou včetně dneška: v okně jeho zbytek, v den
 * sklizně (zítra okno začíná) dnešek a celé okno; jinak 0 – snopy jsou po okně.
 */
function outlookWindowDays(crop: ThreshedCrop, day: number): number {
  const left = threshWindowDaysLeft(crop, day);
  if (left > 0) return left;
  const next = threshWindowDaysLeft(crop, day + 1);
  return next > 0 ? next + 1 : 0;
}

/**
 * Kolik ze snopů každého druhu výmlat podle výhledu dá (0–1, návrh Clauda): výmlat den po dni
 * s rukama vsi (`threshHands`) – plodiny v pořadí výmlatu dne (`threshTasks` – humna berou snopy
 * v pořadí výmlatu, v srpnu ozim před luštěninami; oprava 2. 11. 2026 – dřív jeden společný podíl
 * obou druhů), na humnech plným tempem do jejich kapacity, zbytek rukou nouzově (o
 * THRESHING.emergencyWork pomaleji a o THRESHING.emergencyLoss méně zrna). Co ruce do konce okna
 * nestihnou, se kazí (ubytek jako `spoilSheaves` – druh bez plodiny v okně ztrácí denní díl)
 * a mlátí se dál stejnýma rukama (oprava, návrh Clauda 2. 11. 2026 – dřív výhled počítal, že se
 * všechno vymlátí dnes). Bez rukou ve stavu (`threshHands` chybí) výmlat dne při dost rukou.
 */
function sheafYields(state: OutlookState, day: number): Record<SheafKind, number> {
  const tasks = threshTasks(state, day).map((task) => ({
    kind: sheafKind(task.crop),
    work: sheafWork(state, task.crop),
    windowDays: outlookWindowDays(task.crop, day),
  }));
  const total: Record<SheafKind, number> = { grain: 0, legumes: 0 };
  const threshed: Record<SheafKind, number> = { grain: 0, legumes: 0 };
  for (const task of tasks) total[task.kind] += task.work;
  if (tasks.some((task) => task.work > EPSILON)) {
    const hands = threshHands(state, day, state.threshHands ?? Infinity);
    const floors = threshingCapacity(state, day).floorManDays;
    for (let d = 0; d < OUTLOOK_MAX_DAYS && tasks.some((t) => t.work > EPSILON); d++) {
      // ubytek na začátku dne (dnešní už proběhl): druh, jehož žádná plodina nemá výmlat v okně
      if (d > 0) {
        for (const kind of ['grain', 'legumes'] as const) {
          const kept = tasks.some((t) => t.kind === kind && t.work > EPSILON && d < t.windowDays);
          if (!kept) for (const t of tasks) if (t.kind === kind) t.work *= DAILY_KEEP;
        }
      }
      let handsLeft = Math.max(0, hands.perDay - (d < hands.aheadDays ? hands.aheadPerDay : 0));
      let floorLeft = floors;
      for (const task of tasks) {
        if (handsLeft <= EPSILON) break;
        if (task.work <= EPSILON) continue;
        const floor = Math.min(task.work, floorLeft, handsLeft);
        floorLeft -= floor;
        handsLeft -= floor;
        const ground = Math.min(task.work - floor, handsLeft / (1 + THRESHING.emergencyWork));
        handsLeft -= ground * (1 + THRESHING.emergencyWork);
        task.work -= floor + ground;
        threshed[task.kind] += floor + ground * (1 - THRESHING.emergencyLoss);
      }
    }
  }
  const kindYield = (kind: SheafKind): number =>
    total[kind] <= EPSILON ? 1 : threshed[kind] / total[kind];
  return { grain: kindYield('grain'), legumes: kindYield('legumes') };
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
    if (kind === 'grain') {
      state.storesKg += Math.max(0, kg);
      // vymlácené zrno čeká na humně na uložení do jam (production-chains.md – Obilné jámy)
      addThreshedGrain(state, Math.max(0, kg));
    } else state.legumesKg = (state.legumesKg ?? 0) + Math.max(0, kg);
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

/**
 * Konec úseku okna výmlatu plodiny v měsících, když dnes běží (září–prosinec 12, leden–únor 2);
 * jinak null.
 */
function threshWindowEnd(crop: ThreshedCrop, month: number): number | null {
  const segments: readonly WindowSegment[] = CROP_WINDOWS[crop].thresh;
  const current = segments.find(([from, to]) => month >= from && month <= to);
  return current ? current[1] : null;
}

/**
 * Poslední měsíc okna výmlatu plodiny (rok od dnešního, měsíc), když dnes běží: úsek do prosince
 * pokračuje úsekem od ledna příštího roku (okno přes konec roku – srpen až únor); jinak null.
 */
function threshWindowLast(
  crop: ThreshedCrop,
  month: number,
): { yearsAhead: number; month: number } | null {
  const segments: readonly WindowSegment[] = CROP_WINDOWS[crop].thresh;
  const end = threshWindowEnd(crop, month);
  if (end === null) return null;
  const next = end === MONTHS_PER_YEAR ? segments.find(([from]) => from === 1) : undefined;
  return next ? { yearsAhead: 1, month: next[1] } : { yearsAhead: 0, month: end };
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
  const last = threshWindowLast(crop, month);
  return last === null ? 0 : afterMonth(year + last.yearsAhead, last.month) - day;
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
   * Konec úseku okna výmlatu v měsících (pořadí výmlatu plodin dne); výmlat na dnešní jídlo
   * THRESH_URGENT_END (první), výmlat po konci okna THRESH_OVERDUE_END (poslední).
   */
  end: number;
  /** Výmlat na dnešní jídlo – zásoby dnešní jídlo nepokryjí (production-chains.md – Humno). */
  urgent?: true;
  /**
   * Výmlat na osivo – vymlácené zrno nepokryje setí dneška a zítřka (fields.md – Pořadí důležitosti
   * polních prací a výmlat do zimy; `seedThreshKg`).
   */
  seed?: true;
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
 * první, za ním **výmlat na osivo** (`seedKg` kg – `seedThreshKg`). Pak výmlat v pořadí konce okna
 * a plodin (výmlat po okně poslední – THRESH_OVERDUE_END). Kapacitu humen berou úlohy v tomto
 * pořadí, co se na humna nevejde, mlátí se nouzově (víc práce).
 */
export function threshTasks(state: ThreshState, day: number, foodKg = 0, seedKg = 0): ThreshTask[] {
  const capacity = threshingCapacity(state, day);
  if (capacity.floorManDays <= 0 && !capacity.emergency) return [];
  const month = dateOfDayIndex(day).month;
  const urgent = urgentProgress(state, foodKg, capacity);
  const seed = urgentProgress(state, seedKg, capacity, urgent);
  const early = (
    progress: ReadonlyMap<ThreshedCrop, number>,
    kind: 'urgent' | 'seed',
    priority: number,
  ): PendingThresh[] =>
    [...progress].map(([crop, work]) => ({
      crop,
      work,
      end: THRESH_URGENT_END,
      overdue: false,
      kind,
      priority,
    }));
  const pending: PendingThresh[] = [
    ...early(urgent, 'urgent', 0),
    ...early(seed, 'seed', 1),
    ...THRESHED_CROPS.flatMap((crop): PendingThresh[] => {
      const work = sheafWork(state, crop) - (urgent.get(crop) ?? 0) - (seed.get(crop) ?? 0);
      if (work <= EPSILON) return [];
      const windowEnd = threshWindowEnd(crop, month);
      return [
        {
          crop,
          work,
          end: windowEnd ?? THRESH_OVERDUE_END,
          overdue: windowEnd === null,
          kind: null,
          priority: 2,
        },
      ];
    }),
  ].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.end - b.end ||
      CROP_ORDER.indexOf(a.crop) - CROP_ORDER.indexOf(b.crop),
  );
  let floorLeft = capacity.floorManDays;
  const tasks: ThreshTask[] = [];
  for (const { crop, work, end, overdue, kind } of pending) {
    const floor = Math.min(work, floorLeft);
    floorLeft -= floor;
    const ground = capacity.emergency ? (work - floor) * (1 + THRESHING.emergencyWork) : 0;
    const remaining = floor + ground;
    if (remaining > EPSILON) {
      tasks.push({
        crop,
        end,
        remaining,
        floor,
        overdue,
        ...(kind === 'urgent' ? { urgent: true } : kind === 'seed' ? { seed: true } : {}),
      });
    }
  }
  return tasks;
}

/** Výmlat plodiny, který čeká na rozdělení kapacity humen (`threshTasks`). */
interface PendingThresh {
  crop: ThreshedCrop;
  work: number;
  end: number;
  overdue: boolean;
  /** Výmlat na dnešní jídlo, na osivo, nebo obyčejný (null). */
  kind: 'urgent' | 'seed' | null;
  /** Pořadí na humnech – jídlo, osivo, ostatní. */
  priority: number;
}

/**
 * Zrno na dnešní jídlo (kg – výmlat na dnešní jídlo, production-chains.md – Humno): potřeba energie
 * vsi `needPerDayKg` na URGENT_FOOD_DAYS dní (celá potřeba počítaná jako obilí – jiné jídlo potřebu
 * obilí jen zmenší). Tolik zrna ves nevymění ani nezaplatí (`paymentPool`).
 */
export function foodGrainReserveKg(needPerDayKg: number): number {
  return needPerDayKg * URGENT_FOOD_DAYS;
}

/**
 * Kolik zrna obilí vymlátit na jídlo (kg – výmlat na dnešní jídlo, production-chains.md – Humno):
 * co ze zásob chybí do zrna na dnešní jídlo (`foodGrainReserveKg`). Se zásobami na dva dny nic.
 */
export function threshForFoodKg(
  state: Pick<VillageState, 'storesKg'>,
  needPerDayKg: number,
): number {
  return Math.max(0, foodGrainReserveKg(needPerDayKg) - state.storesKg);
}

/**
 * Kolik práce výmlatu (postupu, člověkodny na humně) dá `foodKg` kg zrna obilí – po plodinách
 * obilí v pořadí plodin (ozim první), nejvýš jejich zbývající práce bez postupu, který už dnes
 * bere výmlat před ním (`before` – výmlat na osivo za výmlatem na jídlo). Výmlat na jídlo bere
 * humna první – do jejich kapacity plný výnos; co se nevejde, mlátí se nouzově a je o ztrátu menší
 * – mlátí se ho víc (oprava, návrh Clauda 2. 11. 2026 – dřív s humnem celé jako z humna).
 */
function urgentProgress(
  state: ThreshState,
  foodKg: number,
  capacity: ThreshingCapacity,
  before: ReadonlyMap<ThreshedCrop, number> = new Map(),
): Map<ThreshedCrop, number> {
  const progress = new Map<ThreshedCrop, number>();
  const pool = villageSheaves(state).grainKg;
  const allWork = kindWork(state, 'grain');
  const taken = [...before.values()].reduce((sum, w) => sum + w, 0);
  const work = allWork - taken;
  if (foodKg <= EPSILON || pool <= EPSILON || work <= EPSILON) return progress;
  const kgPerWork = pool / allWork;
  const onFloors = Math.min(work, Math.max(0, capacity.floorManDays - taken));
  const floorKg = onFloors * kgPerWork;
  let need = Math.min(
    work,
    foodKg <= floorKg
      ? foodKg / kgPerWork
      : onFloors + (foodKg - floorKg) / (kgPerWork * (1 - THRESHING.emergencyLoss)),
  );
  for (const crop of THRESHED_CROPS) {
    if (need <= EPSILON) break;
    if (sheafKind(crop) !== 'grain') continue;
    const take = Math.min(sheafWork(state, crop) - (before.get(crop) ?? 0), need);
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
  if (kind === 'grain') {
    state.storesKg += threshed;
    // vymlácené zrno čeká na humně na uložení do jam (production-chains.md – Obilné jámy)
    addThreshedGrain(state, threshed);
  } else state.legumesKg = villageLegumesKg(state) + threshed;
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
  /** Ves bez humna mlátí nouzově na udusané zemi (má snopy k výmlatu). */
  emergency: boolean;
  /**
   * Výmlat nestihl okno, ač humno stálo celé okno, a ves mimo odklad mlátí jen na humnech – humno
   * nestačí (humno postavené až po začátku okna se nepočítá – zpoždění je z pozdní stavby).
   */
  floorShort: boolean;
}

/** Stav výmlatu vsi v den `day` (production-chains.md – Humno) – jen čte stav. */
export function threshingStatus(state: VillageState, day: number): ThreshingStatus {
  const sheaves = villageSheaves(state);
  const floors = builtThreshingFloorCount(state);
  const work = THRESHED_CROPS.reduce((sum, c) => sum + sheafWork(state, c), 0);
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
    emergency: floors === 0 && work > EPSILON,
    floorShort: floors > 0 && overdue,
  };
}
