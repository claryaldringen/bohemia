// Měření správce vsi (steward.md – Ověření kvality): jádro skriptu measure-steward.ts – skupiny
// krajin z vlastností, běh rodu (ves + vsi synů v paměti) se správcem (B) nebo se skriptovaným
// hráčem (A), souhrn a tabulka kritérií. Bez I/O a bez worker vláken, ať jde testovat.
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  measureLandscape,
  obstaclesOf,
  type Landscape,
  type ObstacleLayer,
} from '../../src/domain/landscape';
import type { ChronicleEvent } from '../../src/domain/village';
import { dateOfDayIndex, dayIndexOf } from '../../src/domain/calendar';
import {
  STEWARD_TIMING,
  advanceVillage,
  bufferFill,
  craftCoverage,
  failStewardDeparture,
  fieldTarget,
  foundField,
  foundVillage,
  foundedState,
  freeVillageSite,
  newSteward,
  pendingStewardDepartures,
  settleStewardDeparture,
  startNewDwelling,
  waitingHouseholds,
  type FieldPart,
  type VillageState,
} from '../../src/domain/village';
import { ROTATION, ROTATION_FACTOR } from '../../src/domain/village/field-capacity';
import {
  FERTILITY,
  FIELD_WORK_PER_HA,
  FOUNDING_COST_PER_HA,
  RECLAIM_COST_PER_HA,
} from '../../src/domain/village/rules-fields';
import { fieldStoresOutlook } from '../../src/domain/village/simulate-plan';
import { realLand, type CalibrationLand } from './calibration-land';
import { steadyState } from './steady-state';

export type Strategy = 'player' | 'steward';
export const SNAPSHOT_YEARS: readonly number[] = [5, 10, 25, 50];
const DAYS_PER_YEAR = 365.25;
const CHUNK_DAYS = 10;
const START_PARTS = 75;
const PLAYER_PARTS_PER_YEAR = 8;
/** Čtverců pole na chybějícího člověka (75 čtverců první pole ≈ 6 lidí). */
const PARTS_PER_PERSON = 12;
/** Nejvýš tolik vsí rodu (matka + synové) – hlídá dobu běhu. */
const MAX_COLONIES = 12;
/** Odchod s nejvýš tolika lidmi je ves, která sama nepřežije (plán úloh správce, 1. 11. 2026). */
const TINY_VILLAGE = 2;
/** Polní práce plánu (fields.md – Práce) – jmenovatel podílu založení a vracení přílohu. */
const FIELD_LABOR = new Set([
  'reclaim',
  'dig',
  'sow',
  'weed',
  'harvest',
  'carry',
  'thresh',
  'plough',
]);
/** Práce navíc kvůli ploše polí: zakládání dílů a vracení zarostlého přílohu. */
const FIELD_OVERHEAD = new Set(['found-field', 'reclaim']);
const OUTLINE: [number, number][] = [
  [0, 0],
  [15, 0],
  [15, 15],
];

// --- skupiny krajin ---------------------------------------------------------------------

export interface LandscapeGroup {
  name: string;
  seeds: number[];
}

interface GroupSpec {
  name: string;
  score: (l: Landscape) => number;
}

const GROUPS: readonly GroupSpec[] = [
  { name: 'lesnatá', score: (l) => measureLandscape(l).forestShare },
  { name: 'otevřená', score: (l) => -measureLandscape(l).forestShare },
  { name: 'úrodná', score: (l) => measureLandscape(l).nearGoodMeadowCells },
  { name: 'členitá', score: (l) => measureLandscape(l).reliefM },
  { name: 'potok', score: (l) => l.stream.length },
];

/**
 * Pět skupin krajin z vlastností krajiny (podíl lesa, otevřenost, úrodná louka u vsi, členitost,
 * délka potoka): ze seedů 0 … `pool − 1` skupina po skupině vezme `perGroup` seedů s nejvyšším
 * skóre, které žádná dřívější skupina nevzala. Deterministické (shoda skóre – nižší seed).
 */
export function landscapeGroups(pool: number, perGroup: number): LandscapeGroup[] {
  if (pool < GROUPS.length * perGroup) throw new RangeError('Vzorek seedů je menší než skupiny.');
  const landscapes = Array.from({ length: pool }, (_, seed) =>
    generateLandscape(seed, CURRENT_LAYER_VERSIONS),
  );
  const used = new Set<number>();
  return GROUPS.map((group) => {
    const ranked = landscapes
      .map((l, seed) => ({ seed, score: group.score(l) }))
      .filter((r) => !used.has(r.seed))
      .sort((a, b) => b.score - a.score || a.seed - b.seed)
      .slice(0, perGroup);
    for (const r of ranked) used.add(r.seed);
    return { name: group.name, seeds: ranked.map((r) => r.seed) };
  });
}

/** Úlohy po skupinách střídavě (1. ves každé skupiny, pak 2. …) – krátký běh vidí víc typů. */
export function villageTasks(
  groups: readonly LandscapeGroup[],
  count: number,
): { group: string; seed: number }[] {
  const tasks: { group: string; seed: number }[] = [];
  const perGroup = Math.max(...groups.map((g) => g.seeds.length));
  for (let i = 0; i < perGroup; i++) {
    for (const g of groups) {
      const seed = g.seeds[i];
      if (seed !== undefined) tasks.push({ group: g.name, seed });
    }
  }
  return tasks.slice(0, count);
}

// --- běh rodu ---------------------------------------------------------------------------

export interface DynastyResult {
  group: string;
  seed: number;
  strategy: Strategy;
  years: number;
  /** Lidé rodu ve všech vsích v letech z `SNAPSHOT_YEARS` (jen do délky běhu). */
  snapshots: { year: number; people: number }[];
  villages: number;
  departures: number;
  hungerDeaths: number;
  hungerBeginnings: number;
  /** Dny, kdy některá ves hladověla (odhad po krocích dopočtu). */
  hungryDays: number;
  /** Pojistka zásob (0–1) – průměr a nejnižší hodnota přes kroky po prvním roce. */
  bufferAvg: number;
  bufferMin: number;
  /** Průměrný podíl úrodnosti dílů (0–1). */
  fertilityShare: number;
  fieldHa: number;
  /** Průměrná vzdálenost dílů od obydlí (m, podle plochy). */
  walkM: number;
  /** Horní mez lidí na hektar pole ze `steadyState` (plná domácnost) pro úrodnost a vzdálenost rodu. */
  steadyPeoplePerHa: number;
  /** CPU dopočtu (ms) a z něj čas správce (ms) a nejdražší den správce (ms). */
  ms: { total: number; steward: number; maxStewardDay: number };
  // --- kritéria plánu úloh správce (1. 11. 2026); ve starších kontrolních bodech chybí ---
  /** Podíl oseté plochy v červnu na polích v oběhu – mateřská ves od roku `sownFromYear`. */
  sownShare?: number;
  /**
   * Podíl odpočaté půdy ladem v červnu – díly hotové k osevu a příloh s úrodností aspoň
   * `FERTILITY.fallowReady`, které ves neosela – na polích v oběhu; mateřská ves od `sownFromYear`.
   */
  restedIdleShare?: number;
  /** Vzdálenost osetých dílů v červnu (m, podle osetých ploch) – všechny vsi od `sownFromYear`. */
  sownWalkM?: number;
  /** Zakládání dílů + vracení přílohu ÷ polní práce (vzorek práce dne po krocích dopočtu). */
  fieldOverhead?: number;
  /** Člověkodny (vzorek práce dne) – zakládání dílů, vracení přílohu a polní práce celkem. */
  labor?: { founding: number; reclaim: number; field: number };
  /** Plocha všech dílů rodu na konci i se zakládanými (ha) – jmenovatel založení na hektar. */
  foundedHa?: number;
  /** Lidé každého odchodu syna (osadníci nové vsi). */
  departureSizes?: number[];
  /** Vsi rodu, které měly po některém kroku dopočtu 1–`TINY_VILLAGE` lidí (i mateřská). */
  tinyVillages?: number;
  /** Pojistka a hladové dny zvlášť mateřská ves / vsi synů (NaN – žádná ves synů). */
  bufferMother?: number;
  bufferSons?: number;
  hungryDaysMother?: number;
  hungryDaysSons?: number;
  /** Roky vsí s lidmi (všechny vsi rodu) – jmenovatel úmrtí hladem na ves a rok. */
  villageYears?: number;
}

/** Od kterého roku se měří podíl osevu (krátký běh od poloviny). */
export function sownFromYear(years: number): number {
  return Math.min(10, Math.floor(years / 2));
}

/** Krok dopočtu jedné vsi rodu – pro diagnostiku (`steward-diag.ts`). */
export interface ChunkView {
  /** Pořadí vsi v rodu (0 = mateřská ves). */
  index: number;
  foundDay: number;
  from: number;
  to: number;
  state: VillageState;
  chronicle: readonly ChronicleEvent[];
  landscape: Landscape;
  obstacles: ObstacleLayer;
}

interface Colony {
  state: VillageState;
  landscape: Landscape;
  obstacles: ObstacleLayer;
  land: CalibrationLand | null;
  foundDay: number;
  playerYear: number;
  /** Pozice dalšího čtverce v pořadí hráče (`CalibrationLand.take`). */
  next: number;
}

export interface RunOptions {
  group: string;
  seed: number;
  strategy: Strategy;
  years: number;
  /** Hodiny (ms) – výchozí `threadClock`. */
  clock?: () => number;
  /** Každý krok dopočtu každé vsi (diagnostika) – výsledek běhu nemění. */
  observe?: (view: ChunkView) => void;
}

function foundMother(land: CalibrationLand, seed: number, day: number): VillageState {
  const first = land.take(null, day, 0, START_PARTS);
  if (first === null) throw new Error('Krajina nemá půdu ani na první pole.');
  return foundVillage({
    seed,
    day,
    dwellingPosition: land.position,
    firstField: {
      outline: OUTLINE,
      parts: first.parts,
      ...(first.sacred ? { sacred: first.sacred } : {}),
    },
    obstacles: land.obstacles,
    forestDistanceM: land.site.forestDistanceM,
    lord: {},
  });
}

/** Skriptovaný hráč (A): zemnice, kdykoli je kam a komu, a 1. 9. pár dílů navíc, když pole nestačí. */
function playerTend(colony: Colony, day: number): void {
  const { land } = colony;
  if (!land) return;
  let state = colony.state;
  while (waitingHouseholds(state, day) > 0) {
    try {
      state = startNewDwelling(state, day, 'zemnice', land.position, 0, [], land.site);
    } catch {
      break;
    }
  }
  const date = dateOfDayIndex(day);
  if (date.month === 9 && date.day <= CHUNK_DAYS && colony.playerYear !== date.year) {
    colony.playerYear = date.year;
    const target = fieldTarget(state, day, craftCoverage(state, day));
    if (target.have < target.need) {
      const wanted = Math.max(
        PLAYER_PARTS_PER_YEAR,
        Math.ceil((target.need - target.have) * PARTS_PER_PERSON),
      );
      const batch = land.take(state, day, colony.next, wanted);
      if (batch) {
        colony.next = batch.next;
        state = foundField(state, day, {
          outline: OUTLINE,
          parts: batch.parts,
          ...(batch.sacred ? { sacred: batch.sacred } : {}),
        });
      }
    }
  }
  colony.state = state;
}

/** Vybaví schránku odchodů vsi: syn založí novou ves (tady, nebo na nové mapě). */
function settleDepartures(colonies: Colony[], sizes: number[]): void {
  for (const colony of [...colonies]) {
    for (const record of pendingStewardDepartures(colony.state)) {
      if (colonies.length >= MAX_COLONIES || !record.settlers) {
        colony.state = failStewardDeparture(colony.state, record.id);
        continue;
      }
      // jedna ves, jedna mapa (Martin 1. 11. 2026) – syn odchází vždy na novou mapu
      const landscape = generateLandscape(record.seed, CURRENT_LAYER_VERSIONS);
      const obstacles = obstaclesOf(landscape);
      const dwelling = freeVillageSite(landscape, obstacles);
      const founded = dwelling
        ? foundedState(record.seed, {
            landscape,
            obstacles,
            today: record.id,
            dwelling,
            settlers: record.settlers,
          })
        : null;
      if (!founded?.ok) {
        colony.state = failStewardDeparture(colony.state, record.id);
        continue;
      }
      sizes.push(record.settlers.people.length);
      colony.state = settleStewardDeparture(colony.state, record.id, `son-${colonies.length}`);
      colonies.push({
        state: founded.state,
        landscape,
        obstacles,
        land: null,
        foundDay: record.id,
        playerYear: 0,
        next: 0,
      });
    }
  }
}

function peopleOf(colonies: readonly Colony[]): number {
  return colonies.reduce((sum, c) => sum + c.state.people.length, 0);
}

/** Rod ze zakladatelů na skutečné krajině `seed` po `years` let se správcem, nebo hráčem skriptu. */
/**
 * Hodiny měření (ms): čas CPU vlákna (`process.threadCpuUsage` – uživatel + jádro), ne čas na
 * zdi. Měření běží v několika vláknech s `nice 19` vedle jiné práce – na zdi pak stejný den správce
 * trval 44 ms bez zátěže a 191 ms při zátěži stroje 94 (návrh Clauda 2. 11. 2026, steward.md –
 * Ověření kvality). Bez API vlákna (starší Node) čas na zdi.
 */
export function threadClock(): number {
  if (typeof process.threadCpuUsage !== 'function') return performance.now();
  const usage = process.threadCpuUsage();
  return (usage.user + usage.system) / 1000;
}

export function runDynasty(opts: RunOptions): DynastyResult {
  const clock = opts.clock ?? threadClock;
  const land = realLand(opts.seed);
  const landscape = land.landscape;
  if (!landscape) throw new Error('Měření správce potřebuje skutečnou krajinu.');
  const foundDay = dayIndexOf({ year: 500, month: 9, day: 1 });
  const endDay = foundDay + Math.round(opts.years * DAYS_PER_YEAR);
  const state = foundMother(land, opts.seed, foundDay);
  if (opts.strategy === 'steward') state.steward = newSteward(foundDay, true);
  const mother: Colony = {
    state,
    landscape,
    obstacles: land.obstacles,
    land,
    foundDay,
    playerYear: 0,
    next: START_PARTS,
  };
  const colonies: Colony[] = [mother];
  const result: DynastyResult = {
    group: opts.group,
    seed: opts.seed,
    strategy: opts.strategy,
    years: opts.years,
    snapshots: [],
    villages: 1,
    departures: 0,
    hungerDeaths: 0,
    hungerBeginnings: 0,
    hungryDays: 0,
    bufferAvg: 0,
    bufferMin: 1,
    fertilityShare: 0,
    fieldHa: 0,
    walkM: 0,
    steadyPeoplePerHa: 0,
    ms: { total: 0, steward: 0, maxStewardDay: 0 },
  };
  const pending = SNAPSHOT_YEARS.filter((y) => y <= opts.years);
  const tally = newTally();
  STEWARD_TIMING.clock = opts.strategy === 'steward' ? clock : null;
  STEWARD_TIMING.ms = 0;
  STEWARD_TIMING.days = 0;
  STEWARD_TIMING.maxMs = 0;
  try {
    for (let cursor = foundDay; cursor < endDay;) {
      const to = Math.min(endDay, cursor + CHUNK_DAYS);
      for (const [index, colony] of [...colonies].entries()) {
        const started = clock();
        const after = advanceVillage(colony.state, to, colony.obstacles, colony.landscape);
        result.ms.total += clock() - started;
        for (const e of after.chronicle) {
          if (e.kind === 'death' && e.cause === 'hunger') result.hungerDeaths++;
          if (e.kind === 'hunger-began') result.hungerBeginnings++;
        }
        opts.observe?.({
          index,
          foundDay: colony.foundDay,
          from: cursor,
          to,
          state: after,
          chronicle: after.chronicle,
          landscape: colony.landscape,
          obstacles: colony.obstacles,
        });
        after.chronicle = [];
        colony.state = after;
        if (opts.strategy === 'player') playerTend(colony, to);
        if (after.people.length === 0) continue;
        if (after.people.length <= TINY_VILLAGE) tally.tiny.add(index);
        const mother = index === 0;
        const days = to - cursor;
        tally.villageDays += days;
        if (after.hungry) {
          result.hungryDays += days;
          if (mother) tally.hungryMother += days;
          else tally.hungrySons += days;
        }
        countLabor(tally, after, days);
        countJune(tally, after, to, mother, (to - foundDay) / DAYS_PER_YEAR, opts.years);
        if (to - foundDay > DAYS_PER_YEAR) {
          const fill = bufferFill(fieldStoresOutlook(after, to, craftCoverage(after, to)));
          tally.buffer[mother ? 'mother' : 'sons'].push(fill);
          result.bufferMin = Math.min(result.bufferMin, fill);
        }
      }
      if (opts.strategy === 'steward') settleDepartures(colonies, tally.departures);
      cursor = to;
      while (pending.length > 0 && cursor - foundDay >= Math.round(pending[0]! * DAYS_PER_YEAR)) {
        result.snapshots.push({ year: pending.shift()!, people: peopleOf(colonies) });
      }
    }
  } finally {
    result.ms.steward = STEWARD_TIMING.ms;
    result.ms.maxStewardDay = STEWARD_TIMING.maxMs;
    STEWARD_TIMING.clock = null;
  }
  result.villages = colonies.length;
  result.departures = colonies.length - 1;
  const all = [...tally.buffer.mother, ...tally.buffer.sons];
  result.bufferAvg = all.length > 0 ? mean(all) : 1;
  result.bufferMother = mean(tally.buffer.mother);
  result.bufferSons = mean(tally.buffer.sons);
  result.hungryDaysMother = tally.hungryMother;
  result.hungryDaysSons = tally.hungrySons;
  result.sownShare = mean(tally.sownShares);
  result.restedIdleShare = mean(tally.restedIdle);
  result.sownWalkM = tally.sownM2 > 0 ? tally.sownWalk / tally.sownM2 : NaN;
  result.fieldOverhead = tally.fieldLabor > 0 ? tally.overheadLabor / tally.fieldLabor : NaN;
  result.labor = {
    founding: tally.overheadLabor - tally.reclaimLabor,
    reclaim: tally.reclaimLabor,
    field: tally.fieldLabor,
  };
  result.foundedHa =
    colonies.reduce((sum, c) => sum + c.state.parts.reduce((a, p) => a + p.areaM2, 0), 0) / 10_000;
  result.departureSizes = tally.departures;
  result.tinyVillages = tally.tiny.size;
  result.villageYears = tally.villageDays / DAYS_PER_YEAR;
  fillLand(result, colonies);
  return result;
}

/** Průběžné součty kritérií plánu úloh správce. */
interface Tally {
  buffer: { mother: number[]; sons: number[] };
  hungryMother: number;
  hungrySons: number;
  villageDays: number;
  sownShares: number[];
  restedIdle: number[];
  sownM2: number;
  sownWalk: number;
  fieldLabor: number;
  overheadLabor: number;
  reclaimLabor: number;
  departures: number[];
  /** Indexy vsí rodu, které kdy měly 1–`TINY_VILLAGE` lidí. */
  tiny: Set<number>;
}

function newTally(): Tally {
  return {
    buffer: { mother: [], sons: [] },
    hungryMother: 0,
    hungrySons: 0,
    villageDays: 0,
    sownShares: [],
    restedIdle: [],
    sownM2: 0,
    sownWalk: 0,
    fieldLabor: 0,
    overheadLabor: 0,
    reclaimLabor: 0,
    departures: [],
    tiny: new Set(),
  };
}

/** Práce posledního dne kroku × dny kroku (odhad – vzorek jednoho dne z `CHUNK_DAYS`). */
function countLabor(tally: Tally, state: VillageState, days: number): void {
  for (const share of state.labor?.shares ?? []) {
    const md = share.manDays * days;
    if (FIELD_LABOR.has(share.activity)) tally.fieldLabor += md;
    if (FIELD_OVERHEAD.has(share.activity)) tally.overheadLabor += md;
    if (share.activity === 'reclaim') tally.reclaimLabor += md;
  }
}

/** Červnový snímek (první krok června): podíl osevu mateřské vsi a vzdálenost osetých dílů. */
function countJune(
  tally: Tally,
  state: VillageState,
  to: number,
  mother: boolean,
  age: number,
  years: number,
): void {
  const date = dateOfDayIndex(to);
  if (date.month !== 6 || date.day > CHUNK_DAYS || age < sownFromYear(years)) return;
  let rotation = 0;
  let sown = 0;
  let idle = 0;
  for (const p of state.parts) {
    if (p.state === 'founding') continue;
    rotation += p.areaM2;
    if (isRestedIdle(p)) idle += p.areaM2;
    if (p.state !== 'sown') continue;
    sown += p.areaM2;
    tally.sownM2 += p.areaM2;
    tally.sownWalk += p.areaM2 * p.distanceM;
  }
  if (mother && rotation > 0) {
    tally.sownShares.push(sown / rotation);
    tally.restedIdle.push(idle / rotation);
  }
}

/**
 * Odpočatá půda ladem: díl hotový k osevu, nebo příloh, který už je odpočatý (úrodnost aspoň
 * `FERTILITY.fallowReady`) – v červnu ho ves neosela, ačkoli odpočívat nepotřebuje.
 */
export function isRestedIdle(p: Pick<FieldPart, 'state' | 'fertilityShare'>): boolean {
  if (p.state === 'ready') return true;
  return p.state === 'fallow' && p.fertilityShare >= FERTILITY.fallowReady - 1e-9;
}

/** Pole, úrodnost, vzdálenost dílů a horní mez lidí na hektar z konce běhu. */
function fillLand(result: DynastyResult, colonies: readonly Colony[]): void {
  let area = 0;
  let walk = 0;
  let fertility = 0;
  let natural = 0;
  let count = 0;
  for (const c of colonies) {
    for (const p of c.state.parts) {
      if (p.state === 'founding') continue;
      area += p.areaM2;
      walk += p.distanceM * p.areaM2;
      fertility += p.fertilityShare;
      natural += p.naturalFertility;
      count++;
    }
  }
  result.fieldHa = area / 10_000;
  result.walkM = area > 0 ? walk / area : 0;
  result.fertilityShare = count > 0 ? fertility / count : 1;
  if (count === 0) return;
  const steady = steadyState({
    household: { adults: 4, elders: 0, olderChildren: 0, smallChildren: 2 },
    households: 1,
    fertility: natural / count,
    distanceM: result.walkM,
    forestDistanceM: 50,
    dwelling: 'zemnice',
    orchardHa: 0,
    reserve: true,
  });
  result.steadyPeoplePerHa = steady.people / steady.fieldHa;
}

// --- souhrn -----------------------------------------------------------------------------

export type Status = 'OK' | 'MIMO' | 'info' | '–';
export interface Row {
  name: string;
  target: string;
  measured: string;
  status: Status;
  /** Tvrdé kritérium – MIMO znamená, že úloha neprošla, ať jsou ostatní řádky jakékoli. */
  hard?: true;
}

/** Tvrdá kritéria, která neprošla (výpis pod tabulkou měření). */
export function hardFailures(rows: readonly Row[]): Row[] {
  return rows.filter((r) => r.hard && r.status === 'MIMO');
}

/**
 * Cíl „založení + vracení přílohu ÷ polní práce“ (plán úloh správce, úloha 3): vracení pětiletého
 * přílohu (stadium louka – drn jako založení louky) je součást oběhu – ročně se vrací 1 ÷
 * `ROTATION.sown` oseté plochy; k tomu zakládání nových dílů celého oběhu (`ROTATION_FACTOR`) při
 * růstu osevu `growth` za rok. Sazby bez nástrojů (worst); jmenovatel je polní práce na osetý
 * hektar (vracení, kopání, setí, pletí jen jaře – ozim se neplete, žně, mlácení) – zakládání v něm
 * není (jako ve vzorku práce). Měření bere růst 0 – horní mez vracení přílohu ÷ polní práce (návrh
 * Clauda 2. 11. 2026): motykou je vracení louky celý oběh, s rádlem rozorá drn orba a vracení zbude
 * jen u zarostlého přílohu (křoviny, mladý les). Zakládání se nehodnotí – s rádlem stojí louka jen
 * překážky a les 250 čd/ha, podíl pak ukazuje krajinu a růst, ne zbytečnou práci (tu hlídá využití
 * oběhu – odpočatá půda ladem).
 */
export function overheadTarget(growth: number): number {
  const w = FIELD_WORK_PER_HA;
  const reclaim = RECLAIM_COST_PER_HA.meadow.worst / ROTATION.sown;
  const field =
    reclaim + w.dig.worst + w.sow.worst + w.weed.worst / 2 + w.harvest.worst + w.thresh.worst;
  const founding = growth * ROTATION_FACTOR * FOUNDING_COST_PER_HA.meadow.worst;
  return (reclaim + founding) / field;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;
const fmt = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '–';
const ok = (pass: boolean): Status => (pass ? 'OK' : 'MIMO');
const sum = (values: readonly number[]): number => values.reduce((x, y) => x + y, 0);

function peopleAt(runs: readonly DynastyResult[], year: number): number {
  return mean(runs.flatMap((r) => r.snapshots.filter((s) => s.year === year).map((s) => s.people)));
}

/**
 * Cíle kritérií: rychlé měření (pod 50 let – po každé úloze vylepšení správce) a dlouhé 20 × 50
 * (steward.md – Ověření kvality; plán úloh správce 1. 11. 2026, Jak rychle měřit).
 */
interface Targets {
  quick: boolean;
  deaths: number;
  bufferAvg: number;
  bufferMin: number;
  /**
   * Využití oběhu – 1 − podíl odpočaté půdy ladem v červnu (`isRestedIdle`): 1 = žádný díl
   * neodpočívá déle, než potřebuje; rezerva polí `STEWARD.fieldReserve` 1,1 dá ≈ 0,91.
   */
  rotationUse: number;
  /** Chůze bez A (m); s A platí B ≤ A. */
  walkM: number;
  /** Lidé rodu za 25 let bez A (rychlé měření – výchozí stav plánu 23,2). */
  people25: number;
}

const QUICK: Targets = {
  quick: true,
  deaths: 5,
  bufferAvg: 0.6,
  bufferMin: 0,
  rotationUse: 0.8,
  walkM: 266,
  people25: 23,
};
const FULL: Targets = {
  quick: false,
  deaths: 0,
  bufferAvg: 0.9,
  bufferMin: 0.5,
  rotationUse: 0.9,
  walkM: 266,
  people25: 23,
};

/** Hodnoty kritéria (chybí ve starším kontrolním bodu – vynechá se). */
function values(
  runs: readonly DynastyResult[],
  pick: (r: DynastyResult) => number | undefined,
): number[] {
  return runs.map(pick).filter((v): v is number => v !== undefined && Number.isFinite(v));
}

/** Tabulka kritérií B (správce) proti A (hráč skriptu) a D (horní mez); C (Vlkov) se neměří. */
export function summarize(results: readonly DynastyResult[]): Row[] {
  // výčty hodnot po vsích (využití oběhu, pokrytí nástroji, dílny) po seedech vzestupně – jako
  // řádky seedů pod tabulkou; kontrolní bod je v pořadí dokončení úloh, které se mezi běhy liší
  const bySeed = [...results].sort((x, y) => x.seed - y.seed);
  const a = bySeed.filter((r) => r.strategy === 'player');
  const b = bySeed.filter((r) => r.strategy === 'steward');
  const t = Math.max(...results.map((r) => r.years)) < 50 ? QUICK : FULL;
  const hasA = a.length > 0;
  const rows: Row[] = [];
  const years = [...new Set(b.flatMap((r) => r.snapshots.map((s) => s.year)))].sort(
    (x, y) => x - y,
  );
  for (const y of years) {
    const pa = peopleAt(a, y);
    const pb = peopleAt(b, y);
    const quick25 = !hasA && t.quick && y === 25;
    rows.push({
      name: `Lidé rodu za ${y} let (A / B)`,
      target: quick25 ? `B ≥ ${t.people25}` : 'B ≥ A × 1,15',
      measured: `${fmt(pa)} / ${fmt(pb)}${hasA ? ` (${fmt(pb / pa, 2)}×)` : ''}`,
      status: hasA ? ok(pb >= pa * 1.15) : quick25 ? ok(pb >= t.people25) : 'info',
    });
  }
  const deaths = (rs: readonly DynastyResult[]): number => mean(rs.map((r) => r.hungerDeaths));
  rows.push({
    name: 'Úmrtí hladem na rod (A / B)',
    target: t.quick ? `B ≤ ${t.deaths}` : 'B = 0 mimo kruté roky',
    measured: `${fmt(deaths(a))} / ${fmt(deaths(b))}`,
    status: ok(deaths(b) <= t.deaths),
  });
  const perYear = sum(b.map((r) => r.hungerDeaths)) / sum(values(b, (r) => r.villageYears));
  rows.push({
    name: 'Úmrtí hladem na ves a rok (B)',
    target: 'info',
    measured: fmt(perYear, 2),
    status: 'info',
  });
  rows.push({
    name: 'Hladové dny na rod (A / B)',
    target: 'info',
    measured: `${fmt(mean(a.map((r) => r.hungryDays)), 0)} / ${fmt(mean(b.map((r) => r.hungryDays)), 0)}`,
    status: 'info',
  });
  rows.push({
    name: 'Hladové dny – mateřská ves / vsi synů (B)',
    target: 'info',
    measured: `${fmt(mean(values(b, (r) => r.hungryDaysMother)), 0)} / ${fmt(mean(values(b, (r) => r.hungryDaysSons)), 0)}`,
    status: 'info',
  });
  const bufAvg = mean(b.map((r) => r.bufferAvg));
  const bufMin = Math.min(...b.map((r) => r.bufferMin));
  rows.push({
    name: 'Pojistka zásob – průměr / nejnižší (B)',
    target: t.quick ? `≥ ${fmt(t.bufferAvg)} / –` : `≥ ${fmt(t.bufferAvg)} / ≥ ${fmt(t.bufferMin)}`,
    measured: `${fmt(bufAvg, 2)} / ${fmt(bufMin, 2)}`,
    status: ok(bufAvg >= t.bufferAvg && bufMin >= t.bufferMin),
  });
  rows.push({
    name: 'Pojistka – mateřská ves / vsi synů (B)',
    target: 'info',
    measured: `${fmt(mean(values(b, (r) => r.bufferMother)), 2)} / ${fmt(mean(values(b, (r) => r.bufferSons)), 2)}`,
    status: 'info',
  });
  const from = sownFromYear(t.quick ? Math.max(...b.map((r) => r.years)) : 50);
  const use = values(b, (r) => r.restedIdleShare).map((v) => 1 - v);
  const used = mean(use);
  rows.push({
    name: `Využití oběhu (1 − odpočatá půda ladem) – mateřská ves, červen od roku ${from} (B)`,
    target: `≥ ${fmt(t.rotationUse, 2)}`,
    measured: `${fmt(used, 2)} (${use.map((v) => fmt(v, 2)).join(' ')})`,
    status: Number.isFinite(used) ? ok(used >= t.rotationUse) : '–',
  });
  const sown = values(b, (r) => r.sownShare).map((v) => v * ROTATION_FACTOR);
  rows.push({
    name: `Osev ÷ osev ustáleného oběhu – mateřská ves, červen od roku ${from} (B)`,
    target: 'info',
    measured: `${fmt(mean(sown), 2)} (${sown.map((v) => fmt(v, 2)).join(' ')})`,
    status: 'info',
  });
  const overhead = mean(values(b, (r) => r.fieldOverhead));
  const laborShare = (pick: (l: NonNullable<DynastyResult['labor']>) => number): number =>
    mean(values(b, (r) => (r.labor && r.labor.field > 0 ? pick(r.labor) / r.labor.field : NaN)));
  const foundingPerHa = mean(
    values(b, (r) =>
      r.labor && r.foundedHa !== undefined && r.foundedHa > 0
        ? r.labor.founding / r.foundedHa
        : NaN,
    ),
  );
  rows.push({
    name: 'Založení + vracení přílohu ÷ polní práce (B)',
    target: 'info',
    measured: `${fmt(overhead * 100, 0)} % (založení ${fmt(laborShare((l) => l.founding) * 100, 0)} %, ${fmt(foundingPerHa, 0)} čd na ha polí)`,
    status: 'info',
  });
  const reclaim = laborShare((l) => l.reclaim);
  const reclaimMax = overheadTarget(0);
  rows.push({
    name: 'Vracení přílohu ÷ polní práce (B)',
    target: `≤ ${fmt(reclaimMax * 100, 0)} %`,
    measured: `${fmt(reclaim * 100, 0)} %`,
    status: Number.isFinite(reclaim) ? ok(reclaim <= reclaimMax) : '–',
  });
  const sizes = b.flatMap((r) => r.departureSizes ?? []);
  const tiny = sizes.filter((n) => n <= TINY_VILLAGE).length;
  rows.push({
    name: `Odchody synů o ≤ ${TINY_VILLAGE} lidech (B)`,
    target: '0',
    measured: `${tiny} z ${sizes.length} (lidé ${sizes.join(' ') || '–'})`,
    status: ok(tiny === 0),
  });
  const small = values(b, (r) => r.tinyVillages);
  rows.push({
    name: `Vsi rodu o ≤ ${TINY_VILLAGE} lidech kdykoli (B)`,
    target: '0 (tvrdé)',
    measured: small.length > 0 ? `${sum(small)} (${small.join(' ')})` : '–',
    status: small.length > 0 ? ok(sum(small) === 0) : '–',
    hard: true,
  });
  rows.push({
    name: 'Úrodnost dílů (A / B)',
    target: 'B ≥ 0,75',
    measured: `${fmt(mean(a.map((r) => r.fertilityShare)), 2)} / ${fmt(mean(b.map((r) => r.fertilityShare)), 2)}`,
    status: ok(mean(b.map((r) => r.fertilityShare)) >= 0.75),
  });
  rows.push({
    name: 'Odchody synů (nové vsi) na rod (B)',
    target: 'info',
    measured: fmt(mean(b.map((r) => r.departures))),
    status: 'info',
  });
  const perHa = mean(b.map((r) => peopleAt([r], Math.max(...years)) / r.fieldHa || NaN));
  const upper = mean(b.map((r) => r.steadyPeoplePerHa));
  rows.push({
    name: 'Lidí na ha pole na konci (B / D horní mez)',
    target: 'B ≥ 90 % z D',
    measured: `${fmt(perHa, 2)} / ${fmt(upper, 2)} (${fmt((perHa / upper) * 100, 0)} %)`,
    status: ok(perHa >= 0.9 * upper),
  });
  rows.push({
    name: 'Pole na konci ha (A / B)',
    target: 'info',
    measured: `${fmt(mean(a.map((r) => r.fieldHa)))} / ${fmt(mean(b.map((r) => r.fieldHa)))}`,
    status: 'info',
  });
  // vzdálenost všech dílů (i ladem a čerstvě založených) jen info – chůze stojí práci jen při
  // práci na dílu, kritériem je chůze vážená osevem (návrh Clauda 2. 11. 2026)
  rows.push({
    ...walkRow('Vzdálenost dílů m (A / B)', a, b, (r) => r.walkM, t),
    target: 'info',
    status: 'info',
  });
  rows.push(walkRow('Chůze vážená osevem m (A / B)', a, b, (r) => r.sownWalkM, t));
  const share = mean(b.map((r) => r.ms.steward / r.ms.total));
  const worst = Math.max(...b.map((r) => r.ms.maxStewardDay));
  rows.push({
    name: 'Čas správce z dopočtu / nejdražší den (ms)',
    target: '≤ 5 % / ≤ 200',
    measured: `${fmt(share * 100)} % / ${fmt(worst, 0)}`,
    status: ok(share <= 0.05 && worst <= 200),
  });
  rows.push({
    name: 'C (Vlkov), stojící a rozpadlé stavby správce',
    target: '–',
    measured: 'neměří se (Vlkov žije jen v DB, rozpad viz docs/code/village-steward.md)',
    status: '–',
  });
  return rows;
}

/** Chůze: B ≤ A, bez A (jen správce) proti pevnému cíli. */
function walkRow(
  name: string,
  a: readonly DynastyResult[],
  b: readonly DynastyResult[],
  pick: (r: DynastyResult) => number | undefined,
  t: Targets,
): Row {
  const wa = mean(values(a, pick));
  const wb = mean(values(b, pick));
  const hasA = Number.isFinite(wa);
  return {
    name,
    target: hasA ? 'B ≤ A' : `B ≤ ${t.walkM}`,
    measured: `${fmt(wa, 0)} / ${fmt(wb, 0)}`,
    status: !Number.isFinite(wb) ? '–' : ok(wb <= (hasA ? wa : t.walkM)),
  };
}

/** Tabulka před / po: řádky stejného jména vedle sebe (status podle „po“). */
export function formatCompare(before: readonly Row[], after: readonly Row[]): string {
  const old = new Map(before.map((r) => [r.name, r.measured]));
  return formatRows(
    after.map((r) => ({ ...r, measured: `${old.get(r.name) ?? '–'}  →  ${r.measured}` })),
  );
}

export function formatRows(rows: readonly Row[]): string {
  const w = (k: 'name' | 'target' | 'measured'): number =>
    Math.max(...rows.map((r) => r[k].length));
  return rows
    .map(
      (r) =>
        `${r.name.padEnd(w('name'))}  ${r.target.padEnd(w('target'))}  ${r.measured.padEnd(w('measured'))}  ${r.status}`,
    )
    .join('\n');
}
