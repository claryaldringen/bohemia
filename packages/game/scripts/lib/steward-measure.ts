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
  type VillageState,
} from '../../src/domain/village';
import { fieldSowingTargets } from '../../src/domain/village/simulate-plan';
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
}

interface Colony {
  state: VillageState;
  landscape: Landscape;
  obstacles: ObstacleLayer;
  land: CalibrationLand | null;
  playerYear: number;
  /** Pozice dalšího čtverce v pořadí hráče (`CalibrationLand.take`). */
  next: number;
}

export interface RunOptions {
  group: string;
  seed: number;
  strategy: Strategy;
  years: number;
  clock?: () => number;
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
function settleDepartures(colonies: Colony[]): void {
  for (const colony of [...colonies]) {
    for (const record of pendingStewardDepartures(colony.state)) {
      if (colonies.length >= MAX_COLONIES || !record.settlers) {
        colony.state = failStewardDeparture(colony.state, record.id);
        continue;
      }
      const here = record.dwelling !== undefined;
      const landscape = here
        ? colony.landscape
        : generateLandscape(record.seed, CURRENT_LAYER_VERSIONS);
      const dwelling = record.dwelling ?? freeVillageSite(landscape, []);
      const founded = dwelling
        ? foundedState(record.seed, {
            landscape,
            today: record.id,
            dwelling,
            settlers: record.settlers,
          })
        : null;
      if (!founded?.ok) {
        colony.state = failStewardDeparture(colony.state, record.id);
        continue;
      }
      colony.state = settleStewardDeparture(colony.state, record.id, `son-${colonies.length}`);
      colonies.push({
        state: founded.state,
        landscape,
        obstacles: here ? colony.obstacles : obstaclesOf(landscape),
        land: null,
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
export function runDynasty(opts: RunOptions): DynastyResult {
  const clock = opts.clock ?? ((): number => performance.now());
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
  let bufferSum = 0;
  let bufferCount = 0;
  STEWARD_TIMING.clock = opts.strategy === 'steward' ? clock : null;
  STEWARD_TIMING.ms = 0;
  STEWARD_TIMING.days = 0;
  STEWARD_TIMING.maxMs = 0;
  try {
    for (let cursor = foundDay; cursor < endDay;) {
      const to = Math.min(endDay, cursor + CHUNK_DAYS);
      for (const colony of [...colonies]) {
        const started = clock();
        const after = advanceVillage(colony.state, to, colony.obstacles, colony.landscape);
        result.ms.total += clock() - started;
        for (const e of after.chronicle) {
          if (e.kind === 'death' && e.cause === 'hunger') result.hungerDeaths++;
          if (e.kind === 'hunger-began') result.hungerBeginnings++;
        }
        after.chronicle = [];
        if (after.hungry && after.people.length > 0) result.hungryDays += to - cursor;
        colony.state = after;
        if (opts.strategy === 'player') playerTend(colony, to);
        if (to - foundDay > DAYS_PER_YEAR && after.people.length > 0) {
          const fill = bufferFill(fieldSowingTargets(after, to, craftCoverage(after, to)));
          bufferSum += fill;
          bufferCount++;
          result.bufferMin = Math.min(result.bufferMin, fill);
        }
      }
      if (opts.strategy === 'steward') settleDepartures(colonies);
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
  result.bufferAvg = bufferCount > 0 ? bufferSum / bufferCount : 1;
  fillLand(result, colonies);
  return result;
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
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;
const fmt = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '–';
const ok = (pass: boolean): Status => (pass ? 'OK' : 'MIMO');

function peopleAt(runs: readonly DynastyResult[], year: number): number {
  return mean(runs.flatMap((r) => r.snapshots.filter((s) => s.year === year).map((s) => s.people)));
}

/** Tabulka kritérií B (správce) proti A (hráč skriptu) a D (horní mez); C (Vlkov) se neměří. */
export function summarize(results: readonly DynastyResult[]): Row[] {
  const a = results.filter((r) => r.strategy === 'player');
  const b = results.filter((r) => r.strategy === 'steward');
  const rows: Row[] = [];
  const years = [...new Set(b.flatMap((r) => r.snapshots.map((s) => s.year)))].sort(
    (x, y) => x - y,
  );
  for (const y of years) {
    const pa = peopleAt(a, y);
    const pb = peopleAt(b, y);
    rows.push({
      name: `Lidé rodu za ${y} let (A / B)`,
      target: 'B ≥ A × 1,15',
      measured: `${fmt(pa)} / ${fmt(pb)} (${fmt(pb / pa, 2)}×)`,
      status: Number.isFinite(pa) ? ok(pb >= pa * 1.15) : 'info',
    });
  }
  const deaths = (rs: readonly DynastyResult[]): number => mean(rs.map((r) => r.hungerDeaths));
  rows.push({
    name: 'Úmrtí hladem na ves rodu (A / B)',
    target: 'B = 0 mimo kruté roky',
    measured: `${fmt(deaths(a))} / ${fmt(deaths(b))}`,
    status: ok(deaths(b) === 0),
  });
  rows.push({
    name: 'Hladové dny na ves rodu (A / B)',
    target: 'info',
    measured: `${fmt(mean(a.map((r) => r.hungryDays)), 0)} / ${fmt(mean(b.map((r) => r.hungryDays)), 0)}`,
    status: 'info',
  });
  rows.push({
    name: 'Pojistka zásob – průměr / nejnižší (B)',
    target: '≥ 0,9 / ≥ 0,5',
    measured: `${fmt(mean(b.map((r) => r.bufferAvg)), 2)} / ${fmt(Math.min(...b.map((r) => r.bufferMin)), 2)}`,
    status: ok(
      mean(b.map((r) => r.bufferAvg)) >= 0.9 && Math.min(...b.map((r) => r.bufferMin)) >= 0.5,
    ),
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
    name: 'Vzdálenost dílů m (A / B)',
    target: 'B ≤ A',
    measured: `${fmt(mean(a.map((r) => r.walkM)), 0)} / ${fmt(mean(b.map((r) => r.walkM)), 0)}`,
    status: Number.isFinite(mean(a.map((r) => r.walkM)))
      ? ok(mean(b.map((r) => r.walkM)) <= mean(a.map((r) => r.walkM)))
      : 'info',
  });
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
