// Kalibrace simulace vsi: npx tsx packages/game/scripts/measure-village.ts [počet vsí] [roky]
// (rychlé cíle `200 60`, vymření do roku 1500 `100 1000`). Vypíše cíle z Kalibrace
// v docs/design/population.md a fields.md s naměřenou hodnotou a OK / MIMO.
//
// Strategie hráče:
// - Syntetická krajina: 35 ha louky s úrodností 70 po dílech 225 m², vzdálenost od obydlí roste
//   podle pořadí zakládání z 50 na 600 m; za loukou les s úrodností 60 (165 ha, 50–800 m podle
//   pořadí). Překážky žádné. Les jako vrstva překážek: dospělé stromy (hustota jako ve skutečné
//   krajině, ≈ 258 na ha) na východ od vsi od 50 m dál – stavby z nich kácí nejbližší (dřevo,
//   forest.md), díl lesa dá po založení klády za své stromy. Obydlí stojí 50 m od okraje lesa
//   (palivo bez přirážky).
// - Ves se zakládá zemnicí a prvním polem ≈ 1,7 ha (75 dílů) jako v Ukázce fields.md; den
//   založení se mezi vesnicemi rozprostře přes celý rok 500 (všechna roční období).
// - Hráč staví zemnici, kdykoli může – kontroluje po každém kroku (týden, v dlouhých bězích
//   4 týdny); poloha bez významu.
// - 1. 9. (po plánu osevu) hráč založí nové díly, když pole – zakládané, připravené a oseté díly
//   a přílohy s úrodností aspoň 0,7 – nepokryje potřebu celého oběhu: osev × (roky osevu + roky
//   přílohu) / roky osevu podle pravidel (od opravy podle rešerše 17. 10. 2026 16 / 3 ≈ 5,3,
//   dřív 3,3), kde osev = roční potřeba × (1 + rezerva) / čistá úroda hektaru v průměru tří let
//   osevu (tak osev vybírá i ves).
// - Řemesla zatím nejsou – práce a ztráty se počítají s pokrytím NO_CRAFTS (horní meze).
// - Hřbitov (cemetery.md): hráč ho založí hned po dostavění první zemnice – jeden čtverec 200 m
//   od obydlí (všechna stojí v počátku) a 150 m od vody, hygiena 1 – a rozšíří ho o čtverec,
//   když je z 80 % plný a žádné rozšíření se zrovna nestaví.
// - Druhá strategie „nikdy nestaví“: totéž bez nových obydlí a bez hřbitova – jediná domácnost.
// - Třetí strategie „staví a sází sad“ (orchard.md): jako první, a hned po dostavění první
//   zemnice založí jabloňový sad 0,5 ha (22 čtverců 120 m od obydlí, mimo půdu pro pole) –
//   jen informace, sad cíle polí a populace nemění.
// - Sondy s pevným složením domácnosti (startovní: 2 dospělí a 2 děti 7–13 let; plná:
//   4 dospělí a 2 malé děti): skript před každým krokem vrátí lidi do pevného složení, takže
//   ves nestárne ani neroste – měří ustálený oběh, práci na obživu a špičky z Ukázky. Sonda
//   s polem o polovinu větším, než oběh potřebuje (hráč nic nepřidává), měří zarůstání.
//
// Strava a dobytek (diet.md): hráč skriptu ohrady nestaví (orba ne), stáda rostou a porážka dává
// maso samo. Cíle „nasycení ≥ 0,95“ a hlad měří energii (dost jídla – jako před stravou),
// nasycení se stravou (energie × pestrost) a podíly masa a ovoce jsou informace na konci kroků.
// Nasycení dne se počítá stejně jako v simulaci – ze stavu na konci předchozího dne. V krocích,
// kde ves hladověla, skript přehraje jídlo den po dni ze začátku kroku a kroniky; když přehrané
// zásoby nesedí s koncem kroku (nebo ves má jablka – sklízejí se postupně), přepočítá krok den po
// dni (výsledek na kouscích nezávisí).
// Vsi a sondy běží paralelně ve worker vláknech (každá ves je samostatná úloha).
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../src/domain/calendar';
import type { CalendarDate } from '../src/domain/calendar';
import { packObstacles, type ObstaclePlacement } from '../src/domain/landscape';
import {
  DWELLINGS,
  FERTILITY,
  FIELD_LIMITS,
  FOOD_NEED_KG_PER_YEAR,
  HARVEST_DAY,
  NO_CRAFTS,
  PLANNING_DAY,
  SEED_KG_PER_HA,
  SOW_RESERVE,
  THRESH_END_DAY,
  WINTER_HARVEST_DAY,
  advanceVillage,
  villageHappiness,
  villageMeal,
  ageGroup,
  buildAffordability,
  cemeteryCapacity,
  dailyMinPerHousehold,
  daysUntilFoodHarvest,
  eatDay,
  foodNeedPerDay,
  foundCemetery,
  foundField,
  foundOrchard,
  foundVillage,
  grossYieldPerHa,
  isCemeteryBuilding,
  laborPerDay,
  planCrops,
  planPartIds,
  qualifyingDwellings,
  repairNeedPerDay,
  startNewDwelling,
  threshLossKg,
  waitingHouseholds,
} from '../src/domain/village';
import type {
  ChronicleEvent,
  DwellingType,
  PartInput,
  Person,
  VillageState,
} from '../src/domain/village';

interface Config {
  villages: number;
  years: number;
}
const config: Config = isMainThread
  ? { villages: Number(process.argv[2] ?? 200), years: Number(process.argv[3] ?? 60) }
  : (workerData as Config);

const DAYS_PER_YEAR = 365.25;
const M2_PER_HA = 10_000;
const PART_M2 = 225;
const START_PARTS = 75;
const LAND = {
  meadow: { ha: 35, fertility: 70, fromM: 50, toM: 600 },
  forest: { ha: 165, fertility: 60, fromM: 50, toM: 800 },
} as const;
const MEADOW_PARTS = Math.round((LAND.meadow.ha * M2_PER_HA) / PART_M2);
const FOREST_PARTS = Math.round((LAND.forest.ha * M2_PER_HA) / PART_M2);
const MIN_FIELD_PARTS = Math.ceil(FIELD_LIMITS.minAreaM2 / PART_M2); // pole nejméně 0,1 ha
const EPSILON = 1e-9;

/** Oběh dílu podle pravidel (fields.md – Přílohová soustava): roky osevu a přílohu do 95 %. */
function rotationYears(): { sown: number; fallow: number } {
  let share = 1;
  let sown = 0;
  while (share >= FERTILITY.sowableMin - EPSILON) {
    share -= FERTILITY.sowDepletion;
    sown++;
  }
  let fallow = 0;
  while (share < FERTILITY.fallowReady - EPSILON) {
    share = Math.min(1, share + FERTILITY.fallowRecovery);
    fallow++;
  }
  return { sown, fallow };
}
const ROTATION = rotationYears();
/** Pole na celý oběh ÷ osev (fields.md – Přílohová soustava; dnes 16 / 3 ≈ 5,3). */
const ROTATION_FACTOR = (ROTATION.sown + ROTATION.fallow) / ROTATION.sown;
/** Příloh delší než běžný oběh (pastvina, kterou ves nepotřebuje) – měří přebytečné pole. */
const LONG_IDLE_YEARS = 16;
// Krok hráče: týden, v dlouhých bězích (vymření) 4 týdny. Společná práce se čte z historie
// posledních 30 dní, krok proto nesmí být delší.
const STEP_DAYS = config.years > 100 ? 28 : 7;
const FIRST_YEAR = 500;
const LAST_YEAR = 1499;
const POSITION = { x: 0, z: 0, rotation: 0 };
// les syntetické krajiny: stromy po čtvercové mřížce s roztečí pro ≈ 258 stromů na ha od 50 m na
// východ od vsi (vrstva 128 × 15 m = ±960 m); díl lesa (225 m²) má ≈ 5,8 stromu
const TREES_PER_HA = 258;
const FOREST_EDGE_M = 50;
const FOREST = ((): ReturnType<typeof packObstacles> => {
  const spacing = Math.sqrt(M2_PER_HA / TREES_PER_HA);
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = FOREST_EDGE_M; x < 950; x += spacing) {
    for (let z = -950; z < 950; z += spacing) {
      trees.push({ id: id++, kind: 'tree', look: 'beech-1', x, z, rotation: 0, scale: 1 });
    }
  }
  return packObstacles(trees, 128, 15);
})();
const DWELLING_SITE = { obstacles: FOREST, forestDistanceM: FOREST_EDGE_M };
const OUTLINE: [number, number][] = [
  [0, 0],
  [15, 0],
  [15, 15],
];
// sondy s pevným složením (věk v letech – uprostřed roku, aby se během kroku nezměnila skupina)
const PROBES = {
  start: { ages: [25.5, 25.5, 10.5, 10.5], oversize: 1 },
  full: { ages: [25.5, 25.5, 30.5, 30.5, 3.5, 3.5], oversize: 1 },
  oversize: { ages: [25.5, 25.5, 10.5, 10.5], oversize: 1.5 },
} as const;
type ProbeName = keyof typeof PROBES;
// hřbitov hráče: čtverce za sebou v ose x, první 200 m od obydlí v počátku, 150 m od vody
const CEMETERY_FIRST_CELL = 13;
const CEMETERY_WATER_M = 150;
const CEMETERY_EXTEND_AT = 0.8;
// sad hráče (třetí strategie): 22 čtverců ≈ 0,5 ha, 120 m od obydlí, mimo půdu pro pole
const ORCHARD_SQUARES = 22;
const ORCHARD_DISTANCE_M = 120;
// plná úroda sadu od 25. roku (orchard.md) – úroda jablek se měří od tohoto roku vsi
const ORCHARD_FULL_FROM_YEAR = 26;
const PROBE_SEEDS = 5;
const PROBE_YEARS = 50;
const PROBE_STEP_DAYS = 28; // sonda nestaví – stačí krok 4 týdny
const PROBE_FROM_YEAR = 20; // ustálený oběh se měří od 20. roku
const BAND = { low: 1, high: 1.5 }; // zásoby po sklizni v ročních potřebách
const SATIATION_OK = 0.95;

// --- krajina a hráč -----------------------------------------------------------------------

/** Díl syntetické krajiny podle pořadí zakládání; null, když půda došla. */
function landPart(index: number): PartInput | null {
  const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
  if (index < MEADOW_PARTS) {
    const m = LAND.meadow;
    return {
      areaM2: PART_M2,
      distanceM: lerp(m.fromM, m.toM, index / (MEADOW_PARTS - 1)),
      naturalFertility: m.fertility,
      surface: 'meadow',
      obstacleCost: 0,
    };
  }
  const j = index - MEADOW_PARTS;
  if (j >= FOREST_PARTS) return null;
  const f = LAND.forest;
  // stromy dílu lesa: 5 nebo 6, v průměru hustota lesa (stromy jsou v ceně za hektar)
  const trees = Math.floor(((j + 1) * PART_M2 * TREES_PER_HA) / M2_PER_HA);
  const before = Math.floor((j * PART_M2 * TREES_PER_HA) / M2_PER_HA);
  return {
    areaM2: PART_M2,
    distanceM: lerp(f.fromM, f.toM, j / (FOREST_PARTS - 1)),
    naturalFertility: f.fertility,
    surface: 'forest',
    obstacleCost: 0,
    trees: trees - before,
  };
}

function landParts(from: number, count: number): PartInput[] {
  const parts: PartInput[] = [];
  for (let i = from; i < from + count; i++) {
    const part = landPart(i);
    if (part === null) break;
    parts.push(part);
  }
  return parts;
}

function annualNeed(people: Person[], day: number): number {
  return people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/**
 * Pole podle potřeby celého oběhu (ha): osev × ROTATION_FACTOR. Osev hráč odhadne jako ves – cíl osevu
 * (potřeba + rezerva) / čistá úroda hektaru v průměru tří let osevu.
 */
function neededFieldHa(need: number, fertility: number): number {
  const averageShare = 1 - FERTILITY.sowDepletion; // průměr tří let osevu (1, 0,88, 0,76)
  const netPerHa = grossYieldPerHa(fertility * averageShare) - SEED_KG_PER_HA;
  return ((need * (1 + SOW_RESERVE)) / netPerHa) * ROTATION_FACTOR;
}

/** Plocha pole, kterou hráč počítá: zakládané, připravené, oseté díly a přílohy ≥ 0,7. */
function countedFieldHa(state: VillageState): number {
  const counted = state.parts.filter(
    (p) => p.state !== 'fallow' || p.fertilityShare >= FERTILITY.sowableMin - EPSILON,
  );
  return counted.reduce((sum, p) => sum + p.areaM2, 0) / M2_PER_HA;
}

function averageFertility(state: VillageState, nextLand: number): number {
  const area = state.parts.reduce((sum, p) => sum + p.areaM2, 0);
  if (area === 0) return landPart(nextLand)?.naturalFertility ?? LAND.meadow.fertility;
  return state.parts.reduce((sum, p) => sum + p.areaM2 * p.naturalFertility, 0) / area;
}

function occupiedCount(state: VillageState): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/** Lidé v pevném složení – věk vztažený k začátku kroku. */
function pinPeople(state: VillageState, day: number, ages: readonly number[]): void {
  const dwellingId = state.dwellings[0]?.id ?? 1;
  state.people = ages.map((age, i): Person => ({
    id: 1_000_000 + i,
    bornDay: day - Math.ceil(age * DAYS_PER_YEAR),
    dwellingId,
  }));
}

// --- běh jedné vsi ------------------------------------------------------------------------

interface RunOptions {
  endDay: number;
  stepDays: number;
  build: boolean;
  foundFields: boolean;
  pinned: readonly number[] | null;
  forkPolozemnice: boolean;
  /** Skončit, jakmile je hotová stavba s tímto id (rozvětvení pro polozemnici). */
  stopAfterConstruction: number | null;
  /** Po dostavění první zemnice založit sad (třetí strategie). */
  orchard?: boolean;
}

interface PlanRecord {
  year: number;
  sownHa: number;
  fieldHa: number;
  /**
   * Rezerva práce ve špičce – 1 − potřeba / volná práce: podzim (ozim v září–říjnu), jaro (setí
   * jaře a kopání, které nestihl podzim), pletí, léto (horší z července a srpna).
   */
  reserves: Reserves;
  finished: boolean;
}

interface Reserves {
  autumn: number;
  spring: number;
  weed: number;
  summer: number;
}
const NO_RESERVES: Reserves = { autumn: NaN, spring: NaN, weed: NaN, summer: NaN };

interface LaborYear {
  capacity: number;
  common: number;
  repairs: number;
  households: number;
}

interface RunResult {
  firstBuildDay: number | null;
  zemniceDays: number | null;
  polozemniceDays: number | null;
  stopDay: number | null;
  rebuilds: { type: DwellingType; ageYears: number; early: boolean }[];
  minSatiation: Map<number, number>; // hospodářský rok (1. 9. – 31. 8.) → nejnižší nasycení
  storesRatio: Map<number, number>; // rok sklizně → zásoby po sklizni / roční potřeba
  labor: Map<number, LaborYear>;
  plans: PlanRecord[];
  partStates: Map<number, string>; // díl → stav k 1. 9. každého roku (S oseto, F příloh, R jinak)
  meadowGoneHouseholds: number | null;
  landGoneYear: number | null; // první rok sklizně, kdy hráč už neměl kde založit pole
  extinctDay: number | null;
  finalPeople: number;
  finalHouseholds: number;
  /** Pole na konci běhu (bez dílů, které zarostly v les) a osev posledního plánu (ha). */
  finalFieldHa: number;
  finalSownHa: number;
  maxHouseholds: number;
  replays: number;
  appleHarvests: Map<number, number>; // rok sklizně → kg jablek
  orchardDay: number | null; // den založení sadu
  /** Dřevo staveb obydlí (i přestaveb): klády z hromady a pokácené stromy. */
  wood: { fromPile: number; felled: number; finalLogs: number };
  /** Rok sklizně → kopání jaře hotové do konce února (podzim) – pro rezervu práce na jaře. */
  autumnDig: Map<number, number>;
  /** Rok sklizně → podíl ozimu na osevu (ha). */
  winterShare: Map<number, number>;
  /** Štěstí obyvatel na konci každého kroku (happiness.md) – jen informace. */
  happiness: number[];
  /** Jídlo posledního dne každého kroku (diet.md) – nasycení a podíly masa a ovoce. */
  diet: { satiation: number; meat: number; fruit: number }[];
}

function harvestYear(day: number): number {
  const date = dateOfDayIndex(day);
  return date.month >= 9 ? date.year + 1 : date.year;
}

function isOn(date: CalendarDate, target: { month: number; day: number }): boolean {
  return date.month === target.month && date.day === target.day;
}

/**
 * Energie jídla dne `day` ze stavu na konci předchozího dne – stejně jako krok jídla v simulaci
 * (diet.md: ovoce přednostně, maso do porážky, obilí dorovná; 1. 3. ráno ovoce shnije; bez vajec
 * dne). Cíle hladu měří energii – pestrost stravy je informace zvlášť.
 */
function satiationOn(previous: VillageState, day: number): number {
  return villageMeal(previous, day).diet.energy;
}

/**
 * Další konec kroku: nejvýš `stepDays` dní; sklizeň ozimu 31. 7., jaře 31. 8., plán 1. 9.
 * a 1. 3. (ztráta nevymláceného, jako samostatný den) jsou vždy konce kroků – změny zásob po
 * jídle tak padnou jen na konec kroku. Den před 1. 3. je konec kroku i kvůli kopání jaře,
 * které stihl podzim (rezervy práce na jaře).
 */
function nextStop(lastDay: number, endDay: number, stepDays: number): number {
  let stop = Math.min(lastDay + stepDays, endDay);
  const { year } = dateOfDayIndex(lastDay + 1);
  for (const y of [year, year + 1]) {
    if (y > LAST_YEAR) continue;
    const threshEnd = dayIndexOf({ year: y, ...THRESH_END_DAY });
    const anchors = [
      threshEnd - 1,
      threshEnd,
      dayIndexOf({ year: y, ...WINTER_HARVEST_DAY }),
      dayIndexOf({ year: y, ...HARVEST_DAY }),
      dayIndexOf({ year: y, ...PLANNING_DAY }),
    ];
    for (const anchor of anchors) if (anchor > lastDay && anchor < stop) stop = anchor;
  }
  return stop;
}

/**
 * Nasycení každého dne kroku bez přepočtu den po dni: jídlo se přehraje ze stavu na začátku
 * kroku, úmrtí podle kroniky (skupina) a rozdílu lidí, porody podle data narození. Vrací null,
 * když přehrané zásoby nesedí se stavem na konci kroku – pak se krok přepočítá den po dni.
 */
function foodTrack(
  before: VillageState,
  after: VillageState,
  events: ChronicleEvent[],
): number[] | null {
  const afterIds = new Set(after.people.map((p) => p.id));
  const beforeIds = new Set(before.people.map((p) => p.id));
  const vanished = before.people.filter((p) => !afterIds.has(p.id));
  const born = after.people.filter((p) => !beforeIds.has(p.id));
  // jablka se sklízejí postupně v září–říjnu – přehrát je bez simulace práce nejde; maso (vejce
  // každý den, porážka) taky ne
  if ((before.applesKg ?? 0) > 0 || (after.applesKg ?? 0) > 0 || after.orchardWork) return null;
  if ((before.meatKg ?? 0) > 0 || (after.meatKg ?? 0) > 0) return null;
  const deathDay = new Map<number, number>();
  for (const e of events) {
    if (e.kind !== 'death') continue;
    const person = vanished.find((p) => !deathDay.has(p.id) && ageGroup(p, e.day) === e.group);
    if (!person) return null; // např. dítě narozené a zemřelé v témže kroku
    deathDay.set(person.id, e.day);
  }
  if (deathDay.size !== vanished.length) return null;

  let people = [...before.people];
  let stores = before.storesKg;
  const satiation: number[] = [];
  for (let d = before.lastDay + 1; d <= after.lastDay; d++) {
    const need = people.reduce((sum, p) => sum + foodNeedPerDay(p, d), 0);
    // výhled sklizně podle plánu na začátku kroku – když se během kroku změní (setí, pletí
    // ozimu), zásoby na konci nesedí a krok se přepočítá den po dni
    const days = daysUntilFoodHarvest(before.plan, before.parts, d, need);
    const eaten = eatDay(stores, need, days, NO_CRAFTS.pottery);
    satiation.push(eaten.satiation);
    stores = eaten.storesKg;
    people = people.filter((p) => deathDay.get(p.id) !== d);
    for (const p of born) if (p.bornDay === d) people.push(p);
  }
  // sklizně 31. 7. a 31. 8. a ztráta nevymláceného 1. 3. přišly až po jídle posledního dne
  const end = dateOfDayIndex(after.lastDay);
  if (isOn(end, WINTER_HARVEST_DAY)) stores += after.plan?.winter?.harvestedKg ?? 0;
  if (isOn(end, HARVEST_DAY)) stores += after.threshingFromPlan?.harvestedKg ?? 0;
  if (isOn(end, THRESH_END_DAY) && before.threshingFromPlan) {
    if (before.lastDay + 1 !== after.lastDay) return null;
    const loss = planCrops(before.threshingFromPlan).reduce(
      (sum, { work }) => sum + threshLossKg(work, work.harvestedKg ?? 0),
      0,
    );
    stores = Math.max(0, stores - loss);
  }
  const tolerance = 1e-6 * Math.max(1, after.storesKg);
  return Math.abs(stores - after.storesKg) <= tolerance ? satiation : null;
}

function emptyResult(): RunResult {
  return {
    firstBuildDay: null,
    zemniceDays: null,
    polozemniceDays: null,
    stopDay: null,
    rebuilds: [],
    minSatiation: new Map(),
    diet: [],
    storesRatio: new Map(),
    labor: new Map(),
    plans: [],
    partStates: new Map(),
    meadowGoneHouseholds: null,
    landGoneYear: null,
    extinctDay: null,
    finalPeople: 0,
    finalHouseholds: 0,
    finalFieldHa: 0,
    finalSownHa: 0,
    maxHouseholds: 0,
    replays: 0,
    appleHarvests: new Map(),
    orchardDay: null,
    wood: { fromPile: 0, felled: 0, finalLogs: 0 },
    autumnDig: new Map(),
    winterShare: new Map(),
    happiness: [],
  };
}

function lowerMin(map: Map<number, number>, key: number, value: number): void {
  map.set(key, Math.min(map.get(key) ?? 1, value));
}

/** Jeden krok simulace; nasycení dní zapíše do výsledku. Vrací stav na konci kroku. */
function step(result: RunResult, before: VillageState, stop: number): VillageState {
  const after = advanceVillage(before, stop, FOREST);
  const hunger =
    before.hungry || after.hungry || after.chronicle.some((e) => e.kind === 'hunger-began');
  if (!hunger) return after;
  const track = foodTrack(before, after, after.chronicle);
  if (track) {
    track.forEach((v, i) => lowerMin(result.minSatiation, harvestYear(before.lastDay + 1 + i), v));
    return after;
  }
  result.replays++;
  let s = before;
  for (let d = before.lastDay + 1; d <= stop; d++) {
    lowerMin(result.minSatiation, harvestYear(d), satiationOn(s, d));
    s = advanceVillage(s, d, FOREST);
  }
  return s;
}

/** Práce kroku pro podíl obživy (kapacita a opravy podle stavu na konci kroku). */
function addLabor(result: RunResult, after: VillageState, days: number): void {
  const day = after.lastDay;
  const year = harvestYear(day);
  const labor = result.labor.get(year) ?? { capacity: 0, common: 0, repairs: 0, households: 0 };
  const occupied = new Set(after.people.map((p) => p.dwellingId));
  labor.capacity += after.people.reduce((sum, p) => sum + laborPerDay(p, day), 0) * days;
  labor.common += after.commonLaborHistory.slice(-days).reduce((sum, v) => sum + v, 0);
  labor.repairs +=
    after.dwellings
      .filter((d) => occupied.has(d.id))
      .reduce((sum, d) => sum + repairNeedPerDay(d, day), 0) * days;
  labor.households += occupied.size * days;
  result.labor.set(year, labor);
}

/** 31. 8. po sklizni: zásoby v ročních potřebách a u sond rezervy práce letošního plánu. */
function recordHarvest(
  result: RunResult,
  after: VillageState,
  pinned: readonly number[] | null,
): void {
  const day = after.lastDay;
  const { year } = dateOfDayIndex(day);
  const need = annualNeed(after.people, day + 1);
  if (need > 0) result.storesRatio.set(year, after.storesKg / need);
  const plan = after.threshingFromPlan;
  const record = result.plans.find((p) => p.year === year);
  if (!plan || !pinned || !record) return;
  // práce sondy z pevného složení – úmrtí v posledním kroku před sklizní by rezervu zkreslilo
  // (lidé sondy se doplní až na začátku dalšího kroku); sonda bydlí v jedné domácnosti
  const probe = { ...after, people: [] as Person[] };
  pinPeople(probe, day, pinned);
  const capacity = probe.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  const free = capacity - dailyMinPerHousehold(NO_CRAFTS.pottery);
  const windowDays = (from: number, to: number, y = year): number =>
    dayIndexOf({ year: y, month: to + 1, day: 1 }) - dayIndexOf({ year: y, month: from, day: 1 });
  const spring = plan.required;
  const winter = plan.winter?.required;
  const springDig = Math.max(0, spring.dig - (result.autumnDig.get(year) ?? 0));
  record.reserves = {
    autumn:
      1 -
      ((winter?.reclaim ?? 0) + (winter?.dig ?? 0) + (winter?.sow ?? 0)) /
        (free * windowDays(9, 10, year - 1)),
    spring: 1 - (springDig + spring.sow) / (free * windowDays(3, 4)),
    weed: 1 - (spring.weed + (winter?.weed ?? 0)) / (free * windowDays(5, 6)),
    summer: 1 - Math.max(winter?.harvest ?? 0, spring.harvest) / (free * windowDays(7, 7)),
  };
  record.finished = planCrops(plan).every(({ work }) =>
    (['sow', 'weed', 'harvest'] as const).every((t) => work.done[t] >= work.required[t] - 1e-6),
  );
}

/** 1. 9. po plánu osevu: osev, velikost pole a stav dílů (u sond). */
function recordPlan(result: RunResult, after: VillageState, pinned: boolean): void {
  const day = after.lastDay;
  const sown = new Set(after.plan ? planPartIds(after.plan) : []);
  const winter = new Set(after.plan?.winter?.partIds ?? []);
  const area = (keep: (p: VillageState['parts'][number]) => boolean): number =>
    after.parts.filter(keep).reduce((sum, p) => sum + p.areaM2, 0) / M2_PER_HA;
  const year = dateOfDayIndex(day).year + 1;
  const sownHa = area((p) => sown.has(p.id));
  if (sownHa > 0) result.winterShare.set(year, area((p) => winter.has(p.id)) / sownHa);
  result.plans.push({
    year,
    sownHa,
    fieldHa: area(() => true),
    reserves: NO_RESERVES,
    finished: false,
  });
  if (!pinned) return;
  for (const p of after.parts) {
    const mark = p.state === 'sown' ? 'S' : p.state === 'fallow' ? 'F' : 'R';
    result.partStates.set(p.id, (result.partStates.get(p.id) ?? '') + mark);
  }
}

/**
 * Hřbitov hráče: založí ho, dokud žádný není, a rozšíří o čtverec, když je z 80 % plný
 * a nic se na něm nestaví.
 */
function tendCemetery(state: VillageState, day: number): VillageState {
  const cemetery = state.cemeteries?.[0];
  if (cemetery && isCemeteryBuilding(cemetery)) return state;
  if (cemetery && cemetery.graves < CEMETERY_EXTEND_AT * cemeteryCapacity(cemetery)) return state;
  const index = CEMETERY_FIRST_CELL + (cemetery?.squares.length ?? 0);
  const square = {
    cell: { x: index, y: 0 },
    x: index * 15 + 7.5,
    z: 7.5,
    waterDistanceM: CEMETERY_WATER_M,
    obstacleCost: 0,
  };
  return foundCemetery(state, day, { squares: [square], squareSizeM: 15 });
}

/** Sad hráče (třetí strategie): 22 čtverců v řadě y = −5 (pole leží v řadě y = 0 a dál). */
function plantOrchard(state: VillageState, day: number): VillageState {
  const squares = Array.from({ length: ORCHARD_SQUARES }, (_, i) => ({
    cell: { x: i, y: -5 },
    areaM2: PART_M2,
    distanceM: ORCHARD_DISTANCE_M,
    obstacleCost: 0,
  }));
  return foundOrchard(state, day, { squares });
}

function runVillage(start: VillageState, startLand: number, opts: RunOptions): RunResult {
  const result = emptyResult();
  let state = start;
  let land = startLand;
  let firstConstruction: { id: number; day: number } | null = null;
  const seenConstructions = new Set<number>();
  const countWood = (s: VillageState): void => {
    for (const c of s.constructions) {
      if (!c.wood || seenConstructions.has(c.id)) continue;
      seenConstructions.add(c.id);
      result.wood.fromPile += c.wood.fromPile;
      result.wood.felled += c.wood.fell.length;
    }
  };
  countWood(start);
  const finishedDwelling = (events: ChronicleEvent[]): ChronicleEvent | undefined =>
    events.find((e) => e.kind === 'construction-finished' && e.constructionKind === 'dwelling');

  while (state.lastDay < opts.endDay) {
    if (opts.pinned) pinPeople(state, state.lastDay + 1, opts.pinned);
    const before = state;
    let after = step(result, before, nextStop(before.lastDay, opts.endDay, opts.stepDays));
    const events = after.chronicle;
    after.chronicle = []; // kronika patří jen tomuto kroku (stav skriptu, simulace ji nečte)
    const day = after.lastDay;
    const date = dateOfDayIndex(day);
    addLabor(result, after, day - before.lastDay);
    countWood(after);
    if (after.extinctDay === undefined) {
      result.happiness.push(villageHappiness(after));
      if (after.diet) {
        result.diet.push({
          satiation: after.diet.satiation,
          meat: after.diet.shares.meat,
          fruit: after.diet.shares.fruit,
        });
      }
    }

    for (const e of events) {
      if (e.kind === 'rebuild-decided') {
        const dwelling =
          before.dwellings.find((d) => d.id === e.dwellingId) ??
          after.dwellings.find((d) => d.id === e.dwellingId);
        if (!dwelling) continue;
        const ageYears = (e.day - dwelling.builtDay) / DAYS_PER_YEAR;
        const lifespan = DWELLINGS[dwelling.type].lifespanYears;
        result.rebuilds.push({ type: dwelling.type, ageYears, early: ageYears < lifespan - 1e-6 });
      } else if (e.kind === 'apple-harvest') {
        result.appleHarvests.set(dateOfDayIndex(e.day).year, e.kg);
      }
    }
    if (firstConstruction && !after.constructions.some((c) => c.id === firstConstruction?.id)) {
      const finished = finishedDwelling(events);
      if (finished) result.zemniceDays = finished.day - firstConstruction.day;
      firstConstruction = null;
    }
    const tracked = opts.stopAfterConstruction;
    if (tracked !== null && !after.constructions.some((c) => c.id === tracked)) {
      result.stopDay = finishedDwelling(events)?.day ?? day;
      state = after;
      break;
    }
    if (after.people.length === 0) {
      result.extinctDay = day;
      state = after;
      break;
    }

    // poslední den února: kolik kopání jaře stihl podzim (zbytek jde na jaro)
    if (isOn(dateOfDayIndex(day + 1), THRESH_END_DAY) && after.plan) {
      result.autumnDig.set(date.year, after.plan.done.dig);
    }
    if (isOn(date, HARVEST_DAY)) recordHarvest(result, after, opts.pinned);
    if (isOn(date, PLANNING_DAY)) {
      recordPlan(result, after, opts.pinned !== null);
      if (opts.foundFields) {
        const missing =
          neededFieldHa(annualNeed(after.people, day), averageFertility(after, land)) -
          countedFieldHa(after);
        const count = Math.max(MIN_FIELD_PARTS, Math.ceil((missing * M2_PER_HA) / PART_M2));
        const parts = landParts(land, count);
        if (missing > 0 && parts.length >= MIN_FIELD_PARTS) {
          after = foundField(after, day, { outline: OUTLINE, parts });
          const wasMeadow = land < MEADOW_PARTS;
          land += parts.length;
          if (wasMeadow && land >= MEADOW_PARTS) result.meadowGoneHouseholds = occupiedCount(after);
        } else if (missing > 0) {
          result.landGoneYear ??= date.year + 1;
        }
      }
    }

    // stavby hráče
    if (result.firstBuildDay === null && qualifyingDwellings(after, day).length > 0) {
      result.firstBuildDay = day;
      if (opts.forkPolozemnice && buildAffordability(after, 'polozemnice', FOREST).affordable) {
        const fork = startNewDwelling(after, day, 'polozemnice', POSITION, 0, [], DWELLING_SITE);
        const forked = runVillage(fork, land, {
          ...opts,
          endDay: Math.min(opts.endDay, day + 5 * 365),
          build: false,
          forkPolozemnice: false,
          stopAfterConstruction: fork.constructions.at(-1)?.id ?? null,
        });
        if (forked.stopDay !== null) result.polozemniceDays = forked.stopDay - day;
      }
    }
    if (opts.build && after.dwellings.length > 0) after = tendCemetery(after, day);
    if (opts.orchard && result.orchardDay === null && after.dwellings.length > 0) {
      after = plantOrchard(after, day);
      result.orchardDay = day;
    }
    if (opts.build) {
      // Hráč staví kdy chce – bot postaví zemnici pro každou plnou domácnost, která nemá kam.
      while (waitingHouseholds(after, day) > 0) {
        after = startNewDwelling(after, day, 'zemnice', POSITION, 0, [], DWELLING_SITE);
        countWood(after);
        const id = after.constructions.at(-1)?.id;
        if (result.zemniceDays === null && firstConstruction === null && id !== undefined) {
          firstConstruction = { id, day };
        }
      }
    }
    result.maxHouseholds = Math.max(result.maxHouseholds, occupiedCount(after));
    state = after;
  }
  result.finalPeople = state.people.length;
  result.finalHouseholds = occupiedCount(state);
  const lastPlan = result.plans.at(-1);
  result.finalFieldHa = lastPlan?.fieldHa ?? 0;
  result.finalSownHa = lastPlan?.sownHa ?? 0;
  result.wood.finalLogs = state.woodLogs ?? 0;
  return result;
}

function foundOn(seed: number, day: number, parts: number): VillageState {
  const state = foundVillage({
    seed,
    day,
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: landParts(0, parts) },
    obstacles: FOREST,
    forestDistanceM: FOREST_EDGE_M,
  });
  // pastva a žaludy výchozího stáda ze syntetické krajiny (diet.md): louka celá, les do 600 m
  state.livestock!.land = { meadowHa: LAND.meadow.ha, forestHa: LIVESTOCK_FOREST_HA };
  return state;
}

/** Les syntetické krajiny do 600 m od vsi (les leží rovnoměrně 50–800 m od obydlí). */
const LIVESTOCK_FOREST_HA =
  (LAND.forest.ha * (600 - LAND.forest.fromM)) / (LAND.forest.toM - LAND.forest.fromM);

/** Den založení i-té vsi – rozprostřeno přes rok 500. */
function foundingDay(i: number, count: number): number {
  return dayIndexOf({ year: FIRST_YEAR, month: 1, day: 1 }) + Math.floor((i * 366) / count);
}

function endDayFor(foundDay: number, years: number): number {
  return Math.min(TOTAL_GAME_DAYS - 1, foundDay + Math.round(years * DAYS_PER_YEAR));
}

/** Úplné hospodářské roky živé vsi (bez roku založení a nedokončeného posledního). */
function fullYears(r: RunResult, foundDay: number, endDay: number): number[] {
  const first = harvestYear(foundDay) + 1;
  const lastDay = r.extinctDay ?? endDay;
  const lastDate = dateOfDayIndex(lastDay);
  const last = isOn(lastDate, HARVEST_DAY) ? lastDate.year : harvestYear(lastDay) - 1;
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);
  return years;
}

// --- statistiky -------------------------------------------------------------------------

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? NaN;
}

function share(values: boolean[]): number {
  return values.length === 0 ? NaN : values.filter(Boolean).length / values.length;
}

const fmt = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : v === Infinity ? '∞' : '–';
const pct = (v: number): string => `${fmt(v * 100)} %`;

// --- úlohy (worker vlákna) --------------------------------------------------------------

interface ProbeSummary {
  sownHa: number;
  fieldHa: number;
  subsistence: number;
  satiationOk: number;
  storesMedian: number;
  reserves: Reserves;
  finished: number;
  sownRuns: number[];
  fallowRuns: number[];
  /** Podíl dílů, které aspoň LONG_IDLE_YEARS let v kuse ležely ladem (pastvina bez osevu). */
  idleShare: number;
}

type Task = { kind: 'village'; index: number } | { kind: 'probe'; probe: ProbeName };
type TaskResult =
  | {
      kind: 'village';
      index: number;
      foundDay: number;
      endDay: number;
      builder: RunResult;
      loner: RunResult;
      orchard: RunResult;
      ms: { builder: number; loner: number; orchard: number };
    }
  | { kind: 'probe'; probe: ProbeName; summary: ProbeSummary; ms: number; replays: number };

function runVillageTask(index: number): TaskResult {
  const foundDay = foundingDay(index, config.villages);
  const endDay = endDayFor(foundDay, config.years);
  const options: RunOptions = {
    endDay,
    stepDays: STEP_DAYS,
    build: true,
    foundFields: true,
    pinned: null,
    forkPolozemnice: true,
    stopAfterConstruction: null,
  };
  const t0 = performance.now();
  const builder = runVillage(foundOn(index, foundDay, START_PARTS), START_PARTS, options);
  const t1 = performance.now();
  const loner = runVillage(foundOn(index, foundDay, START_PARTS), START_PARTS, {
    ...options,
    build: false,
    forkPolozemnice: false,
  });
  const t2 = performance.now();
  const orchard = runVillage(foundOn(index, foundDay, START_PARTS), START_PARTS, {
    ...options,
    forkPolozemnice: false,
    orchard: true,
  });
  const ms = { builder: t1 - t0, loner: t2 - t1, orchard: performance.now() - t2 };
  return { kind: 'village', index, foundDay, endDay, builder, loner, orchard, ms };
}

function runProbe(name: ProbeName): TaskResult {
  const t0 = performance.now();
  const { ages, oversize } = PROBES[name];
  const fixedField = oversize !== 1;
  const startNeed = ages.reduce(
    (sum, age) => sum + (age < 14 ? FOOD_NEED_KG_PER_YEAR.child : FOOD_NEED_KG_PER_YEAR.adult),
    0,
  );
  const firstParts = fixedField
    ? Math.round((neededFieldHa(startNeed, LAND.meadow.fertility) * oversize * M2_PER_HA) / PART_M2)
    : START_PARTS;
  const results: RunResult[] = [];
  const satiation: boolean[] = [];
  for (let seed = 0; seed < PROBE_SEEDS; seed++) {
    const foundDay = dayIndexOf({ year: 600, month: 3, day: 1 }) + seed * 73;
    const endDay = endDayFor(foundDay, PROBE_YEARS);
    const start = foundOn(1000 + seed, foundDay, firstParts);
    pinPeople(start, foundDay, ages);
    const r = runVillage(start, firstParts, {
      endDay,
      stepDays: PROBE_STEP_DAYS,
      build: false,
      foundFields: !fixedField,
      pinned: ages,
      forkPolozemnice: false,
      stopAfterConstruction: null,
    });
    results.push(r);
    for (const y of fullYears(r, foundDay, endDay)) {
      satiation.push((r.minSatiation.get(y) ?? 1) >= SATIATION_OK);
    }
  }
  const steady = (year: number, r: RunResult): boolean =>
    year - (r.plans[0]?.year ?? year) >= PROBE_FROM_YEAR;
  const plans = results.flatMap((r) => r.plans.filter((p) => steady(p.year, r)));
  const laborYears = results.flatMap((r) =>
    [...r.labor.entries()].filter(([y]) => steady(y, r)).map(([, l]) => l),
  );
  const capacity = laborYears.reduce((sum, l) => sum + l.capacity, 0);
  const free = laborYears.reduce((sum, l) => sum + l.common + l.repairs, 0);
  const stores = results.flatMap((r) =>
    [...r.storesRatio.entries()].filter(([y]) => steady(y, r)).map(([, v]) => v),
  );
  const withReserves = plans.filter((p) => Number.isFinite(p.reserves.spring));
  const sownRuns: number[] = [];
  const fallowRuns: number[] = [];
  for (const r of results) {
    for (const marks of r.partStates.values()) {
      // jen celé úseky – první a poslední úsek dílu nemusí být celý
      const runs = marks.match(/S+|F+|R+/g) ?? [];
      for (const run of runs.slice(1, -1)) {
        if (run.startsWith('S')) sownRuns.push(run.length);
        else if (run.startsWith('F')) fallowRuns.push(run.length);
      }
    }
  }
  const summary: ProbeSummary = {
    sownHa: quantile(
      plans.map((p) => p.sownHa),
      0.5,
    ),
    fieldHa: quantile(
      plans.map((p) => p.fieldHa),
      0.5,
    ),
    subsistence: 1 - free / capacity,
    satiationOk: share(satiation),
    storesMedian: quantile(stores, 0.5),
    reserves: {
      autumn: Math.min(...withReserves.map((p) => p.reserves.autumn)),
      spring: Math.min(...withReserves.map((p) => p.reserves.spring)),
      weed: Math.min(...withReserves.map((p) => p.reserves.weed)),
      summer: Math.min(...withReserves.map((p) => p.reserves.summer)),
    },
    finished: share(withReserves.map((p) => p.finished)),
    sownRuns,
    fallowRuns,
    idleShare:
      results.reduce(
        (sum, r) =>
          sum +
          [...r.partStates.values()].filter((marks) =>
            (marks.match(/F+/g) ?? []).some((run) => run.length >= LONG_IDLE_YEARS),
          ).length,
        0,
      ) / results.reduce((sum, r) => sum + r.partStates.size, 0),
  };
  const replays = results.reduce((sum, r) => sum + r.replays, 0);
  return { kind: 'probe', probe: name, summary, ms: performance.now() - t0, replays };
}

function runTask(task: Task): TaskResult {
  return task.kind === 'village' ? runVillageTask(task.index) : runProbe(task.probe);
}

/** Úlohy rozdělí mezi worker vlákna – každé si po dokončení vezme další. */
async function runAll(tasks: Task[]): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  const workerCount = Math.max(1, Math.min(availableParallelism() - 1, tasks.length));
  let next = 0;
  let running = 0;
  await new Promise<void>((resolve, reject) => {
    const dispatch = (worker: Worker): void => {
      const task = tasks[next];
      if (task === undefined) {
        void worker.terminate();
        if (running === 0) resolve();
        return;
      }
      next++;
      running++;
      worker.postMessage(task);
    };
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: config });
      worker.on('message', (result: TaskResult) => {
        results.push(result);
        running--;
        dispatch(worker);
      });
      worker.on('error', reject);
      dispatch(worker);
    }
  });
  return results;
}

// --- výstup -----------------------------------------------------------------------------

type Status = 'OK' | 'MIMO' | 'info' | '–';
interface Row {
  name: string;
  target: string;
  measured: string;
  status: Status;
}
type VillageResult = Extract<TaskResult, { kind: 'village' }>;

function report(villages: VillageResult[], probes: Record<ProbeName, ProbeSummary>): Row[] {
  const rows: Row[] = [];
  const row = (name: string, target: string, measured: string, status: Status): void => {
    rows.push({ name, target, measured, status });
  };
  const ok = (pass: boolean): Status => (pass ? 'OK' : 'MIMO');
  const builders = villages.map((v) => v.builder);

  // strava (diet.md) – nasycení se stravou a podíly masa a ovoce na energii, jen informace
  for (const [label, runs] of [
    ['hráč staví', builders],
    ['nestaví', villages.map((v) => v.loner)],
  ] as const) {
    const all = runs.flatMap((r) => r.diet);
    const satiation = all.map((d) => d.satiation);
    row(
      `Strava – nasycení se stravou (${label})`,
      'informace – energie × pestrost (jen obilí 0,80)',
      `kroky: medián ${fmt(quantile(satiation, 0.5), 2)} | p10 ${fmt(quantile(satiation, 0.1), 2)} | p90 ${fmt(quantile(satiation, 0.9), 2)} | maso medián ${pct(
        quantile(
          all.map((d) => d.meat),
          0.5,
        ),
      )} energie | ovoce medián ${pct(
        quantile(
          all.map((d) => d.fruit),
          0.5,
        ),
      )}`,
      'info',
    );
  }

  // štěstí obyvatel (happiness.md) – bez posvátných míst (hráč skriptu je nestaví), jen informace
  for (const [label, runs] of [
    ['hráč staví', builders],
    ['nestaví', villages.map((v) => v.loner)],
  ] as const) {
    const all = runs.flatMap((r) => r.happiness);
    const finals = runs.flatMap((r) => r.happiness.slice(-1));
    row(
      `Štěstí obyvatel (${label})`,
      'informace – 0–100, výchozí 50',
      `všechny kroky: medián ${fmt(quantile(all, 0.5))} | p10 ${fmt(quantile(all, 0.1))} | p90 ${fmt(quantile(all, 0.9))} | nejmíň ${fmt(quantile(all, 0))} | nejvíc ${fmt(quantile(all, 1))} | na konci medián ${fmt(quantile(finals, 0.5))}`,
      'info',
    );
  }

  const firstBuild = villages.map(({ builder, foundDay }) =>
    builder.firstBuildDay === null ? Infinity : (builder.firstBuildDay - foundDay) / DAYS_PER_YEAR,
  );
  const p90Build = quantile(firstBuild, 0.9);
  row(
    'První možnost stavět (roky)',
    '90 % do ≈ 8 let',
    `medián ${fmt(quantile(firstBuild, 0.5))} | p90 ${fmt(p90Build)} | p99 ${fmt(quantile(firstBuild, 0.99))}`,
    ok(p90Build <= 8.5),
  );

  const zemnice = builders.map((r) => r.zemniceDays).filter((v) => v !== null);
  const polozemnice = builders.map((r) => r.polozemniceDays).filter((v) => v !== null);
  const durations = (values: number[]): string =>
    `medián ${fmt(quantile(values, 0.5), 0)} | p10 ${fmt(quantile(values, 0.1), 0)} | p90 ${fmt(quantile(values, 0.9), 0)} (n ${values.length})`;
  const zemniceMedian = quantile(zemnice, 0.5);
  const polozemniceMedian = quantile(polozemnice, 0.5);
  row(
    'Zemnice čerstvě plnou domácností (dny)',
    '≈ roční období (91 ± 35 %)',
    durations(zemnice),
    ok(zemniceMedian >= 59 && zemniceMedian <= 123),
  );
  row(
    'Polozemnice čerstvě plnou domácností (dny)',
    '≈ herní rok (365 ± 35 %)',
    durations(polozemnice),
    ok(polozemniceMedian >= 237 && polozemniceMedian <= 493),
  );

  const rebuilds = builders.flatMap((r) => r.rebuilds);
  for (const [type, target, lo, hi] of [
    ['zemnice', '≈ 18 let', 16, 20],
    ['polozemnice', '≈ 20–25 let', 20, 25],
  ] as const) {
    const ofType = rebuilds.filter((b) => b.type === type);
    const ages = ofType.map((b) => b.ageYears);
    const median = quantile(ages, 0.5);
    row(
      `Přestavba – ${type} (věk v letech)`,
      target,
      ofType.length === 0
        ? 'žádná přestavba'
        : `medián ${fmt(median)} | p10 ${fmt(quantile(ages, 0.1))} | zchátralé dřív ${pct(share(ofType.map((b) => b.early)))} (n ${ofType.length})`,
      ofType.length === 0 ? '–' : ok(median >= lo && median <= hi),
    );
  }

  // společná práce domácnosti za rok (od 10. roku vsi) vs. opravy na konci životnosti
  const commonPerHousehold: number[] = [];
  for (const { builder, foundDay } of villages) {
    const fromYear = harvestYear(foundDay) + 10;
    let common = 0;
    let householdDays = 0;
    for (const [y, l] of builder.labor) {
      if (y < fromYear) continue;
      common += l.common;
      householdDays += l.households;
    }
    if (householdDays > 0) commonPerHousehold.push((common / householdDays) * 365);
  }
  const commonMedian = quantile(commonPerHousehold, 0.5);
  const repairRatios = (['zemnice', 'polozemnice'] as const).map(
    (t) => DWELLINGS[t].repairAtEndOfLifePerYear / commonMedian,
  );
  row(
    'Opravy na konci životnosti / společná práce domácnosti',
    '≈ 1/2',
    `zemnice ${fmt(repairRatios[0] ?? NaN, 2)} | polozemnice ${fmt(repairRatios[1] ?? NaN, 2)} (společná práce ${fmt(commonMedian, 0)} člověkodní/domácnost/rok od 10. roku)`,
    commonPerHousehold.length === 0 ? '–' : ok(repairRatios.every((v) => v >= 0.35 && v <= 0.65)),
  );

  const millennium = config.years >= 1000;
  const extinctCount = builders.filter((r) => r.extinctDay !== null).length;
  const extinct = share(builders.map((r) => r.extinctDay !== null));
  row(
    `Vymření – hráč staví (${config.years} let)`,
    '≤ 1 % do roku 1500',
    // velikost vzorku: 0 z n potvrdí ≤ 1 % až od n ≈ 300 (95% horní mez ≈ 3 / n)
    `${pct(extinct)} (${extinctCount} z ${builders.length} vsí) | na konci domácností medián ${fmt(
      quantile(
        builders.map((r) => r.finalHouseholds),
        0.5,
      ),
      0,
    )}, lidí ${fmt(
      quantile(
        builders.map((r) => r.finalPeople),
        0.5,
      ),
      0,
    )}`,
    millennium ? ok(extinct <= 0.01) : '–',
  );
  const loners = villages.map((v) => v.loner);
  const lonersExtinct = share(loners.map((r) => r.extinctDay !== null));
  const lonerExtinctYears = villages
    .filter((v) => v.loner.extinctDay !== null)
    .map((v) => ((v.loner.extinctDay ?? 0) - v.foundDay) / DAYS_PER_YEAR);
  row(
    `Vymření – jediná domácnost bez staveb (${config.years} let)`,
    'jen informace (není cíl)',
    `${pct(lonersExtinct)} (n ${loners.length}) | vymřelé za medián ${fmt(quantile(lonerExtinctYears, 0.5), 0)} let | žijící: lidí medián ${fmt(
      quantile(
        loners.filter((r) => r.extinctDay === null).map((r) => r.finalPeople),
        0.5,
      ),
      0,
    )}`,
    'info',
  );

  const { start, full, oversize } = probes;
  // pole v ustáleném oběhu = osev × oběh podle pravidel (dřív ≈ 3,3×, od rešerše ≈ 5,3×)
  const startField = 1.7 * ROTATION_FACTOR;
  const fullField = 2.7 * ROTATION_FACTOR;
  row(
    'Startovní ves: osev / pole (ha, ustálený oběh)',
    `≈ 1,7 / ≈ ${fmt(startField)}`,
    `${fmt(start.sownHa, 2)} / ${fmt(start.fieldHa, 2)}`,
    ok(Math.abs(start.sownHa - 1.7) <= 0.3 && Math.abs(start.fieldHa - startField) <= 1.5),
  );
  row(
    'Startovní ves: práce na obživu',
    '85–90 %',
    `${pct(start.subsistence)} | nasycení ≥ 0,95 v ${pct(start.satiationOk)} let | zásoby po sklizni ${fmt(start.storesMedian, 2)}`,
    ok(start.subsistence >= 0.85 && start.subsistence <= 0.9),
  );
  row(
    'Plná domácnost: osev / pole (ha)',
    `≈ 2,7 / ≈ ${fmt(fullField)}`,
    `${fmt(full.sownHa, 2)} / ${fmt(full.fieldHa, 2)}`,
    ok(Math.abs(full.sownHa - 2.7) <= 0.4 && Math.abs(full.fieldHa - fullField) <= 2.5),
  );
  row(
    'Plná domácnost: práce na obživu',
    '≈ 80 % (75–85)',
    `${pct(full.subsistence)} | nasycení ≥ 0,95 v ${pct(full.satiationOk)} let | zásoby po sklizni ${fmt(full.storesMedian, 2)}`,
    ok(full.subsistence >= 0.75 && full.subsistence <= 0.85),
  );
  const sownMedian = quantile(start.sownRuns, 0.5);
  const fallowMedian = quantile(start.fallowRuns, 0.5);
  row(
    'Oběh dílu: roky osevu / přílohu (medián)',
    `${ROTATION.sown} / ${ROTATION.fallow}–${ROTATION.fallow + 1}`,
    `${fmt(sownMedian, 0)} / ${fmt(fallowMedian, 0)} (příloh p10–p90 ${fmt(quantile(start.fallowRuns, 0.1), 0)}–${fmt(quantile(start.fallowRuns, 0.9), 0)})`,
    ok(
      sownMedian === ROTATION.sown &&
        fallowMedian >= ROTATION.fallow &&
        fallowMedian <= ROTATION.fallow + 1,
    ),
  );
  row(
    'Pole o polovinu větší: nadbytek leží jako pastvina',
    `≈ 1/3 plochy ladem ≥ ${LONG_IDLE_YEARS} let v kuse`,
    `${pct(oversize.idleShare)} dílů ladem aspoň ${LONG_IDLE_YEARS} let v kuse`,
    ok(oversize.idleShare >= 0.2 && oversize.idleShare <= 0.45),
  );

  // zásoby a nasycení hráče, který staví – jen roky, kdy ještě bylo kde založit pole
  const builderYears = villages.flatMap(({ builder, foundDay, endDay }) =>
    fullYears(builder, foundDay, endDay)
      .filter((y) => builder.landGoneYear === null || y < builder.landGoneYear)
      .map((y) => ({
        satiation: builder.minSatiation.get(y) ?? 1,
        stores: builder.storesRatio.get(y),
      })),
  );
  const stores = builderYears.map((y) => y.stores).filter((v) => v !== undefined);
  const storesP10 = quantile(stores, 0.1);
  const storesP90 = quantile(stores, 0.9);
  row(
    'Zásoby po sklizni (roční potřeby), hráč staví',
    'mezi 1 a 1,5 (p10 ≥ 1, p90 ≤ 1,5)',
    `p10 ${fmt(storesP10, 2)} | medián ${fmt(quantile(stores, 0.5), 2)} | p90 ${fmt(storesP90, 2)} | v pásmu ${pct(share(stores.map((v) => v >= BAND.low && v <= BAND.high)))}`,
    ok(storesP10 >= BAND.low && storesP90 <= BAND.high),
  );
  const minSatiation = builderYears.map((y) => y.satiation);
  const satiationOk = share(minSatiation.map((v) => v >= SATIATION_OK));
  row(
    'Nasycení ≥ 0,95 celý rok, hráč staví',
    '≥ 95 % let',
    `${pct(satiationOk)} let | nejnižší nasycení roku p1 ${fmt(quantile(minSatiation, 0.01), 2)}, p5 ${fmt(quantile(minSatiation, 0.05), 2)} | bez hladu ${pct(share(minSatiation.map((v) => v >= 1 - EPSILON)))} (n ${minSatiation.length})`,
    ok(satiationOk >= 0.95),
  );
  const wood = builders.map((r) => r.wood);
  const totalPile = wood.reduce((sum, w) => sum + w.fromPile, 0);
  const totalFelled = wood.reduce((sum, w) => sum + w.felled, 0);
  row(
    `Dřevo obydlí – hráč staví (${config.years} let)`,
    'jen informace (forest.md)',
    `z hromady ${pct(totalPile / Math.max(1, totalPile + totalFelled))} | pokácené stromy na ves medián ${fmt(
      quantile(
        wood.map((w) => w.felled),
        0.5,
      ),
      0,
    )} | klády na konci medián ${fmt(
      quantile(
        wood.map((w) => w.finalLogs),
        0.5,
      ),
      0,
    )}, p90 ${fmt(
      quantile(
        wood.map((w) => w.finalLogs),
        0.9,
      ),
      0,
    )}`,
    'info',
  );
  const landGone = builders.filter((r) => r.landGoneYear !== null).length;
  if (landGone > 0) {
    const lateYears = villages.flatMap(({ builder, foundDay, endDay }) =>
      fullYears(builder, foundDay, endDay)
        .filter((y) => builder.landGoneYear !== null && y >= builder.landGoneYear)
        .map((y) => builder.minSatiation.get(y) ?? 1),
    );
    row(
      'Nasycení ≥ 0,95, hráč staví – po vyčerpání půdy',
      'hlad ves zmenší, nezničí',
      `${pct(share(lateYears.map((v) => v >= SATIATION_OK)))} let (n ${lateYears.length}, půda došla u ${landGone} vsí)`,
      'info',
    );
  }
  const lonerYears = villages.flatMap(({ loner, foundDay, endDay }) =>
    fullYears(loner, foundDay, endDay).map((y) => loner.minSatiation.get(y) ?? 1),
  );
  row(
    'Nasycení ≥ 0,95 celý rok, hráč nestaví',
    '≥ 95 % let',
    `${pct(share(lonerYears.map((v) => v >= SATIATION_OK)))} let (n ${lonerYears.length})`,
    'info',
  );
  row(
    'Startovní ves: rezerva práce ve špičkách',
    '≥ 20 %',
    `jaro ${pct(start.reserves.spring)} | pletí ${pct(start.reserves.weed)} | léto ${pct(start.reserves.summer)} | vše stihne v ${pct(start.finished)} let | podzim (ozim) ${pct(start.reserves.autumn)}`,
    ok(Math.min(start.reserves.spring, start.reserves.summer) >= 0.2 && start.finished === 1),
  );
  const living = builders.filter((r) => r.finalHouseholds > 0 && r.finalSownHa > 0);
  row(
    `Pole na domácnost na konci (ha, ${config.years} let), hráč staví`,
    `pole ≈ ${fmt(ROTATION_FACTOR)}× osevu`,
    `pole ${fmt(
      quantile(
        living.map((r) => r.finalFieldHa / r.finalHouseholds),
        0.5,
      ),
      2,
    )} | osev ${fmt(
      quantile(
        living.map((r) => r.finalSownHa / r.finalHouseholds),
        0.5,
      ),
      2,
    )} | pole ÷ osev ${fmt(
      quantile(
        living.map((r) => r.finalFieldHa / r.finalSownHa),
        0.5,
      ),
      1,
    )} (medián, n ${living.length})`,
    'info',
  );
  const winterShares = builders.flatMap((r) => [...r.winterShare.values()]);
  row(
    'Ozim na osevu (podíl plochy), hráč staví',
    'jen informace – ozim, kolik podzim stihne',
    `medián ${pct(quantile(winterShares, 0.5))}, p10 ${pct(quantile(winterShares, 0.1))}, p90 ${pct(quantile(winterShares, 0.9))} (n ${winterShares.length} plánů)`,
    'info',
  );
  // třetí strategie – hráč staví a hned po první zemnici vysadí sad 0,5 ha
  const orchardYears = villages.flatMap(({ orchard, foundDay, endDay }) =>
    fullYears(orchard, foundDay, endDay)
      .filter((y) => orchard.landGoneYear === null || y < orchard.landGoneYear)
      .map((y) => orchard.minSatiation.get(y) ?? 1),
  );
  const orchards = villages.map((v) => v.orchard);
  row(
    'Hráč staví + sad 0,5 ha: nasycení ≥ 0,95 celý rok',
    'jen informace (bez sadu viz výše)',
    `${pct(share(orchardYears.map((v) => v >= SATIATION_OK)))} let (n ${orchardYears.length}) | na konci domácností medián ${fmt(
      quantile(
        orchards.map((r) => r.finalHouseholds),
        0.5,
      ),
      0,
    )}, lidí ${fmt(
      quantile(
        orchards.map((r) => r.finalPeople),
        0.5,
      ),
      0,
    )} | vymření ${pct(share(orchards.map((r) => r.extinctDay !== null)))}`,
    'info',
  );
  const planted = villages.flatMap(({ orchard }) =>
    orchard.orchardDay === null ? [] : [{ orchard, from: dateOfDayIndex(orchard.orchardDay).year }],
  );
  const firstApples = planted.map(({ orchard, from }) => {
    const years = [...orchard.appleHarvests.keys()].sort((a, b) => a - b);
    return years.length > 0 ? years[0]! - from : Infinity;
  });
  const fullHarvests = planted.flatMap(({ orchard, from }) =>
    [...orchard.appleHarvests.entries()]
      .filter(([y]) => y - from >= ORCHARD_FULL_FROM_YEAR)
      .map(([, kg]) => kg),
  );
  row(
    'Sad 0,5 ha: první jablka / úroda v plné síle',
    '6. rok / ≈ 1 500 kg (3 t/ha, ≈ 215 kg obilí)',
    `první sklizeň medián ${fmt(quantile(firstApples, 0.5), 0)} let po založení | od ${ORCHARD_FULL_FROM_YEAR}. roku sklizeň medián ${fmt(quantile(fullHarvests, 0.5), 0)} kg, p10 ${fmt(quantile(fullHarvests, 0.1), 0)} kg (n ${fullHarvests.length})`,
    'info',
  );

  const meadowGone = builders.map((r) => r.meadowGoneHouseholds).filter((v) => v !== null);
  row(
    'Louky (35 ha, úrodnost 70) uživí domácností',
    '≈ 2–3 (typicky úrodnost 45)',
    meadowGone.length === 0
      ? 'louka nedošla'
      : `když dojde louka: medián ${fmt(quantile(meadowGone, 0.5), 0)} (n ${meadowGone.length}) | nejvíc domácností medián ${fmt(
          quantile(
            builders.map((r) => r.maxHouseholds),
            0.5,
          ),
          0,
        )}`,
    'info',
  );
  return rows;
}

async function main(): Promise<void> {
  const started = performance.now();
  const tasks: Task[] = [
    ...(Object.keys(PROBES) as ProbeName[]).map((probe): Task => ({ kind: 'probe', probe })),
    ...Array.from({ length: config.villages }, (_, index): Task => ({ kind: 'village', index })),
  ];
  const results = await runAll(tasks);
  const villages = results
    .filter((r): r is VillageResult => r.kind === 'village')
    .sort((a, b) => a.index - b.index);
  const probes = Object.fromEntries(
    results.flatMap((r) => (r.kind === 'probe' ? [[r.probe, r.summary]] : [])),
  ) as Record<ProbeName, ProbeSummary>;
  const rows = report(villages, probes);

  const width = (key: 'name' | 'target' | 'measured'): number =>
    Math.max(...rows.map((r) => r[key].length));
  const line = (r: Row): string =>
    `${r.name.padEnd(width('name'))}  ${r.target.padEnd(width('target'))}  ${r.measured.padEnd(width('measured'))}  ${r.status}`;
  console.log(
    `Vzorek: ${config.villages} vsí × ${config.years} let, krok hráče ${STEP_DAYS} dní (sondy ${PROBE_SEEDS} vsí × ${PROBE_YEARS} let, ustálený oběh od ${PROBE_FROM_YEAR}. roku)`,
  );
  console.log(line({ name: 'Cíl', target: 'Spec', measured: 'Naměřeno', status: '–' }));
  for (const r of rows) console.log(line(r));
  const cpu = (pick: (v: VillageResult) => number): string =>
    fmt(villages.reduce((sum, v) => sum + pick(v), 0) / 1000);
  const replays =
    villages.reduce((sum, v) => sum + v.builder.replays + v.loner.replays + v.orchard.replays, 0) +
    results.reduce((sum, r) => sum + (r.kind === 'probe' ? r.replays : 0), 0);
  console.log(
    `Čas: ${fmt((performance.now() - started) / 1000)} s (CPU: hráč staví ${cpu((v) => v.ms.builder)} s, nestaví ${cpu((v) => v.ms.loner)} s, se sadem ${cpu((v) => v.ms.orchard)} s; vláken ${Math.max(1, Math.min(availableParallelism() - 1, tasks.length))}), přepočtů den po dni ${replays}`,
  );
}

if (isMainThread) {
  await main();
} else {
  parentPort?.on('message', (task: Task) => parentPort?.postMessage(runTask(task)));
}
