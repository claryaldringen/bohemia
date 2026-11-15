// Kroky dne práce před rozdělením práce vsi (`work()` v simulate-work.ts): vozy dne, kdo dnes
// pracuje se vsí a jízdy vozů domluvené předem.
import {
  NO_HAUL,
  cartFleetToday,
  fleetCarts,
  villageCartAccess,
  type HaulPlan,
} from '../crafts/carts';
import { charcoalDeliveries } from '../crafts/smith-supply';
import { charcoalCarryDay } from '../crafts/charcoal-pole';
import {
  burnerDraws,
  burnerPlans,
  craftHouseholds,
  ironTravellers,
  migrateBurners,
  restingCrafters,
} from '../crafts/crafts';
import { restingCarpenters } from '../crafts/carpentry';
import { harvestHandsDay } from '../fields/harvest-hands';
import { dayChores } from './day-chores';
import { manorLabor, trainingFamily } from '../people/lord';
import { repairNeedPerDay } from '../buildings/dwellings';
import { fireFighting } from '../disasters/firefighting';
import { raidHiding } from '../fortification/state/raid-day';
import { villagersToday } from './morning-water';
import { householdWater } from './labor';
import {
  NO_CART_JOBS,
  jobsDemand,
  logHaulCandidates,
  logHaulPlan,
  planCartJobs,
  planTaskHauls,
} from './simulate-hauls';
import { DayTask, occupiedDwellings, villageProductivity } from './simulate-plan';
import type {
  DayCartJobs,
  DayCartPlan,
  DayPeople,
  DayTaskList,
  WorkDay,
} from './simulate-work-context';

/**
 * Vozy dne (wagons.md – Vůz): dvoukoláky s volem, který dnes neorá, vozí snopy a seno tam, kam
 * dojedou – převezmou kus nošení a jde s nimi honák a nakladač (úloha pak chce méně práce); ve
 * dny orby jdou páry napřed k rádlům, vozy táhne zbytek volů (oxen.md – Voli se sdílí).
 */
export function dayCartPlan(ctx: WorkDay, tasks: DayTaskList, afield: boolean): DayCartPlan {
  const { state, day, obstacles, coverage, landscape } = ctx;
  const { owned, dayTasks } = tasks;
  const ploughing = owned.some((task) => task.name === 'plough');
  // spřežení na poli zůstává u rádla i v den bez orby (oxen.md – Spřežení zůstane na poli)
  const fleet = cartFleetToday(state, day, ploughing || afield);
  // dosah vozů má ves s hotovou ohradou volů i bez vozů – měří, co by dnes vozy ušetřily
  // (wagons.md – Kolik vozů ves chce): nošení, které dnes opravdu proběhlo, a jízdy pro uhlí, rudu
  // a vodu; čtyřkolák po louce a strništi, na zoraný díl ne (wagons.md – Co se vozí a na čem) –
  // bez krajiny (kalibrace) nikam
  const access = villageCartAccess(state, day, landscape, obstacles);
  const roadAccess =
    access && landscape ? villageCartAccess(state, day, landscape, obstacles, 'four-wheel') : null;
  const fourAccess = fleet['four-wheel'] > 0 ? roadAccess : null;
  const hauls = new Map<DayTask, HaulPlan>();
  if (access) {
    planTaskHauls(state, dayTasks, hauls, fleet, access, fourAccess, coverage, landscape);
  }
  return { ploughing, fleet, access, roadAccess, fourAccess, hauls };
}

/**
 * Kdo dnes pracuje se vsí: obydlí a jejich opravy, řemeslníci bez práce v dílně, uhlíři, rodina
 * vojvody, skladba dne a voda domácností, uhlí ke kováři.
 */
export function dayPeople(ctx: WorkDay): DayPeople {
  const { state, day, obstacles, coverage, landscape } = ctx;
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
  // v den požáru hasí i řemeslníci – dílny dnes stojí (disasters.md – Hašení)
  // uhlíř hasí taky: milíř ten den stojí bez dozoru (pálení se o den odloží, nic se nezkazí),
  // proto se zruší i plán dne (vytahání uhlí, začátek milíře) – návrh Clauda
  // v den nájezdu se skrývají všichni – dílny a milíře stojí jako při požáru (war.md – Ves během
  // nájezdu nepracuje)
  if (fireFighting(state, day) || raidHiding(state, day)) {
    burners.clear();
    for (const d of state.dwellings) if (d.workshop) resting.set(d.id, 'resting');
  }
  const crafts = craftHouseholds(state, resting);
  // kdo jde pro kování k vozu, ve vsi ani v dílně nepracuje (wagons.md – Kování vozů)
  const travelling = ironTravellers(state);
  // vojvodova rodina (lord.md – Den rodiny): když cvičí, je mimo práci vsi jako dílny – vojvoda,
  // jeho synové a ženy rodiny; ostatní v dvorci (zeť) pracují se vsí. Denní minimum dvorce kryje
  // rodina (`manorLabor`), proto domácnost dvorce v minimu vsi chybí
  // režim výcviku se rozhodl na začátku dne (`updateLordTraining` v `simulateDay`) – všichni
  // čtenáři dne (pasení, výběr dílů, nákupy, práce) vidí týž stav
  // kdo pracuje se vsí a chůze pro vodu – týž výběr jako scéna (`villagersToday`)
  const family = trainingFamily(state, day);
  const { villagers, manorSkip } = villagersToday(state, day, crafts);
  // skladba dne podle období (population.md – Skladba dne podle ročního období): ve žních
  // poloviční minimum a voda na pole, v zimě dříví, se sněhem bez vody
  const harvestDay = harvestHandsDay(state, day);
  const chores = dayChores(state, day, harvestDay);
  const waterNeeds = householdWater(villagers, state.dwellings, manorSkip, chores);
  const manor = family
    ? manorLabor(state, day, coverage.pottery, productivity, family, chores)
    : null;
  // uhlí ke kováři (crafts.md – Uhlí a ruda kováře): co dnes uhlíři vytahají z vypálených milířů
  // a do které kovárny se to nese
  const deliveries = charcoalDeliveries(
    state,
    burnerDraws(state, day, coverage, productivity, burners),
    landscape,
  );
  return {
    households,
    repairNeeds,
    repairNeed,
    productivity,
    burners,
    resting,
    crafts,
    travelling,
    family,
    villagers,
    manorSkip,
    harvestDay,
    chores,
    waterNeeds,
    manor,
    deliveries,
  };
}

/**
 * Jízdy vozů domluvené před rozdělením práce: poptávka jízd dne, klády ke stavbám, uhlí, ruda,
 * osivo a voda zbylými vozy, a uhlí ke kováři, který dnes pracuje se vsí.
 */
export function dayCartJobs(
  ctx: WorkDay,
  tasks: DayTaskList,
  carts: DayCartPlan,
  people: DayPeople,
): DayCartJobs {
  const { state, day, obstacles, landscape, demand, drivesOf, drives4Of } = ctx;
  const { dayTasks } = tasks;
  const { fleet, access, fourAccess, hauls } = carts;
  const { resting, waterNeeds, deliveries } = people;
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
  // kovář, který dnes pracuje se vsí (plná zásoba nástrojů), a přesto mu uhlíř vytahal uhlí – když
  // uhlíř nemá syna, nese s ním kovář nebo jeho syn od 14 let svou polovinu z práce vsi
  // (workshops.md – Uhlíř – odnos uhlí na tyči)
  const restingFetch = charcoalCarryDay(state, day, deliveries, jobs, resting, true);
  const restingCarry = [...restingFetch.smiths.values()].reduce((sum, m) => sum + m, 0);
  return { logs, logPlan, jobs, restingFetch, restingCarry };
}
