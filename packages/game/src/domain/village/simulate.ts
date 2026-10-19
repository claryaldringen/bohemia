import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import { abandonmentCheck, abandonmentDay } from './abandonment';
import { villageCemeteries } from './cemetery';
import { cloneState } from './clone';
import {
  craftCoverage,
  craftHouseholds,
  newWorkshop,
  restingCrafters,
  wearCraftStocks,
  workCrafts,
} from './crafts';
import {
  decayEmptyDwelling,
  nextYearlyCommonLabor,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
  yearlyCommonLabor,
} from './dwellings';
import { animalCareNeed, dailyMilk, daysUntilMilking, villageCheeseKg } from './dairy';
import {
  DIET,
  daysUntilMeatEnd,
  eatDiet,
  villageFoodNeed,
  villageMeatKg,
  villageProteinNeed,
} from './diet';
import { endOfSeason, expectedNetKg, fallowStage, partOvergrowthYears } from './fields';
import { daysUntilAppleRot } from './food';
import { isToilDay, updateHappiness, villageLaborFactor, windowEndDay } from './happiness';
import { MOWING_WINDOWS, mow, mowingRemaining } from './hay';
import { herdingDay, recordHerding } from './herding';
import { sowingBlocks, villageHoldings, workOrder } from './holdings';
import { occupyEmptyDwellings, settleNewDwelling } from './households';
import { withKinship } from './kinship';
import { husbandryDay } from './husbandry';
import { daysUntilLegumeHarvest, villageLegumesKg } from './legumes';
import {
  SLAUGHTER_MONTH,
  dailyEggsKg,
  legumeNeedPerYear,
  slaughterRemaining,
  villageChickens,
  villageHerds,
  workSlaughter,
} from './livestock';
import { arrangeMarriages } from './marriage';
import { ableTeams, finishPen, ploughCapacityPerDay, villageOxen } from './oxen';
import { recordClearedObstacles } from './obstacles';
import { overgrowthDay } from './overgrowth';
import { mergeRoadChains, roadsDay } from './paths/roads';
import { refreshWalkDistances } from './paths/village';
import { roadWalk, walkGroundOf } from './paths/walking';
import { finishRoadApples, workRoadApples, roadApplesNeed } from './road-apples';
import { finishRoadUpgrade } from './road-upgrades';
import { copyPlot, relocationPlot } from './plots';
import { villageSacredOaks } from './sacred';
import { sacredOakEvents } from './sacred-life';
import { allocateDay, type LaborTaskName } from './labor';
import { laborDay, type ConstructionWork } from './labor-report';
import {
  ORCHARD_TASK_NAMES,
  isOrchardPlanted,
  orchardPlantingNeed,
  orchardSeasonDay,
  orchardWorkRemaining,
  plantOrchard,
  villageApplesKg,
  workOrchards,
} from './orchard';
import { ageGroup, laborPerDay } from './people';
import { inLuckyYears, nextStarvationDays, populationDay } from './population';
import { dailyMinPerHousehold } from './productivity';
import { moveRelocatedHousehold, relocatingHouseholds } from './relocation';
import { keepManor, villageManorId } from './manor';
import { goodsDay } from './goods';
import { finishExpeditions, workExpeditions } from './trade';
import { finishTrail, trailsDay } from './trail';
import { isVillageDormant } from './departure';
import { recordRuins, updateRuins } from './ruins';
import {
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  CROP_ORDER,
  FOOD_NEED_KG_PER_YEAR,
  FOREST_BONUS,
  HARVEST_DAY,
  ORCHARD_WINDOWS,
  PEAK_CAPACITY_SHARE,
  PLANNING_DAY,
  SOW_RESERVE,
  STORES_HIGH_YEARS,
  THRESH_END_DAY,
  WINDOWS,
  WINTER_HARVEST_DAY,
  WINTER_WINDOWS,
  dwellingBuildLabor,
  workshopBuildLabor,
  workshopTrees,
} from './rules';
import {
  chooseCrops,
  orchardOnlyLoad,
  planLoad,
  windowDaysLeft,
  type SowingCapacity,
} from './sowing';
import type {
  ChronicleEvent,
  Construction,
  CraftCoverage,
  Crop,
  CropWork,
  Dwelling,
  FieldPart,
  VillageState,
} from './types';
import {
  addLogs,
  fellAsWorked,
  fuelExtraPerDay,
  logsFromClearedTrees,
  planDwellingWood,
  rotLogs,
  takeWood,
  woodFellingCost,
  woodSupply,
} from './wood';
import { fieldGridOf } from './squares';
import { clearWoodAt, woodMatureShare, woodTreesOnArea } from './woods';
import {
  TASK_ORDER,
  activeTasks,
  addCropTaskWork,
  addToCropWork,
  createPlan,
  createYearPlan,
  cropTaskDone,
  cropTaskRemaining,
  cropTaskWindows,
  daysUntilFoodHarvest,
  harvestKg,
  planCrops,
  planPartIds,
  ploughRemaining,
  threshLossKg,
  windowEndOf,
  type CropTask,
} from './year-plan';

type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

// Řemesla (crafts.md): pokrytí potřeby nástrojů a nádob se spočítá na začátku dne ze zásob
// (`craftCoverage`) a posouvá všechny meze produktivity dne – plán osevu a přidané díly (polní
// práce a vracení přílohu), denní minimum, ztráty zásob a jablka v nádobách. Domácnosti dílen
// pracují jen v dílně (`workCrafts`), polní ani společnou práci nedělají.

/** Díl hotový nejpozději v posledním měsíci setí (duben) jde ještě do letošního plánu. */
const LAST_JOIN_MONTH = Math.max(...WINDOWS.sow.map(([, to]) => to));
/** Okno bonusu vymýceného lesa trvá roky × 365 dní. */
const DAYS_PER_BONUS_YEAR = 365;
/** Tolerance, pod kterou se nasycení ještě bere jako plné. */
const SATIATION_EPSILON = 1e-9;

/**
 * Dopočítá ves do dne `toDay` včetně – den po dni od `lastDay + 1`. Vstup nemění.
 * Výsledek nezávisí na tom, po jakých kouscích se dopočítává (náhoda dne je ze seedu a dne;
 * kronika se zkrátí na posledních CHRONICLE_MAX_EVENTS událostí – simulace ji nečte).
 * `obstacles` = vrstva překážek krajiny sídla: přestavby podle ní vyhradí stromy ke kácení
 * (forest.md). Povinná – `null` (kácení bez polohy) jen v testech; volající ji musí dávat vždy
 * stejně, jinak výsledek na kouscích závisí. `landscape` = krajina sídla jen pro přestavbu
 * polozemnice bez pozemku – postaví ji na nejbližším volném políčku (`relocationPlot`); bez ní
 * (testy, měření) se obydlí přestaví na místě. Také ji volající dává vždy stejně.
 * Vymřelá ves (`extinctDay`) se už nesimuluje – jen se posune `lastDay`; lidé, pole, stavby,
 * zásoby i klády stojí, jak byly v den vymření.
 * RangeError, když `toDay` leží za koncem světa nebo před už odsimulovaným dnem.
 */
export function advanceVillage(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
): VillageState {
  const steps = advanceVillageSteps(state, toDay, obstacles, landscape);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * `advanceVillage` po dnech: po každém odsimulovaném dni se zastaví (vrátí jeho index), aby
 * volající mohl mezi dny pustit ke slovu jinou práci (server – dlouhý dopočet neblokuje ostatní
 * požadavky). Výsledek (hodnota po posledním kroku) je stejný jako u `advanceVillage` – je to
 * tatáž smyčka, stav se klonuje jen jednou. RangeError jako `advanceVillage` (při prvním kroku).
 */
export function* advanceVillageSteps(
  state: VillageState,
  toDay: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null = null,
): Generator<number, VillageState, void> {
  if (!Number.isInteger(toDay) || toDay >= TOTAL_GAME_DAYS) {
    throw new RangeError(`Den ${toDay} neleží ve světě (0 až ${TOTAL_GAME_DAYS - 1}).`);
  }
  if (toDay < state.lastDay) {
    throw new RangeError(`Ves je dopočítaná do dne ${state.lastDay}, nelze zpět na ${toDay}.`);
  }
  // ves z doby před příbuzenstvím dostane pohlaví a manžele (kinship.md) – jednou, idempotentně
  const next = cloneState(withKinship(state));
  // vymřelá, opuštěná a ves na cestě se nesimulují – jen se posune den (migration.md)
  for (let day = next.lastDay + 1; day <= toDay && !isVillageDormant(next); day++) {
    simulateDay(next, day, obstacles, landscape);
    yield day;
  }
  next.lastDay = toDay;
  trimChronicle(next);
  return next;
}

/** Kronika drží jen posledních CHRONICLE_MAX_EVENTS událostí (mutuje stav). */
function trimChronicle(state: VillageState): void {
  const excess = state.chronicle.length - CHRONICLE_MAX_EVENTS;
  if (excess > 0) state.chronicle.splice(0, excess);
}

/** Jeden den vsi v pevném pořadí kroků (mutuje stav). */
function simulateDay(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): void {
  const date = dateOfDayIndex(day);
  // vzdálenosti chůze dílů po pěšinách – jen když se změnilo rozložení vsi (paths.md); bez
  // krajiny (kalibrace, testy) zůstávají přímé vzdálenosti
  if (landscape) refreshWalkDistances(state, day, landscape, obstacles);
  // pokrytí výrobky řemeslníků ze včerejších zásob – meze produktivity celého dne (crafts.md)
  const coverage = craftCoverage(state, day);
  rotLogs(state);
  // sady: shnilá jablka, konec péče a stárnutí (1. 3.), začátek a konec sklizně a péče, obnova
  // starých čtverců v oknech výsadby (stavba ze společné práce – dostane práci už dnes)
  state.chronicle.push(...orchardSeasonDay(state, day, coverage.pottery));
  // zarůstání přílohu (1. 11., před porážkou – stáda jsou ještě letní): díly, které se nespásly
  // ani neposekly, zarůstají, les z pole vypadne (fields.md – Zarůstání)
  state.chronicle.push(...overgrowthDay(state, day, obstacles ?? landscape));
  // stáda, seno a ohrady: mláďata, seč, porážka, vejce, zimní krmení, spřežení (diet.md, oxen.md)
  state.chronicle.push(...husbandryDay(state, day, coverage.tools, landscape, obstacles));
  // ušetřené posvátné duby stářím usychají a souše padají – den plyne z dubu (happiness.md)
  state.chronicle.push(...sacredOakEvents(villageSacredOaks(state), obstacles, day));
  if (isOn(date, PLANNING_DAY)) planYear(state, day, coverage);
  if (date.month >= PLANNING_DAY.month || date.month <= LAST_JOIN_MONTH) {
    joinFinishedParts(state, day, coverage);
  }
  const { toil, milking } = work(state, day, obstacles, coverage, landscape);
  // nástroje a nádoby v užívání se opotřebí (crafts.md – Účinek)
  wearCraftStocks(state, day);
  // zemské stezky – dostavěné úseky od vsi ven hned vylepšené, vrácené výpravy (trade.md)
  trailsDay(state);
  state.chronicle.push(...finishExpeditions(state, day));
  // sůl se jí, kožešiny se opotřebí (trade.md – Zboží zvenku)
  goodsDay(state);
  finishConstructions(state, day);
  // dvorec vojvody – po zániku dvorce nejstarší obydlí, starší ves dvorec dostane (trade.md)
  keepManor(state);
  decideRebuilds(state, day, obstacles, landscape);
  occupyEmptyDwellings(state, day);
  // zbytky jam po zaniklých obydlích zarůstají, pod novou stavbou zmizí (ruins.ts)
  updateRuins(state, day, landscape);
  // sňatky mezi domy – svobodní ve dvou domech se vezmou (population.md – Sňatky mezi domy)
  state.chronicle.push(...arrangeMarriages(state, day));
  const { satiation, energy, fruit, meat } = eat(state, day, coverage, milking);
  // nahromaděný hlad se počítá z dnešní energie (hladem se umírá z energie, ne z pestrosti –
  // diet.md) – úmrtí dne podle něj (population.md); v hájení zůstává pod prahem, aby po něm lidé
  // umírali postupně
  state.starvationDays = nextStarvationDays(
    state.starvationDays ?? 0,
    energy,
    inLuckyYears(state.foundedDay, day),
  );
  const events = populationDay(state, day, satiation, energy);
  state.chronicle.push(...events);
  // štěstí na konci dne – hlad, úmrtí, přeplněnost, dřina, zásoby, ovoce, maso a posvátná místa
  // (happiness.md, diet.md)
  updateHappiness(state, day, { satiation, events, toil, fruit, obstacles, meatShare: meat });
  if (state.people.length === 0) {
    // zemřel poslední člověk – ves vymřela, dál se nesimuluje (ani sklizeň dne)
    state.extinctDay = day;
    state.chronicle.push({ day, kind: 'village-extinct' });
    return;
  }
  // Sklizeň a ztráta nevymláceného až po jídle (Ruling 13) – 31. 8. se jí ještě z loňských
  // zásob, jak počítá daysUntilHarvest (31. 8. → 1 den); ozim stejně 31. 7.
  if (isOn(date, WINTER_HARVEST_DAY)) harvestWinter(state, day);
  if (isOn(date, HARVEST_DAY)) harvest(state, day);
  if (isOn(date, THRESH_END_DAY)) endThreshing(state);
  // pevné cesty (roads.md): práce dne do ročního součtu, 1. 11. roční kontrola cest a stromů
  const visits = roadsDay(state, day, landscape, obstacles);
  // opuštěné stavby (abandonment.md): 1. 11. podle provozu roční sítě začnou nebo přestanou
  // chátrat, každý den spadnou ty, jejichž stav došel na nulu
  if (visits) abandonmentCheck(state, day, visits);
  state.chronicle.push(...abandonmentDay(state, day, landscape));
}

function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

// --- plán osevu -------------------------------------------------------------------------

/**
 * Krok 1 (1. 9.): konec hospodářského roku pro všechny díly a nový plán osevu – ves rozhodne, co
 * oseje ozimem a co jaří (fields.md – Ozim a jař).
 */
function planYear(state: VillageState, day: number, coverage: CraftCoverage): void {
  for (const part of state.parts) endOfSeason(part, day);
  // ves se spřežením orá rádlem (oxen.md)
  const plough = ableTeams(state) > 0;
  // díly po úsecích hospodářství od domu ven (fields.md – Hospodaření podle polohy domů)
  const holdings = villageHoldings(state);
  const crops = chooseCrops(sowingBlocks(state.parts, holdings), {
    targetKg: sowingTarget(state, day),
    startKg: 0,
    capacity: sowingCapacity(state, day, coverage),
    load: orchardOnlyLoad(orchardHarvestLoad(state)),
    allowWinter: true,
    day,
    toolCoverage: coverage.tools,
    plough,
    // luštěniny podle bílkovin, které chybí po obilí, mléku a vejcích (fields.md – Luštěniny);
    // smějí jít na rezervu osevu, ne pod roční potřebu
    legumeTargetKg: legumeSowingTarget(state, day),
    energyFloorKg: yearlyFoodNeed(state, day),
  });
  // plán vzniká před změnou stavu dílů – vrácení přílohu se počítá jen u dílů v přílohu; práce
  // plánu (i orba – železná špička rádla od kováře) platí podle dnešního pokrytí nástroji celý
  // hospodářský rok
  state.plan = createYearPlan(crops, day, coverage.tools, plough, workOrder(holdings));
  const chosen = new Set([...crops.winter, ...crops.spring, ...crops.legume].map((p) => p.id));
  // vrácený mladý les dá za dospělé stromy klády (fields.md – Zarůstání, forest.md – Mýcení)
  addLogs(state, reclaimedLogs([...crops.winter, ...crops.spring, ...crops.legume], day));
  for (const part of state.parts) {
    if (chosen.has(part.id) || (part.state !== 'sown' && part.state !== 'ready')) continue;
    // nevybraný osev i nevyužitý hotový díl jdou do přílohu a začnou zarůstat
    part.state = 'fallow';
    part.fallowSinceDay = day;
    part.sownYears = 0;
    delete part.crop;
  }
  sow(crops.winter, day, 'winter');
  sow(crops.spring, day, 'spring');
  sow(crops.legume, day, 'legume');
}

/**
 * Krok 2 (1. 9. – 30. 4.): díly hotové v předchozích dnech jdou do letošního plánu jako jař,
 * když plán cíl nepokrývá a jař se vejde do zbývající práce – bez plánu ho založí. Díly hotové
 * po dubnu čekají na 1. 9.
 */
function joinFinishedParts(state: VillageState, day: number, coverage: CraftCoverage): void {
  const ready = state.parts.filter((p) => p.state === 'ready');
  if (ready.length === 0) return;
  const plan = state.plan;
  const inPlan = new Set(plan ? planPartIds(plan) : []);
  // díly plánu (oseté) se počítají do cíle první – nové přibudou, jen když ho nepokryjí
  const startKg = state.parts
    .filter((p) => inPlan.has(p.id))
    .reduce((sum, p) => sum + expectedNetKg(p, day), 0);
  const plough = ableTeams(state) > 0;
  const holdings = villageHoldings(state);
  // hotové díly (skupina 2 přílohové soustavy) po úsecích hospodářství
  const { spring } = chooseCrops(sowingBlocks(state.parts, holdings, 2), {
    targetKg: sowingTarget(state, day),
    startKg,
    capacity: sowingCapacity(state, day, coverage),
    load: planLoad(plan, orchardHarvestLoad(state)),
    allowWinter: false,
    day,
    toolCoverage: coverage.tools,
    plough,
  });
  if (spring.length === 0) return;
  const order = workOrder(holdings);
  if (plan === null) state.plan = createPlan(spring, day, coverage.tools, plough, order);
  else {
    const partsById = new Map(state.parts.map((p) => [p.id, p]));
    addToCropWork(plan, spring, day, coverage.tools, plough, partsById, order);
  }
  sow(spring, day, 'spring');
}

/** Roční potřeba jídla vsi (kg obilí). */
function yearlyFoodNeed(state: VillageState, day: number): number {
  return state.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
}

/** Cíl osevu: roční potřeba + rezerva, při velkých zásobách jen potřeba. */
function sowingTarget(state: VillageState, day: number): number {
  const need = yearlyFoodNeed(state, day);
  return state.storesKg > STORES_HIGH_YEARS * need ? need : need * (1 + SOW_RESERVE);
}

/**
 * Cíl luštěnin (fields.md – Luštěniny): kolik jich ves za rok chce sníst (bílkoviny, které chybí
 * po obilí, mléku a vejcích, nejvýš strop – `legumeNeedPerYear`) + rezerva jako u obilí, při
 * velké zásobě luštěnin jen potřeba.
 */
function legumeSowingTarget(state: VillageState, day: number): number {
  const need = legumeNeedPerYear(state, day);
  return villageLegumesKg(state) > STORES_HIGH_YEARS * need ? need : need * (1 + SOW_RESERVE);
}

/**
 * Seje se, co je zkopané do včerejška (TASK_ORDER) – v okně setí proto plán počítá s jedním dnem
 * méně, aby se zasel i pruh zkopaný poslední den kopání.
 */
const SOW_AFTER_DIG_DAYS = 1;

/**
 * Volná práce vsi ve špičkách polních prací od dneška do konce hospodářského roku: všechna
 * práce po denním minimu (PEAK_CAPACITY_SHARE) krát dny oken – podzim pro ozim (září–říjen)
 * a celý podzim (září–listopad), jaro (březen–duben), červenec a srpen (sklizně). Domácnosti
 * dílen na pole nechodí (crafts.md) – nepočítají se; práce se zvířaty (diet.md) jde napřed.
 */
function sowingCapacity(state: VillageState, day: number, coverage: CraftCoverage): SowingCapacity {
  const crafts = craftHouseholds(state);
  // práci násobí štěstí vsi (happiness.md)
  const capacity =
    state.people.reduce((sum, p) => sum + (crafts.has(p.dwellingId) ? 0 : laborPerDay(p, day)), 0) *
    villageLaborFactor(state);
  const dailyMin = dailyMinPerHousehold(coverage.pottery) * (householdCount(state) - crafts.size);
  // práce se zvířaty jde před polní práce (dojení, péče – diet.md); odhad podle dneška
  const animals = animalCareNeed(
    villageHerds(state),
    villageOxen(state),
    villageChickens(state),
    day,
  );
  const free =
    Math.max(0, capacity - dailyMin - animals.milking - animals.care) * PEAK_CAPACITY_SHARE;
  const days = (segments: Parameters<typeof windowDaysLeft>[1], sowing = false): number =>
    free * Math.max(0, windowDaysLeft(day, segments) - (sowing ? SOW_AFTER_DIG_DAYS : 0));
  return {
    autumnWinter: days(WINTER_WINDOWS.sow, true),
    autumn: days(WINDOWS.reclaim),
    spring: days(WINDOWS.sow, true),
    july: days(WINTER_WINDOWS.harvest),
    august: days(WINDOWS.harvest),
  };
}

/** Zbývající sklizeň jablek (září–říjen) – ves s ní při plánu osevu počítá (orchard.md). */
function orchardHarvestLoad(state: VillageState): number {
  const work = state.orchardWork;
  return work?.task === 'harvest' ? orchardWorkRemaining(work) : 0;
}

/** Do kdy platí okno bonusu úrodnosti lesa vymýceného v den `day`. */
function forestBonusUntil(day: number): number {
  return day + FOREST_BONUS.windowYears * DAYS_PER_BONUS_YEAR;
}

/**
 * Klády z vracených dílů v mladém lese (fields.md – Zarůstání): dospělých stromů jako v lese vsi
 * stejného stáří (`woodMatureShare` × hustota lesa) – za každý celý strom kláda (forest.md –
 * Mýcení).
 */
function reclaimedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    if (part.state !== 'fallow' || fallowStage(part, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(partOvergrowthYears(part));
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/** Vybrané díly se osejí plodinou `crop` (příloh se vrací do osevu – zarůstání začne znovu). */
function sow(parts: FieldPart[], day: number, crop: Crop): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      part.fallowSinceDay = null;
      part.sownYears = 0;
      delete part.overgrowthYears;
    }
    part.state = 'sown';
    part.crop = crop;
  }
}

// --- práce ------------------------------------------------------------------------------

/** Obydlí, ve kterých někdo bydlí (pořadí podle stavu). */
function occupiedDwellings(state: VillageState): Dwelling[] {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings.filter((d) => occupied.has(d.id));
}

/**
 * Počet domácností – i zakladatelů, kteří do dostavění první zemnice bydlí na staveništi
 * (denní minimum a domácí práce mají taky). Ve vsi s hotovými obydlími = obývaná obydlí.
 */
function householdCount(state: VillageState): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/** Polní úloha dne: práce plodiny, kterou dostane, a konec jejího okna pro pořadí. */
interface FieldTaskEntry {
  name: CropTask;
  crop: Crop;
  remaining: number;
  work: CropWork;
  end: number;
  rank: number;
}

/**
 * Polní úlohy dne: práce plánu po plodinách (bez výmlatu – úroda plánu ještě neroste), orba
 * rádlem v oknech kopání (spřežení zvládnou nejvýš `ploughCap` člověkodní za den – oxen.md)
 * a výmlat loňské úrody obou plodin. Nejbližší konec okna první, při shodě ozim před jaří
 * a pořadí úloh (TASK_ORDER; orba před kopáním).
 */
function fieldTasks(state: VillageState, day: number, ploughCap: number): FieldTaskEntry[] {
  const month = dateOfDayIndex(day).month;
  const entries: FieldTaskEntry[] = [];
  const add = (crop: Crop, work: CropWork, name: CropTask): void => {
    const end = windowEndOf(cropTaskWindows(crop, name), month);
    if (end === null) return;
    const order =
      TASK_ORDER.indexOf(name === 'plough' ? 'dig' : name) - (name === 'plough' ? 0.5 : 0);
    const rank = CROP_ORDER.indexOf(crop) * TASK_ORDER.length + order;
    entries.push({ name, crop, remaining: cropTaskRemaining(work, name), work, end, rank });
  };
  if (state.plan !== null) {
    for (const { crop, work } of planCrops(state.plan)) {
      for (const name of activeTasks(work, day, crop)) if (name !== 'thresh') add(crop, work, name);
      if (ploughRemaining(work) > 0) add(crop, work, 'plough');
    }
  }
  if (state.threshingFromPlan !== null) {
    for (const { crop, work } of planCrops(state.threshingFromPlan)) {
      if (activeTasks(work, day, crop).includes('thresh')) add(crop, work, 'thresh');
    }
  }
  entries.sort((a, b) => a.end - b.end || a.rank - b.rank);
  // spřežení orají obě plodiny – dohromady nejvýš jejich denní kapacitu
  let capLeft = ploughCap;
  for (const entry of entries) {
    if (entry.name !== 'plough') continue;
    entry.remaining = Math.min(entry.remaining, capLeft);
    capLeft -= entry.remaining;
  }
  return entries.filter((e) => e.name !== 'plough' || e.remaining > 0);
}

/**
 * Sezónní úloha dne v rozdělení práce: práce se zvířaty (dojení, péče, dospělí pasáci – hned po
 * denním minimu), polní úloha, práce v sadech, seč sena nebo porážka. Řadí se podle konce okna; při
 * shodě sklizeň jablek a porážka (maso se musí zpracovat hned) před polními úlohami (jablka zrají
 * v září a do konce října spadnou – ozim dostane zbytek podzimu, se kterým plán osevu počítá),
 * péče o sad a seč až po nich.
 */
interface DayTask {
  name: LaborTaskName;
  remaining: number;
  end: number;
  tie: number;
  rank: number;
  field?: FieldTaskEntry;
}

/**
 * Krok 3: rozdělení práce vsi. Polní úlohy obou plodin a orba (`fieldTasks`), sezónní práce
 * v sadech, seč sena a porážka podle konce svého okna; opravy obydlí poměrně k potřebě (obydlený
 * dům stav drží i s nedodělkem oprav – chátrá jen prázdný, population.md); společná práce do
 * staveb. Veškerou práci násobí štěstí (happiness.md). Domácnosti obývaných dílen
 * pracují zvlášť – jen v dílně (crafts.md, `workCrafts`); opravy jejich obydlí platí ves. Práce
 * se zvířaty (dojení, zimní péče, prasata a slepice – diet.md) jde hned po denním minimu – zvířata
 * nepočkají. Vrací, jestli ves dnes nestíhá polní práce v období (dřina), a jaký podíl dojných
 * samic se podojil (bez dojení 1).
 */
function work(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): { toil: boolean; milking: number } {
  const month = dateOfDayIndex(day).month;
  // orba: spřežení s rádlem, se železnou špičkou od kováře rychleji (oxen.md)
  const owned = fieldTasks(state, day, ploughCapacityPerDay(state, coverage.tools));
  const dayTasks: DayTask[] = owned.map((field) => ({
    name: field.name,
    remaining: field.remaining,
    end: field.end,
    tie: 1,
    rank: field.rank,
    field,
  }));
  // dojení, sýr z mléka, které se nevypije (strop mléka a sýra – diet.md), a péče o zvířata
  const herds = villageHerds(state);
  const milk = dailyMilk(herds, day);
  const drinkable = DIET.caps.dairy * villageFoodNeed(state, day);
  const cheeseMilkL = milk.energy > drinkable ? milk.liters * (1 - drinkable / milk.energy) : 0;
  const animals = animalCareNeed(
    herds,
    villageOxen(state),
    villageChickens(state),
    day,
    cheeseMilkL,
  );
  if (animals.milking > 0) {
    dayTasks.push({ name: 'milking', remaining: animals.milking, end: -1, tie: 0, rank: 0 });
  }
  if (animals.care > 0) {
    dayTasks.push({ name: 'animal-care', remaining: animals.care, end: -1, tie: 0, rank: 1 });
  }
  const orchard = orchardTask(state, day);
  if (orchard) {
    const tie = orchard.name === ORCHARD_TASK_NAMES.harvest ? 0 : 2;
    dayTasks.push({ ...orchard, tie, rank: 0 });
  }
  const mowing = mowingRemaining(state, day);
  if (mowing > 0) {
    const end = windowEndOf(MOWING_WINDOWS, month) ?? month;
    dayTasks.push({ name: 'mow', remaining: mowing, end, tie: 2, rank: 1 });
  }
  // porážka a uzení – maso se musí zpracovat hned, před polními úlohami téhož měsíce (diet.md)
  const butchery = slaughterRemaining(state, day);
  if (butchery > 0) {
    dayTasks.push({
      name: 'slaughter',
      remaining: butchery,
      end: SLAUGHTER_MONTH,
      tie: 0,
      rank: 1,
    });
  }
  // pasení: co děti od 7 let a starší nezvládnou, pasou dospělí (nejvýš jeden z domácnosti) –
  // stáda nepočkají, jde se zvířaty hned po dojení a péči (diet.md – Pasáci)
  const herding = herdingDay(state, day, villageOxen(state), householdCount(state));
  if (herding.adults > 0) {
    dayTasks.push({ name: 'herding', remaining: herding.adults, end: -1, tie: 0, rank: 2 });
  }
  dayTasks.sort((a, b) => a.end - b.end || a.tie - b.tie || a.rank - b.rank);

  const households = occupiedDwellings(state);
  const repairNeeds = households.map((d) => repairNeedPerDay(d, day));
  const repairNeed = repairNeeds.reduce((sum, n) => sum + n, 0);
  const productivity = villageLaborFactor(state);
  // řemeslník, který dnes nemá v dílně co dělat (plná zásoba, chybí vstup), pracuje se vsí
  // (crafts.md – Podle potřeby)
  const resting = restingCrafters(state, day, coverage, productivity, obstacles);
  const crafts = craftHouseholds(state, resting);
  const villagers =
    crafts.size > 0 ? state.people.filter((p) => !crafts.has(p.dwellingId)) : state.people;
  const allocation = allocateDay({
    capacity: villagers.reduce((sum, p) => sum + laborPerDay(p, day), 0),
    households: householdCount(state) - crafts.size,
    people: villagers.length,
    tasks: dayTasks.map(({ name, remaining }) => ({ name, remaining })),
    repairNeed,
    domesticBacklog: state.domesticBacklog,
    potteryCoverage: coverage.pottery,
    fuelExtra: fuelExtraPerDay(state, (id) => !crafts.has(id)),
    productivity,
  });

  // polní práce dne – i odkud kam došla (rozdělení práce po dílech pro postavy, labor-report.ts)
  const fieldWork: {
    task: CropTask;
    work: CropWork;
    before: number;
    after: number;
    amount: number;
  }[] = [];
  const mowingBefore = state.hay?.mowing?.done ?? 0;
  let milked = animals.milking > 0 ? 0 : 1;
  let herdedByAdults = 0;
  dayTasks.forEach((task, i) => {
    const amount = allocation.taskAmounts[i] ?? 0;
    if (task.name === 'milking') {
      milked = Math.min(1, amount / animals.milking);
    } else if (task.name === 'animal-care') {
      // zimní krmení, voda a kydání – bez následků, když nezbude práce (zatím)
    } else if (task.field) {
      const before = cropTaskDone(task.field.work, task.field.name);
      addCropTaskWork(task.field.work, task.field.name, amount);
      const after = cropTaskDone(task.field.work, task.field.name);
      fieldWork.push({ task: task.field.name, work: task.field.work, before, after, amount });
    } else if (task.name === 'mow') {
      mow(state, amount);
    } else if (task.name === 'slaughter') {
      workSlaughter(state, amount);
    } else if (task.name === 'herding') {
      herdedByAdults += amount;
    } else {
      workOrchards(state, amount);
    }
  });
  // opravy berou práci vsi podle potřeby; obydlený dům stav neztrácí ani s nedodělkem (Martin:
  // „obydlená budova nechátrá – obyvatelé ji opravují. Chátrá jenom prázdná.“)
  const repairs = households.map((d, i) => {
    const need = repairNeeds[i] ?? 0;
    const manDays = repairNeed > 0 ? (allocation.repairs * need) / repairNeed : 0;
    return { dwellingId: d.id, manDays };
  });
  decayEmptyDwellings(state, day, new Set(households.map((d) => d.id)));
  state.domesticBacklog = allocation.domesticBacklog;
  // co dnes pasáci uhlídali – podle toho ves při porážce drží stádo (diet.md – Pasáci)
  recordHerding(state, herding, herdedByAdults);
  // nosiči výprav k sousedům jdou ze společné práce před stavbami (trade.md – Doprava)
  const trade = workExpeditions(state, allocation.common);
  const constructions = build(state, day, allocation.common - trade.used);
  const workshops = workCrafts(state, day, obstacles, coverage, productivity, resting, landscape);
  const hayMowing = state.hay?.mowing;
  state.labor = laborDay(state, day, {
    allocation,
    fieldWork,
    repairs,
    constructions,
    workshops,
    trade: trade.shares,
    toolCoverage: coverage.tools,
    herders: herding.freeHerders,
    ...(hayMowing
      ? { mowing: { mowing: hayMowing, before: mowingBefore, after: hayMowing.done } }
      : {}),
  });
  // roční průměr (starší ves začne průměrem 30 dní ještě bez dneška) a posledních 30 dní
  state.commonLaborYearly = nextYearlyCommonLabor(yearlyCommonLabor(state), allocation.common);
  state.commonLaborHistory.push(allocation.common);
  if (state.commonLaborHistory.length > COMMON_LABOR_HISTORY_DAYS) {
    state.commonLaborHistory.splice(0, state.commonLaborHistory.length - COMMON_LABOR_HISTORY_DAYS);
  }
  // dřina: stihne ves dnešním tempem polní práce obou plodin do konce jejich oken?
  const pace = fieldWork.reduce((sum, task) => sum + task.amount, 0);
  const seasonTasks = owned.map((task) => ({
    remaining: cropTaskRemaining(task.work, task.name),
    endDay: windowEndDay(cropTaskWindows(task.crop, task.name), day) ?? day,
  }));
  return { toil: isToilDay(seasonTasks, pace, day), milking: milked };
}

/** Sezónní práce v sadech dnes (sklizeň, nebo péče) s koncem okna pro pořadí; jinak null. */
function orchardTask(
  state: VillageState,
  day: number,
): { name: LaborTaskName; remaining: number; end: number } | null {
  const work = state.orchardWork;
  const remaining = orchardWorkRemaining(work);
  if (!work || remaining <= 0) return null;
  const end = windowEndOf(ORCHARD_WINDOWS[work.task], dateOfDayIndex(day).month);
  if (end === null) return null;
  return { name: ORCHARD_TASK_NAMES[work.task], remaining, end };
}

/**
 * Opuštěná obydlí se neopravují ani nepřestavují: rozestavěná přestavba prázdného obydlí se
 * opustí (nebere společnou práci, klády, které vzala z hromady, se na ni vrátí, vyhrazené stromy
 * se uvolní), obydlí chátrá rychleji než obydlené (`decayEmptyDwelling`) a na nule zanikne.
 */
function decayEmptyDwellings(state: VillageState, day: number, occupied: Set<number>): void {
  state.constructions = state.constructions.filter((c) => {
    const abandoned = c.kind === 'rebuild' && c.dwellingId !== null && !occupied.has(c.dwellingId);
    if (abandoned && c.wood) addLogs(state, c.wood.fromPile);
    return !abandoned;
  });
  const gone = new Set<number>();
  for (const d of state.dwellings) {
    if (occupied.has(d.id)) continue;
    decayEmptyDwelling(d, day);
    if (d.condition <= 0) gone.add(d.id);
  }
  if (gone.size === 0) return;
  // na místě zaniklého obydlí zůstane zbytek jámy (ruins.ts)
  recordRuins(
    state,
    state.dwellings.filter((d) => gone.has(d.id)),
    day,
  );
  state.dwellings = state.dwellings.filter((d) => !gone.has(d.id));
}

/**
 * Kolik práce stavbě dnes chybí; pole = zbývající zakládání jeho nehotových dílů, sad =
 * zbývající výsadba (jen v oknech výsadby – mimo ně stavba čeká).
 */
function constructionNeed(
  state: VillageState,
  c: Construction,
  day: number,
  founding: FoundingIndex,
): number {
  if (c.kind === 'orchard') return orchardPlantingNeed(state, c, day);
  // jabloně u cesty se sázejí jen v oknech jara a podzimu (roads.md)
  if (c.kind === 'road-apples') return roadApplesNeed(c, day);
  if (c.kind !== 'field') return Math.max(0, c.cost - c.done);
  return foundingParts(founding, c).reduce((sum, p) => sum + (p.foundingCost - p.foundingDone), 0);
}

/**
 * Zakládané díly po polích (v pořadí dílů ve stavu) – jeden průchod díly na krok místo průchodu
 * na každou stavbu pole (s tisíci dílů to byla třetina času simulace). Bez stavby pole prázdné.
 */
type FoundingIndex = ReadonlyMap<number, readonly FieldPart[]>;

function foundingIndex(state: VillageState): FoundingIndex {
  const byField = new Map<number, FieldPart[]>();
  if (!state.constructions.some((c) => c.kind === 'field')) return byField;
  for (const p of state.parts) {
    if (p.state !== 'founding') continue;
    const list = byField.get(p.fieldId);
    if (list) list.push(p);
    else byField.set(p.fieldId, [p]);
  }
  return byField;
}

/** Zakládané díly stavby pole – stav znovu, protože založení mění díl na připravený. */
function foundingParts(founding: FoundingIndex, c: Construction): FieldPart[] {
  if (c.fieldId === null) return [];
  return (founding.get(c.fieldId) ?? []).filter((p) => p.state === 'founding');
}

/**
 * Společná práce rovným dílem do rozestavěných staveb: stavba, které stačí méně, si vezme jen
 * to, co potřebuje, a zbytek se znovu rozdělí mezi ostatní; co zbude po všech, propadne.
 * Vrátí, kolik práce šlo do které stavby (rozdělení práce dne pro scénu – labor-report.ts).
 */
function build(state: VillageState, day: number, common: number): ConstructionWork[] {
  const founding = foundingIndex(state);
  let active = state.constructions
    .map((c) => ({ c, need: constructionNeed(state, c, day, founding) }))
    .filter((x) => x.need > 0);
  const invested: ConstructionWork[] = [];
  const put = (c: Construction, amount: number, completes: boolean): void => {
    invested.push({
      construction: c,
      manDays: amount,
      doneBefore: c.done,
      felledBefore: c.wood?.felled ?? 0,
    });
    invest(state, day, c, amount, completes, founding);
  };
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) put(x.c, share, false);
      return invested;
    }
    for (const x of saturated) {
      put(x.c, x.need, true);
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return invested;
}

/** Vloží práci do stavby; `completes` = dostala vše, co jí chybělo. */
function invest(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
  founding: FoundingIndex,
): void {
  if (c.kind === 'orchard') {
    plantOrchard(state, day, c, amount, completes);
    return;
  }
  if (c.kind === 'road-apples') {
    workRoadApples(state, day, c, amount, completes);
    return;
  }
  if (c.kind !== 'field') {
    c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
    // dřevo se kácí jako první část práce stavby (forest.md)
    fellAsWorked(state, c, day);
    return;
  }
  // pole zakládá díly od nejbližšího k obydlí; přebytek dne teče do dalšího dílu
  const parts = foundingParts(founding, c).sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);
  let left = amount;
  let used = 0;
  for (const part of parts) {
    const need = part.foundingCost - part.foundingDone;
    if (completes || left >= need) {
      left -= need;
      used += need;
      part.foundingDone = part.foundingCost;
      part.state = 'ready';
      if (part.surface === 'forest') part.bonusUntilDay = forestBonusUntil(day);
      // založený díl: stromy, kameny a keře z něj zmizí natrvalo (fields.md – Zakládání),
      // dospělé stromy dají klády na hromadu (forest.md – Mýcení)
      if (part.obstacles) {
        recordClearedObstacles(state, part.obstacles, day);
        delete part.obstacles;
      }
      if (part.trees) {
        addLogs(state, logsFromClearedTrees(part.trees));
        delete part.trees;
      }
      // pole vymýtilo les vsi na čtverci (fields.md – Les vsi) – stromy zmizely s překážkami
      if (part.cell) clearWoodAt(state, part.cell, fieldGridOf(state, part.fieldId));
    } else {
      part.foundingDone += left;
      used += left;
      break;
    }
  }
  // průběh stavby jen z jejích dílů – pole mohlo mít díly založené dřív (rozšíření, sloučení)
  c.done = Math.min(c.cost, c.done + used);
}

// --- stavby a domácnosti ------------------------------------------------------------------

function isFinished(state: VillageState, c: Construction, founding: FoundingIndex): boolean {
  if (c.kind === 'field') return foundingParts(founding, c).length === 0;
  if (c.kind === 'orchard') return isOrchardPlanted(state, c);
  return c.done >= c.cost;
}

/**
 * Krok 4: dokončené stavby – nové obydlí, přestavěné obydlí, založené pole, vysazený (obnovený)
 * sad a pohřebiště. První zemnice dostane id domácnosti zakladatelů (`dwellingId` stavby) – ti už
 * v ní bydlí, nikdo se nestěhuje. Do jiného nového obydlí se stěhuje mladý pár; když žádný není,
 * osídlí ho ještě týž den dospělé děti z přeplněné domácnosti (krok 6).
 */
function finishConstructions(state: VillageState, day: number): void {
  const unfinished: Construction[] = [];
  const founding = foundingIndex(state);
  let roadUpgraded = false;
  for (const c of state.constructions) {
    if (!isFinished(state, c, founding)) {
      unfinished.push(c);
      continue;
    }
    if (c.kind === 'field' || c.kind === 'orchard') {
      // obnova sadu má zápis v kronice při zahájení (orchard.md – Obnova sadu)
      if (!c.renewal) state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'cemetery') {
      finishCemetery(state, day, c);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'road' && c.trail !== undefined) {
      // dostavěná zemská stezka – obchod se sousedem (trade.md)
      state.chronicle.push(...finishTrail(state, c, day));
      continue;
    }
    if (c.kind === 'road') {
      // vylepšená pevná cesta – rychlejší chůze (roads.md); vzdálenosti chůze se přepočítají
      finishRoadUpgrade(state, c);
      state.chronicle.push(finishedEvent(day, c, null));
      roadUpgraded = true;
      continue;
    }
    if (c.kind === 'road-apples') {
      // jabloně podél cesty vysazené – péče a sklizeň se sady (roads.md)
      finishRoadApples(state, c, day);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'pen' || c.kind === 'ard') {
      // dostavěná ohrada přijme dobytek, hotové rádlo čeká na vycvičené voly (oxen.md)
      if (c.kind === 'pen' && c.penId !== null && c.penId !== undefined) {
        finishPen(state, c.penId, day);
      }
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'idol' || c.kind === 'shrine') {
      // dostavěná modla nebo svatyně – přidává štěstí (happiness.md)
      if (c.position !== null) {
        (state.sacredBuildings ??= []).push({
          id: c.id,
          kind: c.kind,
          position: { ...c.position },
          builtDay: day,
        });
      }
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.dwellingType === null) throw new Error(`Stavba ${c.id} nemá typ obydlí.`);
    if (c.kind === 'rebuild') {
      const dwelling = state.dwellings.find((d) => d.id === c.dwellingId);
      if (dwelling) {
        // přestavba jinde: starý dům se zboří – na jeho místě zůstane zbytek jámy (ruins.ts)
        if (c.plot && c.position) recordRuins(state, [dwelling], day);
        dwelling.type = c.dwellingType;
        dwelling.builtDay = day;
        dwelling.condition = 1;
        // přestavba na pozemku jinde (polozemnice bez pozemku) – domácnost se přestěhuje
        if (c.plot && c.position) {
          dwelling.position = { ...c.position };
          dwelling.plot = copyPlot(c.plot);
          if (c.forestDistanceM !== undefined) dwelling.forestDistanceM = c.forestDistanceM;
        }
      }
      state.chronicle.push(finishedEvent(day, c, c.dwellingId));
      continue;
    }
    if (c.position === null) throw new Error(`Stavba obydlí ${c.id} nemá polohu.`);
    const dwelling: Dwelling = {
      id: c.dwellingId ?? state.nextId++,
      type: c.dwellingType,
      builtDay: day,
      condition: 1,
      position: { ...c.position },
      ...(c.plot ? { plot: copyPlot(c.plot) } : {}),
      ...(c.forestDistanceM === undefined ? {} : { forestDistanceM: c.forestDistanceM }),
      // řemeslná dílna – řemeslo patří budově (crafts.md)
      ...(c.craft ? { workshop: newWorkshop(c.craft, c.waterDistanceM) } : {}),
    };
    state.dwellings.push(dwelling);
    state.chronicle.push(finishedEvent(day, c, dwelling.id));
    // přestěhování: domácnost se přestěhuje do nového domu, starý zůstane prázdný (migration.md);
    // jinak nové obydlí osídlí rodina ženatého syna (kinship.md – Domácnosti)
    if (c.relocates !== undefined) moveRelocatedHousehold(state, day, c, dwelling.id);
    else if (c.dwellingId === null) settleNewDwelling(state, day, dwelling.id);
  }
  state.constructions = unfinished;
  // vylepšený úsek se stejným stupněm jako soused v uzlu bez odbočky se s ním spojí (roads.md)
  if (roadUpgraded && state.roads) mergeRoadChains(state.roads, state.constructions);
}

/**
 * Dokončené založení hřbitova (hřbitov přijímá mrtvé), nebo rozšíření (jeho čtverce se začnou
 * počítat – stavba je pozná podle `constructionId`). Překážky na dostavěných čtvercích zmizí
 * natrvalo jako u založeného dílu pole (fields.md – Zakládání).
 */
function finishCemetery(state: VillageState, day: number, c: Construction): void {
  const cemetery = villageCemeteries(state).find((x) => x.id === c.cemeteryId);
  if (!cemetery) return;
  const extension = cemetery.squares.filter((s) => s.constructionId === c.id);
  const finished =
    extension.length > 0
      ? extension
      : cemetery.squares.filter((s) => s.constructionId === undefined);
  for (const square of finished) {
    if (square.trees) {
      addLogs(state, logsFromClearedTrees(square.trees));
      delete square.trees;
    }
    if (!square.obstacles) continue;
    recordClearedObstacles(state, square.obstacles, day);
    delete square.obstacles;
  }
  if (extension.length === 0) {
    cemetery.builtDay = day;
    return;
  }
  for (const square of extension) delete square.constructionId;
}

function finishedEvent(day: number, c: Construction, dwellingId: number | null): ChronicleEvent {
  return {
    day,
    kind: 'construction-finished',
    constructionKind: c.kind,
    dwellingId,
    fieldId: c.kind === 'field' ? c.fieldId : null,
    ...(c.craft && c.kind === 'dwelling' ? { craft: c.craft } : {}),
  };
}

/**
 * Krok 5: obyvatelé dožilého obydlí se rozhodnou ho přestavět (rozhoduje stáří – obydlený dům
 * nechátrá). Přestavba bere
 * dřevo jako nová stavba (forest.md): klády z hromady, zbytek vyhradí mezi nejbližšími dospělými
 * stromy k obydlí. Nezastaví ji ani nedostatek dřeva – vezme, co je. Polozemnice bez pozemku
 * (i zemnice přestavovaná na polozemnici) se s krajinou staví na nejbližším volném políčku
 * s pozemkem (`relocationPlot`, Martin 18. 10. 2026): překážky na něm zmizí hned (klády na
 * hromadu, práce navíc jako u nové stavby), po dostavění se domácnost přestěhuje. Dílna se přestaví na
 * stejnou dílnu na místě (crafts.md – přestavba zachová řemeslo) za cenu nové dílny.
 */
function decideRebuilds(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): void {
  const rebuilding = new Set(
    state.constructions.filter((c) => c.kind === 'rebuild').map((c) => c.dwellingId),
  );
  // domácnost, která si staví nový dům, starý nepřestavuje (migration.md)
  for (const household of relocatingHouseholds(state)) rebuilding.add(household);
  // „má na to“ podle ročního průměru – v zimě (výmlat) ani o žních ves nezchudne (Martin)
  const yearlyCommon = yearlyCommonLabor(state);
  const manorId = villageManorId(state);
  for (const d of occupiedDwellings(state)) {
    if (rebuilding.has(d.id) || !wantsRebuild(d, day)) continue;
    // dílna zůstane dílnou stejného typu na svém místě (crafts.md), dvorec vojvody se přestaví na
    // dvorec (trade.md), ostatní podle práce a dřeva
    const craft = d.workshop?.craft;
    // dřevo: klády na hromadě a stromy, které jde skácet – po předchozích přestavbách dne
    const type = craft
      ? d.type
      : d.id === manorId
        ? 'dvorec'
        : rebuildType(d.type, yearlyCommon, woodSupply(state, obstacles, day));
    // nový pozemek: polozemnice bez pozemku, dvorec bez pozemku se dvorem (dvě políčka)
    const needsSite = !d.plot || (type === 'dvorec' && !d.plot.yard);
    const site =
      landscape && obstacles && needsSite && !craft
        ? relocationPlot(state, landscape, obstacles, d, type, day)
        : null;
    // kácení chůzí po pevných cestách (roads.md) – jen s krajinou
    const walk = landscape ? roadWalk(state.roads?.roads ?? [], walkGroundOf(landscape)) : null;
    const plan = planDwellingWood(state, type, site?.position ?? d.position, day, {
      obstacles,
      ...(walk ? { walk } : {}),
      ...(craft ? { trees: workshopTrees(craft) } : {}),
      ...(site
        ? { clearedTrees: site.check.clearedTrees, clearedIds: site.check.obstacleIds }
        : {}),
    });
    if (site) recordClearedObstacles(state, site.check.obstacleIds, day);
    const wood = takeWood(state, plan);
    state.constructions.push({
      id: state.nextId++,
      kind: 'rebuild',
      startedDay: day,
      cost:
        (craft ? workshopBuildLabor(craft) : dwellingBuildLabor(type)) +
        (site?.check.obstacleCost ?? 0) +
        woodFellingCost(wood),
      done: 0,
      dwellingType: type,
      position: site ? { ...site.position } : null,
      ...(site ? { plot: site.plot, forestDistanceM: site.forestDistanceM } : {}),
      dwellingId: d.id,
      fieldId: null,
      wood,
    });
    state.chronicle.push({ day, kind: 'rebuild-decided', dwellingId: d.id, type });
  }
}

// --- sklizeň a jídlo --------------------------------------------------------------------

/**
 * 31. 7. (po jídle dne): čistá úroda ozimu do zásob obilí (fields.md – Ozim a jař) a luštěnin do
 * zásoby luštěnin (fields.md – Luštěniny).
 */
function harvestWinter(state: VillageState, day: number): void {
  const legume = state.plan?.legume;
  if (legume && legume.harvestedKg === null) {
    const kg = harvestKg(legume, state.parts, day, 'legume');
    state.legumesKg = villageLegumesKg(state) + kg;
    legume.harvestedKg = kg;
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'legume' });
  }
  const winter = state.plan?.winter;
  if (!winter || winter.harvestedKg !== null) return;
  const kg = harvestKg(winter, state.parts, day);
  state.storesKg += kg;
  winter.harvestedKg = kg;
  state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'winter' });
}

/** 31. 8. (po jídle dne): čistá úroda jaře do zásob, plán (i s ozimem) jde k výmlatu. */
function harvest(state: VillageState, day: number): void {
  const plan = state.plan;
  if (plan === null) return;
  const kg = harvestKg(plan, state.parts, day);
  state.storesKg += kg;
  plan.harvestedKg = kg;
  // plán jen s ozimem jař nesklízí – žádná sklizeň do kroniky
  if (!plan.winter) state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  else if (plan.partIds.length > 0) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'spring' });
  }
  state.threshingFromPlan = plan;
  state.plan = null;
}

/** 1. 3. (po jídle dne): nevymlácená část úrody plodin se zkazila (luštěniny ze své zásoby). */
function endThreshing(state: VillageState): void {
  const threshing = state.threshingFromPlan;
  if (threshing === null) return;
  const crops = planCrops(threshing);
  const loss = crops
    .filter(({ crop }) => crop !== 'legume')
    .reduce((sum, { work }) => sum + threshLossKg(work, work.harvestedKg ?? 0), 0);
  state.storesKg = Math.max(0, state.storesKg - loss);
  const legume = threshing.legume;
  if (legume) {
    const legumeLoss = threshLossKg(legume, legume.harvestedKg ?? 0);
    state.legumesKg = Math.max(0, villageLegumesKg(state) - legumeLoss);
  }
  state.threshingFromPlan = null;
}

/**
 * Krok 8: jídlo dne ze zásob (diet.md) – ovoce přednostně do zkažení, čerstvé mléko (podojená část
 * – `milked`) a vejce, maso do porážky, sýr do dojení a luštěniny do sklizně, obilí dorovná;
 * vrací nasycení (energie × kvalita stravy), energii, jestli se jedlo ovoce, a podíl energie
 * z masa (štěstí) a zapíše začátek a konec hladu. Hlad začíná
 * už tehdy, když příděl energie podle výhledu do sklizně klesne pod plný – i když se dnes jí
 * dosyta ovocem a obilí nevystačí až po 1. 3.
 */
function eat(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  milked: number,
): { satiation: number; energy: number; fruit: boolean; meat: number } {
  const need = villageFoodNeed(state, day);
  const milk = dailyMilk(villageHerds(state), day);
  const meal = eatDiet({
    grainKg: state.storesKg,
    meatKg: villageMeatKg(state),
    fruitKg: villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: milk.liters * milked,
    milkProteinKg: milk.proteinKg * milked,
    milkEnergy: milk.energy * milked,
    eggsKg: dailyEggsKg(state),
    legumesKg: villageLegumesKg(state),
    // med ze zboží zvenku (trade.md)
    honeyKg: state.goods?.honeyKg ?? 0,
    daysToLegumeHarvest: daysUntilLegumeHarvest(day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    daysToMilking: daysUntilMilking(day),
    daysToHarvest: daysUntilFoodHarvest(state.plan, state.parts, day, need),
    // jablka v nádobách od hrnčíře vydrží déle (crafts.md)
    daysToRot: daysUntilAppleRot(day, coverage.pottery),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage: coverage.pottery,
  });
  state.storesKg = meal.grainKg;
  if (state.meatKg !== undefined || meal.meatKg > 0) state.meatKg = meal.meatKg;
  if (state.cheeseKg !== undefined || meal.cheeseKg > 0) state.cheeseKg = meal.cheeseKg;
  if (state.legumesKg !== undefined || meal.legumesKg > 0) state.legumesKg = meal.legumesKg;
  if (state.applesKg !== undefined) state.applesKg = meal.fruitKg;
  if (state.goods) state.goods.honeyKg = meal.honeyKg;
  state.diet = meal.diet;
  const hungry = meal.outlook < 1 - SATIATION_EPSILON;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  return {
    satiation: meal.diet.satiation,
    energy: meal.diet.energy,
    // med štěstí přidá jako ovoce (trade.md – Zboží zvenku)
    fruit: meal.diet.shares.fruit > 0 || (meal.diet.shares.honey ?? 0) > 0,
    meat: meal.diet.shares.meat,
  };
}
