import { detCos, detSin, type Landscape, type ObstacleLayer } from '../landscape';
import { distanceFactor } from './fields';
import { buildingLocalToWorld, fellTrees, obstacleChangesAt } from './obstacles';
import { adultDailyMin, waterFetchingLabor } from './labor';
import { ageGroup, laborPerDay } from './people';
import { rectangleCorners, type Point } from './polygon';
import { NO_CRAFTS, dailyMinPerHousehold } from './productivity';
import {
  CRAFTS,
  CRAFT_BASE,
  CRAFT_NEEDS,
  CRAFT_PRODUCTION,
  DWELLING_FOOTPRINT_M,
  MILIR,
  WOOD_TOOLS,
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
import {
  charcoalDrawKg,
  inPlantingWindow,
  kilnLeadDays,
  migrateBurner,
  smithForgeCharcoalKg,
  workBurner,
} from './charcoal';
import { villageRoadWalk } from './paths/walking';
import {
  availableTrees,
  claimedObstacles,
  fellingCost,
  isTreeStanding,
  nearestMatureTrees,
} from './wood';

// Řemesla (crafts.md): dílna je obydlí s řemeslem (hrnčíř, kovář, uhlíř), domácnost, která v ní
// bydlí, pracuje na plný úvazek jen v dílně (po denním minimu, nikdy na poli ani
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
/** Dřevěné nářadí od tesaře v užívání se opotřebí o WOOD_TOOLS.wearPerYear ročně (wagons.md). */
const WOOD_TOOLS_WEAR_PER_DAY = WOOD_TOOLS.wearPerYear / DAYS_PER_YEAR;
/** Mnohoúhelník vyklízeného kruhu milíře – počet vrcholů. */
const MILIR_CLEARING_SIDES = 12;

/** Zásoby vsi bez řemesel. */
export const NO_STOCKS: CraftStocks = { charcoalKg: 0, toolsKg: 0, potteryKg: 0 };

/** Názvy řemesel a dílen pro hráče (1. pád). */
export const CRAFT_NAMES: Readonly<Record<Craft, string>> = {
  potter: 'Hrnčíř',
  smith: 'Kovář',
  burner: 'Uhlíř',
  carpenter: 'Tesař',
};

/** Zásoby výrobků řemeslníků (vsi uložené před řemesly 0). */
export function craftStocks(state: Pick<VillageState, 'crafts'>): CraftStocks {
  return state.crafts ?? NO_STOCKS;
}

/** Potřeba výrobků řemeslníků (kg): nástroje, nádoby a dřevěné nářadí. */
export interface CraftNeeds {
  toolsKg: number;
  potteryKg: number;
  woodToolsKg: number;
}

/**
 * Potřeba vsi: nástroje pro pracující od 14 let a nádoby pro všechny (kg, crafts.md – Účinek),
 * dřevěné nářadí pro pracující od 14 let (wagons.md – Tesař).
 */
export function craftNeeds(state: Pick<VillageState, 'people'>, day: number): CraftNeeds {
  const workers = state.people.filter((p) => ageGroup(p, day) !== 'child').length;
  return {
    toolsKg: CRAFT_NEEDS.toolsKgPerWorker * workers,
    potteryKg: CRAFT_NEEDS.potteryKgPerPerson * state.people.length,
    woodToolsKg: WOOD_TOOLS.kgPerWorker * workers,
  };
}

/** Pokrytí potřeby zásobou 0–1; bez potřeby plné, je-li něco v zásobě. */
function coverageOf(stockKg: number, needKg: number): number {
  if (needKg <= 0) return stockKg > EPSILON ? 1 : 0;
  return Math.min(1, Math.max(0, stockKg / needKg));
}

/**
 * Pokrytí potřeby výrobků řemeslníků v den `day` (crafts.md – Meze produktivity): zásoba
 * nástrojů ÷ potřeba pracujících a zásoba keramiky ÷ potřeba všech lidí, nejvýš 1; dřevěné
 * nářadí od tesaře ÷ potřeba pracujících (wagons.md – jen když nějaké je, jinak chybí = 0). Ves
 * bez zásob (i uložená před řemesly) má pokrytí 0 – platí nejhorší meze.
 */
export function craftCoverage(
  state: Pick<VillageState, 'people' | 'crafts'>,
  day: number,
): CraftCoverage {
  const stocks = state.crafts;
  const woodTools = stocks?.woodToolsKg ?? 0;
  if (!stocks || (stocks.toolsKg <= 0 && stocks.potteryKg <= 0 && woodTools <= 0)) {
    return NO_CRAFTS;
  }
  const needs = craftNeeds(state, day);
  return {
    tools: coverageOf(stocks.toolsKg, needs.toolsKg),
    pottery: coverageOf(stocks.potteryKg, needs.potteryKg),
    ...(woodTools > 0 ? { woodTools: coverageOf(woodTools, needs.woodToolsKg) } : {}),
  };
}

/**
 * Jeden den opotřebení (mutuje stav): z nástrojů v užívání ubyde 30 % / 365 denně, z nádob
 * 40 % / 365. V užívání je nejvýš tolik, kolik ves potřebuje – přebytek v zásobě leží
 * (crafts.md).
 */
export function wearCraftStocks(state: VillageState, day: number): void {
  const stocks = state.crafts;
  const woodTools = stocks?.woodToolsKg ?? 0;
  if (!stocks || (stocks.toolsKg <= 0 && stocks.potteryKg <= 0 && woodTools <= 0)) return;
  const needs = craftNeeds(state, day);
  stocks.toolsKg -= Math.min(stocks.toolsKg, needs.toolsKg) * TOOL_WEAR_PER_DAY;
  stocks.potteryKg -= Math.min(stocks.potteryKg, needs.potteryKg) * POTTERY_BREAKAGE_PER_DAY;
  // dřevěné nářadí od tesaře (wagons.md) – jen vsi, které nějaké mají
  if (woodTools > 0) {
    stocks.woodToolsKg =
      woodTools - Math.min(woodTools, needs.woodToolsKg) * WOOD_TOOLS_WEAR_PER_DAY;
  }
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
 * (crafts.md – Práce a jídlo); prázdná dílna se nepočítá, řemeslník, který dnes nemá v dílně co
 * dělat (`resting` – `restingCrafters`), taky ne – pracuje se vsí.
 */
export function craftHouseholds(
  state: Pick<VillageState, 'dwellings' | 'people'>,
  resting: { has(id: number): boolean } = new Set<number>(),
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
export function occupiedWorkshops(state: VillageState, craft: Craft): Dwelling[] {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings
    .filter((d) => d.workshop?.craft === craft && occupied.has(d.id))
    .sort((a, b) => a.id - b.id);
}

/**
 * Zásoba, do které řemeslníci vyrábějí (kg, crafts.md – Podle potřeby, návrh Clauda): potřeba vsi
 * a k ní opotřebení za CRAFT_NEEDS.reserveYears – nástroje potřeba × 1,3, keramika × 1,4. Ves
 * s takovou zásobou má potřebu pokrytou i za rok, kdy se část opotřebí.
 */
export function craftTargets(state: Pick<VillageState, 'people'>, day: number): CraftNeeds {
  const needs = craftNeeds(state, day);
  return {
    toolsKg: needs.toolsKg * (1 + CRAFT_NEEDS.toolWearPerYear * CRAFT_NEEDS.reserveYears),
    potteryKg:
      needs.potteryKg * (1 + CRAFT_NEEDS.potteryBreakagePerYear * CRAFT_NEEDS.reserveYears),
    // tesař vyrábí dřevěné nářadí do zásoby jako kovář nástroje (wagons.md – Tesař)
    woodToolsKg: needs.woodToolsKg * (1 + WOOD_TOOLS.wearPerYear * WOOD_TOOLS.reserveYears),
  };
}

/**
 * Kolik uhlí ročně kováři vsi spálí (kg) – podle toho uhlíř rozebere zbytek milíře a začne nový
 * včas (crafts.md – Milíř stojí vždy): nástroje, které ves za rok opotřebí, a co chybí do zásoby
 * (`craftTargets`), po 50 kg uhlí na kg – nejvýš kolik kováři při dnešní práci vykovají za rok na
 * plný úvazek. Bez kováře 0.
 */
export function smithsCharcoalPerYear(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): number {
  const smiths = occupiedWorkshops(state, 'smith');
  if (smiths.length === 0) return 0;
  const fullTime =
    smithForgeCharcoalKg(
      smiths.map((d) => ({
        labor: workshopLabor(state, day, d.id, coverage.pottery, productivity).craft,
        oreFactor: oreFactor(d.workshop!),
      })),
    ) * DAYS_PER_YEAR;
  const needs = craftNeeds(state, day);
  const missing = Math.max(0, craftTargets(state, day).toolsKg - craftStocks(state).toolsKg);
  const toolsPerYear = needs.toolsKg * CRAFT_NEEDS.toolWearPerYear + missing;
  return Math.min(fullTime, toolsPerYear * CRAFT_PRODUCTION.toolCharcoalKgPerKg);
}

/**
 * Kolik uhlí kováři spálí, než uhlíř `dwelling` připraví a vypálí další milíř (kg; crafts.md –
 * Milíř stojí vždy): roční spotřeba kovářů (`smithsCharcoalPerYear`) po dnech × doba přípravy
 * a pálení podle jeho milíře a dnešní práce (`kilnLeadDays`). Bez milíře nebo kováře 0.
 */
function kilnLeadKg(
  state: VillageState,
  day: number,
  dwelling: Dwelling,
  coverage: CraftCoverage,
  productivity: number,
  smithsPerYearKg: number,
): number {
  const kiln = dwelling.workshop?.kiln;
  if (!kiln || smithsPerYearKg <= 0) return 0;
  const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity).craft;
  return (smithsPerYearKg / DAYS_PER_YEAR) * kilnLeadDays(kiln, dwelling.position, labor);
}

/**
 * Kolik uhlí kováři vsi dnes spálí (kg) – podle toho uhlíř nosí uhlí z vypáleného milíře
 * (crafts.md – Milíř stojí vždy): kováři, kteří dnes kovou (zásoba nástrojů je pod `craftTargets`),
 * na plný úvazek při dnešní práci, po 50 kg uhlí na kg nástrojů. Bez kováře, nebo s plnou zásobou
 * nástrojů 0.
 */
export function smithsForgeCharcoalKg(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): number {
  const smiths = occupiedWorkshops(state, 'smith');
  if (smiths.length === 0) return 0;
  if (craftStocks(state).toolsKg >= craftTargets(state, day).toolsKg) return 0;
  return smithForgeCharcoalKg(
    smiths.map((d) => ({
      labor: workshopLabor(state, day, d.id, coverage.pottery, productivity).craft,
      oreFactor: oreFactor(d.workshop!),
    })),
  );
}

/**
 * Řemeslníci, kteří dnes nemají v dílně co dělat, a jejich domácnost proto pracuje se vsí jako
 * ostatní (id obydlí; crafts.md – Podle potřeby, Martin 18. 10. 2026: „pokud uhlíř a kovář budou
 * mít volný čas, ať pracují na poli jako zbytek vesnice“):
 * - kovář, když zásoba nástrojů dosáhla `craftTargets`, nebo nemá uhlí (ani mu ho dnes uhlíř
 *   nedonese z vypáleného milíře),
 * - hrnčíř, když zásoba keramiky dosáhla `craftTargets`, nebo nemá palivo ani z čeho kácet,
 * - uhlíř (crafts.md – Milíř stojí vždy), když má vypálený milíř, uhlí u kováře stačí na dnešní
 *   kování (`charcoalDrawKg` – i s uhlím, které dnes donese uhlíř před ním v pořadí id) a není kdy
 *   a kam sázet; uhlíř bez milíře nový začne – odpočívá, jen když nejsou buky.
 * Rozhoduje se na začátku dne ze včerejších zásob; hodnota = co dílna dnes ukáže (`resting` –
 * plná zásoba, `no-charcoal` / `no-wood` – chybí vstup, upozornění pro hráče). `obstacles` =
 * vrstva překážek (dřevo hrnčíře a buky uhlíře); bez ní (null – jen testy) dřeva neomezeně.
 * Tesaře (wagons.md) rozhoduje `restingCarpenters` (carpentry.ts).
 */
export function restingCrafters(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
  obstacles: ObstacleLayer | null = null,
): Map<number, WorkshopActivity> {
  const resting = new Map<number, WorkshopActivity>();
  // běžná ves bez dílen – bez procházení lidí (volá se každý den)
  if (!state.dwellings.some((d) => d.workshop)) return resting;
  const stocks = craftStocks(state);
  const targets = craftTargets(state, day);
  // uhlíři napřed – kolik uhlí dnes kovářům donesou z vypálených milířů
  const loose = restingBurners(state, day, coverage, productivity, obstacles, resting);
  for (const d of occupiedWorkshops(state, 'smith')) {
    if (stocks.toolsKg >= targets.toolsKg) resting.set(d.id, 'resting');
    else if (loose <= 0) resting.set(d.id, 'no-charcoal');
  }
  for (const d of occupiedWorkshops(state, 'potter')) {
    const workshop = d.workshop!;
    const noWood =
      workshop.fuelKg <= 0 &&
      workshop.felling === null &&
      obstacles !== null &&
      availableTrees(obstacles, state, day) <= 0;
    if (stocks.potteryKg >= targets.potteryKg) resting.set(d.id, 'resting');
    else if (noWood) resting.set(d.id, 'no-wood');
  }
  return resting;
}

/**
 * Uhlíři, kteří dnes pracují se vsí (zapíše do `resting`; crafts.md – Milíř stojí vždy), a kolik
 * uhlí bude dnes u kovářů (kg – uhlí u kováře a co dnes uhlíři donesou z vypálených milířů,
 * v pořadí id). Milíř, který se staví nebo pálí, uhlíř dodělá; bez milíře začne nový (bez buků
 * `no-wood`); z vypáleného nosí, když u kovářů nestačí na dnešní kování, jinak sází nebo
 * odpočívá.
 */
function restingBurners(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity: number,
  obstacles: ObstacleLayer | null,
  resting: Map<number, WorkshopActivity>,
): number {
  let loose = craftStocks(state).charcoalKg;
  const burners = occupiedWorkshops(state, 'burner');
  if (burners.length === 0) return loose;
  const forgeKg = smithsForgeCharcoalKg(state, day, coverage, productivity);
  const perYear = smithsCharcoalPerYear(state, day, coverage, productivity);
  for (const d of burners) {
    const workshop = d.workshop!;
    const kiln = workshop.kiln ?? null;
    const planting = inPlantingWindow(day) && (workshop.toPlant?.length ?? 0) > 0;
    if (!kiln) {
      // milíř stojí vždy – uhlíř začne nový, jen bez buků čeká na dřevo
      const noBeeches =
        !planting && obstacles !== null && availableTrees(obstacles, state, day, 'beeches') <= 0;
      if (noBeeches) resting.set(d.id, 'no-wood');
      continue;
    }
    if (kiln.stage !== 'draw') continue;
    const lead = kilnLeadKg(state, day, d, coverage, productivity, perYear);
    const draw = charcoalDrawKg(kiln, loose, forgeKg, lead);
    loose += draw;
    if (draw <= 0 && !planting) resting.set(d.id, 'resting');
  }
  return loose;
}

/** Práce domácnosti dílny za den: celkem (se štěstím), denní minimum a řemeslo. */
export interface WorkshopLabor {
  capacity: number;
  dailyMin: number;
  craft: number;
}

/**
 * Práce domácnosti dílny `dwellingId` v den `day`: všechna práce jejích lidí krát `productivity`
 * (štěstí) – nejdřív denní minimum (meze podle pokrytí nádobami), zbytek dostane řemeslo
 * (crafts.md – řemeslník na plný úvazek). Dílnu provozuje celá domácnost – starší pomáhají jako
 * na poli; domácí výrobu obstarají ženy bokem a výrostci jsou u zvířat (population.md – Práce).
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
  // denní minimum (s přirážkou za chůzi pro vodu) kryjí napřed starší domácnosti, dospělí dají
  // zbytek (population.md – Práce)
  const elders = members.filter((p) => ageGroup(p, day) === 'elder').length;
  const water = waterFetchingLabor(
    members.length,
    state.dwellings.find((d) => d.id === dwellingId)?.waterWalkM,
  );
  const minimum = dailyMinPerHousehold(potteryCoverage) + water;
  const dailyMin = take(adultDailyMin(minimum, elders, productivity));
  return { capacity, dailyMin, craft: left };
}

/** Kam práce dílny dnes šla – rozdělení práce dne pro postavy (labor-report.ts). */
export interface WorkshopDay {
  dwellingId: number;
  craft: Craft;
  /** Denní minimum domácnosti dílny (člověkodny). */
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
export function nextTree(
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
 * denním minimu (`workshopLabor`) – uhlíř pálí buky v milířích a sází mladé buky
 * (charcoal.ts), hrnčíř kácí na palivo a vypaluje nádoby, kovář kuje z uhlí ze zásob. Prázdná
 * dílna nic nevyrábí, řemeslník bez práce v dílně (`resting` – spočítá ho volající před
 * rozdělením práce vsi) pracuje se vsí. Vrací, kam práce šla (rozdělení práce dne pro scénu).
 */
export function workCrafts(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  productivity = 1,
  resting: ReadonlyMap<number, WorkshopActivity> = restingCrafters(
    state,
    day,
    coverage,
    productivity,
    obstacles,
  ),
  landscape: Landscape | null = null,
): WorkshopDay[] {
  // tesaře (wagons.md) řídí krok práce zvlášť – pomoc stavbám jde před stavbami dne
  // (carpentry.ts – `workCarpenter`)
  const workshops = state.dwellings
    .filter((d) => d.workshop && d.workshop.craft !== 'carpenter')
    .sort(workshopOrder);
  if (workshops.length === 0) return [];
  const households = craftHouseholds(state);
  const stocks = (state.crafts ??= { ...NO_STOCKS });
  const days: WorkshopDay[] = [];
  const burners = workshops.filter((d) => d.workshop?.craft === 'burner');
  // starší dílny uhlířů (dřevo před milíři, milíř vytahaný najednou) – jednou, v prvním dni
  for (const d of burners) migrateBurner(d.workshop!, stocks);
  const forgeKg =
    burners.length > 0 ? smithsForgeCharcoalKg(state, day, coverage, productivity) : 0;
  const perYear =
    burners.length > 0 ? smithsCharcoalPerYear(state, day, coverage, productivity) : 0;
  for (const dwelling of workshops) {
    const workshop = dwelling.workshop!;
    if (!households.has(dwelling.id)) {
      workshop.activity = 'empty';
      continue;
    }
    const free = resting.get(dwelling.id);
    if (free) {
      // výrobků je dost (nebo chybí vstup) – domácnost dnes pracuje se vsí (crafts.md)
      workshop.activity = free;
      continue;
    }
    const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity);
    if (workshop.craft === 'burner') {
      const burner = workBurner(
        state,
        dwelling,
        stocks,
        labor.craft,
        day,
        obstacles,
        // z vypáleného milíře donese uhlí, když u kovářů nestačí na dnešní kování, a zbytek
        // vytahá celý, když stačí jen na přípravu dalšího milíře
        {
          drawKg: charcoalDrawKg(
            workshop.kiln,
            stocks.charcoalKg,
            forgeKg,
            kilnLeadKg(state, day, dwelling, coverage, productivity, perYear),
          ),
        },
        // chůze po pevných cestách s půdou krajiny (paths/walking.ts) – graf cest až při výběru
        // dávky; bez krajiny vzdušně
        landscape ? (from, targets) => villageRoadWalk(state, landscape)(from, targets) : undefined,
      );
      workshop.activity = burner.activity;
      days.push({
        dwellingId: dwelling.id,
        craft: workshop.craft,
        domestic: labor.dailyMin,
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
      domestic: labor.dailyMin,
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
 * `margin` (m) ho rozšíří (v lese pruh pod korunami – FOREST_CROWN_MARGIN_M). Deterministicky –
 * kontrola v prohlížeči a na serveru musí najít tytéž překážky.
 */
export function milirClearing(position: Position, margin = 0): Point[] {
  const radius = MILIR.clearingRadiusM + margin;
  return Array.from({ length: MILIR_CLEARING_SIDES }, (_, i) => {
    const angle = (2 * Math.PI * i) / MILIR_CLEARING_SIDES;
    return buildingLocalToWorld(
      position,
      MILIR.offset.x + radius * detCos(angle),
      MILIR.offset.z + radius * detSin(angle),
    );
  });
}
