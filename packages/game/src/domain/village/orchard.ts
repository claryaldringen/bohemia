import { dateOfDayIndex } from '../calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { squareCenter } from './square-grid';
import type { CalendarDate } from '../calendar';
import { distanceFactor } from './fields';
import { applesSpoiled } from './food';
import { recordClearedObstacles } from './obstacles';
import { addLogs, logsFromClearedTrees } from './wood';
import {
  ORCHARD,
  ORCHARD_PLANTING_WINDOWS,
  ORCHARD_SEASON,
  ORCHARD_WINDOWS,
  PREMIUM_EFFECTS,
  ROAD_APPLES,
  type WindowSegment,
} from './rules';
import type {
  ChronicleEvent,
  Construction,
  Orchard,
  OrchardSquare,
  OrchardTaskName,
  OrchardWork,
  RoadApple,
  VillageState,
} from './types';

// Jabloňové sady (orchard.md): výsadba jako stavba ze společné práce v oknech jara a podzimu,
// rok sadu, úroda podle stáří, sezónní práce (sklizeň v září–říjnu, péče v zimě), obnova – od
// 50. roku sadu vesničané čtverce sami sázejí znovu (Obnova sadu) – a stárnutí: čtverec, na který
// obnova nedošla, se v 60. roce vrátí v louku. Čisté funkce a kroky simulace (mutují stav, volat
// na klonu).

const M2_PER_HA = 10_000;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = 365.25;
/** Tolerance zaokrouhlení podílu čtverců nahoru (40 × 0,1 nesmí dát 5). */
const SHARE_EPSILON = 1e-9;

type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

/** Sady vsi – vsi uložené před zavedením sadů je nemají (= žádné). */
export function villageOrchards(state: Pick<VillageState, 'orchards'>): Orchard[] {
  return state.orchards ?? [];
}

/** Zásoby jablek vsi (kg) – u vsí bez sadů 0. */
export function villageApplesKg(state: Pick<VillageState, 'applesKg'>): number {
  return state.applesKg ?? 0;
}

/** Leží měsíc v některém úseku okna? */
export function monthInWindow(segments: readonly WindowSegment[], month: number): boolean {
  return segments.some(([from, to]) => month >= from && month <= to);
}

/** První den sezóny (první den prvního měsíce okna) a den po jejím konci. */
export function seasonBounds(segments: readonly WindowSegment[]): {
  start: DayOfYear;
  end: DayOfYear;
} {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) throw new Error('Okno sezóny nemá žádný úsek.');
  return {
    start: { month: first[0], day: 1 },
    end: { month: (last[1] % MONTHS_PER_YEAR) + 1, day: 1 },
  };
}

const HARVEST_SEASON = seasonBounds(ORCHARD_WINDOWS.harvest);
/** Poslední měsíc sklizně jablek (říjen). */
const HARVEST_SEASON_LAST_MONTH = ORCHARD_WINDOWS.harvest[ORCHARD_WINDOWS.harvest.length - 1]![1];

/** Hospodářský rok sadu, do kterého den patří – začíná 1. 3. (rok jeho jara). */
export function orchardSeason(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  return month >= ORCHARD_SEASON.startMonth ? year : year - 1;
}

/**
 * První hospodářský rok čtverce vysazeného v den `plantedDay`: jarní výsadba roste už letos,
 * podzimní (od září) až od příštího jara; v lednu a únoru je příští jaro ještě letos.
 */
export function firstOrchardSeason(plantedDay: number): number {
  const { year, month } = dateOfDayIndex(plantedDay);
  return month >= ORCHARD_SEASON.autumnPlantingFromMonth ? year + 1 : year;
}

/** Rok sadu v den `day` – 1 = první hospodářský rok po výsadbě; před ním 0 a méně. */
export function orchardYear(plantedDay: number, day: number): number {
  return orchardSeason(day) - firstOrchardSeason(plantedDay) + 1;
}

/**
 * Podíl plné úrody v roce sadu `year` (orchard.md): do 5. roku nic, od 6. roku lineárně do plné
 * úrody ve 25. roce, plná do 50. roku, pak lineárně k nule v 60. roce.
 */
export function orchardYieldShare(year: number): number {
  const { firstFruitYear, fullYieldYear, declineAfterYear, endYear } = ORCHARD;
  if (year < firstFruitYear) return 0;
  if (year < fullYieldYear) {
    return (year - (firstFruitYear - 1)) / (fullYieldYear - (firstFruitYear - 1));
  }
  if (year <= declineAfterYear) return 1;
  if (year < endYear) return (endYear - year) / (endYear - declineAfterYear);
  return 0;
}

/** Cena výsadby čtverce: 80 člověkodní na hektar + překážky (jako u dílu pole). */
export function orchardPlantingCost(areaM2: number, obstacleCost: number): number {
  return ORCHARD.plantingPerHa * (areaM2 / M2_PER_HA) + obstacleCost;
}

/** Úroda čtverce při plné sklizni (kg jablek) v hospodářském roce dne `day`. */
export function squareYieldKg(square: OrchardSquare, day: number): number {
  return squareYieldKgInSeason(square, orchardSeason(day));
}

/** Úroda čtverce při plné sklizni (kg jablek) v hospodářském roce `season`. */
function squareYieldKgInSeason(square: OrchardSquare, season: number): number {
  if (square.plantedDay === null) return 0;
  const share = orchardYieldShare(season - firstOrchardSeason(square.plantedDay) + 1);
  const kg = ORCHARD.fullYieldKgPerHa * (square.areaM2 / M2_PER_HA) * share;
  // teplý jižní svah prémiové krajiny (premium-landscapes.md – Teplé jižní svahy)
  return square.sunny ? kg * PREMIUM_EFFECTS.southSlopeOrchard : kg;
}

/**
 * Hospodářský rok nejbližší sklizně jablek: během sklizně letošní, jinak příští (po sklizni až
 * za rok). Bez data – na podzim 1499 by příští sklizeň ležela mimo svět.
 */
export function nextHarvestSeason(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  return month > HARVEST_SEASON_LAST_MONTH ? year + 1 : year;
}

/**
 * Očekávaná úroda sadu při plné sklizni (kg jablek) nejbližší sklizně – letošní, nebo po ní
 * příští (orchard.md – panel sadu: odhad úrody).
 */
export function orchardExpectedYieldKg(orchard: Orchard, day: number): number {
  return orchard.squares.reduce((sum, s) => sum + squareExpectedYieldKg(s, day), 0);
}

/**
 * Očekávaná úroda čtverce sadu při plné sklizni (kg jablek) nejbližší sklizně – panel čtverce sadu
 * (orchard.md – Co hráč vidí); čtverce se liší stářím (obnova sadu).
 */
export function squareExpectedYieldKg(square: OrchardSquare, day: number): number {
  return squareYieldKgInSeason(square, nextHarvestSeason(day));
}

/** Plodí čtverec v hospodářském roce dne `day` (vysazený a úroda větší než nula)? */
export function squareBearing(square: OrchardSquare, day: number): boolean {
  return square.plantedDay !== null && orchardYieldShare(orchardYear(square.plantedDay, day)) > 0;
}

/**
 * Vzdálenost čtverce sadu pro práci (m): chůze po pěšinách a pevných cestách (`walkDistanceM` –
 * roads.md), bez ní (kalibrace, starší sady) vzdálenost od obydlí při založení.
 */
export function squareWalkDistance(
  square: Pick<OrchardSquare, 'distanceM' | 'walkDistanceM'>,
): number {
  return square.walkDistanceM ?? square.distanceM;
}

/**
 * Práce na sklizni čtverce (člověkodny): 8 na hektar při plné úrodě, při menší úrodě poměrně
 * méně; dražší se vzdáleností od obydlí jako polní práce (fields.md – Vzdálenost).
 */
export function squareHarvestWork(square: OrchardSquare, day: number): number {
  if (square.plantedDay === null) return 0;
  const share = orchardYieldShare(orchardYear(square.plantedDay, day));
  const ha = square.areaM2 / M2_PER_HA;
  return ORCHARD.harvestPerHa * ha * share * distanceFactor(squareWalkDistance(square));
}

/** Péče o vysazený čtverec za zimu (člověkodny): 10 na hektar, dražší se vzdáleností. */
export function squareCareWork(square: OrchardSquare): number {
  if (square.plantedDay === null) return 0;
  return (
    ORCHARD.carePerHa * (square.areaM2 / M2_PER_HA) * distanceFactor(squareWalkDistance(square))
  );
}

// --- jabloně u pevných cest (roads.md – Vysazení jabloní) – jako sad na strom ----------------

/** Plocha sadu na jednu jabloň (m²) – ≈ 180 stromů na hektar. */
const ROAD_APPLE_AREA_HA = 1 / ROAD_APPLES.treesPerHa;

/** Žije jabloň (vysazená, ještě ne souš) v den `day`? */
function appleAlive(apple: RoadApple, day: number): boolean {
  return apple.plantedDay !== null && (day - apple.plantedDay) / DAYS_PER_YEAR < ORCHARD.endYear;
}

/** Podíl plné úrody jabloně v hospodářském roce dne `day` (jako čtverec sadu). */
function roadAppleShare(apple: RoadApple, day: number): number {
  if (!appleAlive(apple, day)) return 0;
  return orchardYieldShare(orchardYear(apple.plantedDay!, day));
}

/** Plodí jabloň v hospodářském roce dne `day` (od 6. roku po výsadbu do konce života)? */
export function roadAppleBearing(apple: RoadApple, day: number): boolean {
  return roadAppleShare(apple, day) > 0;
}

/** Úroda jabloně při plné sklizni (kg) – ≈ 17 kg při plné úrodě. */
export function roadAppleYieldKg(apple: RoadApple, day: number): number {
  return ORCHARD.fullYieldKgPerHa * ROAD_APPLE_AREA_HA * roadAppleShare(apple, day);
}

/** Sklizeň jabloně (člověkodny) – jako sad na strom, dražší se vzdáleností od obydlí. */
export function roadAppleHarvestWork(apple: RoadApple, day: number): number {
  return (
    ORCHARD.harvestPerHa *
    ROAD_APPLE_AREA_HA *
    roadAppleShare(apple, day) *
    distanceFactor(apple.distanceM)
  );
}

/** Péče o jabloň za zimu (člověkodny) – jako sad na strom. */
export function roadAppleCareWork(apple: RoadApple, day: number): number {
  if (!appleAlive(apple, day)) return 0;
  return ORCHARD.carePerHa * ROAD_APPLE_AREA_HA * distanceFactor(apple.distanceM);
}

/** Výsadba jedné jabloně (člověkodny) – 80 čd na hektar ≈ 0,45 čd na strom. */
export function roadApplePlantingWork(): number {
  return ORCHARD.plantingPerHa * ROAD_APPLE_AREA_HA;
}

/** Plocha sadu (m²). */
export function orchardAreaM2(orchard: Orchard): number {
  return orchard.squares.reduce((sum, s) => sum + s.areaM2, 0);
}

/**
 * Stáří sadu v celých letech od výsadby (průměr vysazených čtverců vážený plochou – čtverce
 * vysazené v různých oknech se liší o rok, obnovou sad postupně mládne); dokud není nic
 * vysazeno, null.
 */
export function orchardAgeYears(orchard: Orchard, day: number): number | null {
  const planted = orchard.squares.filter((s) => s.plantedDay !== null);
  const area = planted.reduce((sum, s) => sum + s.areaM2, 0);
  if (planted.length === 0 || area <= 0) return null;
  const days = planted.reduce((sum, s) => sum + (day - (s.plantedDay ?? day)) * s.areaM2, 0);
  return Math.max(0, Math.floor(days / area / DAYS_PER_YEAR));
}

// --- výsadba (stavba) -------------------------------------------------------------------------

function orchardOf(state: VillageState, c: Construction): Orchard | undefined {
  return villageOrchards(state).find((o) => o.id === c.orchardId);
}

/**
 * Čtverce, které stavba sází, od nejbližšího k obydlím (při shodě po řádcích): výsadba
 * nevysazené čtverce, obnova čtverce zařazené do ní (i ty, kde ještě stojí staré stromy).
 */
function plantingSquares(orchard: Orchard, c: Construction): OrchardSquare[] {
  return orchard.squares
    .filter((s) =>
      c.renewal ? s.renewal === c.id : s.renewal === undefined && s.plantedDay === null,
    )
    .sort((a, b) => a.distanceM - b.distanceM || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
}

/** Čtverec obnovy, na kterém ještě stojí staré stromy (práce na něj nedošla). */
function awaitsFelling(square: OrchardSquare): boolean {
  return square.renewal !== undefined && square.plantedDay !== null;
}

/**
 * Čtverce, na kterých se dnes dá sázet: staré stromy obnovy se nekácejí, dokud běží sklizeň
 * jablek – její úroda se počítá i z nich (orchard.md – Obnova sadu).
 */
function workableSquares(state: VillageState, orchard: Orchard, c: Construction): OrchardSquare[] {
  const squares = plantingSquares(orchard, c);
  const harvesting =
    state.orchardWork?.task === 'harvest' && orchardWorkRemaining(state.orchardWork) > 0;
  return harvesting ? squares.filter((s) => !awaitsFelling(s)) : squares;
}

/** Výsadba obnovovaného čtverce – jako výsadba, překážky na něm už nejsou. */
function renewalPlantingCost(square: OrchardSquare): number {
  return orchardPlantingCost(square.areaM2, 0);
}

/** Kolik práce čtverci do vysazení chybí (u čtverce obnovy se starými stromy celá výsadba). */
function squarePlantingNeed(square: OrchardSquare): number {
  return awaitsFelling(square)
    ? renewalPlantingCost(square)
    : square.plantingCost - square.plantingDone;
}

/** Je výsadba (obnova) sadu hotová (všechny její čtverce vysazené, nebo sad zanikl)? */
export function isOrchardPlanted(state: VillageState, c: Construction): boolean {
  const orchard = orchardOf(state, c);
  return !orchard || plantingSquares(orchard, c).length === 0;
}

/**
 * Kolik práce výsadbě (obnově) dnes chybí – jen v oknech výsadby (jaro, podzim); mimo ně stavba
 * sadu společnou práci nebere a čeká.
 */
export function orchardPlantingNeed(state: VillageState, c: Construction, day: number): number {
  const orchard = orchardOf(state, c);
  if (!orchard || !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month)) return 0;
  return workableSquares(state, orchard, c).reduce((sum, s) => sum + squarePlantingNeed(s), 0);
}

/** Krajina sídla má pevnou velikost (landscape/world.ts). */
const GEOMETRY = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M } as const;

/** Střed čtverce sadu ve světě (m) – místo kácení pro hromadu klád (`addLogs`). */
export function orchardSquareCenter(
  orchard: Pick<Orchard, 'grid'>,
  square: Pick<OrchardSquare, 'cell'>,
): { x: number; z: number } {
  return squareCenter(GEOMETRY, orchard.grid, square.cell);
}

/**
 * Vloží společnou práci do výsadby (mutuje stav): čtverce od nejbližšího, přebytek dne teče do
 * dalšího. Překážky z čtverce zmizí natrvalo, jakmile na něm práce začne (nejdřív se vyklidí,
 * pak se zatloukají kůly a sázejí stromky – sazenice tak nestojí mezi kameny a keři), vysazený
 * čtverec dostane den výsadby. Obnova (orchard.md – Obnova sadu) s první prací na čtverci skácí
 * staré stromy a sází ho znovu; vysazený čtverec z obnovy vypadne. `completes` = výsadba dostala
 * vše, co jí dnes chyběla.
 */
export function plantOrchard(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
): void {
  const orchard = orchardOf(state, c);
  if (!orchard) return;
  let left = amount;
  let used = 0;
  for (const square of workableSquares(state, orchard, c)) {
    if (!completes && left <= 0) break;
    if (awaitsFelling(square)) {
      // staré stromy se skácí – čtverec roste znovu od sazenic
      square.plantedDay = null;
      square.plantingCost = renewalPlantingCost(square);
      square.plantingDone = 0;
    }
    if (square.obstacles) {
      recordClearedObstacles(state, square.obstacles, day);
      delete square.obstacles;
    }
    // dospělé stromy z vyklizeného čtverce dají klády na hromadu jako u dílu pole (forest.md)
    if (square.trees) {
      addLogs(state, logsFromClearedTrees(square.trees), orchardSquareCenter(orchard, square));
      delete square.trees;
    }
    const need = square.plantingCost - square.plantingDone;
    if (completes || left >= need) {
      left -= need;
      used += need;
      square.plantingDone = square.plantingCost;
      square.plantedDay = day;
      delete square.renewal;
    } else {
      square.plantingDone += left;
      used += left;
      break;
    }
  }
  // obnova počítá jen svou práci – vysazené čtverce z ní vypadly
  c.done = c.renewal
    ? Math.min(c.cost, c.done + used)
    : orchard.squares.reduce((sum, s) => sum + s.plantingDone, 0);
}

// --- sezónní práce -----------------------------------------------------------------------------

const CARE_SEASON = seasonBounds(ORCHARD_WINDOWS.care);

function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

/** Úloha sezónní práce pro rozdělení práce vsi. */
export const ORCHARD_TASK_NAMES: Record<OrchardWork['task'], OrchardTaskName> = {
  harvest: 'orchard-harvest',
  care: 'orchard-care',
};

/** Kolik sezónní práce v sadech zbývá (0, když žádná neběží). */
export function orchardWorkRemaining(work: OrchardWork | null | undefined): number {
  return work ? Math.max(0, work.required - work.done) : 0;
}

/** Sklizeno jablek (kg) z rozběhnuté sklizně – úroda × hotový podíl práce. */
export function harvestedApplesKg(work: OrchardWork): number {
  if (work.task !== 'harvest' || work.required <= 0) return 0;
  return work.yieldKg * Math.min(1, work.done / work.required);
}

/** Začátek hospodářského roku sadu (1. 3.) – tehdy dosloužilé čtverce zarostou loukou. */
const SEASON_START: DayOfYear = { month: ORCHARD_SEASON.startMonth, day: 1 };

/**
 * Začátek dne v sadech (mutuje stav, před prací a jídlem dne). 1. 3.: nesnědená jablka shnijí
 * (v nádobách později – `applesSpoiled` podle pokrytí nádobami, crafts.md), péče končí
 * a čtverce v 60. roce sadu se vrátí v louku. 1. 9.: sklizeň (práce podle úrody). 1. 11.: konec
 * sklizně – nesklizená jablka spadla a shnila. 1. 12.: péče o vysazené stromy. Každý den v oknech
 * výsadby: vesničané zařadí staré čtverce do obnovy (`renewOrchards`).
 */
export function orchardSeasonDay(
  state: VillageState,
  day: number,
  potteryCoverage = 0,
): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  const events: ChronicleEvent[] = [];
  if (applesSpoiled(day, potteryCoverage)) rotApples(state);
  if (isOn(date, CARE_SEASON.end) && state.orchardWork?.task === 'care') state.orchardWork = null;
  if (isOn(date, SEASON_START)) events.push(...retireOrchards(state, day));
  if (isOn(date, HARVEST_SEASON.end) && state.orchardWork?.task === 'harvest') {
    const kg = Math.round(harvestedApplesKg(state.orchardWork));
    if (kg > 0) events.push({ day, kind: 'apple-harvest', kg });
    state.orchardWork = null;
  }
  if (isOn(date, HARVEST_SEASON.start)) startWork(state, day, 'harvest');
  if (isOn(date, CARE_SEASON.start)) startWork(state, day, 'care');
  events.push(...renewOrchards(state, day));
  return events;
}

/**
 * Podíl letošních jablek sadů, který zbyl po krupobití téhož roku (`disasters.hail.apples` –
 * disasters.md, Kroupy); bez krupobití 1.
 */
export function applesAfterHail(state: Pick<VillageState, 'disasters'>, day: number): number {
  const hail = state.disasters?.hail;
  if (hail?.apples === undefined || hail.day > day) return 1;
  return dateOfDayIndex(hail.day).year === dateOfDayIndex(day).year ? hail.apples : 1;
}

/**
 * Rozběhne sezónní práci ve všech sadech i u jabloní podél pevných cest (roads.md – jabloně jako
 * sad na strom); bez potřebné práce žádnou.
 */
function startWork(state: VillageState, day: number, task: OrchardWork['task']): void {
  const squares = villageOrchards(state).flatMap((o) => o.squares);
  const apples = state.roads?.apples ?? [];
  const required =
    squares.reduce(
      (sum, s) => sum + (task === 'harvest' ? squareHarvestWork(s, day) : squareCareWork(s)),
      0,
    ) +
    apples.reduce(
      (sum, a) =>
        sum + (task === 'harvest' ? roadAppleHarvestWork(a, day) : roadAppleCareWork(a, day)),
      0,
    );
  // kroupy téhož roku potloukly jablka v sadech (disasters.md – Kroupy)
  const yieldKg =
    task === 'harvest'
      ? squares.reduce((s, q) => s + squareYieldKg(q, day), 0) * applesAfterHail(state, day) +
        apples.reduce((s, a) => s + roadAppleYieldKg(a, day), 0)
      : 0;
  if (required > 0) state.orchardWork = { task, required, done: 0, yieldKg };
  // ves bez sadů (i uložená před jejich zavedením) stav nemění
  else if (state.orchardWork !== undefined) state.orchardWork = null;
}

/**
 * Práce dne v sadech (mutuje stav): sklizeň přidá jablka do zásob poměrně k hotové práci
 * (sklízí se postupně, jí se hned), péče je jen práce.
 */
export function workOrchards(state: VillageState, amount: number): void {
  const work = state.orchardWork;
  if (!work || amount <= 0) return;
  const before = harvestedApplesKg(work);
  work.done = Math.min(work.required, work.done + amount);
  const gained = harvestedApplesKg(work) - before;
  if (gained > 0) state.applesKg = villageApplesKg(state) + gained;
}

/** 1. 3. (v nádobách později): jablka, která se nesnědla, shnila (mutuje stav). */
function rotApples(state: VillageState): void {
  if (state.applesKg !== undefined) state.applesKg = 0;
}

/**
 * 1. 3.: čtverce v 60. roce sadu se vrátí v louku (stromy dosloužily – orchard.md) – i ty, které
 * čekaly na obnovu a práce na ně nedošla. Sad bez čtverců zanikne a kronika to zapíše.
 */
function retireOrchards(state: VillageState, day: number): ChronicleEvent[] {
  const orchards = state.orchards;
  if (!orchards || orchards.length === 0) return [];
  const events: ChronicleEvent[] = [];
  for (const orchard of orchards) {
    const before = orchard.squares.length;
    orchard.squares = orchard.squares.filter(
      (s) => s.plantedDay === null || orchardYear(s.plantedDay, day) < ORCHARD.endYear,
    );
    if (before > 0 && orchard.squares.length === 0) {
      events.push({ day, kind: 'orchard-gone', orchardId: orchard.id });
    }
  }
  state.orchards = orchards.filter((o) => o.squares.length > 0);
  return events;
}

// --- obnova sadu -------------------------------------------------------------------------------

/**
 * Kolik čtverců sadu o `squares` čtvercích se za rok sadu nejvýš obnoví: desetina, zaokrouhleno
 * nahoru, aspoň 1 (orchard.md – Obnova sadu).
 */
export function renewalQuota(squares: number): number {
  return Math.max(1, Math.ceil(squares * ORCHARD.renewalShareYear - SHARE_EPSILON));
}

/**
 * Patří čtverec v den `day` do obnovy? Vysazený čtverec od 50. roku sadu – posledního roku plné
 * úrody; do 60. roku tak na obnovu zbývá 10 let (orchard.md – Obnova sadu).
 */
export function squareDueForRenewal(square: OrchardSquare, day: number): boolean {
  return (
    square.plantedDay !== null && orchardYear(square.plantedDay, day) >= ORCHARD.declineAfterYear
  );
}

/**
 * Vyvrácené čtverce sadu (disasters.md – Smršť): ves je obnoví jako staré (orchard.md – Obnova
 * sadu) – stromy leží, čtverec se sází znovu bez překážek (`plantedDay` null). Rozestavěná obnova
 * sadu je převezme, rozestavěná výsadba také; jinak vznikne nová obnova (bez kvóty – vyvrácené
 * stromy nečekají). Nevysazené čtverce nic. Mutuje stav, vrátí počet vyvrácených čtverců.
 */
export function uprootOrchardSquares(
  state: VillageState,
  day: number,
  orchard: Orchard,
  squares: readonly OrchardSquare[],
): number {
  const c = state.constructions.find((x) => x.kind === 'orchard' && x.orchardId === orchard.id);
  const fresh: OrchardSquare[] = [];
  let count = 0;
  for (const square of squares) {
    if (square.plantedDay === null) continue;
    const before = square.plantingCost;
    square.plantedDay = null;
    square.plantingCost = renewalPlantingCost(square);
    square.plantingDone = 0;
    count++;
    // čtverec už zařazený do obnovy má výsadbu v její ceně
    if (square.renewal !== undefined) continue;
    if (c && !c.renewal) c.cost += square.plantingCost - before;
    else fresh.push(square);
  }
  if (fresh.length === 0) return count;
  const cost = fresh.reduce((sum, s) => sum + s.plantingCost, 0);
  if (c?.renewal) {
    for (const square of fresh) square.renewal = c.id;
    c.cost += cost;
    return count;
  }
  const id = state.nextId++;
  for (const square of fresh) square.renewal = id;
  state.constructions.push({
    id,
    kind: 'orchard',
    startedDay: day,
    cost,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    orchardId: orchard.id,
    renewal: true,
  });
  return count;
}

/**
 * Vesničané sami obnovují staré sady (mutuje stav, na začátku dne – orchard.md – Obnova sadu):
 * v oknech výsadby zařadí do obnovy čtverce od 50. roku sadu, nejstarší první (při shodě
 * v pořadí čtverců), nejvýš `renewalQuota` – jednou za rok sadu a jen když sad nemá
 * rozestavěnou výsadbu ani předchozí obnovu. Obnova je stavba sadu ze společné práce
 * (`Construction.renewal`) – nečeká na hráče ani na suroviny, jako přestavba obydlí. Rozhoduje
 * jen stav a den, ne kousky dopočtu – staré sady (i uložené dřív) se zařadí samy.
 */
function renewOrchards(state: VillageState, day: number): ChronicleEvent[] {
  const orchards = state.orchards;
  if (!orchards || orchards.length === 0) return [];
  if (!monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month)) return [];
  const season = orchardSeason(day);
  const events: ChronicleEvent[] = [];
  for (const orchard of orchards) {
    if (orchard.renewedSeason === season) continue;
    if (state.constructions.some((c) => c.kind === 'orchard' && c.orchardId === orchard.id)) {
      continue;
    }
    const due = orchard.squares
      .map((square, index) => ({ square, index }))
      .filter(({ square }) => squareDueForRenewal(square, day))
      .sort((a, b) => (a.square.plantedDay ?? 0) - (b.square.plantedDay ?? 0) || a.index - b.index)
      .slice(0, renewalQuota(orchard.squares.length))
      .map(({ square }) => square);
    if (due.length === 0) continue;
    const id = state.nextId++;
    for (const square of due) square.renewal = id;
    orchard.renewedSeason = season;
    state.constructions.push({
      id,
      kind: 'orchard',
      startedDay: day,
      cost: due.reduce((sum, s) => sum + renewalPlantingCost(s), 0),
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      orchardId: orchard.id,
      renewal: true,
    });
    events.push({
      day,
      kind: 'orchard-renewal-started',
      orchardId: orchard.id,
      squares: due.length,
    });
  }
  return events;
}
