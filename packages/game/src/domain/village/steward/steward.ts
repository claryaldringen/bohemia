import { dateOfDayIndex, dayIndexOf, type GameDate } from '../../calendar';
import {
  SURFACE_CODES,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import {
  applyBuildIntent,
  CANNOT_AFFORD,
  NO_WOOD,
  type BuildIntent,
} from '../buildings/build-intent';
import { HORSE_PEN_NO_SURPLUS } from '../livestock/horse-pen-payment';
import { buildAffordability } from '../buildings/costs';
import { craftCoverage } from '../crafts/crafts';
import {
  averageRotationShare,
  fieldCapacity,
  harvestPerPersonKg,
  netYieldPerHa,
} from '../fields/field-capacity';
import { bufferFill, bufferKg, steadyHarvestKg, yearlyFoodNeed } from '../fields/field-food';
import { expectedYearlyFoodNeed } from '../fields/food-outlook';
import { waitingHouseholds } from '../people/households';
import { flushWear } from '../paths/wear';
import { fieldWorkPerHa } from '../core/productivity';
import { FIELD_LIMITS, FIELD_STORES, STORAGE_LOSS_PER_YEAR } from '../rules/rules-fields';
import { DWELLINGS } from '../rules/rules-people';
import { PLOT_TYPES } from '../rules/rules-buildings';
import { STEWARD, type StewardMonthDay, type StewardWindow } from '../rules/rules-steward';
import { fieldStoresOutlook } from '../core/simulate-plan';
import { fieldCells, planCentre, takenTiles, villageTerritory } from './steward-land';
import { abandonStep } from './steward-abandon';
import { extraSteps } from './steward-extras';
import { HOUSE_TYPES_BEST_FIRST, dwellingYearReason, type HouseType } from '../buildings/log-house';
import { logHouseCovered, logHouseStep } from './steward-log-house';
import { needSteps } from './steward-needs';
import { stewardMarketStep } from './steward-market';
import {
  cellRuns,
  dwellingTiles,
  farmCells,
  planSettlement,
  playerClaimsPlan,
} from './steward-plan';
import { stewardOutlook, type StewardOutlook } from './steward-outlook';
import { isStewardOn, markStewardStarted } from './steward-state';
import { sowingYieldFactor } from '../disasters/weather-effects';
import type {
  BuildableDwellingType,
  Craft,
  CraftCoverage,
  FieldPart,
  FieldTask,
  StewardPlan,
  StewardSlotKind,
  VillageState,
} from '../types';

// Den správce (steward.md – Rozhodovací pořadí v den správce, kroky 3 a 4): pole včetně klučení
// lesa, obydlí nebo dílna – s režimem Nouze / Obnova / Růst a rozpočtem práce. Správce staví
// výhradně přes `applyBuildIntent` (stejná cena předem a kontrola místa jako u hráče) a zná jen
// dnešní stav vsi – seed počasí ani rozvrh pohrom nečte. Rozhoduje jen v den s indexem dělitelným
// `STEWARD.everyDays`, takže výsledek nezávisí na kouscích dopočtu.

const DAYS_PER_YEAR = 365;
const FIELD_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];
/** Důvody odmítnutí, za které nemůže místo – další slot by dopadl stejně. */
const NOT_THE_SLOT = new Set([CANNOT_AFFORD, NO_WOOD, HORSE_PEN_NO_SURPLUS]);

/** Režim správce (steward.md – Cíl „Růst se zásobou“, Režim správce). */
export type StewardMode = 'emergency' | 'recovery' | 'growth';

/** Podklady jednoho dne správce – sdílí je všechny kroky (S5 – ostatní stavby). */
export interface StewardContext {
  readonly day: number;
  readonly date: GameDate;
  readonly landscape: Landscape;
  readonly obstacles: ObstacleLayer;
  readonly coverage: CraftCoverage;
  readonly mode: StewardMode;
  /** Výhled vsi dne – osev podle práce, osiva a půdy a úzké hrdlo (`steward-outlook.ts`). */
  readonly outlook: StewardOutlook;
}

/** Výsledek pokusu o stavbu správce. */
export type StewardBuild = { ok: true } | { ok: false; reason: string };

/**
 * Měření (kouřový test, skripty): hodiny volajícího, součet a nejdelší den správce, odmítnuté
 * stavby (cena předem, místo) a zprávy chyb vstupu akce (`RangeError`). Ve hře hodiny chybí a nic
 * se neměří – výsledek na nich nezávisí.
 */
export const STEWARD_TIMING: {
  clock: (() => number) | null;
  ms: number;
  days: number;
  maxMs: number;
  rejected: number;
  rangeErrors: string[];
} = { clock: null, ms: 0, days: 0, maxMs: 0, rejected: 0, rangeErrors: [] };

/**
 * Den správce (mutuje stav): jen zapnutý správce, s krajinou i vrstvou překážek a v den správce.
 * Jedna etapa plánu sídla, pak pole a obydlí nebo dílna – každý krok nejvýš jednu stavbu.
 */
export function stewardDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (!landscape || !obstacles || !isStewardOn(state)) return;
  if (state.people.length === 0) return;
  // roční výprava na trh (steward-market.ts) jede každý rok, i když 15. 11. není den správce
  if (day % STEWARD.everyDays !== 0) {
    stewardMarketStep(state, { day, coverage: craftCoverage(state, day) });
    return;
  }
  const clock = STEWARD_TIMING.clock;
  const start = clock?.() ?? 0;
  decideDay(state, day, landscape, obstacles);
  if (clock) {
    const ms = clock() - start;
    STEWARD_TIMING.ms += ms;
    STEWARD_TIMING.days++;
    STEWARD_TIMING.maxMs = Math.max(STEWARD_TIMING.maxMs, ms);
  }
}

function decideDay(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): void {
  if (state.steward && !state.steward.replan && playerClaimsPlan(state, landscape)) {
    state.steward.replan = true;
  }
  // plán sídla stavby ani řemesla nemění – pokrytí řemesly platí před ním i po něm
  const coverage = craftCoverage(state, day);
  const planned = planSettlement(state, day, landscape, obstacles, coverage);
  if (planned !== state) state.steward = planned.steward;
  const ctx: StewardContext = {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage,
    mode: stewardMode(state, day, coverage),
    outlook: stewardOutlook(state, day, coverage),
  };
  // hlad dne pro příští den správce (Nouze, jen když hlad roste)
  if (state.steward) state.steward.lastHunger = state.starvationDays ?? 0;
  // krok 2a – nouze: lov, když zvěř škodí (steward-needs.ts)
  needSteps(state, ctx);
  fieldStep(state, ctx);
  // výměna špatných vlastních dílů pole za lepší místo plánu – jednou za rok v září
  // (steward-abandon.ts)
  abandonStep(state, ctx);
  // nadzemní dům před obydlím – rodina z pořadí, pro kterou srub čeká, polozemnici nedostane
  logHouseStep(state, ctx);
  dwellingStep(state, ctx);
  extraSteps(state, ctx);
}

// --- signály ---------------------------------------------------------------------------

/**
 * Režim správce (steward.md – Cíl, Režim správce): Nouze, když hlad od minulého dne správce roste
 * (`steward.lastHunger`) – ves dnes víc hladoví, než se zotavuje; Růst s plnou pojistkou zásob
 * (osivo, které na setí čeká, je stranou); ves, která hladoví, ale hlad neroste (ustálený na stropu
 * hájení, klesá), je v Obnově – v pasti osiva pomůže strava mimo pole a odchod syna, ne čekání.
 * Jinak Nouze, když by zásoby k příští sklizni nedaly ani `STEWARD.emergencyFill` pojistky, ani
 * kdyby ves snědla osivo – hrozí hlad nebo prázdné setí; jinak Obnova. Mladá ves bez pojistky,
 * která do žní vystačí, je v Obnově, ne v Nouzi.
 */
export function stewardMode(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): StewardMode {
  const hunger = state.starvationDays ?? 0;
  if (hunger > (state.steward?.lastHunger ?? 0)) return 'emergency';
  if (bufferFill(fieldStoresOutlook(state, day, coverage)) >= 1) return 'growth';
  if (hunger > 0) return 'recovery';
  const withSeed = bufferFill(fieldStoresOutlook(state, day, coverage, false));
  return withSeed < STEWARD.emergencyFill ? 'emergency' : 'recovery';
}

/** Rozpočet práce (steward.md – Cíl, Rozpočet práce). */
export interface LaborBudget {
  /** Průměrná volná (společná) práce posledních 30 dní – člověkodny za den. */
  freePerDay: number;
  /** Zbývající práce všech rozestavěných staveb – hráčových, vesničanů i správcových. */
  remaining: number;
  /** Kolik práce smí správce ještě začít (člověkodny; záporně = nic). */
  left: number;
}

/**
 * Rozpočet práce: zbývající práce rozestavěných staveb nejvýš průměrná volná práce posledních
 * 30 dní (`commonLaborHistory`) × `STEWARD.laborHorizonDays`. Stavby hráče se počítají taky.
 */
export function laborBudget(state: VillageState): LaborBudget {
  const history = state.commonLaborHistory;
  const freePerDay =
    history.length > 0 ? history.reduce((sum, v) => sum + v, 0) / history.length : 0;
  const remaining = state.constructions.reduce((sum, c) => sum + Math.max(0, c.cost - c.done), 0);
  return { freePerDay, remaining, left: freePerDay * STEWARD.laborHorizonDays - remaining };
}

/**
 * Cíl polí v lidech „Pole uživí“ při dnešní stravě: kolik lidí uživí pole, která ves oseje
 * (`need`), a kolik uživí dnešní pole (`have`, i se zakládanými díly).
 */
export interface FieldTarget {
  need: number;
  have: number;
}

/**
 * Cíl polí (steward.md – Cíl polí; Martin 18. 11. 2026: „Cílem vesnice je prostě produkovat
 * maximum všeho.“): maximum, které ves obdělá – lidé, které uživí osev, který ves stihne osít
 * i sklidit a na který má osivo (`stewardOutlook` – `workableHa`, `seedHa`; Model kapacity vsi,
 * D99 kolo 1) × `STEWARD.fieldReserve`, bez ohledu na stravu: maso,
 * mléko ani ovoce cíl nezmenší, přebytek obilí jde do zásob a na dávky. Pole nad to by ves
 * neosela, jen by zarůstala. Proti „Pole uživí podle dnešní půdy“ (`fieldCapacity` – už × podíl
 * dnešní půdy `soil`); obojí v lidech při dnešní stravě, takže strava se v poměru i v blocích polí
 * (`peoplePerHa`) zkrátí. Zakládané díly se počítají, jako by už byly v oběhu – jinak by správce
 * zakládal pole, dokud se první nedostaví. Ves bez pole v oběhu (`landHa` 0) nebo s osevem bez
 * meze maximum nezná – opatrný cíl z potřeby (`cautiousFieldNeed`).
 */
export function fieldTarget(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  outlook: StewardOutlook = stewardOutlook(state, day, coverage),
): FieldTarget {
  if (state.people.length === 0) return { need: 0, have: 0 };
  const parts = state.parts.map((p) =>
    p.state === 'founding' ? { ...p, state: 'fallow' as const } : p,
  );
  const capacity = fieldCapacity(
    { parts, people: state.people, fieldFood: state.fieldFood },
    day,
    coverage.pottery,
  );
  const have = capacity?.people ?? 0;
  const sowable = Math.min(outlook.workableHa, outlook.seedHa);
  if (outlook.landHa > 0 && Number.isFinite(sowable)) {
    return {
      need: ((outlook.landPeople * sowable) / outlook.landHa) * STEWARD.fieldReserve,
      have,
    };
  }
  return { need: cautiousFieldNeed(state, day, coverage, outlook), have };
}

/**
 * Opatrný cíl polí (steward.md – Cíl polí, Ves bez pole; návrh Clauda 18. 11. 2026), když výhled
 * maximum osevu neurčí – ves bez pole v oběhu nebo osev bez meze: dřívější výpočet z potřeby
 * s plnou potřebou z pole (podíl 1 – strava cíl nezmenší): lidé za `STEWARD.fieldLeadYears` podle
 * výhledu potřeby (`expectedYearlyFoodNeed`) × `STEWARD.fieldReserve` ÷ očekávaná úroda let
 * s počasím (`sowingYieldFactor`) a doplnění chybějící pojistky zásob za
 * `FIELD_STORES.balanceYears`, když je úzkým hrdlem půda. Úroda, kterou to chce, se převede na lidi
 * „Pole uživí“ při dnešní stravě (`harvestPerPersonKg`) – v jednotkách `have` a `peoplePerHa`;
 * ves jen s obilím má týž cíl jako dřív.
 */
function cautiousFieldNeed(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  outlook: StewardOutlook,
): number {
  const people = state.people.length;
  const today = expectedYearlyFoodNeed(state, day, day, day);
  const fed = harvestPerPersonKg(state, day, coverage.pottery);
  if (today <= 0 || fed <= 0) return 0;
  const ahead = day + Math.round(STEWARD.fieldLeadYears * DAYS_PER_YEAR);
  const later = expectedYearlyFoodNeed(state, day, ahead, ahead);
  const grown = ((people * later) / today) * STEWARD.fieldReserve;
  // úroda na člověka s celou potřebou z pole a s udržením pojistky (jako „Pole uživí“ s podílem 1)
  const foodNeed = yearlyFoodNeed(state, day) / people;
  const full = steadyHarvestKg(foodNeed, bufferKg(foodNeed), coverage.pottery);
  const targets = fieldStoresOutlook(state, day, coverage);
  const missingKg = Math.max(0, targets.bufferKg - targets.leftKg);
  const refillKg = outlook.bottleneck === 'land' ? missingKg / FIELD_STORES.balanceYears : 0;
  return ((grown / sowingYieldFactor(state)) * full + refillKg) / fed;
}

/** Kolik lidí uživí hektar pole přirozené úrodnosti `fertility` v ustáleném oběhu. */
function peoplePerHa(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  fertility: number,
): number {
  const part: FieldPart = {
    id: -1,
    fieldId: -1,
    areaM2: 10_000,
    distanceM: 0,
    naturalFertility: fertility,
    fertilityShare: averageRotationShare(),
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
  const capacity = fieldCapacity(
    { parts: [part], people: state.people, fieldFood: state.fieldFood },
    day,
    coverage.pottery,
  );
  return capacity?.people ?? 0;
}

// --- okna roku -------------------------------------------------------------------------

function monthDayKey(d: StewardMonthDay): number {
  return d.month * 100 + d.day;
}

/** Den `date` leží v některém z oken (včetně krajních dnů; okno přes Nový rok). */
export function inStewardWindows(date: GameDate, windows: readonly StewardWindow[]): boolean {
  const key = date.month * 100 + date.day;
  return windows.some(([from, to]) => {
    const a = monthDayKey(from);
    const b = monthDayKey(to);
    return a <= b ? key >= a && key <= b : key >= a || key <= b;
  });
}

/** Dní od `day` do nejbližšího z dat roku `ends` (dnes = 0). */
function daysUntil(day: number, date: GameDate, ends: readonly StewardMonthDay[]): number {
  let best = Infinity;
  for (const end of ends) {
    for (const year of [date.year, date.year + 1]) {
      const at = dayIndexOf({ year, month: end.month, day: end.day }) - day;
      if (at >= 0 && at < best) best = at;
    }
  }
  return best;
}

// --- stavba ----------------------------------------------------------------------------

/**
 * Ves, jak ji vidí akce v den správce: dopočítaná do dne `day`. Uprostřed dopočtu drží `lastDay`
 * ještě den jeho začátku a cena předem (`buildAffordability` – osadníci podle věku) by jinak
 * závisela na kouscích dopočtu.
 */
function asOf(state: VillageState, day: number): VillageState {
  return state.lastDay === day ? state : { ...state, lastDay: day };
}

/**
 * Nahradí obsah stavu `target` stavem `source` (simulace mutuje tentýž objekt): klíče, které akce
 * odebrala, smaže, ostatní přepíše – stav má pak přesně klíče výsledku akce.
 */
function replaceState(target: VillageState, source: VillageState): void {
  for (const key of Object.keys(target)) if (!(key in source)) Reflect.deleteProperty(target, key);
  Object.assign(target, source);
}

/**
 * Stavba správce (mutuje stav): `applyBuildIntent` v den správce – stejná cena předem a kontrola
 * místa jako u hráče – na vsi dopočítané do dne správce (`asOf`) – a značka `markStewardStarted` na
 * každé nové stavbě. Vyšlapanost cest se
 * napřed zapíše do stavu (`flushWear`) – akce stav klonuje a pracovní políčka by se ztratila; je to
 * totéž, co konec dopočtu po kouscích.
 */
export function startStewardBuild(
  state: VillageState,
  ctx: Pick<StewardContext, 'day' | 'landscape' | 'obstacles'>,
  intent: BuildIntent,
): StewardBuild {
  if (state.roads?.wear) flushWear(state.roads.wear);
  const before = state.nextId;
  const lastDay = state.lastDay;
  let result;
  try {
    result = applyBuildIntent(
      asOf(state, ctx.day),
      ctx.day,
      ctx.landscape,
      ctx.obstacles,
      intent,
      'steward',
    );
  } catch (error) {
    // kontrola vstupu akce (díl pole dál než 800 m, …) – místo neprošlo jako u hráče; v měření se
    // počítá, aby chyba ve správci (špatné souřadnice) nezůstala skrytá
    if (!(error instanceof RangeError)) throw error;
    if (STEWARD_TIMING.clock) STEWARD_TIMING.rangeErrors.push(error.message);
    return { ok: false, reason: error.message };
  }
  if (!result.ok) {
    if (STEWARD_TIMING.clock) STEWARD_TIMING.rejected++;
    return result;
  }
  replaceState(state, result.state);
  state.lastDay = lastDay;
  for (const c of state.constructions) if (c.id >= before) markStewardStarted(state, c.id);
  return { ok: true };
}

export function tileCell(landscape: Landscape, tile: number): { x: number; y: number } {
  return { x: tile % landscape.size, y: Math.floor(tile / landscape.size) };
}

/** Políčko je pod vetem hráče pro tento druh stavby. */
function vetoed(state: VillageState, ctx: StewardContext, kind: string, tile: number): boolean {
  const cell = tileCell(ctx.landscape, tile);
  return (state.steward?.vetoes ?? []).some(
    (v) => v.kind === kind && v.untilDay >= ctx.day && v.cell.x === cell.x && v.cell.y === cell.y,
  );
}

/** Sloty druhu, které smí správce dnes brát (u domů v rozpracovaných kontrolách jen ověřené). */
function usableSlots(plan: StewardPlan, kind: StewardSlotKind): number[] {
  const slots = plan.slots[kind] ?? [];
  if (kind === 'dwelling' && plan.stage === 'checks') return slots.slice(0, plan.checked ?? 0);
  return [...slots];
}

/**
 * Sloty plánu druhu `kind` po pořadí (steward.md – Výběr místa pro jednu stavbu): nejvýš
 * `STEWARD.slotTries` pokusů, neúspěšný slot hotového plánu se zahodí; zabrané a vetované sloty
 * se přeskočí. Když v hotovém plánu volný slot nezbude, plán se označí `exhausted` (příští den
 * správce se přepočítá). Odmítnutí, za která místo nemůže (cena předem, osadníci, dřevo), pokusy
 * ukončí. Slot, který `accepts` nevezme (hodí se jen jiné stavbě téhož slotu), se přeskočí, ale
 * nezahodí – počítá se do pokusů. Vrací, zda stavba začala; `tried` = zda byl aspoň jeden slot
 * k mání.
 *
 * `intentOf` smí vrátit víc variant stavby od nejlepší (dílna: roubená → vypletená → dnešní; na
 * každém slotu ve stejném pořadí): na slotu se zkoušejí po řadě a slot se zahodí, jen když na něm
 * neprošla žádná a poslední – nejskromnější, tu ověřuje plán sídla – kvůli místu. Varianta
 * odmítnutá z důvodu, za který místo nemůže, se na dalších slotech už nezkouší; když takhle
 * vypadnou všechny, pokusy končí.
 */
export function trySlots(
  state: VillageState,
  ctx: StewardContext,
  kind: StewardSlotKind,
  intentOf: (tile: number) => BuildIntent | BuildIntent[],
  accepts?: (tile: number) => boolean,
): { started: boolean; tried: boolean } {
  const plan = state.steward?.plan;
  if (!plan) return { started: false, tried: false };
  const taken = takenTiles(state, ctx.day, ctx.landscape);
  const free = usableSlots(plan, kind).filter((t) => !taken[t] && !vetoed(state, ctx, kind, t));
  if (free.length === 0) {
    if (plan.stage === 'done') plan.exhausted = true;
    return { started: false, tried: false };
  }
  const failed: number[] = [];
  // varianty (pořadí), za jejichž odmítnutí místo nemůže – další slot by dopadl stejně
  const notTheSlot = new Set<number>();
  let tries = 0;
  for (const tile of free) {
    if (tries++ >= STEWARD.slotTries) break;
    // slot, který se hodí jinému druhu stavby téhož slotu (ohrada jiného zvířete), zůstane v plánu
    if (accepts && !accepts(tile)) continue;
    const variants = [intentOf(tile)].flat();
    let placeFailed = false;
    for (const [k, intent] of variants.entries()) {
      if (notTheSlot.has(k)) continue;
      const built = startStewardBuild(state, ctx, intent);
      if (built.ok) {
        dropSlots(state, kind, failed);
        return { started: true, tried: true };
      }
      if (NOT_THE_SLOT.has(built.reason)) notTheSlot.add(k);
      else placeFailed = k === variants.length - 1;
    }
    if (placeFailed) failed.push(tile);
    if (notTheSlot.size === variants.length) break;
  }
  dropSlots(state, kind, failed);
  return { started: false, tried: true };
}

/** Zahodí neúspěšné sloty – jen v hotovém plánu (rozpracované etapy drží pořadí slotů). */
function dropSlots(state: VillageState, kind: StewardSlotKind, failed: readonly number[]): void {
  const plan = state.steward?.plan;
  if (!plan || plan.stage !== 'done' || failed.length === 0) return;
  const drop = new Set(failed);
  plan.slots[kind] = (plan.slots[kind] ?? []).filter((t) => !drop.has(t));
}

// --- 3. pole ---------------------------------------------------------------------------

/** Blok čtverců pro nové pole: políčka krajiny, cena založení a zda jde o klučení lesa. */
export interface FieldBlock {
  farm: number;
  cells: number[];
  foundMd: number;
  forest: boolean;
}

/**
 * Souvislý výběr políček z `ordered` (pořadí = přednost) v co nejčtvercovějším bloku (oxen.md –
 * Orba rádlem křížem; návrh Clauda: správce zakládá pole spíš čtvercová, ne v pásech): napřed
 * první, pak vždy políčko, které sousedí stranou s vybranými a nejméně prodlouží delší stranu
 * obalu bloku (při shodě to, které obal nejméně zvětší, pak dřívější v pořadí) – dokud není
 * `want` políček nebo by založení přesáhlo `budget`. Každý začátek výběru je souvislý.
 */
export function connectedPick(
  ordered: readonly number[],
  size: number,
  want: number,
  budget: number,
  found: Float32Array,
): { cells: number[]; foundMd: number } {
  const chosen = new Set<number>();
  const cells: number[] = [];
  const pending = [...ordered];
  let foundMd = 0;
  // obal vybraných políček – sloupce x0–x1, řádky y0–y1
  let x0 = 0;
  let x1 = 0;
  let y0 = 0;
  let y1 = 0;
  const touches = (t: number): boolean =>
    (t % size > 0 && chosen.has(t - 1)) ||
    (t % size < size - 1 && chosen.has(t + 1)) ||
    chosen.has(t - size) ||
    chosen.has(t + size);
  while (cells.length < want && pending.length > 0) {
    let best = cells.length === 0 ? 0 : -1;
    let bestSide = Infinity;
    let bestArea = Infinity;
    for (let k = 0; k < pending.length && cells.length > 0; k++) {
      const t = pending[k]!;
      if (!touches(t)) continue;
      const x = t % size;
      const y = Math.floor(t / size);
      const w = Math.max(x1, x) - Math.min(x0, x) + 1;
      const h = Math.max(y1, y) - Math.min(y0, y) + 1;
      const side = Math.max(w, h);
      if (side > bestSide || (side === bestSide && w * h >= bestArea)) continue;
      best = k;
      bestSide = side;
      bestArea = w * h;
    }
    if (best < 0) break;
    const t = pending[best]!;
    const cost = found[t]!;
    if (foundMd + cost > budget) break;
    const x = t % size;
    const y = Math.floor(t / size);
    if (cells.length === 0) {
      x0 = x1 = x;
      y0 = y1 = y;
    } else {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    chosen.add(t);
    cells.push(t);
    foundMd += cost;
    pending.splice(best, 1);
  }
  return { cells, foundMd };
}

/** Nejmenší počet čtverců pole (`FIELD_LIMITS.minAreaM2`). */
export function minFieldCells(landscape: Landscape): number {
  return Math.ceil(FIELD_LIMITS.minAreaM2 / (landscape.cellSizeM * landscape.cellSizeM));
}

/**
 * Pořadí hospodářství pro nové pole (steward.md – Pole blízko a podle práce): napřed ta se stojícím
 * domem (v pořadí plánu), pak ostatní – jejich volná políčka od nejbližšího ke stojícím domům
 * vsi a hospodářství podle nejbližšího z nich (při shodě v pořadí plánu). Ves bez stojícího domu:
 * pořadí plánu, políčka od domu hospodářství. Políčka, která neprojdou `accept`, vypadnou.
 */
function farmsByHomes(
  state: VillageState,
  plan: StewardPlan,
  landscape: Landscape,
  accept: (tile: number) => boolean,
): { farm: number; cells: number[] }[] {
  const size = landscape.size;
  const homes = dwellingTiles(state, landscape);
  const homeSet = new Set(homes);
  const ids = new Set(state.dwellings.map((d) => d.id));
  const standing: { farm: number; cells: number[] }[] = [];
  const others: { farm: number; cells: number[]; key: number }[] = [];
  const homeDist2 = (t: number): number => {
    let best = Infinity;
    for (const h of homes) {
      const dx = (t % size) - (h % size);
      const dy = Math.floor(t / size) - Math.floor(h / size);
      best = Math.min(best, dx * dx + dy * dy);
    }
    return best;
  };
  plan.farms.forEach((f, farm) => {
    const cells = farmCells(f, size).filter(accept);
    const housed =
      homes.length === 0 ||
      homeSet.has(f.house) ||
      (f.dwellingId !== undefined && ids.has(f.dwellingId));
    if (housed) {
      standing.push({ farm, cells });
      return;
    }
    const keyed = cells.map((t) => [homeDist2(t), t] as const);
    keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    others.push({ farm, cells: keyed.map((e) => e[1]), key: keyed[0]?.[0] ?? Infinity });
  });
  others.sort((a, b) => a.key - b.key || a.farm - b.farm);
  return [...standing, ...others.map(({ farm, cells }) => ({ farm, cells }))];
}

/**
 * Další blok pole z plánu (steward.md – Pole; Klučení lesa; Pole blízko a podle práce): v oknech
 * louky (1. 9. – 28. 2., 15. 6. – 31. 7.) volná políčka bloku prvního hospodářství (napřed se
 * stojícím domem, pak políčka nejblíž stojícím domům – `farmsByHomes`), které jich má dost; když
 * louka v plánu nestačí, v okně lesa (1. 10. – 31. 1.) les na území vsi do
 * `STEWARD.forestSearchTiles` od bloku. Počet čtverců podle chybějících lidí (`short` – číslo)
 * a úrodnosti, nebo rovnou `{ cells }` (výměna dílů – steward-abandon.ts); aspoň nejmenší pole,
 * nejvýš co unese `budget`.
 */
export function nextFieldBlock(
  state: VillageState,
  ctx: StewardContext,
  short: number | { cells: number },
  budget: number,
  skip: ReadonlySet<number> = new Set(),
): FieldBlock | null {
  const plan = state.steward?.plan;
  const wanted = typeof short === 'number' ? short : short.cells;
  if (!plan || wanted <= 0 || budget <= 0) return null;
  const { landscape, obstacles } = ctx;
  const size = landscape.size;
  const cells = fieldCells(landscape, obstacles);
  const taken = takenTiles(state, ctx.day, landscape);
  const min = minFieldCells(landscape);
  const ha = (landscape.cellSizeM * landscape.cellSizeM) / 10_000;
  const wantOf = (ordered: readonly number[]): number => {
    if (typeof short !== 'number') return Math.max(min, short.cells);
    const head = ordered.slice(0, 20);
    const fertility = head.reduce((s, t) => s + landscape.fertility[t]!, 0) / head.length;
    const perHa = peoplePerHa(state, ctx.day, ctx.coverage, fertility);
    return perHa > 0 ? Math.max(min, Math.ceil(short / perHa / ha)) : min;
  };
  const pick = (farm: number, ordered: number[], forest: boolean): FieldBlock | null => {
    if (ordered.length < min) return null;
    const chosen = connectedPick(ordered, size, wantOf(ordered), budget, cells.found);
    return chosen.cells.length >= min ? { farm, ...chosen, forest } : null;
  };
  const usable = (t: number): boolean =>
    !taken[t] && !skip.has(t) && cells.kg[t]! > 0 && !vetoed(state, ctx, 'field', t);
  if (inStewardWindows(ctx.date, STEWARD.meadowFieldWindows)) {
    const meadow = (t: number): boolean =>
      usable(t) && landscape.surface[t] !== SURFACE_CODES.forest;
    for (const { farm, cells: free } of farmsByHomes(state, plan, landscape, meadow)) {
      const block = pick(farm, free, false);
      if (block) return block;
    }
  }
  if (!inStewardWindows(ctx.date, STEWARD.forestFieldWindows)) return null;
  const territory = villageTerritory(state, landscape);
  for (const { farm, cells: block } of farmsByHomes(state, plan, landscape, () => true)) {
    const forest = forestNear(block, size, landscape, (t) => {
      return territory[t] === 1 && landscape.surface[t] === SURFACE_CODES.forest && usable(t);
    });
    const found = pick(farm, forest, true);
    if (found) return found;
  }
  return null;
}

/**
 * Les u bloku: políčka do `STEWARD.forestSearchTiles` kroků od políček bloku (po souši), která
 * projdou `accept` – v pořadí vzdálenosti, při shodě podle indexu.
 */
function forestNear(
  block: readonly number[],
  size: number,
  landscape: Landscape,
  accept: (tile: number) => boolean,
): number[] {
  const seen = new Set<number>(block);
  let frontier = [...block];
  const out: number[] = [];
  for (let step = 0; step < STEWARD.forestSearchTiles && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const t of frontier) {
      const x = t % size;
      const around = [x > 0 ? t - 1 : -1, x < size - 1 ? t + 1 : -1, t - size, t + size];
      for (const n of around) {
        if (n < 0 || n >= size * size || seen.has(n)) continue;
        seen.add(n);
        if (landscape.surface[n] === SURFACE_CODES.water) continue;
        next.push(n);
      }
    }
    next.sort((a, b) => a - b);
    for (const n of next) if (accept(n)) out.push(n);
    frontier = next;
  }
  return out;
}

/**
 * Krok 3 – pole: pod cílem polí další blok z plánu – v každém režimu (i v Nouzi); rozpočet práce
 * bere jen volnou práci, polím v oběhu ji nevezme.
 */
function fieldStep(state: VillageState, ctx: StewardContext): void {
  // v Nouzi jen pole, která ves oseje – když brzdí práce nebo osivo, další pole nepomůžou
  if (ctx.mode === 'emergency' && ctx.outlook.bottleneck !== 'land') return;
  const target = fieldTarget(state, ctx.day, ctx.coverage, ctx.outlook);
  if (target.have >= target.need) return;
  const short = target.need - target.have;
  const started = startFieldBlock(state, ctx, (skip) =>
    nextFieldBlock(state, ctx, short, laborBudget(state).left, skip),
  );
  if (started === 'none') markFieldsExhausted(state, ctx);
}

/** Výsledek `startFieldBlock`: pole začalo, blok chybí (`none`), nebo pokusy skončily. */
export type FieldBlockStart = 'started' | 'none' | 'failed';

/**
 * Založí pole z bloku plánu (mutuje stav – záměr stavby pole jako hráč, `startStewardBuild`):
 * nejvýš `STEWARD.slotTries` pokusů; blok, který neprošel kontrolou místa, ztratí z plánu první
 * políčko (`skip` – les v plánu není, jen pro dnešek) a `blockOf` vybere další. Odmítnutí, za
 * která místo nemůže (cena předem, dřevo), pokusy ukončí.
 */
export function startFieldBlock(
  state: VillageState,
  ctx: StewardContext,
  blockOf: (skip: ReadonlySet<number>) => FieldBlock | null,
): FieldBlockStart {
  const skip = new Set<number>();
  for (let attempt = 0; attempt < STEWARD.slotTries; attempt++) {
    const block = blockOf(skip);
    if (!block) return 'none';
    const built = startStewardBuild(state, ctx, {
      kind: 'field',
      cells: block.cells.map((t) => tileCell(ctx.landscape, t)),
    });
    if (built.ok) return 'started';
    if (NOT_THE_SLOT.has(built.reason)) return 'failed';
    const first = block.cells[0]!;
    skip.add(first);
    dropFarmCell(state, block.farm, first, ctx.landscape.size);
  }
  return 'failed';
}

/** Zahodí políčko z bloku hospodářství (hotový plán). */
function dropFarmCell(state: VillageState, farm: number, tile: number, size: number): void {
  const plan = state.steward?.plan;
  const f = plan?.farms[farm];
  if (!plan || plan.stage !== 'done' || !f) return;
  f.runs = cellRuns(farmCells(f, size).filter((t) => t !== tile));
}

/**
 * Pole chybí a žádné hospodářství hotového plánu nemá volnou louku aspoň na nejmenší pole – plán
 * je vyčerpaný (příští den správce přepočet). Blok, který chybí jen kvůli oknu roku nebo
 * rozpočtu, plán nevyčerpá.
 */
function markFieldsExhausted(state: VillageState, ctx: StewardContext): void {
  const plan = state.steward?.plan;
  if (!plan || plan.stage !== 'done') return;
  const { landscape } = ctx;
  const cells = fieldCells(landscape, ctx.obstacles);
  const taken = takenTiles(state, ctx.day, landscape);
  const min = minFieldCells(landscape);
  const left = plan.farms.some(
    (f) =>
      farmCells(f, landscape.size).filter(
        (t) => !taken[t] && cells.kg[t]! > 0 && landscape.surface[t] !== SURFACE_CODES.forest,
      ).length >= min,
  );
  if (!left) plan.exhausted = true;
}

// --- 4. obydlí nebo dílna --------------------------------------------------------------

/**
 * Typ obydlí (steward.md – Obydlí, typ): polozemnice, když na ni ves má suroviny a dřevo předem
 * a rozpočet práce ji dostaví do zimy (`STEWARD.winterStart`); jinak zemnice – rodina nečeká
 * na dům přes zimu.
 */
export function chooseDwellingType(
  state: VillageState,
  ctx: StewardContext,
): BuildableDwellingType {
  const cost = DWELLINGS.polozemnice.cost;
  const budget = laborBudget(state);
  if (budget.left < cost || budget.freePerDay <= 0) return 'zemnice';
  if (!buildAffordability(asOf(state, ctx.day), 'polozemnice', ctx.obstacles).affordable) {
    return 'zemnice';
  }
  const days = (budget.remaining + cost) / budget.freePerDay;
  return days <= daysUntil(ctx.day, ctx.date, [STEWARD.winterStart]) ? 'polozemnice' : 'zemnice';
}

/** Práce polí za rok (člověkodny na ha osevu) při pokrytí nástroji `tools`. */
function fieldWorkPerSownHa(tools: number): number {
  return FIELD_TASKS.reduce((sum, t) => sum + fieldWorkPerHa(t, tools), 0);
}

function hasCraft(state: VillageState, craft: Craft): boolean {
  return (
    state.dwellings.some((d) => d.workshop?.craft === craft) ||
    state.constructions.some((c) => c.craft === craft)
  );
}

/**
 * Hodnota dílny (člověkodny za rok, steward.md – Dílna místo obydlí): práce, kterou pokrytí výrobky
 * vsi ušetří (od dnešního pokrytí k plnému – meze produktivity), mínus polní práce čekající
 * domácnosti, která vsi chybí. Hrnčíř – menší ztráty zásob (`STORAGE_LOSS_PER_YEAR`) převedené
 * na práci výnosem polní práce; kovář – práce polí s plným pokrytím nástroji, jen když ves má
 * uhlíře; uhlíř – kovářovo ušetření mínus práce dvou domácností, ke kováři bez uhlí (stojí) jedné; tesař až
 * s voly a vozy (zatím 0). Řemeslo, které ves má, 0.
 */
export function workshopValue(
  state: VillageState,
  day: number,
  craft: Craft,
  coverage: CraftCoverage,
): number {
  if (hasCraft(state, craft)) return 0;
  const capacity = fieldCapacity(state, day, coverage.pottery);
  if (!capacity || capacity.sownHa <= 0) return 0;
  const workPerHa = fieldWorkPerSownHa(coverage.tools);
  const fieldWork = capacity.sownHa * workPerHa;
  // polní práce průměrné domácnosti – tolik vsi chybí, když rodina dělá řemeslo
  const familyLoss = fieldWork / Math.max(1, state.dwellings.length);
  const smithSaved = capacity.sownHa * (workPerHa - fieldWorkPerSownHa(1));
  switch (craft) {
    case 'potter': {
      const harvestKg = capacity.sownHa * netYieldPerHa(capacity.fertility);
      const kgPerManDay = workPerHa > 0 ? netYieldPerHa(capacity.fertility) / workPerHa : 0;
      if (kgPerManDay <= 0) return 0;
      const lossGap = STORAGE_LOSS_PER_YEAR.worst - STORAGE_LOSS_PER_YEAR.best;
      return ((1 - coverage.pottery) * lossGap * harvestKg) / kgPerManDay - familyLoss;
    }
    case 'smith':
      return hasCraft(state, 'burner') ? smithSaved - familyLoss : 0;
    case 'burner':
      // ves už kováře má (bez uhlí stojí): uhlíř nese práci jedné domácnosti, ne dvou
      return smithSaved - (hasCraft(state, 'smith') ? 1 : 2) * familyLoss;
    case 'carpenter':
      return 0;
  }
}

/**
 * Krok 4 – obydlí nebo dílna pro čekající rodinu (dílna jen v režimu Růst). Rodiny z pořadí,
 * které dostanou nadzemní dům (`logHouseCovered`), se nepočítají – nestaví se pro ně ještě
 * polozemnice (log-house.md – Správce, návrh Clauda).
 */
function dwellingStep(state: VillageState, ctx: StewardContext): void {
  if (waitingHouseholds(state, ctx.day) - logHouseCovered(state, ctx.day) <= 0) return;
  if (ctx.mode === 'growth' && workshopStep(state, ctx)) return;
  startDwelling(state, ctx, chooseDwellingType(state, ctx));
}

/**
 * Začne obydlí `type` na slotu plánu a když žádný nevyšel, u dvorce (nová ves bez ověřených domů
 * plánu – steward.md – Výpočetní rozpočet; vetovaná políčka ani tady ne – Soužití s hráčem).
 * Vrací, zda stavba začala.
 */
export function startDwelling(
  state: VillageState,
  ctx: StewardContext,
  type: BuildableDwellingType,
): boolean {
  const intentOf = (tile: number): BuildIntent => {
    const cell = tileCell(ctx.landscape, tile);
    const c = tileCenterWorld(ctx.landscape, cell.x, cell.y);
    return {
      kind: 'dwelling',
      type,
      position: { x: c.x, z: c.z, rotation: 0 },
      ...(PLOT_TYPES[type] ? { plot: { cell, variant: 'center' as const } } : {}),
    };
  };
  const slots = trySlots(state, ctx, 'dwelling', intentOf);
  if (slots.started) return true;
  if (slots.tried) return false;
  const tiles = centreHouseTiles(state, ctx).filter((t) => !vetoed(state, ctx, 'dwelling', t));
  for (const tile of tiles.slice(0, STEWARD.slotTries)) {
    const built = startStewardBuild(state, ctx, intentOf(tile));
    if (built.ok) return true;
    if (NOT_THE_SLOT.has(built.reason)) return false;
  }
  return false;
}

/** Dílna místo obydlí: řemeslo s nejvyšší kladnou hodnotou na slotu dílny plánu. */
function workshopStep(state: VillageState, ctx: StewardContext): boolean {
  let best: Craft | null = null;
  let bestValue = 0;
  for (const craft of ['potter', 'burner', 'smith', 'carpenter'] as const) {
    const value = workshopValue(state, ctx.day, craft, ctx.coverage);
    if (value > bestValue) {
      best = craft;
      bestValue = value;
    }
  }
  return best ? startBestWorkshop(state, ctx, best) : false;
}

/**
 * Začne dílnu řemesla `craft` na slotu plánu: workshops.md – Správce (návrh Clauda): na každém
 * slotu nejlepší typ, který už jde (od 800 roubená, od 750 vypletená), a nakonec dnešní dílna;
 * postaví první, na kterou má cenu předem a místo. Slot zahodí, jen když se na něj nevejde ani
 * dnešní dílna (`trySlots` – varianty) – plán sloty ověřuje jen pro ni.
 */
export function startBestWorkshop(state: VillageState, ctx: StewardContext, craft: Craft): boolean {
  const types: (HouseType | undefined)[] = [
    ...HOUSE_TYPES_BEST_FIRST.filter((t) => dwellingYearReason(t, ctx.day) === null),
    undefined,
  ];
  return trySlots(state, ctx, 'workshop', (tile) => {
    const cell = tileCell(ctx.landscape, tile);
    const c = tileCenterWorld(ctx.landscape, cell.x, cell.y);
    return types.map((type): BuildIntent => ({
      kind: 'workshop',
      craft,
      position: { x: c.x, z: c.z, rotation: 0 },
      ...(type ? { type } : {}),
    }));
  }).started;
}

/**
 * Obydlí u dvorce: louka do `STEWARD.centreHouseTiles` od středu vsi, nezabraná a aspoň dvě
 * políčka od ostatních obydlí – nejbližší napřed, při shodě podle indexu.
 */
function centreHouseTiles(state: VillageState, ctx: StewardContext): number[] {
  const centre = planCentre(state);
  if (!centre) return [];
  const { landscape } = ctx;
  const size = landscape.size;
  const taken = takenTiles(state, ctx.day, landscape);
  const houses = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.kind === 'dwelling' && c.position ? [c.position] : [],
    ),
  ];
  const spacing = 2 * landscape.cellSizeM;
  const half = (size * landscape.cellSizeM) / 2;
  const cx = Math.floor((centre.x + half) / landscape.cellSizeM);
  const cy = Math.floor((centre.z + half) / landscape.cellSizeM);
  const r = STEWARD.centreHouseTiles;
  const out: { tile: number; d: number }[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(size - 1, cx + r); x++) {
      const tile = y * size + x;
      if (taken[tile] || landscape.surface[tile] !== SURFACE_CODES.meadow) continue;
      const c = tileCenterWorld(landscape, x, y);
      const near = houses.some(
        (h) => (h.x - c.x) * (h.x - c.x) + (h.z - c.z) * (h.z - c.z) < spacing * spacing,
      );
      if (!near) out.push({ tile, d: (x - cx) * (x - cx) + (y - cy) * (y - cy) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.tile - b.tile);
  return out.map((o) => o.tile);
}
