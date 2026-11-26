export * from './types';
export * from './rules';
export * from './core/productivity';
export * from './people/people';
export * from './core/food';
export * from './core/diet';
export * from './fields/field-food';
export * from './fields/field-capacity';
export * from './livestock/dairy';
export * from './fields/legumes';
export { flaxNeedKg, linenCoverage, linenUnhappiness } from './fields/flax';
export { gardenLegumeKg, harvestGardens } from './fields/garden';
export * from './livestock/livestock';
export * from './rules/rules-wildlife';
export * from './wildlife/wildlife';
export * from './rules/rules-disasters';
export * from './rules/rules-fortifications';
export * from './disasters/weather';
export * from './disasters/disasters';
export * from './disasters/part-protection';
export { hailZone, type HailZone } from './disasters/hail';
export {
  cropWeatherOf,
  harvestYearOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from './disasters/weather-effects';
export * from './wildlife/hunt';
export { dogsYear } from './wildlife/manor-dogs';
export { dogsWanted, huntingDogs, huntPool } from './wildlife/hunt-party';
export { fishingPools, wildlifeLandAt, type FishingPool } from './wildlife/wildlife-land';
export * from './livestock/hay';
export * from './livestock/plough';
export * from './livestock/plough-blocks';
export * from './livestock/plough-trip';
export * from './livestock/oxen';
export * from './buildings/fence-cost';
export * from './fortification';
export * from './livestock/draft';
export * from './livestock/pens';
export { breedingCows, herdPlaces, winterHayNeedKg, type HerdPlaces } from './livestock/husbandry';
export * from './livestock/herding';
export { woolCoverage, woolNeedKg, woolSheep, woolUnhappiness } from './livestock/wool';
export * from './buildings/dwellings';
export * from './buildings/log-house';
export * from './people/manor';
export * from './people/lord';
export { churchCoverage, type ChurchCoverage } from './people/church-life';
export * from './people/arms-caps';
export * from './fields/abandon-parts';
export * from './buildings/cancel-construction';
export * from './fortification/state/fortifications';
export * from './fortification/state/fortification-upgrade';
export * from './fortification/state/fortification-rampart';
export * from './fortification/state/fortification-gate';
export * from './fortification/state/fortification-gate-use';
export * from './fortification/state/fortification-gate-gap';
export * from './fortification/state/fortification-proposal';
export * from './fortification/state/fortification-reroute';
export { fortDefenders } from './steward/steward-fortification';
export { raidHiding } from './fortification/state/raid-day';
export * from './people/relocation';
export * from './people/departure';
export * from './core/digest';
export * from './core/year-log';
export * from './people/son-departure';
export * from './people/player-lot';
export * from './people/world-grid';
export * from './people/village-site';
export * from './fields/fields';
export * from './fields/holdings';
export * from './core/year-plan';
export { withSowingRotation } from './fields/rotation';
export * from './fields/sowing';
export * from './core/daylight';
export * from './disasters/snow';
export * from './core/day-chores';
export * from './fields/field-progress';
export * from './fields/field-outlook';
export * from './fields/part-rotation';
export * from './core/labor';
export { LABOR_TREES_SHOWN, laborReport, startingShares } from './core/labor-report';
export * from './people/population';
export * from './people/kinship';
export * from './people/dynasty';
export * from './people/faith';
export * from './people/slaves';
export * from './people/desecration';
export * from './people/baptism';
export * from './people/dynasty-names';
export * from './people/seniority';
export * from './steward/steward-state';
export * from './steward/steward-land';
export * from './steward/steward-plan';
export * from './steward/steward';
export * from './rules/rules-steward';
export * from './people/households';
export {
  displacedCount,
  housingPlaces,
  lodgersIn,
  lodgingShortfall,
  noRoomReason,
  pruneDisplaced,
  rehouseDisplaced,
  vacateDwelling,
  freePlaces as freeDwellingPlaces,
} from './people/displaced';
export * from './people/marriage';
export * from './core/extinction';
export * from './buildings/cemetery';
export * from './buildings/church-geometry';
export * from './people/burials';
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
} from './buildings/orchard';
export * from './core/actions';
export * from './buildings/build-intent';
export * from './core/simulate';
// převody starších vsí – jeden seznam pro načtení i dopočet (village-core.md – Převody starších vsí)
export * from './core/migrations';
export * from './core/inbox';
export * from './people/appoint-lord';
export * from './people/lodge';
export * from './people/lodge-life';
export * from './buildings/church-build';
export {
  checkChurchPlacement,
  churchyardWorld,
  type ChurchPlacementCheck,
} from './placement/placement-church';
export * from './placement/polygon';
export * from './placement/placement';
export * from './buildings/dwelling-shape';
export { withDwellingShapes } from './buildings/shape-migration';
export * from './buildings/plots';
export * from './placement/plot-cells';
export * from './placement/square-grid';
export * from './placement/squares';
export { TAKEN_LAND_EPSILON_M2, landLeftM2, type TakenLand } from './buildings/land-taken';
export * from './buildings/ruins';
// opuštěné stavby – čisté funkce stavu; kroky simulace (roční kontrola, pád) zůstávají uvnitř
export {
  isAbandoned,
  sacredRuinOvergrowth,
  stockedPenIds,
  structureCondition,
  structureFallDay,
  visitKey,
} from './buildings/abandonment';
// oprava staveb, ke kterým se zase chodí – čisté funkce; práce a dokončení zůstávají uvnitř
export {
  fullRepairManDays,
  repairOf,
  repairedCondition,
  type StructureRef,
} from './buildings/repair';
export * from './core/obstacles';
export {
  clearedForest,
  clearedForestOf,
  touchesForest,
  turnedSquare,
  villageClearings,
  type ClearedForest,
  type ClearingDwelling,
  type ClearingPart,
  type ClearingSources,
} from './core/cleared-forest';
export * from './core/summary';
// trvalé stavy z upozornění – podmínky pro web i simulaci (absence.md – Upozornění vsi do kroniky)
export { LASTING_NOTICES, horsesUngrained, lastingNotices } from './core/lasting-notices';
export * from './people/names';
export * from './buildings/costs';
export * from './forest/wood';
export * from './fortification/state/stone';
export * from './fortification/state/quarry-area';
export * from './rules/rules-stone';
export * from './fortification/state/quarry';
export * from './forest/forest-clearing';
export * from './forest/log-piles';
export * from './forest/log-piles-migration';
export * from './people/sacred';
export * from './people/sacred-life';
export * from './fields/threshing-floors';
// snopy a výmlat (production-chains.md – Humno) – kroky dne (sklizeň do snopů, výmlat, ubytek)
// volá simulate.ts
export {
  THRESHED_CROPS,
  builtThreshingFloorCount,
  canThresh,
  sheafWork,
  sheavesOutlook,
  threshingCapacity,
  threshingStatus,
  villageSheaves,
  withThreshingGrace,
  type ThreshingCapacity,
  type ThreshingStatus,
} from './fields/threshing';
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
} from './fields/grain-pits';
export {
  chooseGrainPitSite,
  coveredGrainPitIds,
  grainPitCenter,
  grainPitSites,
  withGrainPits,
  withoutBuiltOverGrainPits,
} from './fields/grain-pit-site';
export * from './people/happiness';
export * from './crafts/crafts';
// kovář – tavba, houba, hřivny, nástroje jako vybavení (production-chains.md – Kovář)
export * from './crafts/iron';
export { FORGE, ORE_KG_PER_TOOL_KG, REFINE, SMELT, smeltOreKg } from './crafts/iron-rates';
// kování vozů (wagons.md – Kování vozů) – krok dne volá simulate.ts
export {
  cartIronKg,
  ironTripDaysLeft,
  ironTripHelpers,
  ironTripLine,
  ironTripShares,
  withoutSameMapVillages,
} from './crafts/cart-iron';
// učení řemesla (crafts.md – Učení řemesla) – den praxe volá simulate.ts
export {
  craftApprentices,
  craftSkillSummary,
  practiceOf,
  skillShare,
  withCraftSkill,
  workshopSkill,
  type CraftSkillSummary,
} from './crafts/craft-skill';
export * from './crafts/charcoal';
// zemnice uhlíře u milíře (workshops.md – Uhlíř – zemnice u milíře)
export * from './crafts/burner-camp';
export * from './crafts/smith-supply';
// odnos uhlí na tyči (workshops.md – Uhlíř – odnos uhlí na tyči) – den volá simulate-work
export * from './crafts/charcoal-pole';
// výrobky řemeslníků jen od vlastních řemeslníků; nákup u sousedů uložený na cestě doběhne
// (crafts.md; markets.md – Pravidla 1) – kroky simulace (cesta, návrat) volá simulate.ts
export {
  CRAFT_PRODUCTS,
  PRODUCT_CRAFT,
  craftSources,
  ownCraftsmanWorks,
  paymentValueKg,
  purchaseDaysLeft,
  purchaseLine,
  purchaseRoute,
  purchaseTarget,
  purchaseTravelers,
  type CraftProduct,
  type CraftSource,
  type PurchaseRoute,
} from './crafts/craft-buying';
// tesař a vozy (wagons.md) – kroky simulace (pomoc stavbám, výroba, svoz) volá simulate.ts
export {
  NO_HELP,
  carpentryHelp,
  constructionLaborFactor,
  constructionWoodShare,
  restingCarpenters,
  woodworkPending,
  type CarpentryHelp,
} from './crafts/carpentry';
export {
  CART_KINDS,
  CART_NAMES,
  EVERYWHERE,
  cartCondition,
  cartOrigin,
  cartsAway,
  cropCartReach,
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
  tradeHomeCarts,
  cartsWithOxen,
  villageCartAccess,
  villageCarts,
  type CartAccess,
  type HaulPlan,
} from './crafts/carts';
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
} from './crafts/cart-jobs';
export {
  morningWater,
  ploughWindowsToday,
  villagersToday,
  waterHouseholdsToday,
  type MorningWater,
  type PloughWindow,
} from './core/morning-water';
export * from './paths';
export * from './roads/road-trees';
export * from './roads/road-upgrades';
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
  wagonWorkTarget,
  type WagonPiecePlan,
  type WagonPlanEarthwork,
  type WagonPlanInput,
  type WagonPlanRoad,
  type WagonRoadPlan,
} from './roads/wagon-road';
export * from './trade/trail';
export { TRAIL_END_BAND_M, trailExitsOf, type TrailExit } from './trade/trail-exits';
export { landscapeTrailLines } from './trade/premium-route';
export * from './trade/goods';
// trh – ceny v mincovní míře a zápočet tržního dne (markets.md – Rozhodnutí plánu 2, body 3 a 4),
// cena v mincích s hladinou trhu (Rozhodnutí plánu 4, bod 3)
export { coinPriceOf, initialPrice, nextPrices, priceOf } from './trade/market-prices';
export { clearMarket, partyTotals } from './trade/market-clearing';
export { marketStance } from './trade/market-stance';
export { roughCount, villageReport } from './trade/village-report';
// trh ve vsi hostitele (markets.md – Rozhodnutí plánu 2, body 4–7) – příjezd výpravy, tržní den
// (krok dne volá simulate.ts), výsledek do odchozí schránky a zprávy na pivo
export {
  joinMarket,
  marketArrivalRef,
  marketDay,
  marketResult,
  marketResultRef,
  rememberNews,
} from './trade/market';
// výprava na trh – domovská ves (markets.md – Rozhodnutí plánu 2, body 1, 2 a 6): kontroly
// a odchod, lidé a vozy pryč v pevné dny, výsledek trhu domů (kroky dne volá simulate.ts a schránka)
export {
  MARKET_NO_OXEN,
  MARKET_NO_PEOPLE,
  MARKET_OVER_STOCK,
  MARKET_STAY,
  MARKET_BAD_ORDER,
  MARKET_WORLD_END,
  applyMarketResult,
  checkMarketTrip,
  departMarket,
  marketCrew,
  marketTravelDays,
  marketTripsDay,
  oxenForCarts,
  planMarketTrip,
  marketFreeAdults,
  marketTripPeople,
  type MarketTripPeople,
  type MarketCheck,
  type MarketPlan,
  type MarketTripCheck,
} from './trade/market-trip';
// cizí kupci na stezkách (markets.md – Rozhodnutí plánu 4, bod 5) – plán příjezdů na zastávky vsi
export { merchantVisits, nextMerchantVisit, type MerchantVisit } from './trade/merchant-plan';
// objednávka zbroje u kupců ve vlastní vsi (markets.md – Rozhodnutí plánu 4, bod 15) – zadá ji hráč,
// koupí ji trh v den kupců
export { ARMS_BAD_ORDER, ARMS_NO_MERCHANTS, setArmsOrder } from './trade/arms-order';
// okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1) – snímek vsí na sousedních mapách ze schránky
export { applyNearby, nearbyTarget, nearestNearby, nearestWith } from './trade/nearby';
// zakázky u řemeslníka a obilí za výrobky (markets.md – Rozhodnutí plánu 3, body 5 a 6) – kroky
// volá trh (zápočet řemeslníků), simulate.ts (fillOrders) a schránka (markOrderReady)
export {
  craftParties,
  craftStance,
  fillOrders,
  liveOrders,
  markOrderReady,
  orderTargets,
  placedOrder,
  placedOrders,
  recordOrders,
  reduceOrder,
  rememberOrders,
} from './trade/craft-orders';
export { legacyNeighbourName } from './trade/legacy-neighbours';
export * from './trade/trade';
// dobytek v obchodu – příchod a odchod dobytka (`addCattle`, `removeCattle`) jsou kroky obchodu
export { boughtOxTrainedDay, cattleForSale, withCattleKinds } from './trade/cattle-trade';
// koně v obchodu (horses.md – Nákup a prodej) – příchod a odchod koní (`addHorses`,
// `removeHorses`, `takeHorses`) jsou kroky obchodu
export { horseValueKg, horsesForSale, horsesOf } from './trade/horse-trade';
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
} from './livestock/horses';
export { horsesOverRoom, horsesWanted } from './livestock/horse-breeding';
export {
  finishShoeing,
  isUnshod,
  nextShoeingDay,
  planShoeing,
  shoeingDay,
  shoeingView,
  type ShoeingDay,
  type ShoeingPlan,
  type ShoeingView,
} from './livestock/horse-shoeing';
export { horsePenValueKg, withHorsePenStock } from './livestock/horse-stock';
export { withForestClearing } from './forest/forest-clearing-migration';
export { HORSE_PEN_NO_SURPLUS, horsePenPayment } from './livestock/horse-pen-payment';
// lidé, které ves dá (zásilky vazalů), a lidé z výpravy na cestě – příchod lidí (`settleNewcomers`)
// je krok simulace a zůstává uvnitř
export {
  NO_PEOPLE,
  emigrantGroups,
  emigrantList,
  newcomerProfiles,
  tradePeopleCount,
  type EmigrantGroup,
  type Emigrants,
  type NewcomerMember,
  type NewcomerProfile,
} from './trade/people-trade';
// otroci, které ves smí prodat (markets.md – Rozhodnutí plánu 5, bod 6), a nabídka otroků na trhu
// vlastní vsi (bod 8)
export {
  SLAVES_BAD_COUNT,
  offeredSlaveIds,
  sellableSlaves,
  setSlavesForSale,
} from './trade/slaves';
// jabloně u cest – kroky simulace (práce a dokončení výsadby) zůstávají uvnitř
export {
  chainAppleSpots,
  roadAppleSpots,
  roadApplesOption,
  startRoadApples,
  villageRoadApples,
  type ChainAppleSpot,
  type RoadApplesOption,
} from './roads/road-apples';
export * from './fields/overgrowth';
export * from './fields/pasture';
export * from './forest/woods';
export * from './buildings/wild-orchard';
export * from './roads/road-fields';
export * from './roads/road-swath';
export * from './steward/founding';
export * from './steward/steward-son';
export * from './buildings/structure-use';
export * from './buildings/demolition';
export { beesFlying } from './wares/wares';
