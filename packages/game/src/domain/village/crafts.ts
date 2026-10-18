import { detCos, detSin, type ObstacleLayer } from '../landscape';
import { distanceFactor } from './fields';
import { buildingLocalToWorld, fellTrees, obstacleChangesAt } from './obstacles';
import { ageGroup, laborPerDay } from './people';
import { rectangleCorners, type Point } from './polygon';
import { NO_CRAFTS, dailyMinPerHousehold } from './productivity';
import {
  CHARCOAL_KILN,
  CRAFTS,
  CRAFT_BASE,
  CRAFT_NEEDS,
  CRAFT_PRODUCTION,
  DOMESTIC,
  DWELLING_FOOTPRINT_M,
  MILIR,
  WORKSHOP_PORCH_M,
} from './rules';
import type {
  Craft,
  CraftCoverage,
  CraftStocks,
  Dwelling,
  Position,
  VillageState,
  Workshop,
  WorkshopActivity,
  WorkshopFelling,
} from './types';
import { burnerRests, charcoalShortfallKg, smithCharcoalPerYear, workBurner } from './charcoal';
import {
  availableTrees,
  claimedObstacles,
  fellingCost,
  fuelExtraPerDay,
  isTreeStanding,
  nearestMatureTrees,
} from './wood';

// Řemesla (crafts.md): dílna je obydlí s řemeslem (hrnčíř, kovář, uhlíř), domácnost, která v ní
// bydlí, pracuje na plný úvazek jen v dílně (po denním minimu a domácí výrobě, nikdy na poli ani
// ve společné práci) a jí ze společných zásob. Výroba se nezastaví, dokud jsou vstupy – co ves
// nespotřebuje, zůstane v zásobě; bez vstupu dílna stojí. Výrobky ve vsi se opotřebují a jejich
// zásoba proti potřebě dává pokrytí 0–1, které posouvá meze produktivity (productivity.ts).
// Kroky simulace mutují stav – volat na klonu; den po dni, na kouscích nezávisí.

/** Tolerance proti chybám desetinných čísel (práce, palivo). */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků výroby jedné dílny za den (kácení a pálení se střídají). */
const MAX_STEPS = 64;
const DAYS_PER_YEAR = 365;
/**
 * Opotřebení a rozbití za den – podíl věcí v užívání. Ves, která potřebu drží pokrytou, ročně
 * nahradí právě 30 % nástrojů a 40 % nádob (crafts.md – Pro představu: 40 pracujících ≈ 36 kg
 * nástrojů ročně).
 */
const TOOL_WEAR_PER_DAY = CRAFT_NEEDS.toolWearPerYear / DAYS_PER_YEAR;
const POTTERY_BREAKAGE_PER_DAY = CRAFT_NEEDS.potteryBreakagePerYear / DAYS_PER_YEAR;
/** Mnohoúhelník vyklízeného kruhu milíře – počet vrcholů. */
const MILIR_CLEARING_SIDES = 12;

/** Zásoby vsi bez řemesel. */
export const NO_STOCKS: CraftStocks = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };

/** Názvy řemesel a dílen pro hráče (1. pád). */
export const CRAFT_NAMES: Readonly<Record<Craft, string>> = {
  potter: 'Hrnčíř',
  smith: 'Kovář',
  burner: 'Uhlíř',
};

/** Zásoby výrobků řemeslníků (vsi uložené před řemesly 0). */
export function craftStocks(state: Pick<VillageState, 'crafts'>): CraftStocks {
  return state.crafts ?? NO_STOCKS;
}

/** Potřeba vsi: nástroje pro pracující od 14 let a nádoby pro všechny (kg, crafts.md – Účinek). */
export function craftNeeds(
  state: Pick<VillageState, 'people'>,
  day: number,
): { toolsKg: number; potteryKg: number } {
  const workers = state.people.filter((p) => ageGroup(p, day) !== 'child').length;
  return {
    toolsKg: CRAFT_NEEDS.toolsKgPerWorker * workers,
    potteryKg: CRAFT_NEEDS.potteryKgPerPerson * state.people.length,
  };
}

/** Pokrytí potřeby zásobou 0–1; bez potřeby plné, je-li něco v zásobě. */
function coverageOf(stockKg: number, needKg: number): number {
  if (needKg <= 0) return stockKg > EPSILON ? 1 : 0;
  return Math.min(1, Math.max(0, stockKg / needKg));
}

/**
 * Pokrytí potřeby výrobků řemeslníků v den `day` (crafts.md – Meze produktivity): zásoba
 * nástrojů ÷ potřeba pracujících a zásoba keramiky ÷ potřeba všech lidí, nejvýš 1. Ves bez
 * zásob (i uložená před řemesly) má pokrytí 0 – platí nejhorší meze.
 */
export function craftCoverage(
  state: Pick<VillageState, 'people' | 'crafts'>,
  day: number,
): CraftCoverage {
  const stocks = state.crafts;
  if (!stocks || (stocks.toolsKg <= 0 && stocks.potteryKg <= 0)) return NO_CRAFTS;
  const needs = craftNeeds(state, day);
  return {
    tools: coverageOf(stocks.toolsKg, needs.toolsKg),
    pottery: coverageOf(stocks.potteryKg, needs.potteryKg),
  };
}

/**
 * Jeden den opotřebení (mutuje stav): z nástrojů v užívání ubyde 30 % / 365 denně, z nádob
 * 40 % / 365. V užívání je nejvýš tolik, kolik ves potřebuje – přebytek v zásobě leží
 * (crafts.md).
 */
export function wearCraftStocks(state: VillageState, day: number): void {
  const stocks = state.crafts;
  if (!stocks || (stocks.toolsKg <= 0 && stocks.potteryKg <= 0)) return;
  const needs = craftNeeds(state, day);
  stocks.toolsKg -= Math.min(stocks.toolsKg, needs.toolsKg) * TOOL_WEAR_PER_DAY;
  stocks.potteryKg -= Math.min(stocks.potteryKg, needs.potteryKg) * POTTERY_BREAKAGE_PER_DAY;
}

/** Řemeslo obydlí; obyčejné obydlí null. */
export function dwellingCraft(dwelling: Pick<Dwelling, 'workshop'>): Craft | null {
  return dwelling.workshop?.craft ?? null;
}

/** Nová dílna řemesla `craft` po dostavění – zatím nic nekácí ani nevyrábí. */
export function newWorkshop(craft: Craft, waterDistanceM?: number): Workshop {
  return {
    craft,
    ...(waterDistanceM === undefined ? {} : { waterDistanceM }),
    felling: null,
    fuelKg: 0,
    activity: 'empty',
  };
}

/**
 * Obydlí s dílnou, ve kterých někdo bydlí (id) – jejich domácnosti pracují jen v dílně
 * (crafts.md – Práce a jídlo); prázdná dílna se nepočítá, uhlíř, který dnes odpočívá od milíře
 * (`resting` – `restingBurners`), taky ne – pracuje se vsí.
 */
export function craftHouseholds(
  state: Pick<VillageState, 'dwellings' | 'people'>,
  resting: ReadonlySet<number> = new Set(),
): Set<number> {
  const households = new Set<number>();
  if (!state.dwellings.some((d) => d.workshop)) return households;
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  for (const d of state.dwellings) {
    if (d.workshop && occupied.has(d.id) && !resting.has(d.id)) households.add(d.id);
  }
  return households;
}

/** Obývané dílny řemesla `craft` v pořadí id. */
function occupiedWorkshops(state: VillageState, craft: Craft): Dwelling[] {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings
    .filter((d) => d.workshop?.craft === craft && occupied.has(d.id))
    .sort((a, b) => a.id - b.id);
}

/**
 * Kolik uhlí ročně spálí kováři vsi při dnešní práci (kg) – podle toho uhlíř pálí jen do zásoby
 * na rok (crafts.md – Uhlíř).
 */
export function smithsCharcoalPerYear(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): number {
  return smithCharcoalPerYear(
    occupiedWorkshops(state, 'smith').map((d) => ({
      labor: workshopLabor(state, day, d.id, coverage.pottery, productivity).craft,
      oreFactor: oreFactor(d.workshop!),
    })),
  );
}

/**
 * Uhlíři, kteří dnes od milíře odpočívají a pracují se vsí (id obydlí, crafts.md – Uhlíř): nemají
 * rozdělaný milíř, není kdy a kam sázet a ves má uhlí do zásoby na rok spotřeby kovářů – i s uhlím,
 * které nový milíř uhlíře před nimi (v pořadí id) dá.
 */
export function restingBurners(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): Set<number> {
  const resting = new Set<number>();
  // běžná ves bez uhlíře – bez procházení lidí (volá se každý den)
  if (!state.dwellings.some((d) => d.workshop?.craft === 'burner')) return resting;
  const burners = occupiedWorkshops(state, 'burner');
  if (burners.length === 0) return resting;
  let shortfall = charcoalShortfallKg(
    state,
    smithsCharcoalPerYear(state, day, coverage, productivity),
  );
  for (const d of burners) {
    const workshop = d.workshop!;
    if (burnerRests(workshop, day, shortfall)) resting.add(d.id);
    else if (!workshop.kiln && shortfall > 0) {
      // začne nový milíř – další uhlíř počítá s jeho uhlím
      shortfall -= CHARCOAL_KILN.trees * CRAFT_PRODUCTION.charcoalKgPerTree;
    }
  }
  return resting;
}

/** Práce domácnosti dílny za den: celkem (se štěstím), minimum, domácí výroba a řemeslo. */
export interface WorkshopLabor {
  capacity: number;
  dailyMin: number;
  domestic: number;
  craft: number;
}

/**
 * Práce domácnosti dílny `dwellingId` v den `day`: všechna práce jejích lidí krát `productivity`
 * (štěstí) – nejdřív denní minimum (meze podle pokrytí nádobami), pak domácí výroba (i palivo
 * dál od lesa), zbytek dostane řemeslo (crafts.md – řemeslník na plný úvazek). Dílnu provozuje
 * celá domácnost – starší děti a starší pomáhají jako na poli.
 */
export function workshopLabor(
  state: VillageState,
  day: number,
  dwellingId: number,
  potteryCoverage: number,
  productivity = 1,
): WorkshopLabor {
  const members = state.people.filter((p) => p.dwellingId === dwellingId);
  const capacity = Math.max(
    0,
    members.reduce((sum, p) => sum + laborPerDay(p, day), 0) * productivity,
  );
  let left = capacity;
  const take = (wanted: number): number => {
    const amount = Math.max(0, Math.min(wanted, left));
    left -= amount;
    return amount;
  };
  const dailyMin = take(dailyMinPerHousehold(potteryCoverage));
  const domestic = take(
    DOMESTIC.perHousehold +
      DOMESTIC.perPerson * members.length +
      fuelExtraPerDay(state, (id) => id === dwellingId),
  );
  return { capacity, dailyMin, domestic, craft: left };
}

/** Kam práce dílny dnes šla – rozdělení práce dne pro postavy (labor-report.ts). */
export interface WorkshopDay {
  dwellingId: number;
  craft: Craft;
  /** Denní minimum a domácí výroba domácnosti dílny (člověkodny). */
  domestic: number;
  /** Kácení stromů na uhlí nebo palivo (člověkodny) a stromy, u kterých se kácelo. */
  felling: number;
  fellingTrees: number[];
  /** Práce v dílně – stavba, hlídání a vytahání milíře, kování, hrnčířství (člověkodny). */
  making: number;
  /** Kolik kg výrobku dnes vzniklo. */
  producedKg: number;
  /** Uhlíř: sázení mladých buků (čd) a pařezy, na které dnes zasadil; jinak chybí. */
  planting?: number;
  plantedTrees?: number[];
  /** Uhlíř: milíř v lese, u kterého se dnes pracovalo (střed, m); u dílny chybí. */
  kilnSite?: { x: number; z: number };
}

/** Odkud dílna kácí: uhlíř od milíře (tam polena skládá), hrnčíř od dílny. */
function fellingFrom(dwelling: Dwelling, craft: Craft): { x: number; z: number } {
  if (craft !== 'burner') return dwelling.position;
  const [x, z] = milirCenter(dwelling.position);
  return { x, z };
}

/**
 * Další strom dílny: nejbližší stojící dospělý strom, který nepatří jiné stavbě ani dílně a není
 * posvátný (forest.md – kácení, vzdálenost). Bez vrstvy překážek (null – jen testy) se kácí bez
 * polohy za cenu blízkého lesa. Když není z čeho kácet, null.
 */
function nextTree(
  state: VillageState,
  dwelling: Dwelling,
  craft: Craft,
  day: number,
  obstacles: ObstacleLayer | null,
): WorkshopFelling | null {
  if (!obstacles) return { id: null, cost: fellingCost(0), done: 0 };
  // bez stromů v celé krajině se nehledá po políčkách (celá vrstva by se procházela každý den)
  if (availableTrees(obstacles, state, day) <= 0) return null;
  const [tree] = nearestMatureTrees(
    obstacles,
    obstacleChangesAt(state, day),
    fellingFrom(dwelling, craft),
    1,
    claimedObstacles(state),
  );
  return tree ? { id: tree.id, cost: fellingCost(tree.distanceM), done: 0 } : null;
}

/** Výsledek dne jedné dílny před zapsáním do rozdělení práce. */
interface WorkshopOutput {
  felling: number;
  fellingTrees: number[];
  making: number;
  producedKg: number;
  activity: WorkshopActivity;
}

/**
 * Den uhlíře nebo hrnčíře – dílny, které kácejí (mutuje stav): práce jde do výroby, dokud
 * skácené dřevo stačí (`fuelKg`), pak do kácení dalšího stromu (pařez, vzdálenost); skácený strom
 * dá `kgPerTree` výrobku. Když není z čeho kácet, zbytek práce propadne.
 */
function workWithWood(
  state: VillageState,
  dwelling: Dwelling,
  workshop: Workshop,
  labor: number,
  day: number,
  obstacles: ObstacleLayer | null,
  manDaysPerKg: number,
  kgPerTree: number,
): WorkshopOutput {
  let left = labor;
  let felling = 0;
  let making = 0;
  let producedKg = 0;
  let noWood = false;
  const fellingTrees: number[] = [];
  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    if (workshop.fuelKg > EPSILON) {
      const kg = Math.min(workshop.fuelKg, left / manDaysPerKg);
      workshop.fuelKg = Math.max(0, workshop.fuelKg - kg);
      left -= kg * manDaysPerKg;
      making += kg * manDaysPerKg;
      producedKg += kg;
      continue;
    }
    workshop.felling ??= nextTree(state, dwelling, workshop.craft, day, obstacles);
    const tree = workshop.felling;
    if (!tree) {
      noWood = true;
      break;
    }
    const work = Math.min(left, Math.max(0, tree.cost - tree.done));
    tree.done += work;
    left -= work;
    felling += work;
    if (tree.id !== null && !fellingTrees.includes(tree.id)) fellingTrees.push(tree.id);
    if (tree.done + EPSILON >= tree.cost) {
      // pokácený strom nechá pařez; vyhrazený strom, který mezitím zmizel (vyklidila ho jiná
      // stavba), dílna počítá jako svůj – jako stavby (fellAsWorked)
      if (tree.id !== null && isTreeStanding(state, tree.id, day)) {
        state.felledTrees = fellTrees(state, [tree.id], day).felledTrees ?? [];
      }
      workshop.felling = null;
      workshop.fuelKg += kgPerTree;
    }
  }
  const activity: WorkshopActivity =
    producedKg > EPSILON
      ? 'producing'
      : felling > EPSILON
        ? 'felling'
        : noWood
          ? 'no-wood'
          : 'idle';
  return { felling, fellingTrees, making, producedKg, activity };
}

/** Den kováře (mutuje stav): kuje, dokud má práci a uhlí – bez uhlí stojí. */
function workSmith(stocks: CraftStocks, workshop: Workshop, labor: number): WorkshopOutput {
  const manDaysPerKg = CRAFT_PRODUCTION.toolManDaysPerKg * oreFactor(workshop);
  const kg = Math.max(
    0,
    Math.min(labor / manDaysPerKg, stocks.charcoalKg / CRAFT_PRODUCTION.toolCharcoalKgPerKg),
  );
  stocks.toolsKg += kg;
  stocks.charcoalKg = Math.max(0, stocks.charcoalKg - kg * CRAFT_PRODUCTION.toolCharcoalKgPerKg);
  const activity: WorkshopActivity =
    labor <= EPSILON ? 'idle' : kg > EPSILON ? 'producing' : 'no-charcoal';
  return { felling: 0, fellingTrees: [], making: kg * manDaysPerKg, producedKg: kg, activity };
}

/** Přirážka za rudu nebo hlínu dál od potoka (+1 % za 10 m nad 100 m – crafts.md). */
export function oreFactor(workshop: Pick<Workshop, 'waterDistanceM'>): number {
  return distanceFactor(workshop.waterDistanceM ?? 0);
}

/** Pořadí dílen ve výrobě dne: uhlíři první (jejich uhlí kovář hned použije), pak podle id. */
function workshopOrder(a: Dwelling, b: Dwelling): number {
  const craft = (d: Dwelling): number => CRAFTS.indexOf(d.workshop?.craft ?? 'burner');
  return craft(a) - craft(b) || a.id - b.id;
}

/**
 * Krok práce řemeslníků (mutuje stav): každá obývaná dílna dá řemeslu práci své domácnosti po
 * minimu a domácí výrobě (`workshopLabor`) – uhlíř pálí buky v milířích a sází mladé buky
 * (charcoal.ts), hrnčíř kácí na palivo a vypaluje nádoby, kovář kuje z uhlí ze zásob. Prázdná
 * dílna nic nevyrábí, odpočívající uhlíř (`resting` – spočítá ho volající před rozdělením práce
 * vsi) pracuje se vsí. Vrací, kam práce šla (rozdělení práce dne pro scénu).
 */
export function workCrafts(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  productivity = 1,
  resting: ReadonlySet<number> = restingBurners(state, day, coverage, productivity),
): WorkshopDay[] {
  const workshops = state.dwellings.filter((d) => d.workshop).sort(workshopOrder);
  if (workshops.length === 0) return [];
  const households = craftHouseholds(state);
  const stocks = (state.crafts ??= { ...NO_STOCKS });
  const days: WorkshopDay[] = [];
  const smithsPerYear = workshops.some((d) => d.workshop?.craft === 'burner')
    ? smithsCharcoalPerYear(state, day, coverage, productivity)
    : 0;
  for (const dwelling of workshops) {
    const workshop = dwelling.workshop!;
    if (!households.has(dwelling.id)) {
      workshop.activity = 'empty';
      continue;
    }
    if (resting.has(dwelling.id)) {
      // uhlí je dost – domácnost uhlíře dnes pracuje se vsí (crafts.md – Uhlíř)
      workshop.activity = 'resting';
      continue;
    }
    const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity);
    if (workshop.craft === 'burner') {
      const burner = workBurner(state, dwelling, stocks, labor.craft, day, obstacles, {
        startNew: charcoalShortfallKg(state, smithsPerYear) > 0,
      });
      workshop.activity = burner.activity;
      days.push({
        dwellingId: dwelling.id,
        craft: workshop.craft,
        domestic: labor.dailyMin + labor.domestic,
        felling: burner.felling,
        fellingTrees: burner.fellingTrees,
        making: burner.making,
        producedKg: burner.producedKg,
        ...(burner.planting > 0
          ? { planting: burner.planting, plantedTrees: burner.plantedTrees }
          : {}),
        ...(burner.site ? { kilnSite: { ...burner.site } } : {}),
      });
      continue;
    }
    let output: WorkshopOutput;
    if (workshop.craft === 'smith') {
      output = workSmith(stocks, workshop, labor.craft);
    } else {
      output = workWithWood(
        state,
        dwelling,
        workshop,
        labor.craft,
        day,
        obstacles,
        CRAFT_PRODUCTION.potteryManDaysPerKg * oreFactor(workshop),
        CRAFT_PRODUCTION.potteryKgPerTree,
      );
      stocks.potteryKg += output.producedKg;
    }
    workshop.activity = output.activity;
    days.push({
      dwellingId: dwelling.id,
      craft: workshop.craft,
      domestic: labor.dailyMin + labor.domestic,
      felling: output.felling,
      fellingTrees: output.fellingTrees,
      making: output.making,
      producedKg: output.producedKg,
    });
  }
  return days;
}

// --- půdorys dílny a milíře (umístění, scéna) ---------------------------------------------

/** Střed milíře uhlíře ve světě – kus od zemnice (MILIR.offset v souřadnicích modelu). */
export function milirCenter(position: Position): Point {
  return buildingLocalToWorld(position, MILIR.offset.x, MILIR.offset.z);
}

/** Poloha milíře pro scénu – střed a natočení jako zemnice. */
export function milirPosition(position: Position): Position {
  const [x, z] = milirCenter(position);
  return { x, z, rotation: position.rotation };
}

/**
 * Půdorys dílny ve světě: obydlí řemesla (u hrnčíře a kováře prodloužené o přístřešek vpředu)
 * a u uhlíře navíc čtverec milíře – nic z toho se nesmí překrývat s jinou stavbou.
 */
export function workshopFootprints(craft: Craft, position: Position): Point[][] {
  const { width, depth } = DWELLING_FOOTPRINT_M[CRAFT_BASE[craft]];
  const porch = WORKSHOP_PORCH_M[craft];
  const [cx, cz] = buildingLocalToWorld(position, 0, porch / 2);
  const house = rectangleCorners(cx, cz, width, depth + porch, position.rotation);
  if (craft !== 'burner') return [house];
  const [mx, mz] = milirCenter(position);
  return [house, rectangleCorners(mx, mz, MILIR.footprintM, MILIR.footprintM, position.rotation)];
}

/**
 * Vyklízený kruh kolem milíře (mnohoúhelník ve světě) – překážky z něj osadníci odstraní.
 * Deterministicky – kontrola v prohlížeči a na serveru musí najít tytéž překážky.
 */
export function milirClearing(position: Position): Point[] {
  return Array.from({ length: MILIR_CLEARING_SIDES }, (_, i) => {
    const angle = (2 * Math.PI * i) / MILIR_CLEARING_SIDES;
    return buildingLocalToWorld(
      position,
      MILIR.offset.x + MILIR.clearingRadiusM * detCos(angle),
      MILIR.offset.z + MILIR.clearingRadiusM * detSin(angle),
    );
  });
}
