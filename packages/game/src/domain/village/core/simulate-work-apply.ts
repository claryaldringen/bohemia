// Kroky dne práce po rozdělení práce vsi (`work()` v simulate-work.ts): úlohy dne v pořadí
// provedení, kovárny a pasení, společná práce (klády, stavby, opravy, pletí mužů, seč navíc,
// drobná zvěř), dílny a jízdy vozů ke kovářům.
import { smallGameDay, type SmallGameResult } from '../wildlife/small-game';
import { waresWorkDay } from '../wares/wares-work';
import { carpentryHelp, workCarpenters } from '../crafts/carpentry';
import {
  addHaulTrips,
  cartLoadRatio,
  haulCartsToday,
  hauledBy,
  haulProgress,
  type HaulPlan,
} from '../crafts/carts';
import { addCartDemand } from '../livestock/draft';
import { oreCartDrive, oreCartOffer } from '../crafts/cart-jobs';
import { dugBasketManDaysPerKg, type OreCartToday } from '../crafts/smith-supply';
import { walkPurchases } from '../crafts/craft-buying';
import { gainPractice } from '../crafts/craft-skill';
import { ironTripShares } from '../crafts/cart-iron';
import { smithBellowsToday, workCrafts, type SmithSupply } from '../crafts/crafts';
import { charcoalCarryDay, mergeCarryDays } from '../crafts/charcoal-pole';
import { mow, mowingRemaining, recordMowingLabor } from '../livestock/hay';
import { herdingDay, recordHerding } from '../livestock/herding';
import { workSlaughter } from '../livestock/livestock';
import { villageOxen } from '../livestock/oxen';
import { markThreshed, threshingFloorHaulPoints } from '../fields/threshing-floors';
import { workGrainPits } from '../fields/grain-pits';
import { threshCrop } from '../fields/threshing';
import { afterConstructions, type DayAllocation } from './labor';
import type { HaulWork } from './labor-report';
import { workOrchards } from '../buildings/orchard';
import { guestLaborToday } from '../people/people';
import { workExpeditions } from '../trade/trade';
import { CARTS, CART_JOBS } from '../rules';
import type { ChurchWork, Construction, CropWork } from '../types';
import { churchCraftWork, churchMorning, gainMasonryXp } from '../buildings/church-build';
import { seedKeepKg, takeSeed } from '../fields/seed';
import { addCropTaskWork, cropTaskDone, cropTaskRemaining, type CropTask } from './year-plan';
import { tillableRemaining } from '../fields/field-progress';
import { payWatch } from '../wildlife/wildlife-damage';
import { fortUpkeep } from '../fortification/decay';
import { build, decayEmptyDwellings, woodworkToday, type StoneCarts } from './simulate-build';
import {
  haulLogs,
  logsDemand,
  oreDemand,
  paySmithCarts,
  reachableFelling,
  taskCarryDemand,
  type CartJobsDay,
  type SmithCartsDay,
} from './simulate-hauls';
import { DayTask, EPSILON } from './simulate-plan';
import type {
  DayCartJobs,
  DayCartPlan,
  DayPeople,
  DayTaskList,
  DayTravel,
  WorkDay,
} from './simulate-work-context';

/**
 * Polní práce dne – i odkud kam došla (rozdělení práce po dílech pro postavy, labor-report.ts);
 * `amount` = postup úlohy (s vozy víc než práce vsi), `labor` = práce vsi bez honáků.
 */
export interface FieldWorkDone {
  task: CropTask;
  work: CropWork;
  before: number;
  after: number;
  amount: number;
  labor?: number;
}

/** Co dnes úlohy dne udělaly (`applyDayTasks`). */
export interface AppliedTasks {
  readonly fieldWork: FieldWorkDone[];
  readonly haulWork: HaulWork[];
  /** výmlat dne – na humnech a nouzově na udusané zemi (rozdělení práce – labor-report.ts) */
  readonly threshing: { floor: number; ground: number };
  /** práce dne na obilných jamách – u které jámy (rozdělení práce) */
  readonly grainPits: ReturnType<typeof workGrainPits>;
  readonly mowLabor: number | undefined;
  /** postup nutné seče dnes (s vozy víc, než na ni ves dala práce – svoz) */
  readonly mowWork: number;
  /** co dnes pásl dospělý (plných pasáků – diet.md, Pasáci, Dospělý pasák) */
  readonly adultHerded: number;
  readonly mowingBefore: number;
}

/** Společná práce dne – stavby, opravy, pletí mužů, seč navíc a drobná zvěř (`commonWorkDay`). */
export interface CommonWork {
  readonly corvee: ReturnType<typeof build>;
  readonly help: ReturnType<typeof carpentryHelp>;
  readonly constructions: ReturnType<typeof build>;
  readonly repairs: { dwellingId: number; manDays: number }[];
  readonly weedMen: number;
  readonly extraMow: number;
  /**
   * Práce na zboží ze zbytku práce (`waresWorkDay`; člověkodny): vybrání brtí a zpracování kůží
   * a kožešin v domácnosti – to jen z volné práce žen (`womenFreeLabor`).
   */
  readonly wares: number;
  readonly game: SmallGameResult;
}

/** Setí plodiny až po její orbě a kopání – seje se i půda zpracovaná dnes (`fieldTasks`). */
function taskApplyOrder(dayTasks: readonly DayTask[]): number[] {
  const applyOrder = dayTasks.map((_, i) => i);
  dayTasks.forEach((task, i) => {
    if (task.name !== 'sow' || !task.field) return;
    const work = task.field.work;
    let last = -1;
    dayTasks.forEach((t, j) => {
      if (t.name === 'dig' && t.field?.work === work) last = j;
    });
    if (last <= i) return;
    applyOrder.splice(applyOrder.indexOf(i), 1);
    applyOrder.splice(applyOrder.indexOf(last) + 1, 0, i);
  });
  return applyOrder;
}

/**
 * Svoz úlohy dne vozy (wagons.md – Vůz): posádka do rozdělení práce, co vozy převzaly – nejvýš
 * podíl nošení celé úlohy (carts.ts – haulAvailable); jízdy svozu do ročního provozu cest (vyjeté
 * cesty – roads.md); osivo zvlášť (wagons.md – Co vozy vozí).
 */
function recordTaskHaul(
  ctx: WorkDay,
  task: DayTask,
  labor: number,
  crew: number,
  haul: HaulPlan,
  haulWork: HaulWork[],
): void {
  const { state, cartLog } = ctx;
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
  const hauled = hauledBy(labor, haul);
  if (seed) {
    const work = task.field!.work;
    work.seedHauled = (work.seedHauled ?? 0) + hauled;
    if (work.seedReach) addHaulTrips(state, work.seedReach, hauled, 'two-wheel', cartLog);
    return;
  }
  const owner = task.field
    ? task.field.work
    : task.name === 'orchard-harvest'
      ? state.orchardWork
      : state.hay?.mowing;
  if (!owner) return;
  owner.hauled = (owner.hauled ?? 0) + hauled;
  // jízdy do ročního provozu cest po druzích vozů
  const four = haul.work > 1e-9 ? (haul.fourWork ?? 0) / haul.work : 0;
  if (owner.cartReach4 && four > 0) {
    addHaulTrips(state, owner.cartReach4, hauled * four, 'four-wheel', cartLog);
  }
  if (owner.cartReach) {
    addHaulTrips(state, owner.cartReach, hauled * (1 - four), 'two-wheel', cartLog);
  }
  // snopy jedou z pole na humno (production-chains.md – Humno) – i tam se vyjede cesta
  if (task.field?.name === 'harvest') {
    const floors = threshingFloorHaulPoints(state);
    if (floors.length > 0) {
      addHaulTrips(state, { points: floors }, hauled * four, 'four-wheel', cartLog);
      addHaulTrips(state, { points: floors }, hauled * (1 - four), 'two-wheel', cartLog);
    }
  }
}

/**
 * Úlohy dne podle rozdělení práce (`allocation.taskAmounts`) v pořadí provedení
 * (`taskApplyOrder`): svoz vozy, polní práce s osivem ze zásob, výmlat, seč, porážka, obilné
 * jámy, hlídka polí, dospělý pasák a sady; humna, na kterých se dnes mlátilo, nechátrají.
 */
export function applyDayTasks(
  ctx: WorkDay,
  tasks: DayTaskList,
  carts: DayCartPlan,
  allocation: DayAllocation,
): AppliedTasks {
  const { state, day, coverage, landscape, partsById, demand } = ctx;
  const { dayTasks, moreGrain, pitSite } = tasks;
  const { access, roadAccess, hauls } = carts;
  const fieldWork: FieldWorkDone[] = [];
  const haulWork: HaulWork[] = [];
  const threshing = { floor: 0, ground: 0 };
  let grainPits = null as ReturnType<typeof workGrainPits>;
  let mowLabor: number | undefined;
  let mowWork = 0;
  let adultHerded = 0;
  const mowingBefore = state.hay?.mowing?.done ?? 0;
  // přežívací zásoba do žní, nad kterou díly sejí z běžného zrna (`takeSeed`) – jednou za den,
  // před prvním osivem dne
  let sowKeepKg: number | null = null;
  for (const i of taskApplyOrder(dayTasks)) {
    const task = dayTasks[i]!;
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
    if (haul && crew > 0) recordTaskHaul(ctx, task, labor, crew, haul, haulWork);
    if (task.field) {
      const before = cropTaskDone(task.field.work, task.field.name);
      // seje se jen zpracovaná půda – i dnes zoraná a zkopaná, a jen vyklučená (D116)
      const done =
        task.field.name === 'sow'
          ? Math.min(amount, tillableRemaining(task.field.work, partsById, 'sow', day))
          : amount;
      addCropTaskWork(task.field.work, task.field.name, done);
      const after = cropTaskDone(task.field.work, task.field.name);
      // osivo zaseté části ze zásob v den setí (fields.md – Úroda, Osivo ze zásob)
      if (task.field.name === 'sow' && after > before) {
        sowKeepKg ??= seedKeepKg(state, day);
        takeSeed(state, task.field.work, task.field.crop, partsById, sowKeepKg);
      }
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
      mow(state, amount, day);
      mowLabor = haul ? labor - crew : labor;
      mowWork += amount;
    } else if (task.name === 'slaughter') {
      workSlaughter(state, amount);
    } else if (task.name === 'grain-pit') {
      grainPits = workGrainPits(state, day, amount, moreGrain, pitSite);
    } else if (task.name === 'watch') {
      payWatch(state, day, task.remaining, amount);
    } else if (task.name === 'herding') {
      adultHerded += amount;
    } else {
      workOrchards(state, amount);
    }
  }
  // humna, na kterých se dnes mlátilo, nechátrají (demolition.md – Chátrání humna)
  markThreshed(state, threshing.floor);
  return {
    fieldWork,
    haulWork,
    threshing,
    grainPits,
    mowLabor,
    mowWork,
    adultHerded,
    mowingBefore,
  };
}

/**
 * Po úlohách dne: uhlí a ruda ke kovářům (vozem a pěšky), měchař, pasení výrostců a lidé na
 * cestách k sousedům.
 */
export function smithHerdingTravel(
  ctx: WorkDay,
  people: DayPeople,
  cartJobs: DayCartJobs,
  jobs: CartJobsDay,
  allocation: DayAllocation,
  adultHerded: number,
): DayTravel {
  const { state, day } = ctx;
  const { resting, deliveries } = people;
  const { restingFetch } = cartJobs;
  // uhlí a ruda vozem (crafts.md – Uhlí a ruda kováře): sedlák jede z práce vsi – vozy v pořadí
  // přednosti, dokud na sedláka práce vsi zbyla; co vůz nepřiveze, donesou pěšky
  const smithCarts = paySmithCarts(jobs, allocation.carting);
  // odnos uhlí na tyči do pracujících kováren (workshops.md – Uhlíř – odnos uhlí na tyči) – syn
  // 12–13 u tyče ten den nepase ani nešlape měch
  const fetchPlans = mergeCarryDays(
    restingFetch,
    charcoalCarryDay(state, day, deliveries, smithCarts, resting, false),
  );
  const busy = new Set(fetchPlans.busy);
  // měchař u tavby (production-chains.md – Kovář): syn 10–13, který šlape měch, ten den nepase
  const bellows = smithBellowsToday(state, day, resting, busy);
  for (const helper of bellows.values()) if (helper?.kind === 'son') busy.add(helper.personId);
  // co dnes výrostci uhlídali – podle toho ves při porážce drží stádo (diet.md – Pasáci)
  const herding = herdingDay(state, day, villageOxen(state), busy);
  recordHerding(state, herding, adultHerded);
  // lidé na cestách k sousedům – podíl z rozdělení dne (trade.md – Doprava): skupiny nákupu
  // u sousedů ujdou den napřed (jdou pevně dny cesty – crafts.md, Nákup u sousedů), zbytek
  // dostanou výpravy obchodu
  const purchases = [...walkPurchases(state), ...ironTripShares(state)];
  const purchaseLabor = Math.min(
    allocation.away,
    purchases.reduce((sum, p) => sum + p.manDays, 0),
  );
  const trade = workExpeditions(state, allocation.away - purchaseLabor);
  return { smithCarts, fetchPlans, bellows, herding, purchases, trade };
}

/**
 * Vozy ze společné práce: klády ke stavbám tam, kam vůz dojede (wagons.md – Vůz) – honák
 * a nakladač ze společné práce; vozy, které jely jinam (Co vozy vozí), je nevozí; voda v sudech
 * s posádkou ve dnešním minimu. Vrací zbytek společné práce a kácení u stromů, kam vůz dojede.
 */
function commonHauls(
  ctx: WorkDay,
  carts: DayCartPlan,
  cartJobs: DayCartJobs,
  jobs: CartJobsDay,
  common: number,
  haulWork: HaulWork[],
): {
  common: number;
  fellingBefore: Map<Construction, { remaining: number; road: number }>;
} {
  const { state, day, obstacles, landscape, cartLog } = ctx;
  const { access, roadAccess } = carts;
  const { logs, logPlan } = cartJobs;
  // kácení u stromů, kam vůz dojede, před dnešní prací – co se dnes skácí, mohly odvézt vozy
  const fellingBefore = access
    ? reachableFelling(state, day, access, roadAccess, landscape, obstacles)
    : new Map<Construction, { remaining: number; road: number }>();
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
    cartLog.push({ ...water.spot, kind: water.kind, trips: water.trips });
    haulWork.push({
      job: 'water',
      manDays: water.crew,
      carts: water.carts,
      ...(water.kind === 'four-wheel' ? { four: water.carts } : {}),
      target: { kind: 'water', ...water.spot },
    });
  }
  return { common, fellingBefore };
}

/**
 * Stavby ze společné práce: robota hostů (fortifications.md – Cena a stavba, vassalage.md – Lidé
 * a robota; návrh Clauda) napřed do rozestavěného opevnění vsi (veřejná stavba, rovným dílem po
 * úsecích), co zbude, do společné práce – ostatní stavby rovným dílem, opravy obydlí, údržba valu,
 * pletí mužů a seč navíc; polní úlohy dne hosté nedělají. Tesař pomáhá stavbám (wagons.md), opravy
 * obydlí až z práce, kterou stavby nespotřebovaly, pak údržba opevnění. Vozy s kamenem (`stone` –
 * fortifications.md, Kámen, Nošení kamene a vůz) zlevní lámání staveb ze společné práce. Stavby
 * dostanou ze společné práce (`labor.common`) jen díl mužů (`labor.men` – population.md, Práce,
 * Stavby staví muži); hosté na robotě a tesař staví jako dřív. Vrací i práci, která zbude
 * (`freeLabor`).
 */
function buildDay(
  ctx: WorkDay,
  carts: DayCartPlan,
  people: DayPeople,
  labor: { common: number; men: number },
  fellingBefore: Map<Construction, { remaining: number; road: number }>,
  stone: StoneCarts,
): Omit<CommonWork, 'weedMen' | 'extraMow' | 'wares' | 'game'> & { freeLabor: number } {
  const { state, day, coverage, landscape, daylight, demand } = ctx;
  const { access } = carts;
  const { households, repairNeeds, repairNeed, productivity, resting } = people;
  let { common, men } = labor;
  // kostely (churches.md – Stavba): vypálené vápno ráno, hotová práce před stavbami pro zkušenost
  // pomocníků; ves bez kostela nic
  const churchesBefore = churchSitesBefore(state, day);
  const guestLabor = guestLaborToday(state, day) * daylight;
  const corvee = guestLabor > EPSILON ? build(state, day, guestLabor, 0, 'fortification') : [];
  if (guestLabor > EPSILON) {
    const guestsLeft = Math.max(0, guestLabor - corvee.reduce((sum, c) => sum + c.manDays, 0));
    common += guestsLeft;
    men += guestsLeft;
  }
  // tesař pomáhá stavbám – jeho práce jde do staveb a zlevní jejich dřevěnou část (wagons.md)
  const help = carpentryHelp(state, day, coverage, productivity, resting, (extra) =>
    woodworkToday(state, day, men + extra, stone),
  );
  const constructions = build(state, day, men + help.labor, help.coverage, undefined, stone);
  // vůz s kamenem jede po trase lom – stavba a zpět: jízdy do ročního provozu cest (wagons.md –
  // Vyjeté cesty; konec uložené trasy stavby `stoneCart`)
  for (const work of constructions) {
    const drive = work.construction.stoneCart;
    const trips = work.quarry?.trips ?? 0;
    if (drive && trips > EPSILON)
      ctx.cartLog.push({ x: drive.x, z: drive.z, kind: 'two-wheel', trips });
  }
  if (churchesBefore) {
    gainMasonryXp(state, churchCraftWork(state, churchesBefore), day, people.villagers);
  }
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
  // údržba opevnění po úsecích hned po opravách obydlí, ze zbytku společné práce (fortifications.md – Životnost
  // a oprava); ves bez opevnění nic nespotřebuje
  const upkeep = fortUpkeep(state, afterBuild.left, landscape).used;
  const freeLabor = afterBuild.left - upkeep;
  const repairs = households.map((d, i) => {
    const need = repairNeeds[i] ?? 0;
    const manDays = repairNeed > 0 ? (afterBuild.repairs * need) / repairNeed : 0;
    return { dwellingId: d.id, manDays };
  });
  decayEmptyDwellings(state, day, new Set(households.map((d) => d.id)));
  return { corvee, help, constructions, repairs, freeLabor };
}

/**
 * Ráno staveniště kostelů (`churchMorning`) a jejich hotová práce před stavbami dne (podle id
 * stavby); ves bez kostela null a stav nemění.
 */
function churchSitesBefore(
  state: WorkDay['state'],
  day: number,
): Map<number, Partial<Record<ChurchWork, number>>> | null {
  if (!state.constructions.some((c) => c.church)) return null;
  churchMorning(state, day);
  const before = new Map<number, Partial<Record<ChurchWork, number>>>();
  for (const c of state.constructions) if (c.church) before.set(c.id, { ...c.church.done });
  return before;
}

/**
 * Práce, která zbude po stavbách, opravách obydlí a údržbě opevnění: pletí mužů (fields.md –
 * Pletí jednou a rychle; Martin 9. 11. 2026: „pletí obstarají ženy a děti“) – co děti a ženy do
 * konce okna nestihnou; seč navíc pro růst stád (oxen.md – Seno, dvě seče; Martin 19. 10. 2026:
 * „pokud se něco staví, tak čas věnují primárně té stavbě“) – pěšky, bez vozů, co nestihne do
 * konce okna, zůstane neposečené; domácnosti ze zbytku zpracují kůže a kožešiny (hides-honey.md –
 * Zpracování v domácnosti; i v hladu) – jen z volné práce žen `women` (`womenFreeLabor`) – a
 * nehladovějící ves chytá ryby a zajíce z toho, co zbude.
 */
function freeLaborDay(
  ctx: WorkDay,
  tasks: DayTaskList,
  allocation: DayAllocation,
  fieldWork: FieldWorkDone[],
  labor: { free: number; women: number | undefined },
  game: SmallGameResult,
): { weedMen: number; extraMow: number; wares: number; game: SmallGameResult } {
  const { free: freeLabor, women } = labor;
  const { state, day } = ctx;
  const { dayTasks } = tasks;
  let weedMen = 0;
  for (const { index, manDays } of allocation.menWeed ?? []) {
    const field = dayTasks[index]?.field;
    if (!field) continue;
    const wanted = Math.min(manDays, freeLabor - weedMen, cropTaskRemaining(field.work, 'weed'));
    if (wanted <= EPSILON) continue;
    const before = cropTaskDone(field.work, 'weed');
    addCropTaskWork(field.work, 'weed', wanted);
    const after = cropTaskDone(field.work, 'weed');
    fieldWork.push({ task: 'weed', work: field.work, before, after, amount: after - before });
    weedMen += after - before;
  }
  const extraMow = Math.max(0, Math.min(freeLabor - weedMen, mowingRemaining(state, day)));
  if (extraMow > EPSILON) mow(state, extraMow, day);
  const rest = freeLabor - weedMen - extraMow;
  const wares = waresWorkDay(state, day, rest, ctx.landscape, women);
  if (!state.hungry) {
    game = smallGameDay(state, day, rest - wares);
  }
  return { weedMen, extraMow, wares, game };
}

/**
 * Společná práce dne (`allocation.common`): volná práce na seč do stád příštího roku, vozy
 * (`commonHauls`), drobná zvěř hladovějící vsi, stavby a opravy (`buildDay`) a práce, která
 * zbude (`freeLaborDay`).
 */
export function commonWorkDay(
  ctx: WorkDay,
  tasks: DayTaskList,
  carts: DayCartPlan,
  people: DayPeople,
  cartJobs: DayCartJobs,
  jobs: CartJobsDay,
  allocation: DayAllocation,
  applied: AppliedTasks,
): CommonWork {
  const { state, day, coverage } = ctx;
  // volná práce na seč (oxen.md – Stáda podle práce na seč): co po polních pracích zbylo – nutná
  // seč a společná práce (stavby, opravy, pletí mužů a seč navíc, nevyužitá) – podle ní ves
  // příští rok drží stáda; pletí mužů po stavbách ji nezmenší
  recordMowingLabor(state, day, applied.mowWork + allocation.common, coverage.tools);
  const hauled = commonHauls(ctx, carts, cartJobs, jobs, allocation.common, applied.haulWork);
  let common = hauled.common;
  // hladovějící ves chytá ryby a zajíce hned za polními úlohami, před stavbami (wildlife.md –
  // Drobná zvěř a ryby); jinak až ze zbytku práce po pletí mužů a seči navíc (`freeLaborDay`)
  let game: SmallGameResult = { manDays: 0, shares: [] };
  if (state.hungry) {
    game = smallGameDay(state, day, common);
    common -= game.manDays;
  }
  const stone = new Map(jobs.stone.map((cart) => [cart.constructionId, cart]));
  // stavby staví muži (population.md – Práce, Stavby staví muži): vozy s kládami a drobná zvěř
  // hladové vsi berou ze společné práce jako dřív, stavbám zbude nejvýš díl mužů (`build`)
  const menBuild = Math.min(common, allocation.build ?? allocation.common);
  const { freeLabor, ...built } = buildDay(
    ctx,
    carts,
    people,
    { common, men: menBuild },
    hauled.fellingBefore,
    stone,
  );
  const women = womenFreeLabor(people, allocation, common - menBuild);
  const free = freeLaborDay(
    ctx,
    tasks,
    allocation,
    applied.fieldWork,
    { free: freeLabor, women },
    game,
  );
  return { ...built, ...free };
}

/**
 * Volná práce žen po jejich denních úlohách (population.md – Práce, Stavby staví muži; Martin
 * 14. 11. 2026: „domácí zpracování kůže měly na starosti spíš ženy“) – jen z ní domácnosti
 * zpracují kůže a kožešiny (`waresWorkDay`). Je to díl společné práce, který na stavby nejde
 * (`notBuild` = `common − build` po vozech s kládami a drobné zvěři hladové vsi): ženy nesou napřed
 * denní minimum a úlohy dne (`allocateDay`). Opravy obydlí, údržba opevnění, pletí mužů, seč navíc
 * a brtě berou napřed ze zbytku práce mužů (návrh Clauda) – zpracování dostane nejvýš tenhle díl
 * a nejvýš to, co ze zbytku zbude. Bez pohlaví (vsi před příbuzenstvím – `withKinship`) nebo bez
 * dílu mužů (`build`) undefined – zpracování bere jako dřív z celého zbytku.
 */
function womenFreeLabor(
  people: DayPeople,
  allocation: DayAllocation,
  notBuild: number,
): number | undefined {
  if (allocation.build === undefined) return undefined;
  if (!people.villagers.some((p) => p.sex !== undefined)) return undefined;
  return Math.max(0, notBuild);
}

/**
 * Dílny dne (crafts.md): řemeslníci a tesaři s uhlím, rudou a hlínou (pěšky i vozem), poptávka
 * vozů dne a praxe řemeslníků a učňů (crafts.md – Učení řemesla). Vrací práci dílen.
 */
export function craftsDay(
  ctx: WorkDay,
  carts: DayCartPlan,
  people: DayPeople,
  cartJobs: DayCartJobs,
  travel: DayTravel,
  help: CommonWork['help'],
): ReturnType<typeof workCrafts> {
  const { state, day, obstacles, coverage, landscape, demand, drivesOf } = ctx;
  const { access, ploughing } = carts;
  const { burners, resting, crafts, travelling, productivity } = people;
  const { restingFetch } = cartJobs;
  const { fetchPlans, bellows, smithCarts } = travel;
  const supply: SmithSupply = {
    carry: fetchPlans,
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
  // jejichž kovář nebo syn nesl s uhlířem uhlí na tyči, i když kovář pracoval se vsí
  const carried = new Set(
    restingFetch.pairs.filter((p) => p.partner.kind !== 'burner-son').map((p) => p.smithId),
  );
  if (crafts.size > 0 || carried.size > 0) {
    gainPractice(state, day, crafts, carried, travelling);
  }
  return workshops;
}

/**
 * Uhlí a ruda vozem – sedlák ze společné práce, jízdy do ročního provozu cest (wagons.md – Co
 * vozy vozí, crafts.md – Uhlí a ruda kováře).
 */
export function smithCartTrips(
  ctx: WorkDay,
  smithCarts: SmithCartsDay,
  haulWork: HaulWork[],
): void {
  const { cartLog } = ctx;
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
}
