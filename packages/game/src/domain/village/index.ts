export * from './types';
export * from './rules';
export * from './productivity';
export * from './people';
export * from './food';
export * from './diet';
export * from './field-food';
export * from './field-capacity';
export * from './dairy';
export * from './legumes';
export { expectedFlaxKg, flaxNeedKg, linenCoverage, linenUnhappiness } from './flax';
export * from './livestock';
export * from './hay';
export * from './plough';
export * from './plough-blocks';
export * from './plough-trip';
export * from './oxen';
export * from './fence-cost';
export * from './draft';
export * from './pens';
export { breedingCows, herdPlaces, winterHayNeedKg, type HerdPlaces } from './husbandry';
export * from './herding';
export { woolCoverage, woolNeedKg, woolSheep, woolUnhappiness } from './wool';
export * from './dwellings';
export * from './manor';
export * from './lord';
export * from './cancel-construction';
export * from './relocation';
export * from './departure';
export * from './neighbourhood';
export * from './world-grid';
export * from './villages-apart';
export * from './fields';
export * from './holdings';
export * from './year-plan';
export { withSowingRotation } from './rotation';
export * from './sowing';
export * from './field-progress';
export * from './part-rotation';
export * from './labor';
export { LABOR_TREES_SHOWN, laborReport } from './labor-report';
export * from './population';
export * from './kinship';
export * from './dynasty';
export * from './dynasty-names';
export * from './households';
export * from './marriage';
export * from './extinction';
export * from './cemetery';
export * from './burials';
// sady – jen čisté funkce; kroky simulace (výsadba, práce a sezóna sadů) zůstávají uvnitř
export {
  ORCHARD_TASK_NAMES,
  firstOrchardSeason,
  harvestedApplesKg,
  monthInWindow,
  nextHarvestSeason,
  orchardAgeYears,
  orchardAreaM2,
  orchardExpectedYieldKg,
  orchardPlantingCost,
  orchardSeason,
  orchardWorkRemaining,
  orchardYear,
  orchardYieldShare,
  roadAppleBearing,
  roadAppleCareWork,
  roadAppleHarvestWork,
  roadApplePlantingWork,
  roadAppleYieldKg,
  seasonBounds,
  squareBearing,
  squareCareWork,
  squareExpectedYieldKg,
  squareHarvestWork,
  squareWalkDistance,
  squareYieldKg,
  villageApplesKg,
  villageOrchards,
} from './orchard';
export * from './actions';
export * from './simulate';
export * from './polygon';
export * from './placement';
export * from './dwelling-shape';
export { withDwellingShapes } from './shape-migration';
export * from './plots';
export * from './plot-cells';
export * from './square-grid';
export * from './squares';
export { TAKEN_LAND_EPSILON_M2, landLeftM2, type TakenLand } from './land-taken';
export * from './ruins';
// opuštěné stavby – čisté funkce stavu; kroky simulace (roční kontrola, pád) zůstávají uvnitř
export {
  isAbandoned,
  sacredRuinOvergrowth,
  stockedPenIds,
  structureCondition,
  structureFallDay,
  visitKey,
} from './abandonment';
// oprava staveb, ke kterým se zase chodí – čisté funkce; práce a dokončení zůstávají uvnitř
export { fullRepairManDays, repairOf, repairedCondition, type StructureRef } from './repair';
export * from './obstacles';
export * from './summary';
export * from './names';
export * from './costs';
export * from './wood';
export * from './forest-clearing';
export * from './sacred';
export * from './sacred-life';
export * from './threshing-floors';
// snopy a výmlat (production-chains.md – Humno) – kroky dne (sklizeň do snopů, výmlat, ubytek)
// volá simulate.ts
export {
  THRESHED_CROPS,
  builtThreshingFloorCount,
  canThresh,
  inThreshingGrace,
  sheafWork,
  sheavesOutlook,
  threshingCapacity,
  threshingStatus,
  villageSheaves,
  withThreshingGrace,
  type ThreshingCapacity,
  type ThreshingStatus,
} from './threshing';
// obilné jámy (production-chains.md – Obilné jámy) – kroky dne (ztráty, odběr, plnění jam,
// jámy pod stavbou) volá simulate.ts
export {
  currentGrainPits,
  grainInPitsKg,
  grainStoresKeep,
  isPitFillingDay,
  looseGrainKg,
  openGrainPits,
  villageGrainPits,
} from './grain-pits';
export {
  chooseGrainPitSite,
  coveredGrainPitIds,
  grainPitCenter,
  grainPitSites,
  withGrainPits,
  withoutBuiltOverGrainPits,
} from './grain-pit-site';
export * from './happiness';
export * from './crafts';
// kovář – tavba, houba, hřivny, nástroje jako vybavení (production-chains.md – Kovář)
export * from './iron';
export { FORGE, ORE_KG_PER_TOOL_KG, REFINE, SMELT, smeltOreKg } from './iron-rates';
// kování vozů (wagons.md – Kování vozů) – krok dne volá simulate.ts
export {
  cartIronKg,
  ironCarrier,
  ironPriceKg,
  ironDestinations,
  ironOptions,
  ironPlan,
  freeIronCart,
  ironTripDaysLeft,
  ironTripHelpers,
  ironTripLine,
  ironTripShares,
  mapTripDays,
  smithAtHome,
  type IronPlan,
  type IronRoute,
} from './cart-iron';
// učení řemesla (crafts.md – Učení řemesla) – den praxe volá simulate.ts
export {
  craftApprentices,
  craftSkillSummary,
  practiceOf,
  skillShare,
  withCraftSkill,
  workshopSkill,
  type CraftSkillSummary,
} from './craft-skill';
export * from './charcoal';
export * from './smith-supply';
// nákup u sousedů (crafts.md) – kroky simulace (odchod, cesta, návrat) volá simulate.ts
export {
  CRAFT_PRODUCTS,
  PRODUCT_CRAFT,
  craftSources,
  neighbourCrafts,
  ownCraftsmanWorks,
  paymentValueKg,
  planPurchases,
  productPrice,
  purchaseDaysLeft,
  purchaseLine,
  purchaseRoute,
  purchaseTarget,
  purchaseTravelers,
  type CraftProduct,
  type CraftSource,
  type PurchasePlan,
  type PurchaseRoute,
} from './craft-buying';
// tesař a vozy (wagons.md) – kroky simulace (pomoc stavbám, výroba, svoz) volá simulate.ts
export {
  NO_HELP,
  carpentryHelp,
  constructionLaborFactor,
  constructionWoodShare,
  restingCarpenters,
  woodworkPending,
  type CarpentryHelp,
} from './carpentry';
export {
  CART_KINDS,
  CART_NAMES,
  EVERYWHERE,
  cartCondition,
  cartOrigin,
  cartsAway,
  cropCartReach,
  expeditionCartKinds,
  fellingHaulable,
  haulAvailable,
  haulCartsToday,
  haulPlan,
  haulProgress,
  hauledBy,
  leavingCart,
  logsCartReach,
  mowingCartReach,
  networkCartAccess,
  sowingCartReach,
  cartOxen,
  tradeCarts,
  trailCartPassable,
  villageCartAccess,
  villageCarts,
  type CartAccess,
  type HaulPlan,
} from './carts';
export {
  cartTripManDays,
  cartTripSeconds,
  cartTripsPerDay,
  kilnCartDrive,
  kilnCartOffer,
  oreCartDrive,
  oreCartOffer,
  villageCartDrives,
  storedWaterCartDrive,
  waterCartDrive,
  waterCartPlan,
  withoutTrampledParts,
  type CartDrives,
  type SmithCart,
  type WaterCartPlan,
} from './cart-jobs';
export {
  morningWater,
  ploughWindowsToday,
  villagersToday,
  waterHouseholdsToday,
  type MorningWater,
  type PloughWindow,
} from './morning-water';
export * from './paths';
export * from './road-trees';
export * from './road-upgrades';
// vozová cesta (roads.md – Vozová cesta) – kroky simulace (úseky, dokončení) zůstávají uvnitř
export {
  WAGON_BUILDING,
  WAGON_EXISTS,
  WAGON_HAIRPIN_REASON,
  WAGON_LOOP,
  WAGON_BLOCKED,
  WAGON_NO_ROAD,
  WAGON_NO_WOOD,
  WAGON_SACRED,
  WAGON_SHORT,
  WAGON_STEEP,
  planWagonRoad,
  startWagonRoad,
  villageWagonEarthworks,
  wagonChainConstruction,
  wagonChainStatus,
  wagonHome,
  wagonPlanInputOf,
  wagonProgress,
  wagonWorkTarget,
  type WagonPiecePlan,
  type WagonPlanEarthwork,
  type WagonPlanInput,
  type WagonPlanRoad,
  type WagonRoadPlan,
} from './wagon-road';
export * from './trail';
export * from './neighbours';
export * from './trade';
// dobytek v obchodu – příchod a odchod dobytka (`addCattle`, `removeCattle`) jsou kroky obchodu
export {
  NO_COW_ROOM,
  NO_OX_ROOM,
  boughtOxTrainedDay,
  cattleForSale,
  cattleRoom,
  cattleRoomBlocked,
  withCattleKinds,
} from './cattle-trade';
// koně v obchodu (horses.md – Nákup a prodej) – příchod a odchod koní (`addHorses`,
// `removeHorses`) jsou kroky obchodu
export {
  NO_HORSE_ROOM,
  horseRoomBlocked,
  horseTradeRoom,
  horseValueKg,
  horsesForSale,
  horsesSaleValues,
  offeredHorses,
} from './horse-trade';
// koně po kusech (horses.md – Koně po kusech): věk, druh a místa ohrad koní pro scénu a rozhraní
export {
  horseAgeYears,
  horseGrainToday,
  horseHayDailyKg,
  horseKind,
  horsePlaces,
  horsesInPlaces,
  isFoalByAge,
  isGrainHorse,
  penHorses,
  ridingHorses,
  stallionId,
  villageHorses,
  type HorseKind,
} from './horses';
export { horsesOverRoom, horsesWanted } from './horse-breeding';
export {
  finishShoeing,
  isUnshod,
  nextShoeingDay,
  planShoeing,
  shoeingCosts,
  shoeingView,
  type ShoeingPlan,
  type ShoeingView,
} from './horse-shoeing';
export { horsePenValueKg, withHorsePenStock } from './horse-stock';
export { withForestClearing } from './forest-clearing-migration';
export { HORSE_PEN_NO_SURPLUS, horsePenPayment } from './horse-pen-payment';
// výměna lidí se sousedem – příchod lidí (`settleNewcomers`) je krok simulace a zůstává uvnitř
export {
  NO_PEOPLE,
  emigrantGroups,
  emigrantList,
  neighbourFamilyValue,
  neighbourPeople,
  newcomerProfiles,
  personValue,
  storedNeighbourPeople,
  tradePeopleCount,
  type EmigrantGroup,
  type Emigrants,
  type NewcomerMember,
  type NewcomerProfile,
} from './people-trade';
// jabloně u cest – kroky simulace (práce a dokončení výsadby) zůstávají uvnitř
export {
  chainAppleSpots,
  roadAppleSpots,
  roadApplesOption,
  startRoadApples,
  villageRoadApples,
  type ChainAppleSpot,
  type RoadApplesOption,
} from './road-apples';
export * from './overgrowth';
export * from './pasture';
export * from './woods';
export * from './road-fields';
export * from './road-swath';
