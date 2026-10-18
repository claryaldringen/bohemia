import type { ObstacleLayer } from '../landscape';
import { HAY, oxenHayCoverage } from './hay';
import { butcher, ensureLivestock, LIVESTOCK } from './livestock';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import { PLOUGH_HA_PER_DAY, ploughWorkPerHa } from './plough';
import { fieldWorkPerHa } from './productivity';
import { FELLING_MAN_DAYS_PER_TREE } from './rules';
import type { ChronicleEvent, CropWork, FieldPart, Pen, TileCell, VillageState } from './types';
import { addLogs, claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';
import { partWeight, planCrops } from './year-plan';

// Ohrada, spřežení volů a orba rádlem (oxen.md, schváleno 18. 10. 2026). Ohrada je stavba na
// jednom čtverci louky (40 člověkodní a 6 stromů). V ohradě hráč zadá výcvik spřežení: dvě telata
// z vlastního stáda krav se za 2 roky vycvičí, vesničané k tomu vyrobí rádlo (1 strom
// a 5 člověkodní). Spřežení orá ≈ 10 let, pak voli zestárnou a jdou na maso. Přes zimu voli žerou
// seno – když chybí přes polovinu, jeden uhyne a spřežení se rozpadne; když chybí méně, slabí voli
// na jaře zorají jen podíl podle pokrytí a zbytek se dokope motykou.

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
 * podle pokrytí nástroji.
 */
export function ploughCapacityPerDay(
  state: Pick<VillageState, 'pens'>,
  toolCoverage: number,
): number {
  return ableTeams(state) * PLOUGH_HA_PER_DAY * ploughWorkPerHa(toolCoverage);
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
 * Vrátí orbu motyce (mutuje `work`): díly od konce řady orby, které spřežení ještě nezačalo – tolik,
 * kolik po celých dílech nejlépe odpovídá podílu `fraction` zbývající orby; s `all` všechny
 * nezorané i rozpracovaný díl (spřežení už není). Vrácené díly se kopou motykou na konci řady
 * kopání – kopání dílů před nimi se tím nemění (oxen.md: zbytek se dokope motykou).
 */
export function returnPloughToHoe(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  toolCoverage: number,
  fraction: number,
  all = false,
): void {
  const plough = work.plough;
  if (!plough || plough.partIds.length === 0 || fraction <= EPSILON) return;
  const position = plough.required > 0 ? Math.min(1, plough.done / plough.required) : 1;
  const weights = plough.partIds.map((id) => {
    const part = partsById.get(id);
    return part ? partWeight(part) : 0;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= EPSILON) return;
  const starts: number[] = [];
  let acc = 0;
  for (const w of weights) {
    starts.push(acc / total);
    acc += w;
  }
  const remainingWeight = (1 - position) * total;
  const goal = all ? Infinity : fraction * remainingWeight;
  const moved: number[] = [];
  let movedWeight = 0;
  for (let i = plough.partIds.length - 1; i >= 0; i--) {
    const end = i + 1 < starts.length ? starts[i + 1]! : 1;
    const started = starts[i]! < position - EPSILON;
    if (all ? end <= position + EPSILON : started) break;
    // díl se vrátí, když se aspoň polovinou vejde do vraceného podílu (zaokrouhlení po dílech)
    if (!all && movedWeight + weights[i]! / 2 > goal + EPSILON) break;
    moved.unshift(i);
    movedWeight += weights[i]!;
  }
  if (moved.length === 0) return;
  const ploughPerWeight = plough.weight > EPSILON ? plough.required / plough.weight : 0;
  const hoe = fieldWorkPerHa('dig', toolCoverage);
  const movedIds = moved.map((i) => plough.partIds[i]!);
  const movedSet = new Set(movedIds);
  plough.partIds = plough.partIds.filter((id) => !movedSet.has(id));
  plough.required = Math.max(0, plough.required - movedWeight * ploughPerWeight);
  plough.done = Math.min(plough.done, plough.required);
  plough.weight = Math.max(0, plough.weight - movedWeight);
  plough.digWeight += movedWeight;
  plough.returned = [...(plough.returned ?? []), ...movedIds];
  work.required.dig += movedWeight * hoe;
}

/** Vrátí motyce orbu všech plodin plánu (mutuje stav) – `fraction` a `all` jako u jedné. */
function returnPlanPlough(
  state: VillageState,
  toolCoverage: number,
  fraction: number,
  all: boolean,
): void {
  if (!state.plan) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { work } of planCrops(state.plan)) {
    returnPloughToHoe(work, partsById, toolCoverage, fraction, all);
  }
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
 * na jaře zorají jen podíl podle pokrytí. Když ves přijde o poslední spřežení, zbylou orbu kopou
 * motyky. Vrátí události kroniky.
 */
export function penDay(
  state: VillageState,
  day: number,
  winterEnd: boolean,
  toolCoverage: number,
): ChronicleEvent[] {
  const pens = villagePens(state);
  if (pens.length === 0) return [];
  const events: ChronicleEvent[] = [];
  const teamsBefore = ableTeams(state);
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
    } else if (ableTeams(state) > 0 && coverage < 1 - EPSILON) {
      returnPlanPlough(state, toolCoverage, 1 - coverage, false);
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
  if (teamsBefore > 0 && ableTeams(state) === 0) returnPlanPlough(state, toolCoverage, 1, true);
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
): WoodPlan {
  return planWoodFrom(
    trees,
    position,
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    { obstacles, clearedIds, clearedTrees },
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

/**
 * Proč v ohradě nejde začít výcvik spřežení (česky), nebo null: ohrada stojí, nic se v ní necvičí,
 * vycvičené spřežení je v posledních 2 letech služby (náhrada naváže, když starý pár doslouží –
 * Martin; kdo chce dvě spřežení, postaví druhou ohradu), stádo má aspoň 3 krávy (dvě telata)
 * a na rádlo je strom (kláda, nebo strom ke kácení).
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
  if (penWood(state, ARD.trees, pen, day, obstacles).missing > 0) return 'Na rádlo chybí dřevo.';
  return null;
}

/**
 * Zahájí výcvik spřežení v ohradě (oxen.md): dvě telata ze stáda krav jdou do výcviku a vesničané
 * vyrobí rádlo – stavba ze společné práce (5 člověkodní) se dřevem (kláda z hromady, nebo strom
 * ke kácení u ohrady). Za 2 roky (a s hotovým rádlem) spřežení orá. RangeError, když výcvik
 * nejde (`trainingBlock`). Konvence dne jako u ostatních akcí – volá se na ves dopočítanou do dne
 * `day`, práci rádlo dostane od dalšího dne.
 */
export function startTeamTraining(
  state: VillageState,
  day: number,
  penId: number,
  obstacles: ObstacleLayer | null,
): VillageState {
  const block = trainingBlock(state, penId, day, obstacles);
  if (block) throw new RangeError(block);
  const next = structuredClone(state);
  const pen = villagePens(next).find((p) => p.id === penId)!;
  const livestock = ensureLivestock(next);
  livestock.herds.cow = Math.max(0, livestock.herds.cow - OXEN.teamSize);
  pen.training = { startDay: day };
  const wood = takeWood(next, penWood(next, ARD.trees, pen, day, obstacles));
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
    penId,
    wood,
  });
  return next;
}

/** Ohrada k zahájení – čtverec, jeho střed a překážky na něm (`checkPenPlacement`). */
export interface PenInput {
  cell: TileCell;
  x: number;
  z: number;
  /** Práce navíc za překážky na čtverci (člověkodny). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: readonly number[];
  /** Dospělé stromy mezi nimi – dají klády na hromadu. */
  clearedTrees: number;
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
): WoodPlan {
  return penWood(state, PEN.trees, input, day, obstacles, input.obstacleIds, input.clearedTrees);
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
): VillageState {
  const plan = planPenWood(state, input, day, obstacles);
  if (plan.missing > 0) throw new RangeError('Na ohradu chybí dřevo – klády ani stromy nestačí.');
  const next = structuredClone(state);
  recordClearedObstacles(next, input.obstacleIds, day);
  const wood = takeWood(next, plan);
  const penId = next.nextId++;
  (next.pens ??= []).push({
    id: penId,
    cell: { x: input.cell.x, y: input.cell.y },
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
