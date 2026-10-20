export * from './types';
export * from './rules';
export * from './productivity';
export * from './people';
export * from './food';
export * from './diet';
export * from './field-food';
export * from './dairy';
export * from './legumes';
export { expectedFlaxKg, flaxNeedKg, linenCoverage, linenUnhappiness } from './flax';
export * from './livestock';
export * from './hay';
export * from './plough';
export * from './plough-blocks';
export * from './plough-trip';
export * from './oxen';
export * from './draft';
export * from './pens';
export { breedingCows, herdPlaces, winterHayNeedKg, type HerdPlaces } from './husbandry';
export * from './herding';
export { woolCoverage, woolNeedKg, woolSheep, woolUnhappiness } from './wool';
export * from './dwellings';
export * from './manor';
export * from './relocation';
export * from './departure';
export * from './neighbourhood';
export * from './world-grid';
export * from './villages-apart';
export * from './fields';
export * from './holdings';
export * from './year-plan';
export * from './sowing';
export * from './field-progress';
export * from './labor';
export { LABOR_TREES_SHOWN, laborReport } from './labor-report';
export * from './population';
export * from './kinship';
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
export * from './happiness';
export * from './crafts';
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
  harvestReachState,
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
  waterCartDrive,
  waterCartPlan,
  type CartDrives,
  type SmithCart,
  type WaterCartPlan,
} from './cart-jobs';
export * from './paths';
export * from './road-trees';
export * from './road-upgrades';
// vozová cesta (roads.md – Vozová cesta) – kroky simulace (úseky, dokončení) zůstávají uvnitř
export {
  WAGON_BUILDING,
  WAGON_EXISTS,
  WAGON_LOOP,
  WAGON_NO_ROAD,
  WAGON_NO_ROUTE,
  WAGON_SACRED,
  WAGON_SHORT,
  planWagonRoad,
  startWagonRoad,
  villageWagonEarthworks,
  wagonDetourReason,
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
