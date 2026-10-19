import { dateOfDayIndex, dayIndexOf, isLeapYear } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { HAY, isHayWinter, oxenHayCoverage, villageHayKg } from './hay';
import { butcher, ensureLivestock, LIVESTOCK } from './livestock';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import { PLOUGH_HA_PER_DAY, ploughWorkPerHa } from './plough';
import { FELLING_MAN_DAYS_PER_TREE, PLANNING_DAY } from './rules';
import { copyGrid } from './square-grid';
import type { ChronicleEvent, Pen, SquareGrid, TileCell, VillageState } from './types';
import type { Walk } from './paths/walking';
import { addLogs, claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';
import { planCrops, ploughToHoe } from './year-plan';

// Ohrada, spřežení volů a orba rádlem (oxen.md, schváleno 18. 10. 2026). Ohrada je stavba na
// jednom čtverci louky (40 člověkodní a 6 stromů). V ohradě hráč zadá výcvik spřežení: dvě telata
// z vlastního stáda krav se za 2 roky vycvičí, vesničané k tomu vyrobí rádlo (1 strom
// a 5 člověkodní). Spřežení orá ≈ 10 let, pak voli zestárnou a jdou na maso. Přes zimu voli žerou
// seno – když chybí přes polovinu, jeden uhyne a spřežení se rozpadne; když chybí méně, slabí voli
// orají na jaře pomaleji (podíl kapacity podle pokrytí). Ves se spřežením orá všechno a nekope
// (oxen.md – Jen rádlo); přijde-li o poslední spřežení, letošní plán dokončí motyka.

/**
 * oxen.md (návrh Clauda, Martin schválil): výcvik ≈ 2 roky, spřežení slouží ≈ 10 let, 2 voli;
 * telata z vlastního stáda – ves potřebuje aspoň 3 krávy (dvě telata jdou do výcviku, chovná
 * kráva zůstane – návrh Clauda při implementaci).
 */
export const OXEN = { trainingYears: 2, serviceYears: 10, teamSize: 2, minCows: 3 } as const;
/** oxen.md – Ohrada: 40 člověkodní a 6 stromů (kůly, přístřešek). */
export const PEN = { laborManDays: 40, trees: 6 } as const;
/** oxen.md – Spřežení: rádlo z 1 stromu za 5 člověkodní. */
export const ARD = { laborManDays: 5, trees: 1 } as const;

const DAYS_PER_YEAR = 365.25;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Ohrady vsi (vsi bez ohrad prázdné). */
export function villagePens(state: Pick<VillageState, 'pens'>): Pen[] {
  return state.pens ?? [];
}

/** Voli ohrady – spřežení a telata ve výcviku. */
export function penOxen(pen: Pen): number {
  return (pen.team ? OXEN.teamSize : 0) + (pen.training ? OXEN.teamSize : 0);
}

/** Voli vsi (spřežení i výcvik) – žerou seno a spásají pastvu jako krávy. */
export function villageOxen(state: Pick<VillageState, 'pens'>): number {
  return villagePens(state).reduce((sum, pen) => sum + penOxen(pen), 0);
}

/** Kolik spřežení ves má – kolik ohrad má vycvičené voly. */
export function ableTeams(state: Pick<VillageState, 'pens'>): number {
  return villagePens(state).filter((pen) => pen.team !== null).length;
}

/**
 * Kolik orby spřežení vsi za den zvládnou (člověkodny): ≈ 0,3 ha na spřežení za sazbu orby
 * podle pokrytí nástroji. Slabí voli po zimě bez dost sena (`team.weak`) orají v den `day` od
 * 1. 3. do konce hospodářského roku jen podílem; bez dne plnou silou.
 */
export function ploughCapacityPerDay(
  state: Pick<VillageState, 'pens'>,
  toolCoverage: number,
  day?: number,
): number {
  const afterWinter = day !== undefined && dateOfDayIndex(day).month < PLANNING_DAY.month;
  const teams = villagePens(state).reduce(
    (sum, pen) => sum + (pen.team ? (afterWinter ? (pen.team.weak ?? 1) : 1) : 0),
    0,
  );
  return teams * PLOUGH_HA_PER_DAY * ploughWorkPerHa(toolCoverage);
}

/** Průběh výcviku 0–1 (bez výcviku null). */
export function trainingProgress(pen: Pen, day: number): number | null {
  if (!pen.training) return null;
  return Math.min(
    1,
    Math.max(0, (day - pen.training.startDay) / (OXEN.trainingYears * DAYS_PER_YEAR)),
  );
}

/** Stáří spřežení v celých letech (bez spřežení null). */
export function teamAgeYears(pen: Pen, day: number): number | null {
  return pen.team ? Math.floor((day - pen.team.readyDay) / DAYS_PER_YEAR) : null;
}

/** Rádlo pro výcvik ohrady se ještě vyrábí (stavba `ard`). */
function ardPending(state: VillageState, penId: number): boolean {
  return state.constructions.some((c) => c.kind === 'ard' && c.penId === penId);
}

/** Zruší rozestavěné rádlo ohrady – klády, které vzalo z hromady, se vrátí (mutuje stav). */
function dropArd(state: VillageState, penId: number): void {
  state.constructions = state.constructions.filter((c) => {
    const drop = c.kind === 'ard' && c.penId === penId;
    if (drop && c.wood) addLogs(state, c.wood.fromPile);
    return !drop;
  });
}

/**
 * Letošní plán, který oralo spřežení, dokončí motyka – ves už žádné spřežení nemá (mutuje stav;
 * oxen.md – Jen rádlo). Jen letos: plán k 1. 9. už vznikne bez orby.
 */
function finishPlanByHoe(state: VillageState, toolCoverage: number): void {
  if (!state.plan || ableTeams(state) > 0) return;
  const crops = planCrops(state.plan);
  if (!crops.some(({ work }) => work.plough)) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { crop, work } of crops) ploughToHoe(work, partsById, toolCoverage, crop);
}

/** Spřežení dosloužilo nebo se rozpadlo – voli (živí) jdou na maso (mutuje stav). */
function retireTeam(state: VillageState, pen: Pen, oxen: number): void {
  pen.team = null;
  butcher(state, oxen * LIVESTOCK.oxMeatKg);
}

/**
 * Den ohrad (mutuje stav): výcvik je hotový (2 roky a hotové rádlo) – staré spřežení dosloužilo,
 * nové orá; spřežení starší než 10 let zestárlo a jde na maso. 1. 3. (konec zimy) rozhodne
 * pokrytí sena: pod polovinu jeden vůl uhyne a spřežení i výcvik se rozpadnou, jinak slabí voli
 * orají na jaře jen podílem kapacity podle pokrytí (`team.weak`). Když ves přijde o poslední
 * spřežení, letošní plán dokončí motyka (`finishPlanByHoe`). Vrátí události kroniky.
 */
export function penDay(
  state: VillageState,
  day: number,
  winterEnd: boolean,
  toolCoverage: number,
): ChronicleEvent[] {
  const pens = villagePens(state);
  if (pens.length === 0) {
    finishPlanByHoe(state, toolCoverage);
    return [];
  }
  const events: ChronicleEvent[] = [];
  if (winterEnd) {
    const oxen = villageOxen(state);
    const coverage = oxenHayCoverage(state, oxen);
    if (oxen > 0 && coverage < HAY.deathBelowCoverage - EPSILON) {
      for (const pen of pens) {
        if (pen.team) {
          retireTeam(state, pen, OXEN.teamSize - 1);
          events.push({ day, kind: 'ox-died', penId: pen.id, training: false });
        }
        if (pen.training) {
          pen.training = null;
          dropArd(state, pen.id);
          butcher(state, (OXEN.teamSize - 1) * LIVESTOCK.oxMeatKg);
          events.push({ day, kind: 'ox-died', penId: pen.id, training: true });
        }
      }
    } else {
      // slabí voli orají na jaře pomaleji – nekope se, co nezorají, se nezaseje (oxen.md – Jen rádlo)
      for (const pen of pens) {
        if (!pen.team) continue;
        if (coverage < 1 - EPSILON) pen.team.weak = coverage;
        else delete pen.team.weak;
      }
    }
  }
  for (const pen of pens) {
    if (pen.team && day - pen.team.readyDay >= OXEN.serviceYears * DAYS_PER_YEAR) {
      retireTeam(state, pen, OXEN.teamSize);
      events.push({ day, kind: 'team-retired', penId: pen.id });
    }
    const progress = trainingProgress(pen, day);
    if (progress !== null && progress >= 1 && !ardPending(state, pen.id)) {
      if (pen.team) {
        retireTeam(state, pen, OXEN.teamSize);
        events.push({ day, kind: 'team-retired', penId: pen.id });
      }
      pen.team = { readyDay: day };
      pen.training = null;
      events.push({ day, kind: 'team-ready', penId: pen.id });
    }
  }
  finishPlanByHoe(state, toolCoverage);
  return events;
}

/** Plán dřeva stavby v ohradě (ohrada, rádlo) – klády z hromady, zbytek nejbližší stromy. */
function penWood(
  state: VillageState,
  trees: number,
  position: { x: number; z: number },
  day: number,
  obstacles: ObstacleLayer | null,
  clearedIds: readonly number[] = [],
  clearedTrees = 0,
  walk?: Walk,
): WoodPlan {
  return planWoodFrom(
    trees,
    position,
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    { obstacles, clearedIds, clearedTrees, ...(walk ? { walk } : {}) },
  );
}

/** Roky česky: 1 rok, 2–4 roky, 5 a víc let. */
function yearsCs(n: number): string {
  if (n === 1) return '1 rok';
  return n >= 2 && n <= 4 ? `${n} roky` : `${n} let`;
}

/**
 * Kdy smí ohrada se spřežením začít cvičit náhradu (oxen.md – Spřežení, Martin 18. 10. 2026):
 * až v posledních OXEN.trainingYears letech služby, aby nový pár byl hotový, když starý doslouží.
 * Spřežení slouží ještě (celé roky jako v panelu ohrady), nebo null – výcvik už jde.
 */
export function serviceYearsBeforeTraining(pen: Pen, day: number): number | null {
  if (!pen.team) return null;
  const served = day - pen.team.readyDay;
  if (served >= (OXEN.serviceYears - OXEN.trainingYears) * DAYS_PER_YEAR - EPSILON) return null;
  return OXEN.serviceYears - Math.floor(served / DAYS_PER_YEAR);
}

/** Dní zimního krmení od dneška do konce března včetně dneška (mimo zimu 0). */
function hayWinterDaysLeft(day: number): number {
  if (!isHayWinter(day)) return 0;
  const { year, month } = dateOfDayIndex(day);
  if (month <= 3) return dayIndexOf({ year, month: 4, day: 1 }) - day;
  // listopad a prosinec – do Silvestra a pak leden až březen příštího roku (bez dayIndexOf za
  // koncem světa)
  const newYear = dayIndexOf({ year, month: 12, day: 31 }) + 1;
  return newYear - day + 31 + (isLeapYear(year + 1) ? 29 : 28) + 31;
}

/**
 * Proč v ohradě teď nezačne výcvik spřežení (česky), nebo null – výcvik začne sám
 * (`trainTeamsWhenReady`): ohrada stojí, nic se v ní necvičí, vycvičené spřežení je v posledních
 * 2 letech služby (náhrada naváže, když starý pár doslouží – Martin; kdo chce dvě spřežení,
 * postaví druhou ohradu), stádo má aspoň 3 krávy (dvě telata), na rádlo je strom (kláda, nebo
 * strom ke kácení) a v zimě vystačí seno volům i telatům do konce března.
 */
export function trainingBlock(
  state: VillageState,
  penId: number,
  day: number,
  obstacles: ObstacleLayer | null,
): string | null {
  const pen = villagePens(state).find((p) => p.id === penId);
  if (!pen) return 'Ohrada neexistuje.';
  if (pen.builtDay === null) return 'Ohrada se ještě staví.';
  if (pen.training) return 'Spřežení se už cvičí.';
  const serving = serviceYearsBeforeTraining(pen, day);
  if (serving !== null) return `Spřežení slouží ještě ${yearsCs(serving)}.`;
  if ((state.livestock?.herds.cow ?? 0) < OXEN.minCows - EPSILON) {
    return `Na výcvik chybí telata – stádo potřebuje aspoň ${OXEN.minCows} krávy.`;
  }
  const winterHay = (villageOxen(state) + OXEN.teamSize) * HAY.dailyKg.ox * hayWinterDaysLeft(day);
  if (villageHayKg(state) < winterHay - EPSILON) return 'Na výcvik chybí seno.';
  if (penWood(state, ARD.trees, pen, day, obstacles).missing > 0) return 'Na rádlo chybí dřevo.';
  return null;
}

/**
 * Výcvik spřežení začne sám (oxen.md – Spřežení; Martin 19. 10. 2026: „Ať se spřežení cvičí
 * automaticky, bez zásahu hráče.“ – mutuje stav): v každé ohradě, kde dnes výcvik jde
 * (`trainingBlock`), jdou dvě telata ze stáda krav do výcviku a vesničané vyrobí rádlo – stavba ze
 * společné práce (5 člověkodní) se dřevem (kláda z hromady, nebo strom ke kácení u ohrady). Za
 * 2 roky (a s hotovým rádlem) spřežení orá. `walk` (chůze ke stromům po pevných cestách) se
 * spočítá, jen když výcvik opravdu začne.
 */
export function trainTeamsWhenReady(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: () => Walk,
): void {
  for (const pen of villagePens(state)) {
    if (trainingBlock(state, pen.id, day, obstacles) === null) {
      startTraining(state, day, pen, obstacles, walk?.());
    }
  }
}

/** Zahájí výcvik v ohradě – telata do výcviku, stavba rádla (mutuje stav). */
function startTraining(
  next: VillageState,
  day: number,
  pen: Pen,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): void {
  const livestock = ensureLivestock(next);
  livestock.herds.cow = Math.max(0, livestock.herds.cow - OXEN.teamSize);
  pen.training = { startDay: day };
  const wood = takeWood(next, penWood(next, ARD.trees, pen, day, obstacles, [], 0, walk));
  next.constructions.push({
    id: next.nextId++,
    kind: 'ard',
    startedDay: day,
    cost: ARD.laborManDays + wood.fell.reduce((sum, t) => sum + t.cost, 0),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    penId: pen.id,
    wood,
  });
}

/** Ohrada k zahájení – čtverec, jeho střed a překážky na něm (`checkPenPlacement`). */
export interface PenInput {
  /** Čtverec ohrady v mřížce `grid`; bez ní políčko krajiny. */
  cell: TileCell;
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Práce navíc za překážky na čtverci (člověkodny). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: readonly number[];
  /** Dospělé stromy mezi nimi – dají klády na hromadu. */
  clearedTrees: number;
  /**
   * Čtverec pole pod ohradou (`takenLand` z kontroly) – z pole zmizí (fields.md – Pole jako
   * krajina; `foundPen`).
   */
  takenLand?: readonly {
    cell: TileCell;
    grid?: SquareGrid;
    areaM2: number;
    cellAreaM2: number;
  }[];
}

/** Práce na ohradě bez dřeva – cena ohrady minus kácení jejích stromů u blízkého lesa. */
export function penBuildLabor(): number {
  return PEN.laborManDays - PEN.trees * FELLING_MAN_DAYS_PER_TREE;
}

/** Práce na ohradě jako při zahájení stavby: stavba, překážky a kácení stromů z plánu dřeva. */
export function penLaborManDays(obstacleCost: number, wood: Pick<WoodPlan, 'fell'>): number {
  return penBuildLabor() + obstacleCost + wood.fell.reduce((sum, t) => sum + t.cost, 0);
}

/** Plán dřeva ohrady (6 stromů – klády z hromady, zbytek nejbližší stromy k ohradě). */
export function planPenWood(
  state: VillageState,
  input: Pick<PenInput, 'x' | 'z' | 'obstacleIds' | 'clearedTrees'>,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): WoodPlan {
  return penWood(
    state,
    PEN.trees,
    input,
    day,
    obstacles,
    input.obstacleIds,
    input.clearedTrees,
    walk,
  );
}

/**
 * Zahájí stavbu ohrady (oxen.md): čtverec louky s pleteným plotem a přístřeškem – stavba ze
 * společné práce (osadníci nejsou potřeba). Překážky na čtverci osadníci odstraní hned, dospělé
 * stromy z něj dají klády; dřevo (6 stromů) vezme stavba z hromady, zbytek vyhradí ke kácení.
 * RangeError, když dřevo nestačí. Umístění ověří `checkPenPlacement`.
 */
export function startPen(
  state: VillageState,
  day: number,
  input: PenInput,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): VillageState {
  const plan = planPenWood(state, input, day, obstacles, walk);
  if (plan.missing > 0) throw new RangeError('Na ohradu chybí dřevo – klády ani stromy nestačí.');
  const next = structuredClone(state);
  recordClearedObstacles(next, input.obstacleIds, day);
  const wood = takeWood(next, plan);
  const penId = next.nextId++;
  (next.pens ??= []).push({
    id: penId,
    cell: { x: input.cell.x, y: input.cell.y },
    ...(input.grid ? { grid: copyGrid(input.grid) } : {}),
    x: input.x,
    z: input.z,
    builtDay: null,
    team: null,
    training: null,
  });
  next.constructions.push({
    id: next.nextId++,
    kind: 'pen',
    startedDay: day,
    cost: penLaborManDays(input.obstacleCost, plan),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    penId,
    wood,
  });
  return next;
}

/** Dostavěná ohrada (mutuje stav). */
export function finishPen(state: VillageState, penId: number, day: number): void {
  const pen = villagePens(state).find((p) => p.id === penId);
  if (pen) pen.builtDay = day;
}
