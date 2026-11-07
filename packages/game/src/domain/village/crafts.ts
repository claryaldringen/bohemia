import { length2, type Landscape, type ObstacleLayer } from '../landscape';
import { buildingLocalToWorld, fellTrees, obstacleChangesAt } from './obstacles';
import { adultDailyMin, waterFetchingLabor } from './labor';
import { ageGroup, laborPerDay } from './people';
import {
  barsReserveKg,
  bloomKg,
  forgeStep,
  ironBarsKg,
  ironDeficit,
  ironDeficitCharcoalKg,
  ironWorkManDays,
  refineStep,
  smeltRate,
  smeltStep,
  smithBellows,
  toolEquipmentKg,
  toolNeedKg,
  type BellowsHelper,
  type IronDeficit,
} from './iron';
import { FORGE, REFINE, SMELT, smeltOreKg } from './iron-rates';
import { dugMaterialFactor } from './premium-effects';
import { workshopSkill } from './craft-skill';
import { isPlainShape, shapedFootprint, type DwellingShape } from './dwelling-shape';
import { rectangleCorners, type Point } from './polygon';
import { NO_CRAFTS, dailyMinPerHousehold } from './productivity';
import {
  CARPENTRY,
  CART_IRON,
  CHARCOAL_BALANCE,
  CHARCOAL_KILN,
  CRAFTS,
  CLAY,
  CRAFT_BASE,
  CRAFT_NEEDS,
  CRAFT_PRODUCTION,
  DWELLINGS,
  DWELLING_FOOTPRINT_M,
  HORSES,
  HORSE_SHOEING,
  SMITH_SUPPLY,
  WOOD_TOOLS,
  WORKSHOP_PORCH_M,
} from './rules';
import type {
  Craft,
  CraftCoverage,
  CraftStocks,
  Dwelling,
  LaborTarget,
  OreSite,
  Position,
  VillageState,
  Workshop,
  WorkshopActivity,
  WorkshopFelling,
} from './types';
import { harvestHandsDay } from './harvest-hands';
import {
  basketManDaysPerKg,
  craftHands,
  migratePotter,
  migrateSmith,
  potteryClayKg,
  smithCrewAges,
  workDug,
  workOre,
  type DugMaterial,
  type OreCartToday,
  type OreDay,
  type SmithFetchDay,
} from './smith-supply';
import {
  DRAW_MAN_DAYS_PER_KG,
  IDLE_BURNER,
  charcoalFetchKg,
  charcoalStockKg,
  charcoalUsePerDay,
  inPlantingWindow,
  kilnCharcoalKg,
  kilnCycleDays,
  kilnInProgress,
  kilnPoint,
  kilnWalkFactor,
  kilnYieldKg,
  migrateBurner,
  recordCharcoalUse,
  smithForgeCharcoalKg,
  startsNextKiln,
  workBurner,
  workshopKilns,
  type BurnerPlan,
  type KilnSiteFinder,
  type KilnWork,
} from './charcoal';
import { findKilnSite } from './kiln-site';
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
// Kovář taví z rudy a uhlí železnou houbu, překove ji na hřivny a z hřiven kove nástroje do
// vybavení domácností (production-chains.md – Kovář, iron.ts).
// Kroky simulace mutují stav – volat na klonu; den po dni, na kouscích nezávisí.

/** Tolerance proti chybám desetinných čísel (práce, palivo). */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků výroby jedné dílny za den (kácení a pálení se střídají). */
const MAX_STEPS = 64;
const DAYS_PER_YEAR = 365;
/**
 * Opotřebení a rozbití za den – podíl věcí v užívání. Ves, která potřebu drží pokrytou, ročně
 * nahradí právě 30 % nástrojů ve vybavení a 40 % nádob (crafts.md – Pro představu: 40 pracujících
 * ≈ 36 kg nástrojů ročně).
 */
const TOOL_WEAR_PER_DAY = CRAFT_NEEDS.toolWearPerYear / DAYS_PER_YEAR;
const POTTERY_BREAKAGE_PER_DAY = CRAFT_NEEDS.potteryBreakagePerYear / DAYS_PER_YEAR;
/** Dřevěné nářadí od tesaře v užívání se opotřebí o WOOD_TOOLS.wearPerYear ročně (wagons.md). */
const WOOD_TOOLS_WEAR_PER_DAY = WOOD_TOOLS.wearPerYear / DAYS_PER_YEAR;

/** Zásoby vsi bez řemesel. */
export const NO_STOCKS: CraftStocks = { charcoalKg: 0, potteryKg: 0 };

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

/** Potřeba výrobků řemeslníků (kg): nástroje ve vybavení, nádoby a dřevěné nářadí. */
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
    toolsKg: toolNeedKg(state, day),
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
 * Pokrytí potřeby výrobků řemeslníků v den `day` (crafts.md – Meze produktivity): nástroje ve
 * vybavení domácností ÷ potřeba pracujících (production-chains.md – Nástroje jako vybavení
 * domácností) a zásoba keramiky ÷ potřeba všech lidí, nejvýš 1; dřevěné nářadí od tesaře ÷ potřeba
 * pracujících (wagons.md – jen když nějaké je, jinak chybí = 0). Ves bez nástrojů a zásob (i uložená
 * před řemesly) má pokrytí 0 – platí nejhorší meze. Hřivny pokrytí nedávají – nástroje z nich
 * teprve kove kovář.
 */
export function craftCoverage(
  state: Pick<VillageState, 'people' | 'crafts' | 'toolEquipmentKg'>,
  day: number,
): CraftCoverage {
  const stocks = state.crafts;
  const equipment = toolEquipmentKg(state);
  const pottery = stocks?.potteryKg ?? 0;
  const woodTools = stocks?.woodToolsKg ?? 0;
  if (equipment <= 0 && pottery <= 0 && woodTools <= 0) return NO_CRAFTS;
  const needs = craftNeeds(state, day);
  return {
    tools: coverageOf(equipment, needs.toolsKg),
    pottery: coverageOf(pottery, needs.potteryKg),
    ...(woodTools > 0 ? { woodTools: coverageOf(woodTools, needs.woodToolsKg) } : {}),
  };
}

/**
 * Jeden den opotřebení (mutuje stav): z nástrojů ve vybavení domácností v užívání ubyde 30 % / 365
 * denně, z nádob 40 % / 365. V užívání je nejvýš tolik, kolik ves potřebuje – přebytek leží
 * (crafts.md). Hřivny a houba se neopotřebují.
 */
export function wearCraftStocks(state: VillageState, day: number): void {
  const stocks = state.crafts;
  const equipment = toolEquipmentKg(state);
  const pottery = stocks?.potteryKg ?? 0;
  const woodTools = stocks?.woodToolsKg ?? 0;
  if (equipment <= 0 && pottery <= 0 && woodTools <= 0) return;
  const needs = craftNeeds(state, day);
  if (equipment > 0) {
    state.toolEquipmentKg = equipment - Math.min(equipment, needs.toolsKg) * TOOL_WEAR_PER_DAY;
  }
  if (!stocks) return;
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
  const counts = new Map<number, number>();
  for (const p of state.people) counts.set(p.dwellingId, (counts.get(p.dwellingId) ?? 0) + 1);
  for (const d of state.dwellings) {
    const count = counts.get(d.id) ?? 0;
    // Dílna přeplněná přistěhovanými (evakuace bez jiného domu) nemá řemeslnickou domácnost –
    // lidé pracují vsí (návrh Clauda).
    if (d.workshop && count > 0 && count <= DWELLINGS[d.type].capacity && !resting.has(d.id)) {
      households.add(d.id);
    }
  }
  return households;
}

/**
 * Lehčí práce žen domácností dílen, které dnes pracují v dílně (`households` – `craftHouseholds`):
 * zbytek jejich práce po denním minimu jde do práce vsi (crafts.md – Kdo dělá řemeslo; Martin
 * 22. 10. 2026: „Ženy řemeslníků se starají o domácnost a k tomu dělají lehčí polní práce se
 * vsí“). Vrací člověkodny před štěstím (jako kapacita vsi v `allocateDay`).
 */
export function craftLightLabor(
  state: VillageState,
  day: number,
  households: ReadonlySet<number>,
  potteryCoverage: number,
  productivity: number,
): number {
  if (households.size === 0 || productivity <= 0) return 0;
  let light = 0;
  for (const id of households) {
    light += workshopLabor(state, day, id, potteryCoverage, productivity).light;
  }
  return light / productivity;
}

/**
 * Žňové ruce dílen (fields.md – Žně všemi rukama): práce řemeslníků a synů domácností dílen,
 * které dnes pracují (`households`), ve žňový den (`WorkshopLabor.harvest`). Člověkodny před
 * štěstím (jako `craftLightLabor`).
 */
export function craftHarvestLabor(
  state: VillageState,
  day: number,
  households: ReadonlySet<number>,
  potteryCoverage: number,
  productivity: number,
): number {
  if (households.size === 0 || productivity <= 0 || !harvestHandsDay(state, day)) return 0;
  let hands = 0;
  for (const id of households) {
    hands += workshopLabor(state, day, id, potteryCoverage, productivity).harvest;
  }
  return hands / productivity;
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
 * s takovou zásobou má potřebu pokrytou i za rok, kdy se část opotřebí. Nástroje do vybavení takto
 * kupuje ves bez kováře u sousedů (crafts.md – Nákup u sousedů); kovář drží vybavení na potřebě
 * a zásobu na rok obnovy v hřivnách (`smithBarsTargetKg` – production-chains.md, Kovář).
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
 * Rozdělaný vůz tesaře s hotovou dřevěnou prací, který čeká na kování (wagons.md – Kování vozů).
 */
export function cartAwaitingIron(workshop: Pick<Workshop, 'cart'>): boolean {
  const cart = workshop.cart;
  return !!cart && cart.done + EPSILON >= CARPENTRY.cartManDays[cart.kind];
}

/** Hřivny na kování k vozu druhu `kind` (kg – wagons.md, Kování vozů; production-chains.md). */
export function cartIronBarsKg(kind: keyof typeof CART_IRON.kg): number {
  return CART_IRON.kg[kind] * FORGE.barsKgPerKg;
}

/**
 * Zakázka kování pro vlastního kováře (kg hřiven – wagons.md, Kování vozů; production-chains.md –
 * Kovář): vozy, které čekají na kování a pro které nikdo nejde jinam (`ironTrip`). Kovář na ně
 * taví a překovává přednostně – hřivny drží i na zakázku (`smithBarsTargetKg`).
 */
export function ironOrderBarsKg(state: Pick<VillageState, 'dwellings'>): number {
  let kg = 0;
  for (const d of state.dwellings) {
    const workshop = d.workshop;
    if (workshop?.craft !== 'carpenter' || workshop.ironTrip || !cartAwaitingIron(workshop)) {
      continue;
    }
    kg += cartIronBarsKg(workshop.cart!.kind);
  }
  return kg;
}

/**
 * Hřivny na příští kování jezdeckých koní (kg – horses.md, Kování): jezdecké koně (samci od 3 let)
 * × hřivny na koně. Bez importu `horses.ts` (cyklus modulů), proto vlastní počítání z ohrad.
 */
export function shoeingBarsKg(state: Pick<VillageState, 'pens'>, day: number): number {
  let horses = 0;
  for (const pen of state.pens ?? []) {
    if (pen.species !== 'horse') continue;
    for (const horse of pen.horses ?? []) {
      const ageYears = (day - horse.bornDay) / 365.25;
      if (horse.sex === 'male' && ageYears >= HORSES.foalUntilYears) horses++;
    }
  }
  return horses * HORSE_SHOEING.ironBarsKg;
}

/**
 * Zásoba hřiven, kterou kováři drží (kg – production-chains.md, Kovář): na rok obnovy vybavení
 * (`barsReserveKg`) a zakázka kování k vozům.
 */
export function smithBarsTargetKg(state: VillageState, day: number): number {
  return barsReserveKg(state, day) + ironOrderBarsKg(state) + shoeingBarsKg(state, day);
}

/**
 * Co kovárnám vsi chybí (production-chains.md – Kovář): nástroje do potřeby vybavení domácností,
 * hřivny do zásoby a na ty nástroje, houba na hřivny – přebytky se netaví.
 */
export function smithIronDeficit(state: VillageState, day: number): IronDeficit {
  return ironDeficit({
    equipmentKg: toolEquipmentKg(state),
    needKg: toolNeedKg(state, day),
    barsKg: ironBarsKg(state),
    bloomKg: bloomKg(state),
    barsTargetKg: smithBarsTargetKg(state, day),
  });
}

/**
 * Nemá kovář dnes v dílně práci aspoň na celý den (návrh Clauda – production-chains.md, Kovář)?
 * Kovárna jde do práce, až chybějící nástroje, hřivny a houba dají práci na celý den dílny
 * (`ironWorkManDays` – s měchařem, sám kovář taví pomaleji); do té doby domácnost pracuje se vsí.
 * Vybavení tak klesne nejvýš o den práce kovárny, práce dílny nepropadá.
 */
function smithRests(
  state: VillageState,
  day: number,
  smithId: number,
  labor: Pick<WorkshopLabor, 'craft' | 'skill'>,
  deficit: IronDeficit,
): boolean {
  const work = ironWorkManDays(deficit, labor.skill, smeltRate(smithBellows(state, smithId, day)));
  return work <= EPSILON || work + EPSILON < labor.craft;
}

/**
 * Musí kovárna k dnešní práci tavit (production-chains.md – Kovář) – chybějící nástroje ani hřivny
 * nepokryje hřivnami a houbou, které má?
 */
function onlySmelting(state: VillageState, deficit: IronDeficit): boolean {
  const canForge = deficit.forgeKg > EPSILON && ironBarsKg(state) > EPSILON;
  const canRefine = deficit.barsKg > EPSILON && bloomKg(state) > EPSILON;
  return deficit.bloomKg > EPSILON && !canForge && !canRefine;
}

/** Kdo je dnes na cestě pro kování (id lidí – wagons.md, Kování vozů). */
export function ironTravellers(state: Pick<VillageState, 'dwellings'>): Set<number> {
  const away = new Set<number>();
  for (const d of state.dwellings) {
    const trip = d.workshop?.ironTrip;
    if (trip) away.add(trip.personId);
  }
  return away;
}

/**
 * Kolik uhlí ročně kováři vsi spálí (kg) – odhad spotřeby, dokud se nenasbírá rok měření (crafts.md
 * – Rovnováha uhlíř – kovář): nástroje, které ves za rok opotřebí, po 50 kg uhlí na kg celým
 * řetězem, a uhlí na to, co kovárnám chybí (nástroje, hřivny a houba – production-chains.md,
 * Kovář) – nejvýš kolik kováři při dnešní práci spálí za rok na plný úvazek. Bez kováře 0.
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
        labor: forgeLabor(workshopLabor(state, day, d.id, coverage.pottery, productivity)),
      })),
    ) * DAYS_PER_YEAR;
  const wearPerYear =
    toolNeedKg(state, day) * CRAFT_NEEDS.toolWearPerYear * CRAFT_PRODUCTION.toolCharcoalKgPerKg;
  const missing = ironDeficitCharcoalKg(smithIronDeficit(state, day));
  return Math.min(fullTime, wearPerYear + missing);
}

/**
 * Kolik uhlí kováři vsi dnes spálí (kg) – podle toho uhlíř vytahá uhlí z vypáleného milíře
 * (crafts.md – Milíř stojí vždy): kováři, kteří dnes mají v dílně práci na celý den (`smithRests`
 * – production-chains.md, Kovář), na plný úvazek při dnešní práci, po 50 kg uhlí na kg nástrojů
 * celým řetězem. Bez kováře, nebo když kováři dnes pracují se vsí, 0.
 */
export function smithsForgeCharcoalKg(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): number {
  const smiths = occupiedWorkshops(state, 'smith');
  if (smiths.length === 0) return 0;
  const deficit = smithIronDeficit(state, day);
  const working = smiths.flatMap((d) => {
    const labor = workshopLabor(state, day, d.id, coverage.pottery, productivity);
    return smithRests(state, day, d.id, labor, deficit) ? [] : [{ labor: forgeLabor(labor) }];
  });
  return working.length > 0 ? smithForgeCharcoalKg(working) : 0;
}

/**
 * Řemeslníci, kteří dnes nemají v dílně co dělat, a jejich domácnost proto pracuje se vsí jako
 * ostatní (id obydlí; crafts.md – Podle potřeby, Martin 18. 10. 2026: „pokud uhlíř a kovář budou
 * mít volný čas, ať pracují na poli jako zbytek vesnice“):
 * - kovář, když nemá v dílně práci na celý den – nástroje ve vybavení, hřivny na rok obnovy
 *   i houba stačí (`smithRests` – production-chains.md, Kovář), nebo nemá uhlí (ani dnes nikdo
 *   nevytahá uhlí z vypáleného milíře), nebo musí tavit a nemá rudu ani kde ji kopat (`no-ore` –
 *   crafts.md, Uhlí a ruda kováře),
 * - hrnčíř, když zásoba keramiky dosáhla `craftTargets`, nebo nemá palivo ani z čeho kácet,
 * - uhlíř (crafts.md – Rovnováha uhlíř – kovář), když nemá rozdělaný milíř, další ještě nezačíná
 *   (uhlí ve vsi stačí na dobu cyklu a rezervu), dnes nevytahá uhlí pro kováře (`burnerPlans`)
 *   a není kdy a kam sázet; uhlíř bez milíře nový začne – odpočívá, jen když nejsou buky.
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
  plans: ReadonlyMap<number, BurnerPlan> = burnerPlans(state, day, coverage, productivity),
): Map<number, WorkshopActivity> {
  const resting = new Map<number, WorkshopActivity>();
  // běžná ves bez dílen – bez procházení lidí (volá se každý den)
  if (!state.dwellings.some((d) => d.workshop)) return resting;
  const stocks = craftStocks(state);
  const targets = craftTargets(state, day);
  // uhlíři napřed – kolik uhlí dnes kovářům vytahají z vypálených milířů
  const loose = restingBurners(state, day, obstacles, plans, resting);
  const smiths = occupiedWorkshops(state, 'smith');
  // co kovárnám chybí – i hřivny na zakázku kování k vozům (wagons.md – Kování vozů)
  const deficit = smiths.length > 0 ? smithIronDeficit(state, day) : null;
  for (const d of smiths) {
    const workshop = d.workshop!;
    const labor = workshopLabor(state, day, d.id, coverage.pottery, productivity);
    if (smithRests(state, day, d.id, labor, deficit!)) resting.set(d.id, 'resting');
    else if (loose <= 0) resting.set(d.id, 'no-charcoal');
    // musí tavit, a nemá rudu ani kde ji kopat (crafts.md – Uhlí a ruda kováře)
    else if (
      onlySmelting(state, deficit!) &&
      workshop.oreSite === null &&
      (workshop.oreKg ?? 1) <= 0
    ) {
      resting.set(d.id, 'no-ore');
    }
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
    // bez hlíny a bez místa, kde ji kopat (crafts.md – Hlína hrnčíře)
    else if (workshop.claySite === null && (workshop.clayKg ?? 1) <= 0) {
      resting.set(d.id, 'no-clay');
    }
  }
  return resting;
}

/**
 * Uhlíři, kteří dnes pracují se vsí (zapíše do `resting`; crafts.md – Rovnováha uhlíř – kovář),
 * a kolik uhlí bude dnes u kovářů (kg – uhlí u kováře a co dnes uhlíři donesou z vypálených
 * milířů). Rozdělaný nebo pálící milíř uhlíř dodělá; bez milíře začne nový (bez buků `no-wood`);
 * s vypálenými milíři pracuje, když dnes vytahá uhlí kovářům nebo začíná další milíř, jinak sází
 * nebo odpočívá.
 */
function restingBurners(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  plans: ReadonlyMap<number, BurnerPlan>,
  resting: Map<number, WorkshopActivity>,
): number {
  let loose = craftStocks(state).charcoalKg;
  const burners = occupiedWorkshops(state, 'burner');
  if (burners.length === 0) return loose;
  for (const plan of plans.values()) for (const draw of plan.draws) loose += draw.kg;
  for (const d of burners) {
    const workshop = d.workshop!;
    const plan = plans.get(d.id) ?? IDLE_BURNER;
    if (kilnInProgress(workshop) || plan.draws.length > 0) continue;
    const planting = inPlantingWindow(day) && (workshop.toPlant?.length ?? 0) > 0;
    if (planting) continue;
    if (plan.start) {
      // nový milíř – bez buků čeká na dřevo
      const noBeeches = obstacles !== null && availableTrees(obstacles, state, day, 'beeches') <= 0;
      if (noBeeches) resting.set(d.id, 'no-wood');
      continue;
    }
    resting.set(d.id, 'resting');
  }
  return loose;
}

/** Kolik uhlí dnes uhlíř vytahá z jednoho milíře (crafts.md – Rovnováha uhlíř – kovář). */
export interface KilnDraw {
  burnerId: number;
  /** Id milíře (chybí u milíře ze starší vsi před převodem). */
  kilnId?: number;
  kg: number;
}

/**
 * Plán uhlířů na dnešek (crafts.md – Rovnováha uhlíř – kovář; po dílnách v pořadí id) – rozhoduje
 * se na začátku dne ze včerejších zásob, stejně pro rozdělení práce vsi, vůz i práci dílny:
 * - **kovář si drží zásobu**: uhlíř vytahá kovářům uhlí (`charcoalFetchKg`), když uhlí u kováren
 *   nestačí na dnešní kování, nebo při změřené spotřebě kovářů (`charcoalUsePerDay`) vystačí jen
 *   na cestu pro uhlí a rezervu – dávku na CHARCOAL_BALANCE.fetchDays dní spotřeby, od
 *   nejstaršího vypáleného milíře, nejvýš kolik dnes stihne; pálící milíř hlídá celý den a nevytahá,
 * - **uhlíř začne další milíř včas** (`startsNextKiln`): bez milíře vždy, jinak když uhlí ve vsi
 *   (u kováren, ve vypálených milířích a v rozdělaných milířích – i těch, které dnes začne uhlíř
 *   před ním) stačí jen na dobu jeho cyklu milíře (`kilnCycleDays`) a rezervu.
 * Bez kováře se spotřeba nepočítá – uhlí se nevytahá a další milíř se nezačne (první milíř stojí
 * vždy).
 */
export function burnerPlans(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
): Map<number, BurnerPlan> {
  const plans = new Map<number, BurnerPlan>();
  const burners = occupiedWorkshops(state, 'burner');
  if (burners.length === 0) return plans;
  const smiths = occupiedWorkshops(state, 'smith');
  let loose = craftStocks(state).charcoalKg;
  const forgeKg = smiths.length > 0 ? smithsForgeCharcoalKg(state, day, coverage, productivity) : 0;
  const usePerDay =
    smiths.length > 0
      ? charcoalUsePerDay(
          state.charcoalUse,
          day,
          smithsCharcoalPerYear(state, day, coverage, productivity) / DAYS_PER_YEAR,
        )
      : 0;
  // uhlí ve vsi i s tím, co se v milířích teprve chystá (dodělá se)
  let stock = charcoalStockKg(state);
  for (const d of burners) {
    const kiln = kilnInProgress(d.workshop!);
    if (kiln) stock += kilnYieldKg(kiln);
  }
  for (const d of burners) {
    const workshop = d.workshop!;
    const kilns = workshopKilns(workshop);
    // uhlíř bez praxe všechno u milíře dělá pomaleji (crafts.md – Učení řemesla)
    const labor = forgeLabor(workshopLabor(state, day, d.id, coverage.pottery, productivity));
    const draws: BurnerPlan['draws'] = [];
    let order = 0;
    const burning = kilns.some((k) => k.stage === 'burn');
    const full = kilns.filter((k) => k.stage === 'draw' && kilnCharcoalKg(k) > 0);
    if (smiths.length > 0 && !burning && full.length > 0) {
      const inKilns = full.reduce((sum, k) => sum + kilnCharcoalKg(k), 0);
      const tripDays = fetchTripDays(d, full[0]!, smiths, Math.max(forgeKg, usePerDay));
      // rozdělaná dávka pro kováře, jinak nová, když zásoba u kováren dochází
      order = Math.min(
        inKilns,
        workshop.charcoalOrderKg ?? charcoalFetchKg(inKilns, loose, forgeKg, usePerDay, tripDays),
      );
      let want = order;
      let capacity = labor;
      for (const kiln of full) {
        if (want <= EPSILON || capacity <= EPSILON) break;
        const perKg = DRAW_MAN_DAYS_PER_KG * kilnWalkFactor(kiln, d.position);
        const kg = Math.min(want, kilnCharcoalKg(kiln), capacity / perKg);
        if (kg <= EPSILON) continue;
        draws.push({ ...(kiln.id !== undefined ? { kilnId: kiln.id } : {}), kg });
        want -= kg;
        capacity -= kg * perKg;
        loose += kg;
      }
    }
    const cycle = kilnCycleDays(workshop, d.position, labor);
    const start = startsNextKiln(workshop, stock, usePerDay, cycle);
    if (start) stock += BATCH_KG;
    plans.set(d.id, { draws, orderKg: order, start });
  }
  return plans;
}

/** Uhlí jedné dávky buků (kg) – kolik dá další milíř. */
const BATCH_KG = CHARCOAL_KILN.trees * CRAFT_PRODUCTION.charcoalKgPerTree;

/**
 * Doba cesty pro uhlí (dny; crafts.md – Rovnováha uhlíř – kovář): nošení dávky na
 * CHARCOAL_BALANCE.fetchDays dní spotřeby `perDayKg` v koších z milíře `kiln` do nejbližší kovárny
 * (vzdálenost chůze uložená u milíře, jinak vzdušně) – čd jednoho člověka, aspoň den.
 */
function fetchTripDays(
  burner: Dwelling,
  kiln: Parameters<typeof kilnPoint>[1] & { carry?: { walkM: number } },
  smiths: readonly Dwelling[],
  perDayKg: number,
): number {
  const at = kilnPoint(burner, kiln);
  const walkM =
    kiln.carry?.walkM ??
    Math.min(...smiths.map((s) => length2(s.position.x - at.x, s.position.z - at.z)));
  const batchKg = perDayKg * CHARCOAL_BALANCE.fetchDays;
  return Math.max(1, batchKg * basketManDaysPerKg(walkM, SMITH_SUPPLY.basketKg.charcoal));
}

/**
 * Kolik uhlí dnes uhlíři vytahají kovářům z vypálených milířů (po milířích – jen ti, kdo tahají;
 * crafts.md – Rovnováha uhlíř – kovář): z plánu uhlířů (`burnerPlans`) – podle toho dostane uhlíř
 * vůz (wagons.md – Co vozy vozí) a kovář ví, odkud nosit.
 */
export function burnerDraws(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  productivity = 1,
  plans: ReadonlyMap<number, BurnerPlan> = burnerPlans(state, day, coverage, productivity),
): KilnDraw[] {
  const out: KilnDraw[] = [];
  for (const [burnerId, plan] of [...plans.entries()].sort((a, b) => a[0] - b[0])) {
    for (const draw of plan.draws) out.push({ burnerId, ...draw });
  }
  return out;
}

/**
 * Převede starší dílny uhlířů na samostatné milíře (mutuje stav, idempotentně – crafts.md, Milíř
 * u skácených buků): volá se na začátku kroku práce, než se plánuje den.
 */
export function migrateBurners(state: VillageState): void {
  const burners = state.dwellings.filter((d) => d.workshop?.craft === 'burner');
  if (burners.length === 0) return;
  const stocks = (state.crafts ??= { ...NO_STOCKS });
  for (const d of burners) migrateBurner(state, d, stocks);
}

/**
 * Práce domácnosti dílny za den: celkem (se štěstím), denní minimum a řemeslo; `skill` = výkon
 * dílny podle praxe 0,5–1 (crafts.md – Učení řemesla) – násobí výrobu (kovář, hrnčíř), práci
 * u milíře (uhlíř) a práci tesaře; kácení, nošení a kopání rudy ne.
 */
export interface WorkshopLabor {
  capacity: number;
  dailyMin: number;
  craft: number;
  /**
   * Práce žen domácnosti, která po denním minimu zbyla (čd po štěstí) – lehčí polní práce se vsí
   * (crafts.md – Kdo dělá řemeslo); `workCrafts` ji nepoužije, do práce vsi ji přidá krok práce.
   */
  light: number;
  /**
   * Práce řemeslníka a synů ve žňový den (fields.md – Žně všemi rukama, `harvestHandsDay`; čd po
   * štěstí) – jde na žeň a výmlat se vsí (`craftHarvestLabor`), řemeslo (`craft`) ten den stojí.
   */
  harvest: number;
  skill: number;
}

/** Práce řemesla dílny po výkonu podle praxe (čd vyučeného) – kování a milíř. */
export function forgeLabor(labor: Pick<WorkshopLabor, 'craft' | 'skill'>): number {
  return labor.craft * labor.skill;
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
  const dwelling = state.dwellings.find((d) => d.id === dwellingId);
  // kdo jde pro kování k vozu, v dílně chybí (wagons.md – Kování vozů)
  const away = dwelling?.workshop?.ironTrip?.personId ?? null;
  const members = state.people.filter((p) => p.dwellingId === dwellingId && p.id !== away);
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
  const water = waterFetchingLabor(members.length, dwelling?.waterWalkM);
  const minimum = dailyMinPerHousehold(potteryCoverage) + water;
  const dailyMin = take(adultDailyMin(minimum, elders, productivity));
  // řemeslo dělá jen řemeslník a jeho synové; zbytek práce žen jde do lehčích prací se vsí
  const handsCapacity =
    craftHands(members, day).reduce((sum, p) => sum + laborPerDay(p, day), 0) * productivity;
  const hands = Math.min(left, handsCapacity);
  // ve žňový den jde řemeslník se syny na pole (fields.md – Žně všemi rukama; Martin 24. 10. 2026:
  // „Dílny i vojvodova rodina“), ženy dál domácnost a lehčí práce
  const harvest = harvestHandsDay(state, day);
  return {
    capacity,
    dailyMin,
    craft: harvest ? 0 : hands,
    light: left - hands,
    harvest: harvest ? hands : 0,
    skill: workshopSkill(state, dwellingId, day, away),
  };
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
  /**
   * Uhlíř: práce u milířů po milířích (stavba, hlídání, vytahání – id milíře, střed m, čd); kácení
   * a příprava dřeva jdou k bukům (`fellingTrees`).
   */
  kilns?: KilnWork[];
  /**
   * Kovář (crafts.md – Uhlí a ruda kováře): nošení uhlí od milířů a rudy z rudiště v koších – cíl
   * (milíř s kovárnou `from`, rudiště), práce (čd dospělého – synové 10–13 mimo práci dílny)
   * a kdo nese (věky); `cart` = kovář jel s vozem pro rudu (jede se sedlákem – nekreslí se pěšky).
   */
  fetch?: { target: LaborTarget; manDays: number; ages: number[]; cart?: true }[];
  /** Kovář: kopání, praní a pražení rudy na rudišti (čd), kdo kope (věky) a místo (m). */
  ore?: { manDays: number; ages: number[]; x: number; z: number };
  /** Hrnčíř: kopání hlíny na hliništi (čd), kdo kope (věky) a místo (m – crafts.md, Hlína). */
  clay?: { manDays: number; ages: number[]; x: number; z: number };
  /**
   * Kovář (production-chains.md – Kovář): tavba v redukční peci – práce (čd, v `making`), kolik
   * houby vytavil (kg) a kdo šlapal měch (null – kovář sám, polovičním tempem); bez tavby chybí.
   */
  smelt?: { manDays: number; bloomKg: number; bellows: BellowsHelper | null };
  /** Kovář: překování houby na hřivny – práce (čd, v `making`) a hřivny (kg); jinak chybí. */
  refine?: { manDays: number; barsKg: number };
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
    dwelling.position,
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
 * dá `kgPerTree` výrobku. Když není z čeho kácet, zbytek práce propadne. Výroby nejvýš `maxKg`
 * (hrnčíř – z hlíny, kterou má; crafts.md, Hlína hrnčíře) – pak dílna přestane a dál nekácí.
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
  maxKg = Infinity,
): WorkshopOutput {
  let left = labor;
  let felling = 0;
  let making = 0;
  let producedKg = 0;
  let noWood = false;
  const fellingTrees: number[] = [];
  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    if (producedKg + EPSILON >= maxKg) break;
    if (workshop.fuelKg > EPSILON) {
      const kg = Math.min(workshop.fuelKg, left / manDaysPerKg, maxKg - producedKg);
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

/** Den kováře nebo hrnčíře pro rozdělení práce dne. */
interface SmithOutput extends WorkshopOutput {
  fetch: NonNullable<WorkshopDay['fetch']>;
  ore?: WorkshopDay['ore'];
  smelt?: WorkshopDay['smelt'];
  refine?: WorkshopDay['refine'];
  /**
   * Kolik uhlí by kovář dnes spálil, kdyby ho měl dost (kg – podle práce a rudy; crafts.md –
   * Rovnováha uhlíř – kovář: měří se poptávka, ne jen to, co uhlíř stihl dodat).
   */
  charcoalDemandKg?: number;
  clay?: WorkshopDay['clay'];
}

/**
 * Nošení suroviny z místa, kde se kope (ruda, hlína), jako záznamy rozdělení práce: pěšky v koších
 * a jízda řemeslníka s vozem se sedlákem (`cart`).
 */
function dugFetchEntries(
  state: VillageState,
  dwellingId: number,
  day: number,
  material: DugMaterial,
  dug: OreDay,
): NonNullable<WorkshopDay['fetch']> {
  const site = dug.site;
  if (!site) return [];
  const target: LaborTarget =
    material === 'clay'
      ? { kind: 'clay', id: dwellingId, ...site }
      : { kind: 'ore', id: dwellingId, ...site };
  const out: NonNullable<WorkshopDay['fetch']> = [];
  if (dug.carry > 0) {
    out.push({
      target,
      manDays: dug.carry,
      ages: smithCrewAges(state, dwellingId, day, dug.carry),
    });
  }
  if (dug.ride > 0) {
    out.push({
      target,
      manDays: dug.ride,
      ages: smithCrewAges(state, dwellingId, day, 0),
      cart: true,
    });
  }
  return out;
}

/**
 * Den hrnčíře (mutuje stav; crafts.md – Hlína hrnčíře): z práce dílny napřed hlína (`workDug` –
 * jízda s vozem pro hromadu u jámy, kopání a nošení v koších jako ruda kováře; kolik hlíny dílna
 * potřebuje, jde podle výkonu dílny podle praxe – crafts.md, Učení řemesla), zbytek točí
 * a vypaluje (bez praxe pomaleji) a kácí na palivo – nejvýš z hlíny, kterou má (CLAY.kgPerPotteryKg
 * na kg keramiky). Bez hlíny a bez místa, kde ji kopat, stojí (`no-clay`).
 */
function workPotter(
  state: VillageState,
  dwelling: Dwelling,
  stocks: CraftStocks,
  labor: WorkshopLabor,
  day: number,
  obstacles: ObstacleLayer | null,
  supply: SmithSupply,
  landscape: Landscape | null,
): SmithOutput {
  const workshop = dwelling.workshop!;
  migratePotter(workshop, labor.craft, labor.skill, SMITH_SUPPLY.oreBatchDays);
  const cartBatch = supply.cartBatch;
  const cart = supply.clayCarts?.get(dwelling.id);
  const clay = workDug(state, dwelling, 'clay', labor.craft, day, {
    landscape,
    obstacles,
    batchDays: SMITH_SUPPLY.oreBatchDays,
    ...(cart ? { cart } : {}),
    ...(cartBatch ? { cartBatch: (site: OreSite) => cartBatch(dwelling, site, 'clay') } : {}),
    // dobrá hlína prémiové krajiny – méně hlíny na kg keramiky (premium-landscapes.md)
    needKg: (left) =>
      potteryClayKg(left, labor.skill) * dugMaterialFactor(workshop.claySite, 'clay'),
  });
  const clayPerKg = CLAY.kgPerPotteryKg * dugMaterialFactor(workshop.claySite, 'clay');
  const output = workWithWood(
    state,
    dwelling,
    workshop,
    clay.left,
    day,
    obstacles,
    // hrnčíř bez praxe točí a vypaluje pomaleji, kácí stejně (crafts.md – Učení řemesla)
    CRAFT_PRODUCTION.potteryManDaysPerKg / labor.skill,
    CRAFT_PRODUCTION.potteryKgPerTree,
    (workshop.clayKg ?? 0) / clayPerKg,
  );
  workshop.clayKg = Math.max(0, (workshop.clayKg ?? 0) - output.producedKg * clayPerKg);
  stocks.potteryKg += output.producedKg;
  const dug = clay.dig > EPSILON || clay.carry > EPSILON || clay.ride > EPSILON;
  const activity: WorkshopActivity =
    output.producedKg > EPSILON || output.felling > EPSILON || output.activity === 'no-wood'
      ? output.activity
      : dug
        ? 'digging'
        : labor.craft > EPSILON && workshop.claySite === null
          ? 'no-clay'
          : output.activity;
  return {
    ...output,
    activity,
    fetch: dugFetchEntries(state, dwelling.id, day, 'clay', clay),
    ...(clay.site && clay.dig > 0
      ? {
          clay: {
            manDays: clay.dig,
            ages: smithCrewAges(state, dwelling.id, day, clay.dig),
            ...clay.site,
          },
        }
      : {}),
  };
}

/**
 * Plán kováren na dnešek (crafts.md – Uhlí a ruda kováře) – sestaví ho krok práce simulace
 * (simulate.ts) před rozdělením práce vsi: kdo nosí uhlí od milířů (synové 10–13, domácnost
 * kováře), kam dnes jede vůz pro rudu a jestli se vyplatí dávka rudy na celý vůz.
 */
export interface SmithSupply {
  /** Nošení uhlí pěšky po kovárnách (id obydlí). */
  fetch: ReadonlyMap<number, SmithFetchDay>;
  /** Vůz pro rudu dnes po kovárnách (sedlák přijel k hromadě u jámy). */
  oreCarts: ReadonlyMap<number, OreCartToday>;
  /** Vůz pro hlínu dnes po dílnách hrnčířů (crafts.md – Hlína hrnčíře); bez údaje žádný. */
  clayCarts?: ReadonlyMap<number, OreCartToday>;
  /**
   * Dávka suroviny `material` (ruda, hlína) na celý vůz pro dílnu a místo – kg vozu, nebo null
   * (ves nemá vůz doma, vůz k místu nedojede nebo jízda neušetří práci proti nošení). Bez údaje
   * vždy pěšky.
   */
  cartBatch?: (dwelling: Dwelling, site: OreSite, material: DugMaterial) => number | null;
  /**
   * Plán uhlířů na dnešek (`burnerPlans` – spočítaný jednou na začátku dne, ať vytahání sedí
   * s nošením a vozem); bez údaje se spočítá v `workCrafts`.
   */
  burners?: ReadonlyMap<number, BurnerPlan>;
  /**
   * Měchař u tavby po kovárnách (production-chains.md – Kovář; `smithBellowsToday` – syn, který
   * šlape měch, ten den nepase); null = kovář sám. Bez údaje se měchař vybere v kovárně
   * (`smithBellows`).
   */
  bellows?: ReadonlyMap<number, BellowsHelper | null>;
}

/**
 * Řetěz kovárny pro panel (production-chains.md – Kovář): houba a hřivny u kovárny (kg), zásoba
 * hřiven, kterou kovář drží (na rok obnovy vybavení a zakázky kování k vozům), nástroje ve
 * vybavení domácností a jejich potřeba (kg) a kdo u tavby šlape měch (null – kovář sám, taví
 * polovičním tempem).
 */
export interface SmithIronSummary {
  bloomKg: number;
  barsKg: number;
  barsTargetKg: number;
  equipmentKg: number;
  needKg: number;
  bellows: BellowsHelper | null;
}

/** Řetěz kovárny `smith` v den `day` pro panel (nemění stav). */
export function smithIronSummary(
  state: VillageState,
  smith: Pick<Dwelling, 'id'>,
  day: number,
): SmithIronSummary {
  return {
    bloomKg: bloomKg(state),
    barsKg: ironBarsKg(state),
    barsTargetKg: smithBarsTargetKg(state, day),
    equipmentKg: toolEquipmentKg(state),
    needKg: toolNeedKg(state, day),
    bellows: smithBellows(state, smith.id, day),
  };
}

/**
 * Měchaři u tavby dnes (production-chains.md – Kovář): kovárny, které dnes pracují v dílně (ne
 * `resting`) a mají co tavit (chybí houba – `smithIronDeficit`), dostanou měchaře (`smithBellows`)
 * – syna 10–13 jen toho, který dnes nenosí uhlí (`busy`); null = kovář sám. Syna volající přidá
 * k výrostkům, kteří ten den nepasou (`herdingDay`).
 */
export function smithBellowsToday(
  state: VillageState,
  day: number,
  resting: ReadonlyMap<number, WorkshopActivity>,
  busy: ReadonlySet<number>,
): Map<number, BellowsHelper | null> {
  const out = new Map<number, BellowsHelper | null>();
  const smiths = occupiedWorkshops(state, 'smith').filter((d) => !resting.has(d.id));
  if (smiths.length === 0 || smithIronDeficit(state, day).bloomKg <= EPSILON) return out;
  for (const d of smiths) out.set(d.id, smithBellows(state, d.id, day, busy));
  return out;
}

/** Bez plánu kováren – synové nenosí, vůz nejede, ruda pěšky. */
export const NO_SMITH_SUPPLY: SmithSupply = { fetch: new Map(), oreCarts: new Map() };

/**
 * Den kováře (mutuje stav; crafts.md – Výroba, Uhlí a ruda kováře; production-chains.md – Kovář):
 * z práce dílny `labor` napřed donese uhlí, které dnes nenosí synové 10–13 ani vůz
 * (`plan.household`), pak řetěz kovárny – co chybí (`smithIronDeficit`):
 * 1. kove nástroje z hřiven do vybavení domácností (do potřeby vsi),
 * 2. překove houbu na hřivny (do zásoby na rok obnovy, zakázky kování k vozům a na nástroje),
 * 3. ruda (`workOre` – jízda s vozem, kopání a nošení) – novou dávku jen, když bude tavit,
 * 4. taví v redukční peci houbu z rudy a uhlí – s měchařem (`supply.bellows`, jinak
 *    `smithBellows`), sám kovář polovičním tempem.
 * Bez praxe všechno pomaleji (crafts.md – Učení řemesla), kopání a nošení ne. Bez uhlí nebo rudy
 * stojí.
 */
function workSmith(
  state: VillageState,
  dwelling: Dwelling,
  stocks: CraftStocks,
  labor: number,
  day: number,
  supply: SmithSupply,
  landscape: Landscape | null,
  skill = 1,
  obstacles: ObstacleLayer | null = null,
): SmithOutput {
  const workshop = dwelling.workshop!;
  migrateSmith(workshop, labor, SMITH_SUPPLY.oreBatchDays);
  const plan = supply.fetch.get(dwelling.id);
  const fetch = plan ? charcoalFetchEntries(state, dwelling.id, day, plan) : [];
  let left = Math.max(0, labor - (plan?.household ?? 0));
  const bellows = supply.bellows?.has(dwelling.id)
    ? (supply.bellows.get(dwelling.id) ?? null)
    : smithBellows(state, dwelling.id, day);
  const rate = smeltRate(bellows);
  const deficit = smithIronDeficit(state, day);
  // poptávka uhlí (crafts.md – Rovnováha uhlíř – kovář): totéž bez meze uhlí
  const want = { forge: 0, refine: 0, smelt: 0 };
  let wantLeft = left;
  // 1. nástroje z hřiven do vybavení
  const barsBefore = stocks.ironBarsKg ?? 0;
  // hřivny na příští kování koní se na nástroje nekují (horses.md – Kování: rezerva hřiven)
  const forgeBars = Math.max(0, barsBefore - shoeingBarsKg(state, day));
  const forgeInput = { labor: left, skill, wantedKg: deficit.forgeKg, barsKg: forgeBars };
  const forge = forgeStep({ ...forgeInput, charcoalKg: stocks.charcoalKg });
  const forgeWant = forgeStep({ ...forgeInput, charcoalKg: Infinity });
  want.forge = forgeWant.charcoalKg;
  wantLeft -= forgeWant.labor;
  if (forge.kg > EPSILON) {
    state.toolEquipmentKg = toolEquipmentKg(state) + forge.kg;
    stocks.ironBarsKg = Math.max(0, barsBefore - forge.kg * FORGE.barsKgPerKg);
    stocks.charcoalKg = Math.max(0, stocks.charcoalKg - forge.charcoalKg);
    left -= forge.labor;
  }
  // 2. houba na hřivny
  const bloomBefore = stocks.bloomKg ?? 0;
  const refineInput = { skill, wantedKg: deficit.barsKg, bloomKg: bloomBefore };
  const refine = refineStep({ ...refineInput, labor: left, charcoalKg: stocks.charcoalKg });
  const refineWant = refineStep({ ...refineInput, labor: wantLeft, charcoalKg: Infinity });
  want.refine = refineWant.charcoalKg;
  wantLeft -= refineWant.labor;
  if (refine.kg > EPSILON) {
    stocks.ironBarsKg = (stocks.ironBarsKg ?? 0) + refine.kg;
    stocks.bloomKg = Math.max(0, bloomBefore - refine.kg * REFINE.bloomKgPerKg);
    stocks.charcoalKg = Math.max(0, stocks.charcoalKg - refine.charcoalKg);
    left -= refine.labor;
  }
  // 3. ruda – novou dávku jen, když kovárna bude tavit
  const smelting = deficit.bloomKg > EPSILON;
  const cartBatch = supply.cartBatch;
  const oreCart = supply.oreCarts.get(dwelling.id);
  const ore = workOre(state, dwelling, left, day, {
    landscape,
    obstacles,
    batchDays: SMITH_SUPPLY.oreBatchDays,
    // bohatá ruda prémiové krajiny – méně rudy na kg houby (premium-landscapes.md)
    needKg: smelting
      ? (l) => smeltOreKg(l) * rate * dugMaterialFactor(workshop.oreSite, 'ore')
      : () => 0,
    ...(oreCart ? { cart: oreCart } : {}),
    ...(cartBatch ? { cartBatch: (site: OreSite) => cartBatch(dwelling, site, 'ore') } : {}),
  });
  const oreLabor = left - ore.left;
  left = ore.left;
  wantLeft = Math.max(0, wantLeft - oreLabor);
  const site = ore.site;
  fetch.push(...dugFetchEntries(state, dwelling.id, day, 'ore', ore));
  // 4. tavba v redukční peci
  const oreKg = workshop.oreKg ?? 0;
  // tavba počítá rudu v kg obyčejné rudy – bohatá ruda vydá na kg houby víc
  const oreFactor = dugMaterialFactor(workshop.oreSite, 'ore');
  const smeltInput = { skill, wantedKg: deficit.bloomKg, oreKg: oreKg / oreFactor, rate };
  const smelt = smeltStep({ ...smeltInput, labor: left, charcoalKg: stocks.charcoalKg });
  want.smelt = smeltStep({ ...smeltInput, labor: wantLeft, charcoalKg: Infinity }).charcoalKg;
  if (smelt.kg > EPSILON) {
    stocks.bloomKg = (stocks.bloomKg ?? 0) + smelt.kg;
    stocks.charcoalKg = Math.max(0, stocks.charcoalKg - smelt.charcoalKg);
    workshop.oreKg = Math.max(0, oreKg - smelt.kg * SMELT.oreKgPerKg * oreFactor);
  }
  const making = forge.labor + refine.labor + smelt.labor;
  // činnost dne – krok, na který šlo nejvíc práce (napřed kování)
  const steps: [WorkshopActivity, number][] = [
    ['producing', forge.labor],
    ['refining', refine.labor],
    ['smelting', smelt.labor],
    ['digging', oreLabor],
  ];
  const top = steps.reduce((best, step) => (step[1] > best[1] + EPSILON ? step : best));
  const activity: WorkshopActivity =
    top[1] > EPSILON
      ? top[0]
      : labor <= EPSILON
        ? 'idle'
        : stocks.charcoalKg <= EPSILON
          ? 'no-charcoal'
          : smelting && workshop.oreSite === null
            ? 'no-ore'
            : 'idle';
  return {
    felling: 0,
    fellingTrees: [],
    making,
    producedKg: forge.kg,
    activity,
    fetch,
    charcoalDemandKg: want.forge + want.refine + want.smelt,
    ...(smelt.labor > EPSILON
      ? { smelt: { manDays: smelt.labor, bloomKg: smelt.kg, bellows } }
      : {}),
    ...(refine.labor > EPSILON ? { refine: { manDays: refine.labor, barsKg: refine.kg } } : {}),
    ...(site && ore.dig > 0
      ? {
          ore: {
            manDays: ore.dig,
            ages: smithCrewAges(state, dwelling.id, day, ore.dig),
            ...site,
          },
        }
      : {}),
  };
}

/**
 * Nošení uhlí kovárny dne jako záznamy rozdělení práce: po milířích synové 10–13 (mimo práci
 * dílny) a domácnost kováře (synové od 14, kovář).
 */
function charcoalFetchEntries(
  state: VillageState,
  smithId: number,
  day: number,
  plan: SmithFetchDay,
): NonNullable<WorkshopDay['fetch']> {
  const out: NonNullable<WorkshopDay['fetch']> = [];
  for (const source of plan.sources) {
    const target: LaborTarget = {
      kind: 'kiln',
      id: source.burnerId,
      ...source.at,
      from: smithId,
      ...(source.kilnId !== undefined ? { kiln: source.kilnId } : {}),
    };
    if (source.youngsters > EPSILON) {
      out.push({ target, manDays: source.youngsters, ages: plan.youngsters.ages });
    }
    if (source.household > EPSILON) {
      out.push({
        target,
        manDays: source.household,
        ages: smithCrewAges(state, smithId, day, source.household),
      });
    }
  }
  return out;
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
 * rozdělením práce vsi) pracuje se vsí. Kovář nosí uhlí a kope rudu podle plánu kováren dne
 * (`supply` – crafts.md, Uhlí a ruda kováře). Vrací, kam práce šla (rozdělení práce dne pro
 * scénu).
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
  supply: SmithSupply = NO_SMITH_SUPPLY,
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
  const hasBurner = workshops.some((d) => d.workshop?.craft === 'burner');
  // starší dílny uhlířů (dřevo před milíři, jediný milíř) – jednou, v prvním dni
  if (hasBurner) migrateBurners(state);
  const plans = hasBurner
    ? (supply.burners ?? burnerPlans(state, day, coverage, productivity))
    : new Map<number, BurnerPlan>();
  // kde stavět milíř u dávky buků – rovné volné místo (crafts.md – Milíř u skácených buků)
  const kilnSite: KilnSiteFinder | undefined =
    landscape && obstacles
      ? (center, batch) => findKilnSite(state, day, landscape, obstacles, center, batch)
      : undefined;
  let burnt = 0;
  for (const dwelling of workshops) {
    const workshop = dwelling.workshop!;
    if (!households.has(dwelling.id)) {
      workshop.activity = 'empty';
      continue;
    }
    const free = resting.get(dwelling.id);
    // kovář bez uhlí by kul celý den – i to je spotřeba, kterou uhlíř měří (crafts.md – Rovnováha)
    if (hasBurner && free === 'no-charcoal' && workshop.craft === 'smith') {
      const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity);
      burnt += smithForgeCharcoalKg([{ labor: forgeLabor(labor) }]);
    }
    if (free) {
      // výrobků je dost (nebo chybí vstup) – domácnost dnes pracuje se vsí (crafts.md); uhlí, které
      // dnes uhlíř vytahal, donesou synové a domácnost kováře z práce vsi (simulate.ts)
      workshop.activity = free;
      const plan = workshop.craft === 'smith' ? supply.fetch.get(dwelling.id) : undefined;
      if (plan) {
        days.push({
          dwellingId: dwelling.id,
          craft: workshop.craft,
          domestic: 0,
          felling: 0,
          fellingTrees: [],
          making: 0,
          producedKg: 0,
          fetch: charcoalFetchEntries(state, dwelling.id, day, plan),
        });
      }
      continue;
    }
    const labor = workshopLabor(state, day, dwelling.id, coverage.pottery, productivity);
    if (workshop.craft === 'burner') {
      const burner = workBurner(
        state,
        dwelling,
        stocks,
        // uhlíř bez praxe všechno u milíře dělá pomaleji (crafts.md – Učení řemesla)
        forgeLabor(labor),
        day,
        obstacles,
        // kolik uhlí dnes vytahá kovářům a jestli začne další milíř (crafts.md – Rovnováha)
        plans.get(dwelling.id) ?? IDLE_BURNER,
        {
          // chůze ze zemnice k milíři po pevných cestách s půdou krajiny (paths/walking.ts) –
          // graf cest až při výběru dávky; bez krajiny vzdušně
          ...(landscape
            ? { walk: (from, targets) => villageRoadWalk(state, landscape)(from, targets) }
            : {}),
          ...(kilnSite ? { site: kilnSite } : {}),
        },
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
        ...(burner.kilns.length > 0 ? { kilns: burner.kilns } : {}),
      });
      continue;
    }
    let output: WorkshopOutput;
    let smith: SmithOutput | null = null;
    if (workshop.craft === 'smith') {
      smith = workSmith(
        state,
        dwelling,
        stocks,
        labor.craft,
        day,
        supply,
        landscape,
        labor.skill,
        obstacles,
      );
      burnt += smith.charcoalDemandKg ?? 0;
      output = smith;
    } else {
      smith = workPotter(state, dwelling, stocks, labor, day, obstacles, supply, landscape);
      output = smith;
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
      ...(smith && smith.fetch.length > 0 ? { fetch: smith.fetch } : {}),
      ...(smith?.ore ? { ore: smith.ore } : {}),
      ...(smith?.clay ? { clay: smith.clay } : {}),
      ...(smith?.smelt ? { smelt: smith.smelt } : {}),
      ...(smith?.refine ? { refine: smith.refine } : {}),
    });
  }
  // spotřeba uhlí kovářů (poptávka – i co kovář nekoval pro nedostatek uhlí) – klouzavě jen ve vsi
  // s uhlířem (crafts.md – Rovnováha uhlíř – kovář)
  if (hasBurner) recordCharcoalUse(state, day, burnt);
  return days;
}

// --- půdorys dílny (umístění, scéna) ---------------------------------------------------------

/**
 * Půdorys dílny ve světě: obydlí řemesla (u hrnčíře, kováře a tesaře prodloužené o přístřešek
 * vpředu; uhlíř jen zemnice – milíř je samostatná stavba u dávky buků, crafts.md – Milíř
 * u skácených buků) – nesmí se překrývat s jinou stavbou.
 */
export function workshopFootprints(
  craft: Craft,
  position: Position,
  shape: DwellingShape,
): Point[][] {
  const type = CRAFT_BASE[craft];
  const porch = WORKSHOP_PORCH_M[craft];
  if (isPlainShape(shape)) {
    const { width, depth } = DWELLING_FOOTPRINT_M[type];
    const [cx, cz] = buildingLocalToWorld(position, 0, porch / 2);
    return [rectangleCorners(cx, cz, width, depth + porch, position.rotation)];
  }
  // varianta rozměrů (population.md – Varianty rozměrů): dům se změní, přístřešek se jen posune
  const { width, depth, centerZ } = shapedFootprint(type, shape, porch);
  const [cx, cz] = buildingLocalToWorld(position, 0, centerZ);
  return [rectangleCorners(cx, cz, width, depth, position.rotation)];
}
