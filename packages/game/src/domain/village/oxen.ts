import { cloneState } from './clone';
import { dateOfDayIndex } from '../calendar';
import type { ObstacleLayer } from '../landscape';
import { HAY, hayWinterDaysLeft, oxenHayCoverage, villageHayKg } from './hay';
import { butcher, ensureLivestock, LIVESTOCK } from './livestock';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import { PLOUGH_HA_PER_DAY, ploughWorkPerHa } from './plough';
import {
  DRAFT_OXEN,
  FELLING_MAN_DAYS_PER_TREE,
  OXEN,
  PEN_FENCE,
  PEN_PLACES_PER_SQUARE,
  PLANNING_DAY,
} from './rules';
import { giveHorsePenStock } from './horse-stock';
import { builtPenSquares, oxenOf, oxTrainedDay, penSpecies } from './pens';
import { fencedSquareEquivalents, newFenceSides, SQUARE_SIDES } from './fence-cost';
import { copyGrid } from './square-grid';
import type {
  ChronicleEvent,
  Ox,
  Pen,
  PenSpecies,
  PenSquare,
  SquareGrid,
  TileCell,
  VillageState,
} from './types';
import type { Walk } from './paths/walking';
import { claimedObstacles, planWoodFrom, takeWood, woodLogs, type WoodPlan } from './wood';
import { seasonCrops, ploughToHoe } from './year-plan';
import { isLongWinterRevealed } from './weather-effects';

// Ohrada volů a orba rádlem (oxen.md, schváleno 18. 10. 2026; voli po kusech – Martin 20. 10. 2026:
// „Ať to funguje jako se stády - ohrada pro voly udrží určitý počet spřežení a když bude vesnice
// potřebovat víc vozů, ohrada se musí zvětšit. Zaároveň to udělej tak, že rádlo táhnou 2 voli,
// 4kolový vůz také dva voli a dvoukolový vůz jeden vůl.“). Ohrada je stavba po čtvercích louky pro
// jeden druh zvířat (40 člověkodní a 6 stromů na čtverec, nejvýš 4 čtverce – oxen.md, Ohrady podle
// druhu; pens.ts). Ohrada volů pojme 6 volů na čtverec i s telaty ve výcviku; voli se počítají po
// kusech – každý má den, kdy je vycvičený (výcvik 2 roky z telat vlastního stáda krav), slouží
// 10 let a pak jde na maso. Pár volů s rádlem orá, vůl táhne dvoukolák, pár čtyřkolák (DRAFT_OXEN);
// voli se sdílí – orba a svoz se nepřekrývají. Kolik volů ves chce, rozhoduje draft.ts; výcvik
// začne sám, když jich ves chce víc, než má, a je pro ně místo. Přes zimu voli žerou seno – když
// chybí přes polovinu, část uhyne; když chybí méně, slabí voli orají na jaře pomaleji. Ves, která
// orá, nekope (oxen.md – Jen rádlo); přijde-li o poslední pár s rádlem, letošní práci plodin dokončí motyka.

/**
 * oxen.md – Ohrada: 40 člověkodní a 6 stromů (kůly, přístřešek) na čtverec ohrady. Plot podle
 * délky (oxen.md – Plot podle délky; návrh Clauda): polovina práce a 4 stromy z 6 je plot, tedy
 * strana čtverce stojí osminu práce a strom; zbytek (přístřešek, žlab, jesle, úprava země) platí
 * každý čtverec a plot jen strany, které nesousedí s ohradou ani s dalším novým čtvercem.
 */
export const PEN = { laborManDays: 40, trees: 6 } as const;
/**
 * horses.md – Ohrada koní (návrh Clauda): čtverec 50 člověkodní a 8 stromů (vyšší, pevnější plot);
 * plot podle délky beze změny (`PEN_FENCE`). Ostatní ohrady `PEN`.
 */
export const PEN_BY_SPECIES = {
  default: PEN,
  horse: { laborManDays: 50, trees: 8 },
} as const;

function penCost(species?: PenSpecies): { readonly laborManDays: number; readonly trees: number } {
  return species === 'horse' ? PEN_BY_SPECIES.horse : PEN_BY_SPECIES.default;
}
/** oxen.md – Spřežení: rádlo z 1 stromu za 5 člověkodní. */
export const ARD = { laborManDays: 5, trees: 1 } as const;

const DAYS_PER_YEAR = 365.25;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Ohrady vsi (vsi bez ohrad prázdné). */
export function villagePens(state: Pick<VillageState, 'pens'>): Pen[] {
  return state.pens ?? [];
}

/** Ohrady volů (oxen.md – Ohrada volů; v kódu druh `team`). */
export function oxPens(state: Pick<VillageState, 'pens'>): Pen[] {
  return villagePens(state).filter((pen) => penSpecies(pen) === 'team');
}

/** Voli ohrady – vycvičení i telata ve výcviku. */
export function penOxen(pen: Pen): number {
  return oxenOf(pen).length;
}

/** Voli vsi (vycvičení i ve výcviku) – žerou seno a spásají pastvu jako krávy. */
export function villageOxen(state: Pick<VillageState, 'pens'>): number {
  return villagePens(state).reduce((sum, pen) => sum + penOxen(pen), 0);
}

/**
 * Voli, které ves koupila u sousedů a výprava je teprve přivede (trade.md – Dobytek ve třech
 * druzích) – mladí i vycvičení; počítají se do volů, se kterými ves při výcviku počítá, a do míst
 * ohrad volů.
 */
export function oxenComing(state: { trade?: VillageState['trade'] }): number {
  let n = 0;
  for (const e of state.trade?.expeditions ?? []) {
    n += (e.get.youngOxen ?? 0) + (e.get.trainedOxen ?? 0);
  }
  return n;
}

/** Je vůl v den `day` vycvičený? */
export function isTrained(ox: Pick<Ox, 'trainedDay'>, day: number): boolean {
  return day >= ox.trainedDay;
}

/** Den, kdy vůl doslouží a jde na maso (OXEN.serviceYears od vycvičení). */
export function oxRetireDay(ox: Pick<Ox, 'trainedDay'>): number {
  return Math.ceil(ox.trainedDay + OXEN.serviceYears * DAYS_PER_YEAR - EPSILON);
}

/** Vycvičení voli vsi v den `day`. */
export function trainedOxen(state: Pick<VillageState, 'pens'>, day: number): number {
  let n = 0;
  for (const pen of villagePens(state)) for (const ox of oxenOf(pen)) if (isTrained(ox, day)) n++;
  return n;
}

/** Telata ve výcviku v den `day`. */
export function oxenInTraining(state: Pick<VillageState, 'pens'>, day: number): number {
  return villageOxen(state) - trainedOxen(state, day);
}

/** Místa ohrad volů (hotové čtverce × 6 – voli i s telaty ve výcviku; oxen.md – Ohrada volů). */
export function oxPlaces(state: Pick<VillageState, 'pens'>): number {
  return oxPens(state).reduce(
    (sum, pen) => sum + builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.team,
    0,
  );
}

/**
 * Hotová rádla vsi – ves uložená dřív bez údaje má rádlo u každé ohrady se spřežením nebo
 * výcvikem (dřív každý výcvik stavěl rádlo – oxen.md, Voli po kusech, `withOxen`).
 */
export function villageArds(state: Pick<VillageState, 'pens' | 'ards'>): number {
  if (state.ards !== undefined) return state.ards;
  return villagePens(state).filter(
    (pen) => (pen.team ?? null) !== null || (pen.training ?? null) !== null,
  ).length;
}

/**
 * Voli, kteří táhnou vozy výprav na cestě (wagons.md – Obchod): čtyřkolák dva, dvoukolák jeden
 * (DRAFT_OXEN).
 */
export function oxenAway(
  state: Pick<VillageState, 'carts' | 'trade'> & { dwellings?: VillageState['dwellings'] },
): number {
  const kinds = new Map((state.carts ?? []).map((c) => [c.id, c.kind]));
  let n = 0;
  for (const e of state.trade?.expeditions ?? []) {
    for (const id of e.carts ?? []) {
      const kind = kinds.get(id);
      if (kind) n += DRAFT_OXEN[kind];
    }
  }
  // vůz s platbou za kování k vozu (wagons.md – Kování vozů)
  for (const d of state.dwellings ?? []) {
    const id = d.workshop?.ironTrip?.cartId;
    const kind = id === undefined ? undefined : kinds.get(id);
    if (kind) n += DRAFT_OXEN[kind];
  }
  return n;
}

/**
 * Vycvičení voli doma v den `day` – bez volů u vozů výprav na cestě (oxen.md – Voli se sdílí).
 */
export function oxenHome(
  state: Pick<VillageState, 'pens' | 'carts' | 'trade'>,
  day: number,
): number {
  return Math.max(0, trainedOxen(state, day) - oxenAway(state));
}

/**
 * Kolik párů volů s rádlem ves má (oxen.md – Voli po kusech): pár vycvičených volů orá, jen když
 * má rádlo. Výpravy nepočítá (`ploughPairsHome`).
 */
export function ableTeams(state: Pick<VillageState, 'pens' | 'ards'>, day: number): number {
  return Math.min(villageArds(state), Math.floor(trainedOxen(state, day) / DRAFT_OXEN.ard));
}

/** Páry volů s rádlem doma v den `day` – voli u vozů výprav neorají (wagons.md – Obchod). */
export function ploughPairsHome(
  state: Pick<VillageState, 'pens' | 'ards' | 'carts' | 'trade'>,
  day: number,
): number {
  return Math.min(villageArds(state), Math.floor(oxenHome(state, day) / DRAFT_OXEN.ard));
}

/** Orba jednoho páru za den (člověkodny): ≈ 0,3 ha za sazbu orby podle pokrytí nástroji. */
export function pairCapacityPerDay(toolCoverage: number): number {
  return PLOUGH_HA_PER_DAY * ploughWorkPerHa(toolCoverage);
}

/**
 * Síla volů v den `day` (0–1): slabí voli po zimě bez dost sena (`Ox.weak`) orají od 1. 3. do konce
 * hospodářského roku jen podílem – průměr vycvičených volů; bez dne plná síla.
 */
export function oxenStrength(state: Pick<VillageState, 'pens'>, day?: number): number {
  if (day === undefined || dateOfDayIndex(day).month >= PLANNING_DAY.month) return 1;
  let n = 0;
  let sum = 0;
  for (const pen of villagePens(state)) {
    for (const ox of oxenOf(pen)) {
      if (!isTrained(ox, day)) continue;
      n++;
      sum += ox.weak ?? 1;
    }
  }
  return n > 0 ? sum / n : 1;
}

/**
 * Kolik orby páry vsi za den zvládnou (člověkodny): páry s rádlem (`pairs`, bez nich všechny –
 * `ableTeams` v den `day`, bez dne `lastDay`) × ≈ 0,3 ha za sazbu orby podle pokrytí nástroji
 * × síla volů po zimě (`oxenStrength`; bez dne plná).
 */
export function ploughCapacityPerDay(
  state: Pick<VillageState, 'pens' | 'ards' | 'lastDay'>,
  toolCoverage: number,
  day?: number,
  pairs?: number,
): number {
  const teams = pairs ?? ableTeams(state, day ?? state.lastDay);
  if (teams <= 0) return 0;
  return teams * pairCapacityPerDay(toolCoverage) * oxenStrength(state, day);
}

/** Průběh výcviku telete 0–1 v den `day`. */
export function oxTrainingProgress(ox: Pick<Ox, 'trainedDay'>, day: number): number {
  const total = OXEN.trainingYears * DAYS_PER_YEAR;
  return Math.min(1, Math.max(0, 1 - (ox.trainedDay - day) / total));
}

/** Stáří vola ve službě v celých letech (tele ve výcviku null). */
export function oxAgeYears(ox: Pick<Ox, 'trainedDay'>, day: number): number | null {
  return isTrained(ox, day) ? Math.floor((day - ox.trainedDay) / DAYS_PER_YEAR) : null;
}

/**
 * Letošní práci plodin, které oraly páry volů – nutných i nad potřebu –, dokončí motyka: ves už
 * žádný pár s rádlem nemá (mutuje stav; oxen.md – Jen rádlo). Díly, které přibudou potom, kope
 * motyka (plodina bez orby).
 */
function finishSeasonByHoe(state: VillageState, day: number, toolCoverage: number): void {
  if (!state.season || ableTeams(state, day) > 0) return;
  const crops = seasonCrops(state.season);
  if (!crops.some(({ work }) => work.plough)) return;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  for (const { crop, work } of crops) ploughToHoe(work, partsById, toolCoverage, crop);
}

/**
 * Voli po kusech (oxen.md – Voli po kusech, převod starých vsí): ohrady uložené se spřežením
 * a výcvikem dostanou voly – spřežení = 2 vycvičení voli se stejným dnem, výcvik = 2 telata –
 * a ves rádlo za každou ohradu se spřežením nebo výcvikem (`villageArds`); rozestavěné rádlo
 * výcviku se zruší a klády z hromady vrátí (rádlo už ves má). Údaje spřežení zmizí ze všech ohrad.
 * Jednou – ves bez nich se nemění (vrátí týž stav).
 */
export function withOxen(state: VillageState): VillageState {
  const pens = state.pens ?? [];
  if (!pens.some((p) => 'team' in p || 'training' in p)) return state;
  const ards = villageArds(state);
  const pending = state.constructions.filter((c) => c.kind === 'ard');
  const logs = pending.reduce((sum, c) => sum + (c.wood?.fromPile ?? 0), 0);
  return {
    ...state,
    ards,
    ...(pending.length > 0
      ? {
          constructions: state.constructions.filter((c) => c.kind !== 'ard'),
          woodLogs: (state.woodLogs ?? 0) + logs,
        }
      : {}),
    pens: pens.map((p) => {
      const rest: Pen = { ...p };
      delete rest.team;
      delete rest.training;
      if (penSpecies(p) !== 'team') return rest;
      return { ...rest, oxen: oxenOf(p).map((ox) => ({ ...ox })) };
    }),
  };
}

/** Voli ohrady k úpravě – ohrada uložená dřív je dostane ze spřežení (mutuje ohradu). */
export function oxenToEdit(pen: Pen): Ox[] {
  if (!pen.oxen) {
    pen.oxen = oxenOf(pen).map((ox) => ({ ...ox }));
    delete pen.team;
    delete pen.training;
  }
  return pen.oxen;
}

/** Voli došli na maso (mutuje stav). */
function retireOxen(state: VillageState, oxen: number): void {
  butcher(state, oxen * LIVESTOCK.oxMeatKg);
}

/**
 * Voli bez ohrady (migration.md – Vůz při odchodu): s první hotovou ohradou volů nové vsi do ní
 * přejdou (do míst); kdo doslouží (OXEN.serviceYears), jde na maso. Mutuje stav.
 */
export function looseOxenDay(state: VillageState, day: number): ChronicleEvent[] {
  const loose = state.looseOxen;
  if (!loose || loose.length === 0) return [];
  const events: ChronicleEvent[] = [];
  const retired = loose.filter((ox) => day >= oxRetireDay(ox)).length;
  let left = loose.filter((ox) => day < oxRetireDay(ox));
  if (retired > 0) retireOxen(state, retired);
  const pen = oxPens(state)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0];
  if (pen && left.length > 0) {
    const oxen = oxenToEdit(pen);
    const room = Math.max(
      0,
      builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.team - oxen.length,
    );
    const moving = left.slice(0, room);
    if (moving.length > 0) {
      oxen.push(...moving);
      left = left.slice(moving.length);
      events.push({ day, kind: 'team-ready', penId: pen.id, oxen: moving.length });
    }
  }
  if (left.length > 0) state.looseOxen = left;
  else delete state.looseOxen;
  return events;
}

/**
 * Den ohrad volů (mutuje stav): telata, kterým dnes skončil výcvik, jsou vycvičená (kronika
 * `team-ready`); voli, kteří slouží OXEN.serviceYears, zestárli a jdou na maso (`team-retired`).
 * 1. 3. (konec zimy) rozhodne pokrytí sena: pod polovinu část volů uhyne – tolik, aby ostatní měli
 * polovinu přídělu, nejdřív nejmladší (`ox-died`); přeživší i voli při pokrytí do 1 orají na jaře
 * jen podílem kapacity podle pokrytí (`Ox.weak`). Když ves přijde o poslední pár s rádlem, letošní
 * práci plodin dokončí motyka (`finishSeasonByHoe`). Vrátí události kroniky.
 */
export function penDay(
  state: VillageState,
  day: number,
  winterEnd: boolean,
  toolCoverage: number,
): ChronicleEvent[] {
  const pens = oxPens(state);
  if (pens.length === 0 || villageOxen(state) === 0) {
    finishSeasonByHoe(state, day, toolCoverage);
    return [];
  }
  const events: ChronicleEvent[] = [];
  if (winterEnd) winterEndOxen(state, day, pens, events);
  for (const pen of pens) {
    const oxen = oxenToEdit(pen);
    const retired = oxen.filter((ox) => day >= oxRetireDay(ox)).length;
    if (retired > 0) {
      pen.oxen = oxen.filter((ox) => day < oxRetireDay(ox));
      retireOxen(state, retired);
      events.push({ day, kind: 'team-retired', penId: pen.id, oxen: retired });
    }
    const ready = oxen.filter((ox) => ox.trainedDay === day).length;
    if (ready > 0) events.push({ day, kind: 'team-ready', penId: pen.id, oxen: ready });
  }
  finishSeasonByHoe(state, day, toolCoverage);
  return events;
}

/**
 * Konec zimy (1. 3.) pro voly – pokrytí sena (mutuje stav, přidá události). Pod polovinu přídělu
 * uhyne tolik volů, aby ostatní měli polovinu – nejdřív nejmladší (telata ve výcviku hladovějí
 * první; rozhodnutí Clauda), pak po ohradách; přeživší jsou slabí. Jinak slabí voli při pokrytí
 * pod 1.
 */
function winterEndOxen(
  state: VillageState,
  day: number,
  pens: readonly Pen[],
  events: ChronicleEvent[],
): void {
  const total = villageOxen(state);
  const coverage = oxenHayCoverage(state, total);
  let weak = coverage;
  if (coverage < HAY.deathBelowCoverage - EPSILON) {
    const survivors = Math.floor((total * coverage) / HAY.deathBelowCoverage + EPSILON);
    let deaths = total - survivors;
    weak = survivors > 0 ? Math.min(1, (total * coverage) / survivors) : 1;
    // nejmladší napřed (pozdější den vycvičení), při shodě ohrada s vyšším id
    const order = pens
      .flatMap((pen) => oxenToEdit(pen).map((ox) => ({ pen, ox })))
      .sort((a, b) => b.ox.trainedDay - a.ox.trainedDay || b.pen.id - a.pen.id);
    const dead = new Set<Ox>();
    for (const { ox } of order) {
      if (deaths <= 0) break;
      dead.add(ox);
      deaths--;
    }
    for (const pen of pens) {
      const oxen = oxenToEdit(pen);
      const died = oxen.filter((ox) => dead.has(ox));
      if (died.length === 0) continue;
      pen.oxen = oxen.filter((ox) => !dead.has(ox));
      const calves = died.filter((ox) => !isTrained(ox, day)).length;
      if (died.length - calves > 0) {
        events.push({
          day,
          kind: 'ox-died',
          penId: pen.id,
          training: false,
          oxen: died.length - calves,
        });
      }
      if (calves > 0)
        events.push({ day, kind: 'ox-died', penId: pen.id, training: true, oxen: calves });
    }
  }
  // slabí voli orají na jaře pomaleji – nekope se, co nezorají, se nezaseje (oxen.md – Jen rádlo)
  for (const pen of pens) {
    for (const ox of oxenToEdit(pen)) {
      if (weak < 1 - EPSILON) ox.weak = weak;
      else delete ox.weak;
    }
  }
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

/**
 * Voli, se kterými ves při výcviku počítá (oxen.md – Spřežení, Martin 18. 10. 2026): telata ve
 * výcviku a vycvičení voli mimo posledních OXEN.trainingYears let služby – náhrada se začne cvičit
 * až v nich, aby byla hotová, když starý vůl doslouží. I voli koupení u sousedů, které výprava
 * teprve přivede (`oxenComing` – mladí, nebo vycvičení se 7 lety služby před sebou).
 */
export function lastingOxen(
  state: Pick<VillageState, 'pens'> & { trade?: VillageState['trade'] },
  day: number,
): number {
  const replaceFrom = (OXEN.serviceYears - OXEN.trainingYears) * DAYS_PER_YEAR - EPSILON;
  let n = oxenComing(state);
  for (const pen of villagePens(state)) {
    for (const ox of oxenOf(pen)) {
      if (!isTrained(ox, day) || day - ox.trainedDay < replaceFrom) n++;
    }
  }
  return n;
}

/** Rádla, která se právě vyrábějí (stavby `ard`). */
function pendingArds(state: Pick<VillageState, 'constructions'>): number {
  return state.constructions.filter((c) => c.kind === 'ard').length;
}

/** Voli bez ohrady (migration.md – Vůz při odchodu, trade.md – koupení voli bez místa). */
function looseOxenCount(state: Pick<VillageState, 'looseOxen'>): number {
  return state.looseOxen?.length ?? 0;
}

/**
 * Kolik rádel ves vyrobí bez výcviku (oxen.md – Voli po kusech, trade.md – Dobytek ve třech
 * druzích): voli, které ves má (i koupení vycvičení), tvoří páry k orbě (`goal.ploughPairs`), na
 * které rádlo chybí – ani se nevyrábí. Rádlo vzniká jinak s výcvikem (`oxenTraining`); bez toho by
 * pár koupený u souseda nikdy neoral.
 */
export function ardsWithoutTraining(
  state: VillageState,
  goal: Pick<OxenGoal, 'ploughPairs'>,
): number {
  if (!oxPens(state).some((pen) => pen.builtDay !== null)) return 0;
  const pairs = Math.min(goal.ploughPairs, Math.floor(villageOxen(state) / DRAFT_OXEN.ard));
  return Math.max(0, pairs - villageArds(state) - pendingArds(state));
}

/** Co dnes výcvik začne: kolik telat jde do výcviku a kolik rádel ves vyrobí. */
export interface OxTraining {
  calves: number;
  ards: number;
}

/**
 * Kolik volů ves chce (draft.ts – `oxenTrainingTarget`, `wantedPloughPairs`) a kolik krav drží
 * vždy (husbandry.ts – `breedingCows`): podle toho výcvik bere telata.
 */
export interface OxenGoal {
  /** Voli, které ves cvičí a krmí (nejvýš místa ohrad volů). */
  oxen: number;
  /** Páry k rádlům, které ves chce. */
  ploughPairs: number;
  /** Chovné krávy – telata na voly jen z přírůstku nad nimi. */
  breedingCows: number;
}

/**
 * Výcvik volů dnes (oxen.md – Voli po kusech; česky důvod, proč nezačne): ves chce `goal.oxen` volů
 * a počítá s telaty ve výcviku a voly mimo posledních 2 let služby (`lastingOxen`); do výcviku jde
 * tolik telat, kolik chybí, kolik se jich vejde do hotových ohrad volů, kolik jich je ve stádu krav
 * nad chovnými kravami (`goal.breedingCows` – telata jen z přírůstku, stádo pod cíl neklesne; jinak
 * výcvik počká na mláďata 1. 4.) a v zimě kolik jich seno uživí do konce března. Výjimka: náhrada
 * posledního páru k orbě (ves orá nebo má rádlo, pár dosluhuje či už se rozpadl a jiný nemá ani
 * necvičí) vezme telata, dokud zůstane chovný pár krav (LIVESTOCK.breedingMin) – ať ves po
 * dosloužení páru neorá motykou (oxen.md – Co nejvíc sena a co největší stáda, bod 5). Rádlo se vyrobí,
 * jen když s novými voly vznikne pár k orbě, na který rádlo chybí (`goal.ploughPairs`); na rádlo
 * musí být dřevo.
 */
export function oxenTraining(
  state: VillageState,
  day: number,
  goal: OxenGoal,
  obstacles: ObstacleLayer | null,
): OxTraining | string {
  const built = oxPens(state).filter((pen) => pen.builtDay !== null);
  const calves = calvesForTraining(state, day, goal);
  if (typeof calves === 'string') return calves;
  let n = calves;
  const winterDays = hayWinterDaysLeft(day, isLongWinterRevealed(state, day));
  if (winterDays > 0) {
    const fed = Math.floor(villageHayKg(state) / (HAY.dailyKg.ox * winterDays) + EPSILON);
    n = Math.min(n, fed - villageOxen(state));
    if (n <= 0) return 'Na výcvik chybí seno.';
  }
  const pairs = Math.min(goal.ploughPairs, Math.floor((villageOxen(state) + n) / DRAFT_OXEN.ard));
  const ards = Math.max(0, pairs - villageArds(state) - pendingArds(state));
  if (ards > 0) {
    const pen = built[0]!;
    if (penWood(state, ARD.trees * ards, pen, day, obstacles).missing > 0) {
      return 'Na rádlo chybí dřevo.';
    }
  }
  return { calves: n, ards };
}

/**
 * Telata, která výcvik dnes opravdu dostane (oxen.md – Voli po kusech, Seno): kolik volů chybí,
 * kolik se jich vejde do hotových ohrad volů a kolik telat je nad chovnými kravami (s výjimkou
 * náhrady posledního páru) – bez sena a dřeva na rádlo. Podle toho ves seče seno na voly
 * (husbandry.ts – `hayOxen`). Bez telat 0.
 */
export function trainableCalves(state: VillageState, day: number, goal: OxenGoal): number {
  const calves = calvesForTraining(state, day, goal);
  return typeof calves === 'string' ? 0 : calves;
}

/** Telata do výcviku bez sena a dřeva (`oxenTraining`), nebo česky důvod, proč žádná. */
function calvesForTraining(state: VillageState, day: number, goal: OxenGoal): number | string {
  const built = oxPens(state).filter((pen) => pen.builtDay !== null);
  if (built.length === 0) {
    return oxPens(state).length > 0 ? 'Ohrada volů se ještě staví.' : 'Ves nemá ohradu volů.';
  }
  const missing = goal.oxen - lastingOxen(state, day);
  if (missing <= 0) return 'Ves má dost volů.';
  // místa i pro voly od sousedů na cestě a voly bez ohrady (trade.md, migration.md)
  const room = oxPlaces(state) - villageOxen(state) - oxenComing(state) - looseOxenCount(state);
  if (room <= 0) return 'Ohrada volů je plná.';
  const cows = state.livestock?.herds.cow ?? 0;
  // telata jen z přírůstku nad chovnými kravami; náhrada posledního páru k orbě (pár dosluhuje,
  // jiný ves nemá ani necvičí) má přednost – telata se pro ni vezmou, dokud zůstane chovný pár
  // krav (návrh Clauda 20. 10. 2026 – ať ves neorá motykou); i po rozpadu páru, když ves má rádlo
  // (návrh Clauda, schválený Martinem 24. 10. 2026)
  const lasting = lastingOxen(state, day);
  const lastPair =
    goal.ploughPairs > 0 &&
    (ableTeams(state, day) > 0 || villageArds(state) > 0) &&
    lasting < DRAFT_OXEN.ard;
  const spare = Math.floor(cows - goal.breedingCows + EPSILON);
  const urgent = lastPair
    ? Math.min(DRAFT_OXEN.ard - lasting, Math.floor(cows - LIVESTOCK.breedingMin + EPSILON))
    : 0;
  const calves = Math.max(spare, urgent);
  if (calves <= 0) return 'Na výcvik chybí telata – krávy nemají přírůstek nad chovné stádo.';
  return Math.min(missing, room, calves);
}

/**
 * Výcvik volů začne sám (oxen.md – Spřežení, Voli po kusech; Martin 19. 10. 2026: „Ať se spřežení
 * cvičí automaticky, bez zásahu hráče.“ – mutuje stav): kdykoli ves chce víc volů, než má, a výcvik
 * jde (`oxenTraining`), jdou telata ze stáda krav do výcviku do hotových ohrad volů s místem
 * a vesničané vyrobí rádla – stavby ze společné práce (5 člověkodní) se dřevem (kláda z hromady,
 * nebo strom ke kácení u ohrady). Za 2 roky jsou voli vycvičení. `walk` (chůze ke stromům po
 * pevných cestách) se spočítá, jen když se rádlo opravdu staví.
 */
export function trainTeamsWhenReady(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  goal: OxenGoal,
  walk?: () => Walk,
): void {
  const plan = oxenTraining(state, day, goal, obstacles);
  if (typeof plan !== 'string') {
    startTraining(state, day, plan, obstacles, plan.ards > 0 ? walk?.() : undefined);
    return;
  }
  // pár bez rádla (voli koupení u souseda) – rádlo bez výcviku, když je na něj dřevo
  const ards = ardsWithoutTraining(state, goal);
  if (ards <= 0) return;
  const pen = oxPens(state)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0]!;
  if (penWood(state, ARD.trees * ards, pen, day, obstacles).missing > 0) return;
  startArds(state, day, ards, obstacles, walk?.());
}

/** Zahájí výcvik – telata do ohrad volů s místem, stavby rádel (mutuje stav). */
function startTraining(
  next: VillageState,
  day: number,
  plan: OxTraining,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): void {
  const livestock = ensureLivestock(next);
  livestock.herds.cow = Math.max(0, livestock.herds.cow - plan.calves);
  const built = oxPens(next)
    .filter((pen) => pen.builtDay !== null)
    .sort((a, b) => a.id - b.id);
  let left = plan.calves;
  for (const pen of built) {
    const oxen = oxenToEdit(pen);
    const free = builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.team - oxen.length;
    for (let k = 0; k < free && left > 0; k++, left--) oxen.push({ trainedDay: oxTrainedDay(day) });
  }
  startArds(next, day, plan.ards, obstacles, walk);
}

/**
 * Vesničané vyrobí `ards` rádel – stavby ze společné práce u první hotové ohrady volů se dřevem
 * (kláda z hromady, nebo strom ke kácení u ohrady; mutuje stav).
 */
function startArds(
  next: VillageState,
  day: number,
  ards: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): void {
  const pen = oxPens(next)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id)[0];
  if (!pen) return;
  for (let k = 0; k < ards; k++) {
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
}

/** Hotové rádlo – ves ho má k orbě (mutuje stav; oxen.md – Voli po kusech). */
export function finishArd(state: VillageState): void {
  state.ards = villageArds(state) + 1;
}

/** Čtverec ohrady k zahájení – střed a překážky na něm (`checkPenPlacement`). */
export interface PenSquareInput {
  /** Čtverec ohrady v mřížce `PenInput.grid`; bez ní políčko krajiny. */
  cell: TileCell;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Práce navíc za překážky na čtverci (člověkodny). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: readonly number[];
  /** Dospělé stromy mezi nimi – dají klády na hromadu. */
  clearedTrees: number;
}

/**
 * Ohrada k zahájení (oxen.md – Ohrady podle druhu): druh zvířat a čtverce (`penSquaresFromCells`) –
 * nová ohrada, nebo rozšíření ohrady téhož druhu, na kterou čtverce navazují.
 */
export interface PenInput {
  species: PenSpecies;
  /** Čtverce v pořadí – u nové ohrady první nese přístřešek a jesle. */
  squares: readonly PenSquareInput[];
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
  /**
   * Čtverce pole pod ohradou (`takenLand` z kontroly) – z pole zmizí (fields.md – Pole jako
   * krajina; `foundPen`).
   */
  takenLand?: readonly {
    cell: TileCell;
    grid?: SquareGrid;
    areaM2: number;
    cellAreaM2: number;
  }[];
}

/** Práce na čtverci ohrady bez dřeva – cena čtverce minus kácení jeho stromů u blízkého lesa. */
export function penBuildLabor(species?: PenSpecies): number {
  const cost = penCost(species);
  return cost.laborManDays - cost.trees * FELLING_MAN_DAYS_PER_TREE;
}

/**
 * Práce na ohradě jako při zahájení stavby: stavba `squares` čtverců, překážky a kácení stromů
 * z plánu dřeva.
 */
export function penLaborManDays(
  obstacleCost: number,
  wood: Pick<WoodPlan, 'fell'>,
  squares = 1,
  fenceSides = squares * SQUARE_SIDES,
  species?: PenSpecies,
): number {
  return (
    penBuildLabor(species) * fencedSquareEquivalents(squares, fenceSides, PEN_FENCE.share) +
    obstacleCost +
    wood.fell.reduce((sum, t) => sum + t.cost, 0)
  );
}

/** Stromy na ohradu: zbytek za každý čtverec a strom na každou novou stranu plotu. */
export function penTrees(squares: number, fenceSides: number, species?: PenSpecies): number {
  return (
    (penCost(species).trees - PEN_FENCE.trees) * squares +
    (PEN_FENCE.trees * fenceSides) / SQUARE_SIDES
  );
}

/** Políčka ohrady (hotová i rozestavěné), na které nové čtverce navazují. */
function penCells(pen: Pen): TileCell[] {
  return [pen.cell, ...(pen.extraSquares ?? []).map((q) => q.cell)];
}

/** Střed čtverců (m) – odtud se hledají stromy ke kácení. */
function squaresCenter(squares: readonly { x: number; z: number }[]): { x: number; z: number } {
  const n = Math.max(1, squares.length);
  return {
    x: squares.reduce((sum, q) => sum + q.x, 0) / n,
    z: squares.reduce((sum, q) => sum + q.z, 0) / n,
  };
}

/**
 * Plán dřeva ohrady (6 stromů na čtverec – klády z hromady, zbytek nejbližší stromy k ohradě);
 * stromy na čtvercích dají klády.
 */
export function planPenWood(
  state: VillageState,
  squares: readonly Pick<PenSquareInput, 'cell' | 'x' | 'z' | 'obstacleIds' | 'clearedTrees'>[],
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
  extendId?: number,
  species?: PenSpecies,
): WoodPlan {
  const target =
    extendId === undefined ? undefined : villagePens(state).find((p) => p.id === extendId);
  const sides = newFenceSides(
    squares.map((q) => q.cell),
    target ? penCells(target) : [],
  );
  return penWood(
    state,
    penTrees(squares.length, sides, target ? penSpecies(target) : species),
    squaresCenter(squares),
    day,
    obstacles,
    squares.flatMap((q) => q.obstacleIds),
    squares.reduce((sum, q) => sum + q.clearedTrees, 0),
    walk,
  );
}

/**
 * Zahájí stavbu ohrady (oxen.md – Ohrady podle druhu): čtverce louky s pleteným plotem
 * a přístřeškem – stavba ze společné práce (osadníci nejsou potřeba). Nová ohrada dostane druh
 * a čtverce (první s přístřeškem); rozšíření (`extendId` – ohrada téhož druhu, na kterou čtverce
 * navazují) přidá čtverce na konec, do dokončení stavby se nepočítají. Překážky na čtvercích
 * osadníci odstraní hned, dospělé stromy z nich dají klády; dřevo (6 stromů na čtverec) vezme
 * stavba z hromady, zbytek vyhradí ke kácení. RangeError, když dřevo nestačí. Umístění ověří
 * `penSquaresFromCells` (placement.ts), vstup `foundPen`.
 */
export function startPen(
  state: VillageState,
  day: number,
  input: PenInput,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
  extendId?: number,
): VillageState {
  const plan = planPenWood(state, input.squares, day, obstacles, walk, extendId, input.species);
  if (plan.missing > 0) throw new RangeError('Na ohradu chybí dřevo – klády ani stromy nestačí.');
  const next = cloneState(state);
  recordClearedObstacles(
    next,
    input.squares.flatMap((q) => q.obstacleIds),
    day,
  );
  const wood = takeWood(next, plan);
  const pens = (next.pens ??= []);
  const target = extendId === undefined ? undefined : pens.find((p) => p.id === extendId);
  const fenceSides = newFenceSides(
    input.squares.map((q) => q.cell),
    target ? penCells(target) : [],
  );
  const constructionId = target ? next.nextId++ : undefined;
  const square = (q: PenSquareInput, building?: number): PenSquare => ({
    cell: { x: q.cell.x, y: q.cell.y },
    x: q.x,
    z: q.z,
    ...(building === undefined ? {} : { constructionId: building }),
  });
  let penId: number;
  if (target) {
    penId = target.id;
    (target.extraSquares ??= []).push(...input.squares.map((q) => square(q, constructionId)));
  } else {
    const [first, ...rest] = input.squares;
    if (!first) throw new RangeError('Ohrada musí mít aspoň jeden čtverec.');
    penId = next.nextId++;
    pens.push({
      id: penId,
      species: input.species,
      cell: { x: first.cell.x, y: first.cell.y },
      ...(rest.length > 0 ? { extraSquares: rest.map((q) => square(q)) } : {}),
      ...(input.grid ? { grid: copyGrid(input.grid) } : {}),
      x: first.x,
      z: first.z,
      builtDay: null,
      ...(input.species === 'team' ? { oxen: [] } : {}),
    });
  }
  next.constructions.push({
    id: constructionId ?? next.nextId++,
    kind: 'pen',
    startedDay: day,
    cost: penLaborManDays(
      input.squares.reduce((sum, q) => sum + q.obstacleCost, 0),
      plan,
      input.squares.length,
      fenceSides,
      target ? penSpecies(target) : input.species,
    ),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    penId,
    wood,
    ...(target ? { extends: true as const } : {}),
  });
  return next;
}

/**
 * Dostavěná ohrada, nebo její rozšíření (mutuje stav): čtverce rozšíření stavby `constructionId`
 * se začnou počítat; jinak je hotová celá ohrada.
 */
export function finishPen(
  state: VillageState,
  penId: number,
  day: number,
  constructionId?: number,
): void {
  const pen = villagePens(state).find((p) => p.id === penId);
  if (!pen) return;
  const extension = (pen.extraSquares ?? []).filter(
    (q) => constructionId !== undefined && q.constructionId === constructionId,
  );
  if (extension.length === 0) {
    pen.builtDay = day;
    // koně jsou součást stavby (horses.md – Koně se stavbou ohrady)
    if (penSpecies(pen) === 'horse') giveHorsePenStock(state, pen, day);
    return;
  }
  for (const q of extension) delete q.constructionId;
}
