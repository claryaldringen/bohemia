import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import { abandonmentCheck, abandonmentDay } from './abandonment';
import {
  carpentryHelp,
  constructionLaborFactor,
  constructionWoodShare,
  restingCarpenters,
  workCarpenters,
} from './carpentry';
import {
  addHaulTrips,
  cartOrigin,
  cropCartReach,
  fellingHaulable,
  haulAvailable,
  haulCartsToday,
  hauledBy,
  haulPlan,
  haulProgress,
  logsCartReach,
  mowingCartReach,
  retireCarts,
  sowingCartReach,
  teamsHomeShare,
  villageCartAccess,
  type CartAccess,
  type HaulPlan,
} from './carts';
import { addCartDemand, nextPloughPairs } from './draft';
import {
  kilnCartDrive,
  kilnCartOffer,
  oreCartDrive,
  oreCartOffer,
  villageCartDrives,
  waterCartDrive,
  waterCartPlan,
  type CartDrives,
  type WaterCartPlan,
} from './cart-jobs';
import {
  basketManDaysPerKg,
  charcoalDeliveries,
  findKiln,
  occupiedSmiths,
  smithFetchDay,
  updateOrePits,
  type CharcoalDelivery,
  type CharcoalFetch,
  type OreCartToday,
  type SmithFetchDay,
} from './smith-supply';
import { villageCemeteries } from './cemetery';
import { finishPurchases, purchaseTravelers, startPurchases, walkPurchases } from './craft-buying';
import { gainPractice, withCraftSkill } from './craft-skill';
import { cartIronDay } from './cart-iron';
import { cloneState } from './clone';
import { updateKilnRemnants } from './charcoal';
import {
  burnerDraws,
  burnerPlans,
  craftCoverage,
  craftHouseholds,
  ironTravellers,
  migrateBurners,
  newWorkshop,
  restingCrafters,
  wearCraftStocks,
  workCrafts,
  type SmithSupply,
} from './crafts';
import {
  decayEmptyDwelling,
  nextYearlyCommonLabor,
  rebuildType,
  repairNeedPerDay,
  wantsRebuild,
  yearlyCommonLabor,
} from './dwellings';
import { animalCareNeed, dailyMilk } from './dairy';
import { DIET, eatDiet, villageFoodNeed } from './diet';
import {
  closeFieldFoodYear,
  recordFieldFood,
  sowingTargets,
  type SowingTargets,
} from './field-food';
import { endOfSeason, expectedNetKg, sowingGroup } from './fields';
import { plannedFurrowEfficiency, ploughDayFactor } from './plough-trip';
import { isToilDay, updateHappiness, villageLaborFactor, windowEndDay } from './happiness';
import { MOWING_WINDOWS, mow, mowingRemaining } from './hay';
import { herdingDay, recordHerding } from './herding';
import { EMERGENCY_GROUP, sowingBlocks, villageHoldings, workOrder } from './holdings';
import { occupyEmptyDwellings, settleNewDwelling } from './households';
import { withKinship } from './kinship';
import { withPenSpecies } from './pens';
import { flaxNeedKg, harvestFlax } from './flax';
import { husbandryDay, plannedLegumeKg } from './husbandry';
import { dayMealInput, emergencySlaughter } from './emergency-slaughter';
import { villageLegumesKg } from './legumes';
import {
  slaughterRemaining,
  villageChickens,
  villageDams,
  villageHerds,
  workSlaughter,
} from './livestock';
import { arrangeMarriages } from './marriage';
import {
  ableTeams,
  finishArd,
  finishPen,
  oxPens,
  ploughCapacityPerDay,
  villageOxen,
  withOxen,
} from './oxen';
import { recordClearedObstacles } from './obstacles';
import { overgrowthDay } from './overgrowth';
import { addRoadCartTrips, mergeRoadChains, roadsDay } from './paths/roads';
import { refreshWalkDistances } from './paths/village';
import { roadFieldsDay } from './road-fields';
import { roadWalk, walkGroundOf } from './paths/walking';
import { finishRoadApples, workRoadApples, roadApplesNeed } from './road-apples';
import { finishRoadUpgrade } from './road-upgrades';
import { finishRepair, isRepairFinished, repairNeed, workRepair } from './repair';
import { copyPlot, relocationPlot } from './plots';
import { trimPlanToTarget } from './plan-trim';
import {
  extraPartOf,
  extraSowingDay,
  extraSowingWantsTeam,
  queueExtraParts,
  reclaimedLogs,
  sowParts,
  unqueueExtraParts,
} from './extra-sowing';
import { villageSacredOaks } from './sacred';
import { sacredOakEvents } from './sacred-life';
import {
  adultDailyMin,
  afterConstructions,
  allocateDay,
  householdElders,
  householdWater,
  householdWaterLabor,
  type HouseholdWater,
  type LaborTaskName,
} from './labor';
import { laborDay, type AsideWork, type ConstructionWork, type HaulWork } from './labor-report';
import {
  ORCHARD_TASK_NAMES,
  isOrchardPlanted,
  orchardPlantingNeed,
  orchardSeasonDay,
  orchardWorkRemaining,
  plantOrchard,
  workOrchards,
} from './orchard';
import { laborPerDay } from './people';
import { inLuckyYears, nextStarvationDays, populationDay } from './population';
import { dailyMinPerHousehold, harvestCarryShare, woodToolsLaborFactor } from './productivity';
import { moveRelocatedHousehold, relocatingHouseholds } from './relocation';
import { keepManor, villageManorId } from './manor';
import {
  expeditionLaborToday,
  finishExpeditions,
  withoutForeignGoods,
  workExpeditions,
} from './trade';
import { finishTrail, swathRoadsInWork, trailsDay } from './trail';
import { roadSwathDay } from './road-swath';
import { isVillageDormant } from './departure';
import { recordRuins, updateRuins } from './ruins';
import {
  CARTS,
  CART_DEMAND,
  CART_JOBS,
  SMITH_SUPPLY,
  CHRONICLE_MAX_EVENTS,
  COMMON_LABOR_HISTORY_DAYS,
  CROP_ORDER,
  DOMESTIC,
  FIELD_STORES,
  FOREST_BONUS,
  HARVEST_DAY,
  ORCHARD_WINDOWS,
  OXEN,
  PEAK_CAPACITY_SHARE,
  PLANNING_DAY,
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
  chosenEnergyKg,
  orchardOnlyLoad,
  planLoad,
  windowDaysLeft,
  type CropChoiceInput,
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
  WorkshopActivity,
} from './types';
import {
  addLogs,
  fellAsWorked,
  logsFromClearedTrees,
  planDwellingWood,
  rotLogs,
  takeWood,
  woodFellingCost,
  woodSupply,
} from './wood';
import { fieldGridOf } from './squares';
import { clearWoodAt } from './woods';
import {
  TASK_ORDER,
  activeTasks,
  addCropTaskWork,
  addToCropWork,
  createPlan,
  createYearPlan,
  cropTaskDone,
  cropTaskWindows,
  harvestKg,
  planCrops,
  planPartIds,
  neededTaskRemaining,
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
/** Tolerance proti chybám desetinných čísel (vozy pro uhlí a rudu). */
const EPSILON = 1e-9;
/** Tolerance porovnání energie úrody s cílem osevu (kg obilí). */
const SOWING_EPSILON_KG = 1e-6;

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
  // ves z doby před příbuzenstvím dostane pohlaví a manžele (kinship.md), ves ze zboží zvenku
  // o něj přijde (trade.md – Jen společné suroviny) a řemeslníci z doby před učením řemesla
  // praxi (crafts.md – Učení řemesla) – jednou, idempotentně
  const next = cloneState(
    withCraftSkill(withOxen(withPenSpecies(withoutForeignGoods(withKinship(state))))),
  );
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
  // pevné cesty ubírají polím plochu (roads.md a fields.md – Cesta přes pole) – jen když se od
  // včerejška změnily cesty nebo čtverce polí
  if (landscape) roadFieldsDay(state, day, landscape);
  if (landscape) refreshWalkDistances(state, day, landscape, obstacles);
  // pokrytí výrobky řemeslníků ze včerejších zásob – meze produktivity celého dne (crafts.md)
  const coverage = craftCoverage(state, day);
  rotLogs(state);
  // vozy, které dosloužily – tesař vyrobí nové (wagons.md – Vůz)
  state.chronicle.push(...retireCarts(state, day));
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
  if (isOn(date, PLANNING_DAY)) planYear(state, day, coverage, landscape);
  if (date.month >= PLANNING_DAY.month || date.month <= LAST_JOIN_MONTH) {
    joinFinishedParts(state, day, coverage, landscape);
    // má-li ves zásob dost, rozjetý plán se zkrátí hned, ne až 1. 9. (fields.md – Osev podle zásob)
    trimPlan(state, day, coverage);
  }
  // nákup výrobků řemeslníků u sousedů – jednou za rok po sklizni, ves se rozhodne sama
  // (crafts.md – Nákup u sousedů); skupina vyrazí hned
  startPurchases(state, day, coverage, landscape);
  const { toil } = work(state, day, obstacles, coverage, landscape);
  // nástroje a nádoby v užívání se opotřebí (crafts.md – Účinek)
  wearCraftStocks(state, day);
  // zemské stezky – dostavěné úseky od vsi ven hned vylepšené, vrácené výpravy (trade.md)
  trailsDay(state);
  // průsek lesem – úseky, na které vylepšení cesty došlo (roads.md – Průsek lesem)
  roadSwathDay(state, day, obstacles, landscape, swathRoadsInWork(state));
  state.chronicle.push(...finishExpeditions(state, day));
  state.chronicle.push(...finishPurchases(state, day));
  // kování vozů (wagons.md – Kování vozů): vůz s hotovou dřevěnou prací ze zásoby nástrojů, ves bez
  // kováře pošle tesaře nebo jeho syna do nejbližší vsi s kovářem; kdo se vrátil, vůz dokončí
  state.chronicle.push(...cartIronDay(state, day, landscape));
  finishConstructions(state, day);
  // dvorec vojvody – po zániku dvorce nejstarší obydlí, starší ves dvorec dostane (trade.md)
  keepManor(state);
  decideRebuilds(state, day, obstacles, landscape);
  occupyEmptyDwellings(state, day);
  // zbytky jam po zaniklých obydlích zarůstají, pod novou stavbou zmizí (ruins.ts)
  updateRuins(state, day, landscape);
  updateOrePits(state, day);
  updateKilnRemnants(state, day);
  // sňatky mezi domy – svobodní ve dvou domech se vezmou (population.md – Sňatky mezi domy)
  state.chronicle.push(...arrangeMarriages(state, day));
  const { satiation, energy, fruit, meat } = eat(state, day, coverage);
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
function planYear(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  // kolik jídla ves za uplynulý rok potřebovala z pole – podle toho oseje (fields.md – Kolik ves
  // oseje, Osev podle stravy)
  closeFieldFoodYear(state);
  for (const part of state.parts) endOfSeason(part, day);
  // ves s párem volů a rádlem orá všechno, motyka nekope (oxen.md – Jen rádlo)
  const plough = ableTeams(state, day) > 0;
  // díly po úsecích hospodářství od domu ven (fields.md – Hospodaření podle polohy domů)
  const holdings = villageHoldings(state);
  // kolik zasít podle zásob a potřeby z pole (fields.md – Kolik ves oseje, Osev podle zásob)
  const targets = fieldSowingTargets(state, day, coverage);
  const flaxNeed = flaxNeedKg(state, day);
  const blocks = sowingBlocks(state.parts, holdings);
  const choice: CropChoiceInput = {
    targetKg: targets.targetKg,
    startKg: 0,
    capacity: sowingCapacity(state, day, coverage, plough, landscape),
    load: orchardOnlyLoad(orchardHarvestLoad(state)),
    allowWinter: true,
    day,
    toolCoverage: coverage.tools,
    plough,
    // luštěniny podle bílkovin, které chybí po obilí, mléku a vejcích, a podle své zásoby
    // (fields.md – Luštěniny); smějí jít na doplnění pojistky, ne pod roční potřebu z pole
    legumeTargetKg: targets.legumeKg,
    energyFloorKg: targets.energyFloorKg,
    // len na plátno pro všechny (fields.md – Len, diet.md – Oděv) – povinný, i se zásobami pod
    // pojistkou (Len napřed)
    flaxTargetKg: flaxNeed,
  };
  let crops = chooseCrops(blocks, choice);
  // páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce) – podle nich cvičí voly; mění
  // se, jen když potřeba trvá dva roky (`nextPloughPairs`)
  if (oxPens(state).length > 0) {
    const need = wantedPloughPairsOf(state, day, coverage, landscape, blocks, choice);
    state.draft = { ...state.draft, ...nextPloughPairs(state, need) };
  }
  // nouzový osev (fields.md – Přílohová soustava, Nouzový osev): když díly od 70 % nedají energii,
  // kterou ves potřebuje sklidit, vezme i přílohy 40–70 % – za ostatními díly, jen s kladnou
  // čistou úrodou; luštěniny, len ani osev navíc je neberou
  if (chosenEnergyKg(crops, day) < targets.harvestKg - SOWING_EPSILON_KG) {
    const emergency = sowingBlocks(state.parts, holdings, EMERGENCY_GROUP)
      .map((block) => block.filter((p) => expectedNetKg(p, day) > 0))
      .filter((block) => block.length > 0);
    if (emergency.length > 0) crops = chooseCrops([...blocks, ...emergency], choice);
  }
  // plán vzniká před změnou stavu dílů – vrácení přílohu se počítá jen u dílů v přílohu; práce
  // plánu (i orba – železná špička rádla od kováře) platí podle dnešního pokrytí nástroji celý
  // hospodářský rok
  state.plan = createYearPlan(crops, day, coverage.tools, plough, workOrder(holdings));
  // podle potřeby lnu při plánu se při trhání zapíše, na kolik oděvu len je (fields.md – Len)
  state.plan.flaxNeedKg = flaxNeed;
  const sown = [...crops.winter, ...crops.spring, ...crops.legume, ...crops.flax];
  const chosen = new Set(sown.map((p) => p.id));
  // osev navíc: ostatní díly, které ves smí osít, v pořadí výběru – dostanou práci, která zbude po
  // stavbách (fields.md – Osev navíc); osévaný díl si pamatuje léta v řadě, než půjde ladem
  const extra = blocks
    .flat()
    .filter((p) => !chosen.has(p.id))
    .map(extraPartOf);
  if (extra.length > 0) state.plan.extra = extra;
  // vrácený mladý les dá za dospělé stromy klády (fields.md – Zarůstání, forest.md – Mýcení)
  addLogs(state, reclaimedLogs(sown, day));
  for (const part of state.parts) {
    if (chosen.has(part.id) || (part.state !== 'sown' && part.state !== 'ready')) continue;
    // nevybraný osev i nevyužitý hotový díl jdou do přílohu – osev navíc je může vrátit
    part.state = 'fallow';
    part.fallowSinceDay = day;
    part.sownYears = 0;
    delete part.crop;
  }
  sowParts(crops.winter, 'winter');
  sowParts(crops.spring, 'spring');
  sowParts(crops.legume, 'legume');
  sowParts(crops.flax, 'flax');
}

/**
 * Krok 2 (1. 9. – 30. 4.): díly hotové v předchozích dnech jdou do letošního plánu jako jař,
 * když plán cíl nepokrývá a jař se vejde do zbývající práce – bez plánu ho založí. Ostatní hotové
 * díly čekají v osevu navíc (fields.md – Osev navíc). Díly hotové po dubnu čekají na 1. 9.
 */
function joinFinishedParts(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  const ready = state.parts.filter((p) => p.state === 'ready');
  if (ready.length === 0) return;
  const plan = state.plan;
  const inPlan = new Set(plan ? planPartIds(plan) : []);
  // díly plánu (oseté) se počítají do cíle první – nové přibudou, jen když ho nepokryjí
  const startKg = state.parts
    .filter((p) => inPlan.has(p.id))
    .reduce((sum, p) => sum + expectedNetKg(p, day), 0);
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo): k plánu, který orá, přibudou díly
  // k orbě; bez plánu podle toho, jestli ves má pár volů s rádlem
  const plough = plan ? plan.plough !== undefined : ableTeams(state, day) > 0;
  const holdings = villageHoldings(state);
  // hotové díly (skupina 2 přílohové soustavy) po úsecích hospodářství
  const blocks = sowingBlocks(state.parts, holdings, 2);
  const { spring } = chooseCrops(blocks, {
    targetKg: fieldSowingTargets(state, day, coverage).targetKg,
    startKg,
    capacity: sowingCapacity(state, day, coverage, plough, landscape),
    load: planLoad(plan, orchardHarvestLoad(state)),
    allowWinter: false,
    day,
    toolCoverage: coverage.tools,
    plough,
  });
  const taken = new Set(spring.map((p) => p.id));
  const rest = blocks.flat().filter((p) => !taken.has(p.id));
  if (spring.length === 0 && rest.length === 0) return;
  const order = workOrder(holdings);
  let target = plan;
  if (target === null) {
    // ves, která do 1. 9. plán neměla – i plán bez dílů, jen pro osev navíc
    target = createPlan(spring, day, coverage.tools, plough, order);
    state.plan = target;
  } else if (spring.length > 0) {
    addToCropWork(target, spring, day, coverage.tools, order);
  }
  sowParts(spring, 'spring');
  // hotové díly, které potřebný osev nevzal, čekají v osevu navíc (fields.md – Osev navíc)
  unqueueExtraParts(target, taken);
  queueExtraParts(target, rest.map(extraPartOf));
}

/**
 * Cíle osevu (fields.md – Kolik ves oseje, Osev podle zásob): úroda na rok spotřeby z pole
 * a pojistku bez toho, co ze zásob k příští sklizni zbude; luštěniny podle rovnovážného hospodaření
 * (`plannedLegumeKg` – soupeří cenou v práci se stády, diet.md) a podle své zásoby.
 */
function fieldSowingTargets(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): SowingTargets {
  return sowingTargets(state, day, plannedLegumeKg(state, day, coverage.tools), coverage.pottery);
}

/**
 * Krok 3 (1. 9. – 30. 4., každý den po přidání hotových dílů): když letošní plán převyšuje cíl
 * podle zásob o víc než FIELD_STORES.trimMarginYears roční potřeby z pole, ubere díly, na kterých
 * ještě nezačala práce – od konce pořadí práce (fields.md – Kolik ves oseje, Osev podle zásob).
 */
function trimPlan(state: VillageState, day: number, coverage: CraftCoverage): void {
  if (!state.plan) return;
  const targets = fieldSowingTargets(state, day, coverage);
  trimPlanToTarget(state, day, targets.targetKg, FIELD_STORES.trimMarginYears * targets.needKg);
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
 * Ves, která orá (`plough`), má navíc kapacitu spřežení v oknech orby (oxen.md – Jen rádlo):
 * denní orba všech spřežení krát dny oken kopání – září–říjen pro ozim (bez posledního dne, ať se
 * zaseje i poslední zoraný pruh), září–listopad a březen–duben pro jař a luštěniny.
 */
function sowingCapacity(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  plough = false,
  landscape: Landscape | null = null,
  pairs?: number,
): SowingCapacity {
  const crafts = craftHouseholds(state);
  // práci násobí štěstí vsi (happiness.md) a dřevěné nářadí od tesaře (wagons.md); zvířata
  // a domácí výroba jdou bokem, denní minimum kryjí napřed starší (population.md – Práce)
  const productivity = villageProductivity(state, coverage);
  const capacity =
    state.people.reduce((sum, p) => sum + (crafts.has(p.dwellingId) ? 0 : laborPerDay(p, day)), 0) *
    productivity;
  const minimum = dailyMinPerHousehold(coverage.pottery);
  // denní minimum s přirážkou za chůzi pro vodu (population.md – Práce)
  const water = householdWaterLabor(state.people, state.dwellings, crafts);
  const dailyMin = householdElders(state.people, day, crafts).reduce(
    (sum, elders, k) => sum + adultDailyMin(minimum + water[k]!, elders, productivity),
    0,
  );
  const free = Math.max(0, capacity - dailyMin) * PEAK_CAPACITY_SHARE;
  const days = (segments: Parameters<typeof windowDaysLeft>[1], sowing = false): number =>
    free * Math.max(0, windowDaysLeft(day, segments) - (sowing ? SOW_AFTER_DIG_DAYS : 0));
  const people: SowingCapacity = {
    autumnWinter: days(WINTER_WINDOWS.sow, true),
    autumn: days(WINDOWS.reclaim),
    spring: days(WINDOWS.sow, true),
    july: days(WINTER_WINDOWS.harvest),
    august: days(WINDOWS.harvest),
  };
  if (!plough) return people;
  // výkon podle délky brázd polí, na která ves může zasít – na pevných cestách se brázda láme
  // (oxen.md – Co nejdelší brázda, Brázdy končí na cestě)
  const perDay =
    ploughCapacityPerDay(state, coverage.tools, day, pairs) *
    plannedFurrowEfficiency(
      state.parts.filter((p) => sowingGroup(p) !== null),
      state,
      landscape,
    );
  const ploughDays = (segments: Parameters<typeof windowDaysLeft>[1], sowing = false): number =>
    perDay * Math.max(0, windowDaysLeft(day, segments) - (sowing ? SOW_AFTER_DIG_DAYS : 0));
  // okna kopání jaře: podzim jako vracení přílohu, jaro jako setí
  return {
    ...people,
    plough: {
      autumnWinter: ploughDays(WINTER_WINDOWS.dig, true),
      autumn: ploughDays(WINDOWS.reclaim),
      spring: ploughDays(WINDOWS.sow, true),
    },
  };
}

/** Výběr osevu jako text – díly po plodinách (porovnání dvou výběrů). */
function cropsKey(crops: ReturnType<typeof chooseCrops>): string {
  const ids = (parts: readonly FieldPart[]): string => parts.map((p) => p.id).join(',');
  return [crops.winter, crops.spring, crops.legume, crops.flax].map(ids).join('|');
}

/**
 * Páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce; Martin 20. 10. 2026): nejméně
 * párů (nejvýš OXEN.maxPairs), se kterými plán osevu (`choice`, `blocks`) vybere totéž jako bez meze
 * orby – voli zorají celý osev v oknech orby. Kapacita páru jako dřív spřežení
 * (`ploughCapacityPerDay`, délka brázdy).
 */
function wantedPloughPairsOf(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
  blocks: Parameters<typeof chooseCrops>[0],
  choice: CropChoiceInput,
): number {
  const people = sowingCapacity(state, day, coverage, false, landscape);
  const free = cropsKey(chooseCrops(blocks, { ...choice, capacity: people, plough: true }));
  for (let pairs = 1; pairs < OXEN.maxPairs; pairs++) {
    const capacity = sowingCapacity(state, day, coverage, true, landscape, pairs);
    if (cropsKey(chooseCrops(blocks, { ...choice, capacity, plough: true })) === free) return pairs;
  }
  return OXEN.maxPairs;
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

// --- práce ------------------------------------------------------------------------------

/**
 * Násobek veškeré práce vsi: štěstí (happiness.md – `villageLaborFactor`) krát dřevěné nářadí od
 * tesaře (wagons.md – Tesař, meze WOOD_TOOLS_LABOR; bez tesaře 1).
 */
function villageProductivity(state: VillageState, coverage: CraftCoverage): number {
  return villageLaborFactor(state) * woodToolsLaborFactor(coverage.woodTools ?? 0);
}

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
  /** Orba: kolik kapacity spřežení úloha dnes bere (člověkodny orby při plném výkonu). */
  teamDays?: number;
}

/**
 * Polní úlohy dne: práce plánu po plodinách (bez výmlatu – úroda plánu ještě neroste), orba
 * rádlem v oknech kopání (spřežení zvládnou nejvýš `ploughCap` člověkodní za den – oxen.md)
 * a výmlat loňské úrody obou plodin. Nejbližší konec okna první, při shodě ozim před jaří
 * a pořadí úloh (TASK_ORDER; orba před kopáním).
 */
function fieldTasks(
  state: VillageState,
  day: number,
  ploughCap: number,
  ploughFactor: (work: CropWork) => number = () => 1,
): FieldTaskEntry[] {
  const month = dateOfDayIndex(day).month;
  const entries: FieldTaskEntry[] = [];
  const add = (crop: Crop, work: CropWork, name: CropTask): void => {
    const end = windowEndOf(cropTaskWindows(crop, name), month);
    if (end === null) return;
    const order =
      TASK_ORDER.indexOf(name === 'plough' ? 'dig' : name) - (name === 'plough' ? 0.5 : 0);
    const rank = CROP_ORDER.indexOf(crop) * TASK_ORDER.length + order;
    // příprava půdy dílů osevu navíc čeká na volnou práci (fields.md – Osev navíc)
    const remaining = neededTaskRemaining(work, name);
    if (remaining > 0) entries.push({ name, crop, remaining, work, end, rank });
  };
  if (state.plan !== null) {
    for (const { crop, work } of planCrops(state.plan)) {
      for (const name of activeTasks(work, day, crop)) if (name !== 'thresh') add(crop, work, name);
      if (neededTaskRemaining(work, 'plough') > 0) add(crop, work, 'plough');
    }
  }
  if (state.threshingFromPlan !== null) {
    for (const { crop, work } of planCrops(state.threshingFromPlan)) {
      if (activeTasks(work, day, crop).includes('thresh')) add(crop, work, 'thresh');
    }
  }
  entries.sort((a, b) => a.end - b.end || a.rank - b.rank);
  // spřežení orají obě plodiny – dohromady nejvýš jejich denní kapacitu; výkon podle brázdy pásu
  // a cesty k bloku (oxen.md – Co nejdelší brázda)
  let capLeft = ploughCap;
  for (const entry of entries) {
    if (entry.name !== 'plough') continue;
    const factor = capLeft > 0 ? ploughFactor(entry.work) : 1;
    entry.remaining = Math.min(entry.remaining, capLeft * factor);
    entry.teamDays = entry.remaining / factor;
    capLeft = Math.max(0, capLeft - entry.teamDays);
  }
  return entries.filter((e) => e.name !== 'plough' || e.remaining > 0);
}

/**
 * Sezónní úloha dne v rozdělení práce: polní úloha, práce v sadech, seč sena nebo porážka. Řadí se podle konce okna; při
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
 * Krok 3: rozdělení práce vsi (population.md – Práce; Martin 19. 10. 2026: „pokud se něco staví,
 * tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“).
 * Polní úlohy obou plodin a orba (`fieldTasks`), sezónní práce v sadech, seč sena a porážka podle
 * konce svého okna; společná práce do staveb; z toho, co stavby nespotřebovaly, opravy obydlí
 * poměrně k potřebě (obydlený dům stav drží i s nedodělkem oprav – chátrá jen prázdný,
 * population.md). Veškerou práci násobí štěstí (happiness.md). Domácnosti obývaných dílen
 * pracují zvlášť – jen v dílně (crafts.md, `workCrafts`); opravy jejich obydlí platí ves. Zvířata
 * (dojení a péči ženy, pasení výrostci) a domácí výrobu ženy – obojí bokem, z práce vsi
 * nebere (rozdělení práce je má jen pro postavy – `LaborDay.aside`). Vrací, jestli ves dnes
 * nestíhá polní práce v období (dřina).
 */
function work(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): { toil: boolean } {
  const month = dateOfDayIndex(day).month;
  // orba: páry volů s rádlem, se železnou špičkou od kováře rychleji (oxen.md); slabí voli po
  // zimě pomaleji; voli s vozem na výpravě neorají (wagons.md)
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const ploughCap = ploughCapacityPerDay(state, coverage.tools, day) * teamsHomeShare(state, day);
  const ploughFactor = (cropWork: CropWork): number =>
    ploughDayFactor(state, day, cropWork, partsById, landscape, obstacles);
  const owned = fieldTasks(state, day, ploughCap, ploughFactor);
  const dayTasks: DayTask[] = owned.map((field) => ({
    name: field.name,
    remaining: field.remaining,
    end: field.end,
    tie: 1,
    rank: field.rank,
    field,
  }));
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
      // přes zimu po dnech, nouzová porážka i mimo ni – vždy v měsíci, kdy se porazilo (diet.md)
      end: month,
      tie: 0,
      rank: 1,
    });
  }
  dayTasks.sort((a, b) => a.end - b.end || a.tie - b.tie || a.rank - b.rank);
  // vozy (wagons.md – Vůz): dvoukoláky s volem, který dnes neorá, vozí snopy a seno tam, kam
  // dojedou – převezmou kus nošení a jde s nimi honák a nakladač (úloha pak chce méně práce); ve
  // dny orby (i orby osevu navíc) jdou páry napřed k rádlům, vozy táhne zbytek volů (oxen.md –
  // Voli se sdílí)
  const ploughing =
    owned.some((task) => task.name === 'plough') || extraSowingWantsTeam(state, day);
  let cartsLeft = haulCartsToday(state, day, ploughing);
  // dosah vozů má ves s hotovou ohradou volů i bez vozů – měří, co by dnes vozy ušetřily
  // (wagons.md – Kolik vozů ves chce): nošení, které dnes opravdu proběhlo, a jízdy pro uhlí a vodu
  const access = villageCartAccess(state, day, landscape, obstacles);
  const demand: number[] = [];
  const hauls = new Map<DayTask, HaulPlan>();
  if (access)
    cartsLeft = planTaskHauls(state, dayTasks, hauls, cartsLeft, access, coverage, landscape);

  const households = occupiedDwellings(state);
  const repairNeeds = households.map((d) => repairNeedPerDay(d, day));
  const repairNeed = repairNeeds.reduce((sum, n) => sum + n, 0);
  const productivity = villageProductivity(state, coverage);
  // řemeslník, který dnes nemá v dílně co dělat (plná zásoba, chybí vstup), pracuje se vsí
  // (crafts.md – Podle potřeby); tesař, jen když nemá co vyrábět ani komu pomáhat (wagons.md)
  // uhlíři (crafts.md – Rovnováha uhlíř – kovář): starší dílny na samostatné milíře, plán dne jednou
  // – vytahání uhlí sedí s nošením, vozem i prací dílny
  migrateBurners(state);
  const burners = burnerPlans(state, day, coverage, productivity);
  const resting = restingCrafters(state, day, coverage, productivity, obstacles, burners);
  for (const [id, activity] of restingCarpenters(state, day, obstacles)) resting.set(id, activity);
  const crafts = craftHouseholds(state, resting);
  // kdo jde pro kování k vozu, ve vsi ani v dílně nepracuje (wagons.md – Kování vozů)
  const travelling = ironTravellers(state);
  const villagers =
    crafts.size > 0 || travelling.size > 0
      ? state.people.filter((p) => !crafts.has(p.dwellingId) && !travelling.has(p.id))
      : state.people;
  const waterNeeds = householdWater(villagers, state.dwellings);
  // uhlí ke kováři (crafts.md – Uhlí a ruda kováře): co dnes uhlíři vytahají z vypálených milířů
  // a do které kovárny se to nese
  const deliveries = charcoalDeliveries(
    state,
    burnerDraws(state, day, coverage, productivity, burners),
    landscape,
  );
  let drives: CartDrives | null | undefined;
  const drivesOf = (): CartDrives | null =>
    (drives ??= villageCartDrives(state, day, landscape, obstacles));
  if (access) {
    demand.push(
      ...jobsDemand(state, { landscape, deliveries, drives: drivesOf, water: waterNeeds }),
    );
  }
  // klády ke stavbám mají před ostatními jízdami přednost – kolik vozů si vezmou, se ví už teď
  // (náklad až z práce, která zbude po úlohách dne); vozy, které zbudou, jedou pro uhlí, s osivem,
  // nebo pro vodu (wagons.md – Co vozy vozí)
  const logs =
    access && cartsLeft > 0 ? logHaulCandidates(state, day, access, landscape, obstacles) : [];
  const jobs =
    access && cartsLeft > 0
      ? planCartJobs(state, {
          carts: cartsLeft - logHaulPlan(logs, cartsLeft).carts,
          tasks: dayTasks,
          hauls,
          access,
          landscape,
          drives: drivesOf,
          deliveries,
          resting,
          water: waterNeeds,
        })
      : NO_CART_JOBS;
  // kovář, který dnes pracuje se vsí (plná zásoba nástrojů), a přesto mu uhlíř vytahal uhlí – co
  // nedonesou synové 10–13, donese jeho domácnost z práce vsi
  const restingFetch = smithFetchPlans(state, day, deliveries, jobs, resting, true);
  const restingCarry = [...restingFetch.values()].reduce((sum, f) => sum + f.household, 0);
  const allocation = allocateDay({
    capacity: Math.max(
      0,
      villagers.reduce((sum, p) => sum + laborPerDay(p, day), 0) - restingCarry,
    ),
    householdElders: householdElders(villagers, day),
    // chůze pro vodu nad denní minimum (population.md – Práce, paths.md – Pochůzky pro vodu); vodu,
    // kterou přivezl vůz, nenosí a platí díl práce posádky (wagons.md – Co vozy vozí)
    householdWater: jobs.water ? jobs.water.water : waterNeeds.map((h) => h.labor),
    tasks: dayTasks.map(({ name, remaining }) => ({ name, remaining })),
    potteryCoverage: coverage.pottery,
    productivity,
    // lidé na výpravách k sousedům (trade.md – Doprava, Martin 19. 10. 2026): jejich práce jde po
    // denním minimu, před úlohami dne – nosiči jsou dospělí, nejvýš kolik jich ves má
    // i skupiny nákupu u sousedů (crafts.md – Nákup u sousedů) – stejné pravidlo
    away: expeditionLaborToday(state, villagers, day, purchaseTravelers(state)),
    // sedláci s vozy pro uhlí a rudu kováře (crafts.md – Uhlí a ruda kováře) – jízda domluvená
    // předem, z práce vsi před úlohami dne
    carting:
      jobs.charcoal.reduce((sum, c) => sum + c.manDays, 0) +
      jobs.ore.reduce((sum, o) => sum + o.manDays, 0),
  });

  // polní práce dne – i odkud kam došla (rozdělení práce po dílech pro postavy, labor-report.ts);
  // `amount` = postup úlohy (s vozy víc než práce vsi), `labor` = práce vsi bez honáků
  const fieldWork: {
    task: CropTask;
    work: CropWork;
    before: number;
    after: number;
    amount: number;
    labor?: number;
  }[] = [];
  const haulWork: HaulWork[] = [];
  let mowLabor: number | undefined;
  const mowingBefore = state.hay?.mowing?.done ?? 0;
  dayTasks.forEach((task, i) => {
    const labor = allocation.taskAmounts[i] ?? 0;
    // s vozy úloha postoupí víc, než na ni ves dala práce (wagons.md – Vůz)
    const haul = hauls.get(task);
    const amount = haul ? haulProgress(labor, haul) : labor;
    if (access) demand.push(...taskCarryDemand(state, task, amount, access, coverage, landscape));
    const crew = haul ? Math.min(labor, haul.crew) : 0;
    if (haul && crew > 0) {
      const seed = task.field?.name === 'sow';
      haulWork.push({
        job: task.name === 'mow' ? 'mow' : seed ? 'seed' : 'harvest',
        manDays: crew,
        carts: haul.carts,
      });
      // co vozy převzaly – nejvýš podíl nošení celé úlohy (carts.ts – haulAvailable); jízdy svozu
      // do ročního provozu cest (vyjeté cesty – roads.md); osivo zvlášť (wagons.md – Co vozy vozí)
      const hauled = hauledBy(labor, haul);
      if (seed) {
        const work = task.field!.work;
        work.seedHauled = (work.seedHauled ?? 0) + hauled;
        if (work.seedReach) addHaulTrips(state, work.seedReach, hauled);
      } else {
        const owner = task.field ? task.field.work : state.hay?.mowing;
        if (owner) {
          owner.hauled = (owner.hauled ?? 0) + hauled;
          if (owner.cartReach) addHaulTrips(state, owner.cartReach, hauled);
        }
      }
    }
    if (task.field) {
      const before = cropTaskDone(task.field.work, task.field.name);
      addCropTaskWork(task.field.work, task.field.name, amount);
      const after = cropTaskDone(task.field.work, task.field.name);
      fieldWork.push({
        task: task.field.name,
        work: task.field.work,
        before,
        after,
        amount,
        ...(haul ? { labor: labor - crew } : {}),
      });
    } else if (task.name === 'mow') {
      mow(state, amount);
      if (haul) mowLabor = labor - crew;
    } else if (task.name === 'slaughter') {
      workSlaughter(state, amount);
    } else {
      workOrchards(state, amount);
    }
  });
  // uhlí a ruda vozem (crafts.md – Uhlí a ruda kováře): sedlák jede z práce vsi – vozy v pořadí
  // přednosti, dokud na sedláka práce vsi zbyla; co vůz nepřiveze, donesou pěšky
  const smithCarts = paySmithCarts(jobs, allocation.carting);
  // kdo dnes nosí uhlí do pracujících kováren – synové 10–13 ten den nepasou
  const fetchPlans = new Map([
    ...restingFetch,
    ...smithFetchPlans(state, day, deliveries, smithCarts, resting, false),
  ]);
  const busy = new Set([...fetchPlans.values()].flatMap((f) => f.youngsters.ids));
  // co dnes výrostci uhlídali – podle toho ves při porážce drží stádo (diet.md – Pasáci)
  const herding = herdingDay(state, day, villageOxen(state), busy);
  recordHerding(state, herding);
  // lidé na cestách k sousedům – podíl z rozdělení dne (trade.md – Doprava): skupiny nákupu
  // u sousedů ujdou den napřed (jdou pevně dny cesty – crafts.md, Nákup u sousedů), zbytek
  // dostanou výpravy obchodu
  const purchases = walkPurchases(state);
  const purchaseLabor = Math.min(
    allocation.away,
    purchases.reduce((sum, p) => sum + p.manDays, 0),
  );
  const trade = workExpeditions(state, allocation.away - purchaseLabor);
  let common = allocation.common;
  // kácení u stromů, kam vůz dojede, před dnešní prací – co se dnes skácí, mohly odvézt vozy
  const fellingBefore = access
    ? reachableFelling(state, day, access, landscape, obstacles)
    : new Map<Construction, number>();
  // klády ke stavbám vozem tam, kam vůz dojede (wagons.md – Vůz) – honák a nakladač ze společné
  // práce; vozy, které jely jinam (Co vozy vozí), je nevozí
  if (logs.length > 0) {
    const logWork = haulLogs(state, day, common, cartsLeft - jobs.carts, logs);
    if (logWork) {
      common -= logWork.manDays;
      haulWork.push(logWork);
    }
  }
  // voda v sudech (wagons.md – Co vozy vozí): posádka ve dnešním minimu, jízdy do provozu cest
  if (jobs.water) {
    const water = jobs.water;
    if (state.roads) {
      addRoadCartTrips(state.roads, [{ ...water.spot, kind: 'two-wheel', trips: water.trips }]);
    }
    haulWork.push({
      job: 'water',
      manDays: water.crew,
      carts: water.carts,
      target: { kind: 'water', ...water.spot },
    });
  }
  // tesař pomáhá stavbám – jeho práce jde do staveb a zlevní jejich dřevěnou část (wagons.md)
  const help = carpentryHelp(state, day, coverage, productivity, resting, (extra) =>
    woodworkToday(state, day, common + extra),
  );
  const constructions = build(state, day, common + help.labor, help.coverage);
  if (access) {
    demand.push(...logsDemand(fellingBefore));
    addCartDemand(state, day, demand, ploughing);
  }
  // opravy obydlí až z práce, kterou stavby nespotřebovaly (Martin 19. 10. 2026: „Opravy obydlí
  // zařaď až za stavbu.“) – tesařova pomoc jde jen do staveb; obydlený dům stav neztrácí ani
  // s nedodělkem (Martin: „obydlená budova nechátrá – obyvatelé ji opravují. Chátrá jenom
  // prázdná.“)
  const invested = constructions.reduce((sum, c) => sum + c.manDays, 0);
  const afterBuild = afterConstructions(
    Math.min(common, common + help.labor - invested),
    repairNeed,
  );
  const repairs = households.map((d, i) => {
    const need = repairNeeds[i] ?? 0;
    const manDays = repairNeed > 0 ? (afterBuild.repairs * need) / repairNeed : 0;
    return { dwellingId: d.id, manDays };
  });
  decayEmptyDwellings(state, day, new Set(households.map((d) => d.id)));
  // osev navíc (fields.md – Osev navíc): práce, která zbude po stavbách a opravách, jde na díly,
  // které ves smí osít navíc; páry s rádlem jen s kapacitou, která po potřebné orbě zbyla (vozy
  // ve dny orby páry neberou – oxen.md, Voli se sdílí) – co zbude i potom, propadne
  const extra = extraSowingDay(state, day, {
    labor: afterBuild.left,
    ploughCap: Math.max(0, ploughCap - owned.reduce((sum, t) => sum + (t.teamDays ?? 0), 0)),
    ploughFactor,
    toolCoverage: coverage.tools,
    order: () => workOrder(villageHoldings(state)),
  });
  const supply: SmithSupply = {
    fetch: fetchPlans,
    burners,
    oreCarts: new Map(
      smithCarts.ore.map((o): [number, OreCartToday] => [
        o.smithId,
        { kg: o.kg, riderManDays: o.riderManDays },
      ]),
    ),
    // dávka rudy na celý vůz, když ves má vůz doma a jízda k rudišti ušetří práci proti nošení
    cartBatch: (_smith, site) => {
      if (haulCartsToday(state, day, false) <= 0) return null;
      const all = drivesOf();
      if (!all) return null;
      if (site.cart === undefined) site.cart = oreCartDrive(state, site, all);
      const footPerKg = basketManDaysPerKg(site.walkM, SMITH_SUPPLY.basketKg.ore);
      return oreCartOffer(site.cart, footPerKg) ? CARTS.loadKg['two-wheel'] : null;
    },
  };
  const workshops = [
    ...workCrafts(state, day, obstacles, coverage, productivity, resting, landscape, supply),
    ...workCarpenters(state, day, obstacles, coverage, productivity, resting, help),
  ];
  // praxe řemeslníků a učňů (crafts.md – Učení řemesla): dílny, které dnes pracovaly, a kovárny,
  // kde synové nosili uhlí, i když kovář pracoval se vsí
  if (crafts.size > 0 || restingFetch.size > 0) {
    gainPractice(state, day, crafts, restingFetch, travelling);
  }
  // uhlí a ruda vozem – sedlák ze společné práce, jízdy do ročního provozu cest (wagons.md – Co
  // vozy vozí, crafts.md – Uhlí a ruda kováře)
  for (const c of smithCarts.charcoal) {
    if (state.roads) {
      const trips = c.kg / CART_JOBS.charcoal.loadKg;
      addRoadCartTrips(state.roads, [{ x: c.x, z: c.z, kind: 'two-wheel', trips }]);
    }
    haulWork.push({
      job: 'charcoal',
      manDays: c.manDays,
      carts: 1,
      target: {
        kind: 'kiln',
        id: c.burnerId,
        ...c.at,
        ...(c.kilnId !== undefined ? { kiln: c.kilnId } : {}),
      },
    });
  }
  for (const o of smithCarts.ore) {
    if (state.roads) {
      const trips = o.kg / CARTS.loadKg['two-wheel'];
      addRoadCartTrips(state.roads, [{ x: o.x, z: o.z, kind: 'two-wheel', trips }]);
    }
    haulWork.push({
      job: 'ore',
      manDays: o.manDays,
      carts: 1,
      target: { kind: 'ore', id: o.smithId, ...o.site },
    });
  }
  const hayMowing = state.hay?.mowing;
  state.labor = laborDay(state, day, {
    allocation,
    fieldWork: [...fieldWork, ...extra.fieldWork],
    extraField: extra.labor,
    repairs,
    constructions,
    workshops,
    trade: trade.shares,
    purchases,
    hauls: haulWork,
    toolCoverage: coverage.tools,
    herders: herding.freeHerders,
    aside: asideWork(state, day, allocation.eldersDailyMin),
    ...(hayMowing
      ? {
          mowing: {
            mowing: hayMowing,
            before: mowingBefore,
            after: hayMowing.done,
            ...(mowLabor !== undefined ? { labor: mowLabor } : {}),
          },
        }
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
    remaining: neededTaskRemaining(task.work, task.name),
    endDay: windowEndDay(cropTaskWindows(task.crop, task.name), day) ?? day,
  }));
  return { toil: isToilDay(seasonTasks, pace, day) };
}

/**
 * Práce bokem dne – mimo práci vsi, jen pro postavy (population.md – Práce): dojení a sýr
 * z mléka, které se nevypije (strop mléka a sýra – diet.md), a péče o zvířata (ženy); domácí
 * výroba žen (`DOMESTIC` po domácnostech a lidech) a denní minimum, které pokryli starší
 * (`eldersDailyMin`).
 */
function asideWork(state: VillageState, day: number, eldersDailyMin: number): AsideWork {
  const herds = villageHerds(state);
  const dams = villageDams(state);
  const milk = dailyMilk(dams, day);
  const drinkable = DIET.caps.dairy * villageFoodNeed(state, day);
  const cheeseMilkL = milk.energy > drinkable ? milk.liters * (1 - drinkable / milk.energy) : 0;
  const animals = animalCareNeed(
    herds,
    villageOxen(state),
    villageChickens(state),
    day,
    cheeseMilkL,
    dams,
  );
  return {
    milking: animals.milking,
    care: animals.care,
    domestic:
      eldersDailyMin +
      DOMESTIC.perHousehold * householdCount(state) +
      DOMESTIC.perPerson * state.people.length,
  };
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
  // oprava stavby, která mezitím přestala stát, práci nebere (abandonment.md – Oprava)
  if (c.kind === 'repair') return repairNeed(state, c);
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
 * `carpentry` = pokrytí dřevěné práce tesařem (wagons.md – Tesař): práce stavby se násobí
 * `constructionLaborFactor` – stejná práce s tesařem postaví víc (bez tesaře 1).
 */
function build(
  state: VillageState,
  day: number,
  common: number,
  carpentry = 0,
): ConstructionWork[] {
  const founding = foundingIndex(state);
  // díl louky, který ves se spřežením zakládá bez překážek, práci nepotřebuje – založí se hned
  // (drn rozorá první orba – oxen.md, Jen rádlo)
  for (const c of state.constructions) {
    if (c.kind !== 'field') continue;
    for (const part of foundingParts(founding, c)) {
      if (part.foundingCost - part.foundingDone <= 0) foundPart(state, day, part);
    }
  }
  let active = state.constructions
    .map((c) => {
      const factor = constructionLaborFactor(c, carpentry);
      return { c, factor, need: constructionNeed(state, c, day, founding) * factor };
    })
    .filter((x) => x.need > 0);
  const invested: ConstructionWork[] = [];
  const put = (
    x: { c: Construction; factor: number },
    amount: number,
    completes: boolean,
  ): void => {
    invested.push({
      construction: x.c,
      manDays: amount,
      doneBefore: x.c.done,
      felledBefore: x.c.wood?.felled ?? 0,
    });
    invest(state, day, x.c, amount / x.factor, completes, founding);
  };
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) put(x, share, false);
      return invested;
    }
    for (const x of saturated) {
      put(x, x.need, true);
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return invested;
}

/**
 * Dřevěná práce staveb dne (čd bez tesaře – wagons.md, Tesař): kolik z `common` práce rozdělené
 * rovným dílem jako ve `build` připadne na dřevěné části staveb. Stav nemění.
 */
function woodworkToday(state: VillageState, day: number, common: number): number {
  const founding = foundingIndex(state);
  let active = state.constructions
    .map((c) => ({
      share: constructionWoodShare(c),
      need: constructionNeed(state, c, day, founding),
    }))
    .filter((x) => x.need > 0);
  let wood = 0;
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) wood += x.share * share;
      return wood;
    }
    for (const x of saturated) {
      wood += x.share * x.need;
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return wood;
}

/**
 * Svoz vozy na úlohy dne (wagons.md – Vůz; mutuje `tasks` a `hauls`): vozy jedou na úlohy
 * v pořadí dne – odnos snopů (podíl odnosu na sklizni) a svoz sena (CARTS.haulShare.hay) tam, kam
 * dojedou. Úloha pak chce o převzaté nošení méně práce a o honáky a nakladače víc. Vrátí, kolik
 * vozů zbylo (klády ke stavbám).
 */
function planTaskHauls(
  state: VillageState,
  tasks: DayTask[],
  hauls: Map<DayTask, HaulPlan>,
  carts: number,
  access: CartAccess,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): number {
  let left = carts;
  const carry = harvestCarryShare(coverage.tools);
  for (const task of tasks) {
    if (left <= 0) break;
    let available = 0;
    // kam vůz dojede, se spočítá při prvním svozu úlohy a uloží u ní (vozová síť – carts.ts)
    if (task.field?.name === 'harvest') {
      const work = task.field.work;
      work.cartReach ??= cropCartReach(state, work, landscape, access);
      const share = carry * work.cartReach.share;
      available = haulAvailable(work.required.harvest, task.remaining, work.hauled ?? 0, share);
    } else if (task.name === 'mow' && state.hay?.mowing) {
      const mowing = state.hay.mowing;
      mowing.cartReach ??= mowingCartReach(state, mowing, landscape, access);
      const share = CARTS.haulShare.hay * mowing.cartReach.share;
      available = haulAvailable(mowing.required, task.remaining, mowing.hauled ?? 0, share);
    } else {
      continue;
    }
    const haul = haulPlan(available, left);
    if (haul.carts === 0) continue;
    left -= haul.carts;
    hauls.set(task, haul);
    task.remaining = task.remaining - haul.work + haul.crew;
  }
  return left;
}

/** Stavba, na kterou dnes vůz může vozit klády, a kolik dovozu smí převzít (čd). */
interface LogHaul {
  c: Construction;
  haulable: number;
}

/**
 * Stavby, na které dnes vozy můžou vozit klády (wagons.md – Vůz): CARTS.haulShare.logs
 * zbývajícího kácení a dovozu u stromů, ke kterým vůz dojede, v pořadí staveb. Dosah se spočítá
 * jednou za stavbu, při prvním svozu klád (mutuje – `ConstructionWood.cartReach`).
 */
function logHaulCandidates(
  state: VillageState,
  day: number,
  access: CartAccess,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): LogHaul[] {
  const founding = foundingIndex(state);
  return state.constructions.flatMap((c) => {
    if (!c.wood || c.done + 1e-9 >= woodFellingCost(c.wood)) return [];
    if (constructionNeed(state, c, day, founding) <= 0) return [];
    // ke kterým stromům vůz dojede – jednou za stavbu, při prvním svozu klád
    c.wood.cartReach ??= logsCartReach(state, c.wood, landscape, obstacles, access);
    const reach = fellingHaulable(c, c.wood.cartReach.trees);
    const haulable = haulAvailable(
      reach.total,
      reach.remaining,
      c.wood.hauled ?? 0,
      CARTS.haulShare.logs,
    );
    return haulable > 0 ? [{ c, haulable }] : [];
  });
}

/** Svoz klád na stavby `candidates` nejvýš `carts` vozy (`haulPlan`). */
function logHaulPlan(candidates: readonly LogHaul[], carts: number): HaulPlan {
  return haulPlan(
    candidates.reduce((sum, x) => sum + x.haulable, 0),
    carts,
  );
}

/**
 * Klády ke stavbám vozem (wagons.md – Vůz): vozy převezmou dovoz u staveb `candidates`
 * (`logHaulCandidates`) stavbu po stavbě; honáci a nakladači jdou ze společné práce (když
 * nestačí, vozy převezmou poměrně méně). Mutuje stav (postup staveb – kácení jako u společné
 * práce); bez práce null.
 */
function haulLogs(
  state: VillageState,
  day: number,
  common: number,
  carts: number,
  candidates: readonly LogHaul[],
): HaulWork | null {
  if (common <= 0) return null;
  const plan = logHaulPlan(candidates, carts);
  if (plan.carts === 0) return null;
  const founding = foundingIndex(state);
  const scale = plan.crew > common ? common / plan.crew : 1;
  let left = plan.work * scale;
  const trees: number[] = [];
  for (const { c, haulable } of candidates) {
    if (left <= 0) break;
    const work = Math.min(left, haulable);
    const wood = c.wood!;
    for (const t of wood.fell.slice(wood.felled, wood.felled + 3)) {
      if (t.id !== null && !trees.includes(t.id)) trees.push(t.id);
    }
    invest(state, day, c, work, false, founding);
    wood.hauled = (wood.hauled ?? 0) + work;
    if (wood.cartReach) addHaulTrips(state, wood.cartReach, work);
    left -= work;
  }
  return { job: 'logs', manDays: plan.crew * scale, carts: plan.carts, trees };
}

/** Vůz se sedlákem pro uhlí od milíře ke kováři (crafts.md – Uhlí a ruda kováře). */
interface CharcoalCartJob {
  burnerId: number;
  /** Id milíře (crafts.md – Milíř u skácených buků). */
  kilnId?: number;
  smithId: number;
  /** Milíř (m). */
  at: { x: number; z: number };
  /** Kolik uhlí vůz přiveze (kg) a práce sedláka (čd – ze společné práce). */
  kg: number;
  manDays: number;
  /** Kde trasa vozu u milíře končí (m – jízdy do ročního provozu cest). */
  x: number;
  z: number;
}

/** Vůz se sedlákem pro rudu z rudiště do kovárny (crafts.md – Uhlí a ruda kováře). */
interface OreCartJob {
  smithId: number;
  /** Rudiště (m). */
  site: { x: number; z: number };
  /**
   * Kolik rudy vůz přiveze (kg), práce sedláka (čd – ze společné práce) a kováře, který jede
   * s ním (čd – z práce dílny).
   */
  kg: number;
  manDays: number;
  riderManDays: number;
  /** Kde trasa vozu u rudiště končí (m). */
  x: number;
  z: number;
}

/** Co vozy dnes vozí mimo svoz a klády (wagons.md – Co vozy vozí). */
interface CartJobsDay {
  /** Kolik vozů jede (uhlí, ruda, osivo, voda). */
  carts: number;
  /** Uhlí od milířů ke kovářům. */
  charcoal: CharcoalCartJob[];
  /** Ruda z rudišť do kováren. */
  ore: OreCartJob[];
  /** Voda v sudech; bez ní null. */
  water: WaterCartPlan | null;
}

const NO_CART_JOBS: CartJobsDay = { carts: 0, charcoal: [], ore: [], water: null };

/**
 * Jízdy vozů, které nesvážejí úrodu, seno ani klády (wagons.md – Co vozy vozí; mutuje `tasks`
 * a `hauls` jako svoz): v pořadí CART_JOBS.order – uhlí z milíře do kovárny tam, kde ho dnes uhlíř
 * vytahal (`deliveries`; jízda k milíři se uloží u milíře), ruda z hromady u jámy dávky na celý vůz
 * (jízda k rudišti se uloží u rudiště – crafts.md, Uhlí a ruda kováře), osivo na pole
 * (`planSeedHauls`), voda v sudech (`waterCartPlan`; břeh se uloží ve stavu). Vůz jede jen tam,
 * kam dojede, a jen když ušetří práci (uhlí a ruda proti nošení v koších kovářovou domácností).
 */
function planCartJobs(
  state: VillageState,
  input: {
    carts: number;
    tasks: DayTask[];
    hauls: Map<DayTask, HaulPlan>;
    access: CartAccess;
    landscape: Landscape | null;
    drives: () => CartDrives | null;
    deliveries: readonly CharcoalDelivery[];
    resting: ReadonlyMap<number, WorkshopActivity>;
    water: readonly HouseholdWater[];
  },
): CartJobsDay {
  let left = input.carts;
  if (left <= 0) return NO_CART_JOBS;
  const charcoal: CharcoalCartJob[] = [];
  const ore: OreCartJob[] = [];
  for (const job of CART_JOBS.order) {
    if (left <= 0) break;
    if (job === 'charcoal') {
      for (const d of input.deliveries) {
        if (left <= 0) break;
        const kiln = findKiln(
          state.dwellings.find((x) => x.id === d.burnerId),
          d.kilnId,
        );
        const all = input.drives();
        if (!kiln || !all) continue;
        if (kiln.cart === undefined) kiln.cart = kilnCartDrive(state, d.at, all);
        const footPerKg = basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal);
        const offer = kilnCartOffer(kiln.cart, footPerKg);
        if (!offer) continue;
        const kg = Math.min(d.kg, offer.maxKg);
        charcoal.push({
          burnerId: d.burnerId,
          ...(d.kilnId !== undefined ? { kilnId: d.kilnId } : {}),
          smithId: d.smithId,
          at: d.at,
          kg,
          manDays: kg * offer.manDaysPerKg,
          x: offer.x,
          z: offer.z,
        });
        left--;
      }
    } else if (job === 'ore') {
      for (const smith of occupiedSmiths(state)) {
        if (left <= 0) break;
        if (input.resting.has(smith.id)) continue;
        const workshop = smith.workshop!;
        const batch = workshop.oreBatch;
        const site = workshop.oreSite;
        if (!batch?.cart || !site || batch.dug + EPSILON < batch.kg || batch.heap <= EPSILON) {
          continue;
        }
        const all = input.drives();
        if (!all) continue;
        if (site.cart === undefined) site.cart = oreCartDrive(state, site, all);
        const footPerKg = basketManDaysPerKg(site.walkM, SMITH_SUPPLY.basketKg.ore);
        const offer = oreCartOffer(site.cart, footPerKg);
        if (!offer) continue;
        const kg = Math.min(batch.heap, offer.maxKg);
        ore.push({
          smithId: smith.id,
          site: { x: site.x, z: site.z },
          kg,
          manDays: kg * offer.manDaysPerKg,
          riderManDays: kg * offer.riderManDaysPerKg,
          x: offer.x,
          z: offer.z,
        });
        left--;
      }
    } else if (job === 'seed') {
      left = planSeedHauls(state, input.tasks, input.hauls, left, input.access, input.landscape);
    } else {
      const all = input.drives();
      const water = all
        ? waterCartPlan(input.water, left, waterCartDrive(state, input.landscape, all))
        : null;
      if (water) return { carts: input.carts - left + water.carts, charcoal, ore, water };
    }
  }
  return { carts: input.carts - left, charcoal, ore, water: null };
}

/** Vozy pro uhlí a rudu, na které dnes zbyl sedlák ze společné práce. */
interface SmithCartsDay {
  charcoal: CharcoalCartJob[];
  ore: OreCartJob[];
  /** Práce sedláků celkem (čd – z práce vsi). */
  manDays: number;
}

/**
 * Sedláci pro vozy s uhlím a rudou (crafts.md – Uhlí a ruda kováře; Martin: „přiveze uhlí sedlák
 * s vozem (a odečte se jeho práce)“): z práce vsi, která na sedláky dnes zbyla (`carting` –
 * rozdělení práce dne), v pořadí přednosti – vůz, na jehož sedláka práce nezbyla, nejede (uhlí
 * a rudu pak donesou pěšky).
 */
function paySmithCarts(jobs: CartJobsDay, carting: number): SmithCartsDay {
  let left = Math.max(0, carting);
  const charcoal = jobs.charcoal.filter((c) => {
    if (c.manDays > left + EPSILON) return false;
    left -= c.manDays;
    return true;
  });
  const ore = jobs.ore.filter((o) => {
    if (o.manDays > left + EPSILON) return false;
    left -= o.manDays;
    return true;
  });
  return { charcoal, ore, manDays: Math.max(0, carting) - left };
}

/**
 * Kdo dnes nosí uhlí do kováren (crafts.md – Uhlí a ruda kováře): uhlí, které uhlíři vytahali
 * (`deliveries`) a vůz nepřiveze (`carts`), nesou synové 10–13 a domácnost kováře
 * (`smithFetchDay`) – jen kovárny, které dnes pracují se vsí (`restingOnly` – před rozdělením
 * práce vsi), nebo jen ty, které pracují v dílně.
 */
function smithFetchPlans(
  state: VillageState,
  day: number,
  deliveries: readonly CharcoalDelivery[],
  carts: { charcoal: readonly CharcoalCartJob[] },
  resting: ReadonlyMap<number, WorkshopActivity>,
  restingOnly: boolean,
): Map<number, SmithFetchDay> {
  const plans = new Map<number, SmithFetchDay>();
  const fetches: CharcoalFetch[] = deliveries
    .filter((d) => resting.has(d.smithId) === restingOnly)
    .map((d) => {
      const carted = carts.charcoal
        .filter((c) => c.burnerId === d.burnerId && c.kilnId === d.kilnId)
        .reduce((sum, c) => sum + c.kg, 0);
      const kg = Math.max(0, d.kg - carted);
      return {
        smithId: d.smithId,
        burnerId: d.burnerId,
        ...(d.kilnId !== undefined ? { kilnId: d.kilnId } : {}),
        at: d.at,
        kg,
        manDays: kg * basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal),
      };
    });
  for (const id of new Set(fetches.map((f) => f.smithId))) {
    const plan = smithFetchDay(state, id, day, fetches);
    if (plan.youngsters.manDays + plan.household > 0) plans.set(id, plan);
  }
  return plans;
}

/**
 * Úspory jednotlivých vozů z plánu svozu (čd): vůz za den převezme nejvýš CARTS.carrierManDays
 * nošení a jde s ním posádka (poměrně – CARTS.crew na plný vůz).
 */
function haulSavings(plan: HaulPlan): number[] {
  const out: number[] = [];
  let work = plan.work;
  for (let k = 0; k < plan.carts && work > 1e-9; k++) {
    const carried = Math.min(CARTS.carrierManDays, work);
    out.push(carried * (1 - CARTS.crew / CARTS.carrierManDays));
    work -= carried;
  }
  return out;
}

/** Úspory jednotlivých vozů, které by převzaly `carried` čd nošení (`haulSavings`). */
function carrySavings(carried: number): number[] {
  if (carried <= 1e-9) return [];
  return haulSavings(haulPlan(carried, CART_DEMAND.probeCarts));
}

/**
 * Nošení, které dnes na úloze proběhlo (wagons.md – Kolik vozů ves chce): úloha postoupila
 * o `amount` čd a jeho podíl je nošení tam, kam vůz dojede – odnos snopů při sklizni, svoz sena při
 * seči, osivo při setí (jako svoz – `planTaskHauls`, `planSeedHauls`); úspory vozů, které by ho
 * převzaly. Dosah vozu se u úlohy spočítá a uloží jako při svozu.
 */
function taskCarryDemand(
  state: VillageState,
  task: DayTask,
  amount: number,
  access: CartAccess,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): number[] {
  if (amount <= 1e-9) return [];
  if (task.field?.name === 'harvest') {
    const work = task.field.work;
    work.cartReach ??= cropCartReach(state, work, landscape, access);
    return carrySavings(amount * harvestCarryShare(coverage.tools) * work.cartReach.share);
  }
  if (task.field?.name === 'sow') {
    const work = task.field.work;
    work.seedReach ??= sowingCartReach(state, work, landscape, access);
    return carrySavings(amount * CART_JOBS.seed.carryShare * work.seedReach.share);
  }
  if (task.name === 'mow' && state.hay?.mowing) {
    const mowing = state.hay.mowing;
    mowing.cartReach ??= mowingCartReach(state, mowing, landscape, access);
    return carrySavings(amount * CARTS.haulShare.hay * mowing.cartReach.share);
  }
  return [];
}

/**
 * Kácení a dovoz klád stavby, které zbývá u stromů, kam vůz dojede (čd po stavbách; dosah se
 * spočítá a uloží jako při svozu klád – `logHaulCandidates`).
 */
function reachableFelling(
  state: VillageState,
  day: number,
  access: CartAccess,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): Map<Construction, number> {
  const out = new Map<Construction, number>();
  const founding = foundingIndex(state);
  for (const c of state.constructions) {
    if (!c.wood || c.done + 1e-9 >= woodFellingCost(c.wood)) continue;
    if (constructionNeed(state, c, day, founding) <= 0) continue;
    c.wood.cartReach ??= logsCartReach(state, c.wood, landscape, obstacles, access);
    out.set(c, fellingHaulable(c, c.wood.cartReach.trees).remaining);
  }
  return out;
}

/**
 * Klády, které se dnes u stromů, kam vůz dojede, skácely a odvezly (wagons.md – Kolik vozů ves
 * chce): CARTS.haulShare.logs dnešního kácení a dovozu (`before` – co u staveb zbývalo ráno,
 * `reachableFelling`); úspory vozů.
 */
function logsDemand(before: ReadonlyMap<Construction, number>): number[] {
  let felled = 0;
  for (const [c, remaining] of before) {
    const reach = c.wood?.cartReach?.trees;
    const after = reach ? fellingHaulable(c, reach).remaining : 0;
    felled += Math.max(0, remaining - after);
  }
  return carrySavings(felled * CARTS.haulShare.logs);
}

/**
 * Jízdy pro uhlí a vodu, kdyby vozů bylo dost (wagons.md – Kolik vozů ves chce): stejné nabídky
 * jako skutečné vozy (`planCartJobs` – uhlí z milířů, odkud ho dnes do kovárny nosí, proti nošení
 * v koších, voda v sudech s CART_DEMAND.probeCarts vozy); úspory jednotlivých vozů (čd). Jízda
 * k vodě je poslední známá (`VillageState.waterCart`) – přepočet vozové sítě po každé změně
 * rozložení vsi by stál víc než celý odhad; znovu se hledá, jen když jízdu ves ještě nemá nebo se
 * ohrada volů přestěhovala.
 */
function jobsDemand(
  state: VillageState,
  input: {
    landscape: Landscape | null;
    deliveries: readonly CharcoalDelivery[];
    drives: () => CartDrives | null;
    water: readonly HouseholdWater[];
  },
): number[] {
  const savings: number[] = [];
  for (const d of input.deliveries) {
    const kiln = findKiln(
      state.dwellings.find((x) => x.id === d.burnerId),
      d.kilnId,
    );
    const all = input.drives();
    if (!kiln || !all) continue;
    if (kiln.cart === undefined) kiln.cart = kilnCartDrive(state, d.at, all);
    const footPerKg = basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal);
    const offer = kilnCartOffer(kiln.cart, footPerKg);
    if (offer) savings.push(Math.min(d.kg, offer.maxKg) * (footPerKg - offer.manDaysPerKg));
  }
  const origin = cartOrigin(state);
  const known = state.waterCart;
  const all = input.drives();
  const drive =
    known && origin && known.key.endsWith(`|${origin.x},${origin.z}`)
      ? known.drive
      : all
        ? waterCartDrive(state, input.landscape, all)
        : null;
  const water = waterCartPlan(input.water, CART_DEMAND.probeCarts, drive);
  if (water) {
    const each = (water.saved - water.crew) / water.carts;
    for (let k = 0; k < water.carts; k++) savings.push(each);
  }
  return savings;
}

/**
 * Osivo na pole vozem (wagons.md – Co vozy vozí; mutuje `tasks` a `hauls` jako svoz): na setí dne
 * převezmou vozy nošení osiva – CART_JOBS.seed.carryShare setí na dílech, kam vůz s osivem dojede
 * (dosah se spočítá při prvním odvozu osiva a uloží u plodiny – `CropWork.seedReach`). Úloha pak
 * chce o převzaté nošení méně práce a o honáky a nakladače víc. Vrátí, kolik vozů zbylo.
 */
function planSeedHauls(
  state: VillageState,
  tasks: DayTask[],
  hauls: Map<DayTask, HaulPlan>,
  carts: number,
  access: CartAccess,
  landscape: Landscape | null,
): number {
  let left = carts;
  for (const task of tasks) {
    if (left <= 0) break;
    if (task.field?.name !== 'sow' || hauls.has(task)) continue;
    const work = task.field.work;
    work.seedReach ??= sowingCartReach(state, work, landscape, access);
    const share = CART_JOBS.seed.carryShare * work.seedReach.share;
    const available = haulAvailable(work.required.sow, task.remaining, work.seedHauled ?? 0, share);
    const haul = haulPlan(available, left);
    if (haul.carts === 0) continue;
    left -= haul.carts;
    hauls.set(task, haul);
    task.remaining = task.remaining - haul.work + haul.crew;
  }
  return left;
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
  if (c.kind === 'repair') {
    // stav opravované stavby roste s prací (abandonment.md – Oprava)
    workRepair(state, c, amount, completes);
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
      foundPart(state, day, part);
    } else {
      part.foundingDone += left;
      used += left;
      break;
    }
  }
  // průběh stavby jen z jejích dílů – pole mohlo mít díly založené dřív (rozšíření, sloučení)
  c.done = Math.min(c.cost, c.done + used);
}

/** Díl pole je založený (mutuje stav). */
function foundPart(state: VillageState, day: number, part: FieldPart): void {
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
}

// --- stavby a domácnosti ------------------------------------------------------------------

function isFinished(state: VillageState, c: Construction, founding: FoundingIndex): boolean {
  if (c.kind === 'field') return foundingParts(founding, c).length === 0;
  if (c.kind === 'orchard') return isOrchardPlanted(state, c);
  if (c.kind === 'repair') return isRepairFinished(state, c);
  return c.done >= c.cost;
}

/**
 * Krok 4: dokončené stavby – nové obydlí, přestavěné obydlí, založené pole, vysazený (obnovený)
 * sad, pohřebiště a opravená stavba (abandonment.md – Oprava). První zemnice dostane id
 * domácnosti zakladatelů (`dwellingId` stavby) – ti už v ní bydlí, nikdo se nestěhuje. Do jiného
 * nového obydlí se stěhuje mladý pár; když žádný není, osídlí ho ještě týž den dospělé děti
 * z přeplněné domácnosti (krok 6).
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
    if (c.kind === 'repair') {
      // opravená stavba je celá – „Modla opravena“ ap. (abandonment.md – Oprava)
      const repaired = finishRepair(state, day, c);
      if (repaired) state.chronicle.push(repaired);
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
      // dostavěná ohrada přijme dobytek, hotové rádlo orá s párem vycvičených volů (oxen.md)
      if (c.kind === 'pen' && c.penId !== null && c.penId !== undefined) {
        // založení celé ohrady, nebo rozšíření o čtverce (oxen.md – Ohrady podle druhu)
        finishPen(state, c.penId, day, c.id);
      }
      if (c.kind === 'ard') finishArd(state);
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
      // řemeslná dílna – řemeslo patří budově (crafts.md); nový řemeslník se teprve učí
      // (crafts.md – Učení řemesla)
      ...(c.craft
        ? { workshop: { ...newWorkshop(c.craft, c.waterDistanceM), skillTracked: true as const } }
        : {}),
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
 * 31. 7. (po jídle dne): čistá úroda ozimu do zásob obilí (fields.md – Ozim a jař), luštěnin do
 * zásoby luštěnin (fields.md – Luštěniny) a trhání lnu – podíl oděvu, na který len je (fields.md –
 * Len).
 */
function harvestWinter(state: VillageState, day: number): void {
  const linen = harvestFlax(state, day);
  if (linen) state.chronicle.push(linen);
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
  // luštěniny ze své zásoby, len se nemlátí (fields.md – Len)
  const loss = crops
    .filter(({ crop }) => crop !== 'legume' && crop !== 'flax')
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
 * Krok 8: jídlo dne ze zásob (diet.md) – ovoce přednostně do zkažení, čerstvé mléko (dojí se
 * vždy celé – ženy bokem, population.md – Práce) a vejce, maso do porážky, sýr do dojení a luštěniny do sklizně, obilí dorovná;
 * vrací nasycení (energie × kvalita stravy), energii, jestli se jedlo ovoce, a podíl energie
 * z masa (štěstí) a zapíše začátek a konec hladu. Hlad začíná
 * už tehdy, když příděl energie podle výhledu do sklizně klesne pod plný – i když se dnes jí
 * dosyta ovocem a obilí nevystačí až po 1. 3.
 */
function eat(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { satiation: number; energy: number; fruit: boolean; meat: number } {
  const milked = 1;
  const need = villageFoodNeed(state, day);
  // nevychází-li výhled do sklizně, ves napřed porazí zvířata navíc – teprve pak šetří přídělem
  // (diet.md – Nouzová porážka)
  const emergency = emergencySlaughter(state, day, coverage.pottery, milked);
  if (emergency) state.chronicle.push(emergency);
  const meal = eatDiet(dayMealInput(state, day, coverage.pottery, milked));
  state.storesKg = meal.grainKg;
  // čerstvé maso dne se snědlo, zbytek je v uzeném (diet.md – Porážka v zimě)
  delete state.freshMeatKg;
  if (state.meatKg !== undefined || meal.meatKg > 0) state.meatKg = meal.meatKg;
  if (state.cheeseKg !== undefined || meal.cheeseKg > 0) state.cheeseKg = meal.cheeseKg;
  if (state.legumesKg !== undefined || meal.legumesKg > 0) state.legumesKg = meal.legumesKg;
  if (state.applesKg !== undefined) state.applesKg = meal.fruitKg;
  state.diet = meal.diet;
  // kolik z dnešní potřeby musí dát pole – podle toho ves k 1. 9. oseje (fields.md – Kolik ves
  // oseje, Osev podle stravy)
  recordFieldFood(state, need, meal.diet);
  const hungry = meal.outlook < 1 - SATIATION_EPSILON;
  // příděl do sklizně, když ves šetří – stupeň upozornění (population.md – Co hráč vidí)
  if (hungry) state.ration = meal.outlook;
  else delete state.ration;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  return {
    satiation: meal.diet.satiation,
    energy: meal.diet.energy,
    fruit: meal.diet.shares.fruit > 0,
    meat: meal.diet.shares.meat,
  };
}
