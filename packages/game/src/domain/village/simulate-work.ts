// Práce dne – polní úlohy v pořadí a `work()` s rozdělením práce vsi.
import { dateOfDayIndex } from '../calendar';
import type { Landscape, ObstacleLayer } from '../landscape';
import { carpentryHelp, restingCarpenters, workCarpenters } from './carpentry';
import {
  NO_HAUL,
  addHaulTrips,
  cartFleetToday,
  cartLoadRatio,
  fleetCarts,
  haulCartsToday,
  hauledBy,
  haulProgress,
  teamsHomeShare,
  villageCartAccess,
  type HaulPlan,
} from './carts';
import { addCartDemand, type CartDemandToday } from './draft';
import {
  oreCartDrive,
  oreCartOffer,
  flushCartTrips,
  villageCartDrives,
  type CartDrives,
} from './cart-jobs';
import { charcoalDeliveries, dugBasketManDaysPerKg, type OreCartToday } from './smith-supply';
import { purchaseTravelers, walkPurchases } from './craft-buying';
import { gainPractice } from './craft-skill';
import { ironTripHelpers, ironTripShares } from './cart-iron';
import {
  burnerDraws,
  burnerPlans,
  craftHouseholds,
  craftLightLabor,
  ironTravellers,
  migrateBurners,
  restingCrafters,
  smithBellowsToday,
  workCrafts,
  type SmithSupply,
} from './crafts';
import { lordDayCounts, manorLabor, updateLordTraining } from './lord';
import { nextYearlyCommonLabor, repairNeedPerDay, yearlyCommonLabor } from './dwellings';
import { animalCareNeed, dailyMilk } from './dairy';
import { DIET, villageFoodNeed } from './diet';
import { ploughDayFactor } from './plough-trip';
import { isToilDay, windowEndDay } from './happiness';
import { MOWING_WINDOWS, mow, mowingRemaining } from './hay';
import { herdingDay, recordHerding } from './herding';
import { villageHoldings, workOrder } from './holdings';
import {
  slaughterRemaining,
  villageChickens,
  villageDams,
  villageHerds,
  workSlaughter,
} from './livestock';
import { ploughCapacityPerDay, villageOxen } from './oxen';
import { extraSowingDay, extraSowingWantsTeam } from './extra-sowing';
import { threshingFloorHaulPoints } from './threshing-floors';
import { grainPitTask, workGrainPits } from './grain-pits';
import { chooseGrainPitSite } from './grain-pit-site';
import {
  canThresh,
  villageSheaves,
  threshForFoodKg,
  threshSeasonTasks,
  threshCrop,
  threshTasks,
} from './threshing';
import {
  afterConstructions,
  allocateDay,
  householdElders,
  householdWater,
  type LaborTaskName,
} from './labor';
import { laborDay, type AsideWork, type HaulWork } from './labor-report';
import { ORCHARD_TASK_NAMES, orchardWorkRemaining, workOrchards } from './orchard';
import { laborPerDay } from './people';
import { expeditionLaborToday, workExpeditions } from './trade';
import {
  CARTS,
  CART_JOBS,
  COMMON_LABOR_HISTORY_DAYS,
  CROP_ORDER,
  DOMESTIC,
  GRAIN_PITS,
  HARVEST_DAY,
  ORCHARD_WINDOWS,
} from './rules';
import type {
  CartTripLog,
  Construction,
  CraftCoverage,
  Crop,
  CropWork,
  VillageState,
} from './types';
import {
  TASK_ORDER,
  activeTasks,
  addCropTaskWork,
  cropTaskDone,
  cropTaskWindows,
  planCrops,
  neededTaskRemaining,
  windowEndOf,
  type CropTask,
} from './year-plan';
import { build, decayEmptyDwellings, woodworkToday } from './simulate-build';
import {
  NO_CART_JOBS,
  haulLogs,
  jobsDemand,
  logHaulCandidates,
  logHaulPlan,
  logsDemand,
  oreDemand,
  paySmithCarts,
  planCartJobs,
  planTaskHauls,
  reachableFelling,
  smithFetchPlans,
  taskCarryDemand,
} from './simulate-hauls';
import {
  DayTask,
  EPSILON,
  FieldTaskEntry,
  householdCount,
  occupiedDwellings,
  villageProductivity,
} from './simulate-plan';

/**
 * Polní úlohy dne: práce plánu po plodinách (bez výmlatu – ten mlátí snopy, `threshTasks`), orba
 * rádlem v oknech kopání (spřežení zvládnou nejvýš `ploughCap` člověkodní za den – oxen.md).
 * Nejbližší konec okna první, při shodě ozim před jaří a pořadí úloh (TASK_ORDER; orba před
 * kopáním).
 */
export function fieldTasks(
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
 * Čeká ves letos ještě na žeň jaře (plán letošního roku jař nesklidil – do HARVEST_DAY)? Pak
 * přijde další vymlácené zrno a neúplná obilná jáma počká (production-chains.md – Obilné jámy).
 */
export function springHarvestAhead(state: VillageState, month: number): boolean {
  const plan = state.plan;
  return (
    month <= HARVEST_DAY.month &&
    plan !== null &&
    plan.harvestedKg === null &&
    plan.partIds.length > 0
  );
}

/**
 * Výmlat jde při shodě konce okna za polními úlohami (žeň má přednost, výmlat ji následuje) – pořadí
 * za všemi úlohami všech plodin.
 */
export const THRESH_RANK = CROP_ORDER.length * TASK_ORDER.length;

/**
 * Krok 3: rozdělení práce vsi (population.md – Práce; Martin 19. 10. 2026: „pokud se něco staví,
 * tak čas věnují primárně té stavbě – zemědělství jenom natolik, aby vesnice neměla hlad“).
 * Polní úlohy obou plodin a orba (`fieldTasks`), sezónní práce v sadech, seč sena a porážka podle
 * konce svého okna; společná práce do staveb; z toho, co stavby nespotřebovaly, opravy obydlí
 * poměrně k potřebě (obydlený dům stav drží i s nedodělkem oprav – chátrá jen prázdný,
 * population.md). Veškerou práci násobí štěstí (happiness.md). Domácnosti obývaných dílen
 * pracují zvlášť – jen v dílně (crafts.md, `workCrafts`); opravy jejich obydlí platí ves. Zvířata
 * (dojení a péči ženy, pasení výrostci) a domácí výrobu ženy – obojí bokem, z práce vsi
 * nebere (rozdělení práce je má jen pro postavy – `LaborDay.aside`). Cvičící vojvodova rodina
 * je mimo práci vsi (lord.md – Den rodiny), na pole jde jen při hladu (zásobník `lordField`).
 * Vrací, jestli ves dnes nestíhá polní práce v období (dřina), a podíl práce rodiny na poli, který
 * dnes úlohy spotřebovaly (`trainLordDay`).
 */
export function work(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): { toil: boolean; lordField: number } {
  const month = dateOfDayIndex(day).month;
  // jízdy vozů dne (svoz, voda, uhlí, ruda, klády, osivo) – zapíše `flushCartTrips`
  const cartLog: CartTripLog = [];
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
  // výmlat snopů na humnech, v roce odkladu i nouzově na udusané zemi (production-chains.md –
  // Humno): ozim a luštěniny v srpnu, jař v září – za polními úlohami téhož konce okna (žeň má
  // přednost); výmlat, který okno nestihl, po všech pracích. Chybí-li v zásobách zrno na dnešní
  // jídlo, vymlátí se napřed – před žní i ostatními úlohami (výmlat na dnešní jídlo)
  const threshes = threshTasks(state, day, threshForFoodKg(state, villageFoodNeed(state, day)));
  for (const thresh of threshes) {
    dayTasks.push({
      name: 'thresh',
      remaining: thresh.remaining,
      end: thresh.end,
      tie: thresh.urgent ? 0 : 1,
      rank: THRESH_RANK + CROP_ORDER.indexOf(thresh.crop),
      thresh,
    });
  }
  // obilné jámy (production-chains.md – Obilné jámy): vymlácené zrno z humna do jam po polních
  // pracích a výmlatu – v době plnění jam (do zámrazu) za setím ozimu, před stavbami; neúplnou
  // jámu až po výmlatu letošní úrody (ve snopech nic, co ves vymlátí, a jař sklizená)
  const moreGrain =
    (villageSheaves(state).grainKg > EPSILON && canThresh(state, day)) ||
    springHarvestAhead(state, month);
  // místo nové jámy (jen server – krajina a stavby vsi); bez vhodného místa se letos nekope
  const pitSite = (): { x: number; z: number } | null =>
    chooseGrainPitSite(state, day, landscape, obstacles);
  const pitWork = grainPitTask(state, day, moreGrain, pitSite);
  if (pitWork > EPSILON) {
    dayTasks.push({
      name: 'grain-pit',
      remaining: pitWork,
      end: GRAIN_PITS.fillTo,
      tie: 1,
      rank: THRESH_RANK + CROP_ORDER.length,
    });
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
  const fleet = cartFleetToday(state, day, ploughing);
  // dosah vozů má ves s hotovou ohradou volů i bez vozů – měří, co by dnes vozy ušetřily
  // (wagons.md – Kolik vozů ves chce): nošení, které dnes opravdu proběhlo, a jízdy pro uhlí, rudu
  // a vodu; čtyřkolák po louce a strništi, na zoraný díl ne (wagons.md – Co se vozí a na čem) –
  // bez krajiny (kalibrace) nikam
  const access = villageCartAccess(state, day, landscape, obstacles);
  const roadAccess =
    access && landscape ? villageCartAccess(state, day, landscape, obstacles, 'four-wheel') : null;
  const fourAccess = fleet['four-wheel'] > 0 ? roadAccess : null;
  const demand: CartDemandToday = { road: 0, other: 0, jobs: [] };
  const hauls = new Map<DayTask, HaulPlan>();
  if (access) {
    planTaskHauls(state, dayTasks, hauls, fleet, access, fourAccess, coverage, landscape);
  }

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
  // vojvodova rodina (lord.md – Den rodiny): když cvičí, je mimo práci vsi jako dílny – vojvoda,
  // jeho synové a ženy rodiny; ostatní v dvorci (zeť) pracují se vsí. Denní minimum dvorce kryje
  // rodina (`manorLabor`), proto domácnost dvorce v minimu vsi chybí
  const family = updateLordTraining(state, day);
  const apart = new Set(family ? [...family.trainees, ...family.household].map((p) => p.id) : []);
  const manorSkip = new Set<number>(family?.lord ? [family.lord.dwellingId] : []);
  const villagers =
    crafts.size > 0 || travelling.size > 0 || apart.size > 0
      ? state.people.filter(
          (p) => !crafts.has(p.dwellingId) && !travelling.has(p.id) && !apart.has(p.id),
        )
      : state.people;
  const waterNeeds = householdWater(villagers, state.dwellings, manorSkip);
  const manor = family ? manorLabor(state, day, coverage.pottery, productivity, family) : null;
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
  let drives4: CartDrives | null | undefined;
  const drives4Of = (): CartDrives | null =>
    (drives4 ??= villageCartDrives(state, day, landscape, obstacles, 'four-wheel'));
  if (access) {
    demand.jobs.push(
      ...jobsDemand(state, { landscape, deliveries, drives: drivesOf, water: waterNeeds }),
    );
  }
  // klády ke stavbám mají před ostatními jízdami přednost – kolik vozů si vezmou, se ví už teď
  // (náklad až z práce, která zbude po úlohách dne); vozy, které zbudou, jedou pro uhlí, s osivem,
  // nebo pro vodu (wagons.md – Co vozy vozí)
  const anyCart = (): boolean =>
    fleetCarts(fleet, 'two-wheel') + fleetCarts(fleet, 'four-wheel') > 0;
  const logs =
    access && anyCart()
      ? logHaulCandidates(state, day, access, fourAccess, landscape, obstacles)
      : [];
  const logPlan = logs.length > 0 ? logHaulPlan(logs, fleet) : NO_HAUL;
  // uhlí, ruda, osivo a voda – zbylé vozy (uhlí a vodu i čtyřkolák po cestě – wagons.md)
  const jobs =
    access && anyCart()
      ? planCartJobs(state, {
          fleet,
          tasks: dayTasks,
          hauls,
          access,
          landscape,
          drives: drivesOf,
          drives4: drives4Of,
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
    // ženy řemeslníků: zbytek po domácnosti jde jen na lehčí polní práce se vsí (crafts.md)
    light: craftLightLabor(state, day, crafts, coverage.pottery, productivity),
    // vojvodova rodina na poli při hladu – jen úlohy dne (lord.md – Kdy jde rodina na pole); co
    // z minima dvorce rodina nepokryje, platí ves
    lordField: manor && productivity > 0 ? manor.field / productivity : 0,
    manorMin: manor?.uncovered ?? 0,
    householdElders: householdElders(villagers, day, manorSkip),
    // chůze pro vodu nad denní minimum (population.md – Práce, paths.md – Pochůzky pro vodu); vodu,
    // kterou přivezl vůz, nenosí a platí díl práce posádky (wagons.md – Co vozy vozí)
    householdWater: jobs.water ? jobs.water.water : waterNeeds.map((h) => h.labor),
    tasks: dayTasks.map(({ name, remaining }) => ({ name, remaining })),
    potteryCoverage: coverage.pottery,
    productivity,
    // lidé na výpravách k sousedům (trade.md – Doprava, Martin 19. 10. 2026): jejich práce jde po
    // denním minimu, před úlohami dne – nosiči jsou dospělí, nejvýš kolik jich ves má
    // i skupiny nákupu u sousedů (crafts.md – Nákup u sousedů) – stejné pravidlo
    // i nosiči a sedlák s platbou za kování k vozu (wagons.md – Kování vozů) – po celou cestu
    away: expeditionLaborToday(
      state,
      villagers,
      day,
      purchaseTravelers(state) + ironTripHelpers(state),
    ),
    // sedláci s vozy pro uhlí a rudu kováře (crafts.md – Uhlí a ruda kováře) – jízda domluvená
    // předem, z práce vsi před úlohami dne
    carting:
      jobs.charcoal.reduce((sum, c) => sum + c.manDays, 0) +
      jobs.ore.reduce((sum, o) => sum + o.manDays, 0) +
      jobs.clay.reduce((sum, o) => sum + o.manDays, 0),
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
  // výmlat dne – na humnech a nouzově na udusané zemi (rozdělení práce – labor-report.ts)
  const threshing = { floor: 0, ground: 0 };
  // práce dne na obilných jamách – u které jámy (rozdělení práce)
  let grainPits = null as ReturnType<typeof workGrainPits>;
  let mowLabor: number | undefined;
  const mowingBefore = state.hay?.mowing?.done ?? 0;
  dayTasks.forEach((task, i) => {
    const labor = allocation.taskAmounts[i] ?? 0;
    // s vozy úloha postoupí víc, než na ni ves dala práce (wagons.md – Vůz)
    const haul = hauls.get(task);
    const amount = haul ? haulProgress(labor, haul) : labor;
    if (access) {
      const carried = taskCarryDemand(state, task, amount, access, roadAccess, coverage, landscape);
      demand.road += carried.road;
      demand.other += carried.other;
    }
    const crew = haul ? Math.min(labor, haul.crew) : 0;
    if (haul && crew > 0) {
      const seed = task.field?.name === 'sow';
      haulWork.push({
        job:
          task.name === 'mow'
            ? 'mow'
            : task.name === 'orchard-harvest'
              ? 'apples'
              : seed
                ? 'seed'
                : 'harvest',
        manDays: crew,
        carts: haul.carts,
        ...(haul.four ? { four: haul.four } : {}),
      });
      // co vozy převzaly – nejvýš podíl nošení celé úlohy (carts.ts – haulAvailable); jízdy svozu
      // do ročního provozu cest (vyjeté cesty – roads.md); osivo zvlášť (wagons.md – Co vozy vozí)
      const hauled = hauledBy(labor, haul);
      if (seed) {
        const work = task.field!.work;
        work.seedHauled = (work.seedHauled ?? 0) + hauled;
        if (work.seedReach)
          addHaulTrips(state, work.seedReach, hauled, 'two-wheel', cartLog, work.partIds);
      } else {
        const owner = task.field
          ? task.field.work
          : task.name === 'orchard-harvest'
            ? state.orchardWork
            : state.hay?.mowing;
        if (owner) {
          owner.hauled = (owner.hauled ?? 0) + hauled;
          // jízdy do ročního provozu cest po druzích vozů
          const spare = task.field?.work.partIds;
          const four = haul.work > 1e-9 ? (haul.fourWork ?? 0) / haul.work : 0;
          if (owner.cartReach4 && four > 0) {
            addHaulTrips(state, owner.cartReach4, hauled * four, 'four-wheel', cartLog, spare);
          }
          if (owner.cartReach) {
            addHaulTrips(state, owner.cartReach, hauled * (1 - four), 'two-wheel', cartLog, spare);
          }
          // snopy jedou z pole na humno (production-chains.md – Humno) – i tam se vyjede cesta
          if (task.field?.name === 'harvest') {
            const floors = threshingFloorHaulPoints(state);
            if (floors.length > 0) {
              addHaulTrips(state, { points: floors }, hauled * four, 'four-wheel', cartLog, spare);
              addHaulTrips(
                state,
                { points: floors },
                hauled * (1 - four),
                'two-wheel',
                cartLog,
                spare,
              );
            }
          }
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
    } else if (task.thresh) {
      const split = threshCrop(state, task.thresh, amount);
      threshing.floor += split.floor;
      threshing.ground += split.ground;
    } else if (task.name === 'mow') {
      mow(state, amount);
      if (haul) mowLabor = labor - crew;
    } else if (task.name === 'slaughter') {
      workSlaughter(state, amount);
    } else if (task.name === 'grain-pit') {
      grainPits = workGrainPits(state, day, amount, moreGrain, pitSite);
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
  // měchař u tavby (production-chains.md – Kovář): syn 10–13, který šlape měch, ten den nepase
  const bellows = smithBellowsToday(state, day, resting, busy);
  for (const helper of bellows.values()) if (helper?.kind === 'son') busy.add(helper.personId);
  // co dnes výrostci uhlídali – podle toho ves při porážce drží stádo (diet.md – Pasáci)
  const herding = herdingDay(state, day, villageOxen(state), busy);
  recordHerding(state, herding);
  // lidé na cestách k sousedům – podíl z rozdělení dne (trade.md – Doprava): skupiny nákupu
  // u sousedů ujdou den napřed (jdou pevně dny cesty – crafts.md, Nákup u sousedů), zbytek
  // dostanou výpravy obchodu
  const purchases = [...walkPurchases(state), ...ironTripShares(state)];
  const purchaseLabor = Math.min(
    allocation.away,
    purchases.reduce((sum, p) => sum + p.manDays, 0),
  );
  const trade = workExpeditions(state, allocation.away - purchaseLabor);
  let common = allocation.common;
  // kácení u stromů, kam vůz dojede, před dnešní prací – co se dnes skácí, mohly odvézt vozy
  const fellingBefore = access
    ? reachableFelling(state, day, access, roadAccess, landscape, obstacles)
    : new Map<Construction, { remaining: number; road: number }>();
  // klády ke stavbám vozem tam, kam vůz dojede (wagons.md – Vůz) – honák a nakladač ze společné
  // práce; vozy, které jely jinam (Co vozy vozí), je nevozí
  if (logs.length > 0) {
    const logWork = haulLogs(state, day, common, logPlan, logs, cartLog);
    if (logWork) {
      common -= logWork.manDays;
      haulWork.push(logWork);
    }
  }
  // voda v sudech (wagons.md – Co vozy vozí): posádka ve dnešním minimu, jízdy do provozu cest
  if (jobs.water) {
    const water = jobs.water;
    cartLog.push({ ...water.spot, kind: water.kind, trips: water.trips, sown: water.sown });
    haulWork.push({
      job: 'water',
      manDays: water.crew,
      carts: water.carts,
      ...(water.kind === 'four-wheel' ? { four: water.carts } : {}),
      target: { kind: 'water', ...water.spot },
    });
  }
  // tesař pomáhá stavbám – jeho práce jde do staveb a zlevní jejich dřevěnou část (wagons.md)
  const help = carpentryHelp(state, day, coverage, productivity, resting, (extra) =>
    woodworkToday(state, day, common + extra),
  );
  const constructions = build(state, day, common + help.labor, help.coverage);
  if (access) {
    const felled = logsDemand(fellingBefore);
    demand.road += felled.road;
    demand.other += felled.other;
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
    bellows,
    oreCarts: new Map(
      smithCarts.ore.map((o): [number, OreCartToday] => [
        o.smithId,
        { kg: o.kg, riderManDays: o.riderManDays },
      ]),
    ),
    clayCarts: new Map(
      smithCarts.clay.map((o): [number, OreCartToday] => [
        o.smithId,
        { kg: o.kg, riderManDays: o.riderManDays },
      ]),
    ),
    // dávka rudy na celý vůz, když ves má vůz doma a jízda k rudišti ušetří práci proti nošení
    cartBatch: (_dwelling, site, material) => {
      if (haulCartsToday(state, day, false) <= 0) return null;
      const all = drivesOf();
      if (!all) return null;
      if (site.cart === undefined) site.cart = oreCartDrive(state, site, all, material);
      const footPerKg = dugBasketManDaysPerKg(material, site.walkM);
      return oreCartOffer(site.cart, footPerKg, material) ? CARTS.loadKg['two-wheel'] : null;
    },
  };
  const workshops = [
    ...workCrafts(state, day, obstacles, coverage, productivity, resting, landscape, supply),
    ...workCarpenters(state, day, obstacles, coverage, productivity, resting, help),
  ];
  if (access) {
    demand.jobs.push(...oreDemand(state, workshops, drivesOf));
    addCartDemand(state, day, demand, ploughing);
  }
  // praxe řemeslníků a učňů (crafts.md – Učení řemesla): dílny, které dnes pracovaly, a kovárny,
  // kde synové nosili uhlí, i když kovář pracoval se vsí
  if (crafts.size > 0 || restingFetch.size > 0) {
    gainPractice(state, day, crafts, restingFetch, travelling);
  }
  // uhlí a ruda vozem – sedlák ze společné práce, jízdy do ročního provozu cest (wagons.md – Co
  // vozy vozí, crafts.md – Uhlí a ruda kováře)
  for (const c of smithCarts.charcoal) {
    const trips = c.kg / (CART_JOBS.charcoal.loadKg * cartLoadRatio(c.kind));
    cartLog.push({ x: c.x, z: c.z, kind: c.kind, trips });
    haulWork.push({
      job: 'charcoal',
      manDays: c.manDays,
      carts: 1,
      ...(c.kind === 'four-wheel' ? { four: 1 } : {}),
      target: {
        kind: 'kiln',
        id: c.burnerId,
        ...c.at,
        ...(c.kilnId !== undefined ? { kiln: c.kilnId } : {}),
      },
    });
  }
  for (const material of ['ore', 'clay'] as const) {
    for (const o of smithCarts[material]) {
      cartLog.push({ x: o.x, z: o.z, kind: 'two-wheel', trips: o.kg / CARTS.loadKg['two-wheel'] });
      haulWork.push({
        job: material,
        manDays: o.manDays,
        carts: 1,
        target: { kind: material, id: o.smithId, ...o.site },
      });
    }
  }
  // všechny jízdy dne do provozu cest a pošlapání úrody na jednom místě (wagons.md)
  flushCartTrips(state, cartLog, day, landscape, obstacles);
  const hayMowing = state.hay?.mowing;
  // podíl práce rodiny na poli, který dnes úlohy spotřebovaly – zbytek dne cvičí (`trainLordDay`)
  const lordField = manor && manor.field > 0 ? allocation.lordField / manor.field : 0;
  state.labor = laborDay(state, day, {
    allocation,
    ...(family && manor
      ? { lord: { domestic: manor.dailyMin, counts: lordDayCounts(family, day, lordField) } }
      : {}),
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
    threshing,
    ...(grainPits ? { grainPits } : {}),
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
  // dřina: stihne ves dnešním tempem polní práce obou plodin do konce jejich oken? I výmlat ve
  // svém okně jako ostatní polní práce (production-chains.md – Humno); výmlat po okně termín nemá
  const pace = fieldWork.reduce(
    (sum, task) => sum + task.amount,
    threshing.floor + threshing.ground,
  );
  const seasonTasks = [
    ...owned.map((task) => ({
      remaining: neededTaskRemaining(task.work, task.name),
      endDay: windowEndDay(cropTaskWindows(task.crop, task.name), day) ?? day,
    })),
    ...threshSeasonTasks(state, day),
  ];
  return { toil: isToilDay(seasonTasks, pace, day), lordField };
}

/**
 * Práce bokem dne – mimo práci vsi, jen pro postavy (population.md – Práce): dojení a sýr
 * z mléka, které se nevypije (strop mléka a sýra – diet.md), a péče o zvířata (ženy); domácí
 * výroba žen (`DOMESTIC` po domácnostech a lidech) a denní minimum, které pokryli starší
 * (`eldersDailyMin`).
 */
export function asideWork(state: VillageState, day: number, eldersDailyMin: number): AsideWork {
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
export function orchardTask(
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
