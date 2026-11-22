// Práce dne – polní úlohy v pořadí a `work()` s rozdělením práce vsi; `work()` skládá kroky dne
// v pevném pořadí (simulate-work-people.ts před rozdělením práce, simulate-work-apply.ts po něm).
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import type { Landscape, ObstacleLayer } from '../../landscape';
import { teamsHomeShare } from '../crafts/carts';
import { flushCartTrips, villageCartDrives, type CartDrives } from '../crafts/cart-jobs';
import { purchaseTravelers } from '../crafts/craft-buying';
import { ironTripHelpers } from '../crafts/cart-iron';
import { craftHarvestLabor, craftLightLabor } from '../crafts/crafts';
import { harvestHelperLabor, weedingChildren } from '../fields/harvest-hands';
import { daylightFactor } from './daylight';
import {
  lordApartIds,
  lordDayCounts,
  lordFieldSharesToday,
  NO_LORD_FIELD,
  type LordFieldShares,
} from '../people/lord';
import { nextYearlyCommonLabor, yearlyCommonLabor } from '../buildings/dwellings';
import { animalCareNeed, dailyMilk } from '../livestock/dairy';
import { villageFoodNeed } from './diet';
import {
  ploughDayFactor,
  ploughTeamsAfield,
  settlePloughTeams,
  type PloughTravels,
} from '../livestock/plough-trip';
import { isToilDay, windowEndDay } from '../people/happiness';
import { mowingCut, mowingNeededRemaining } from '../livestock/hay';
import { adultHerding } from '../livestock/herding';
import { horseCareLabor, villageHorses } from '../livestock/horses';
import { finishShoeing, planShoeing } from '../livestock/horse-shoeing';
import {
  slaughterRemaining,
  villageChickens,
  villageDams,
  villageHerds,
} from '../livestock/livestock';
import { ploughCapacityPerDay, ploughPairsHome, villageOxen } from '../livestock/oxen';
import { morningWater, ploughWindowsToday } from './morning-water';
import { grainPitTask } from '../fields/grain-pits';
import { chooseGrainPitSite } from '../fields/grain-pit-site';
import {
  canThresh,
  villageSheaves,
  threshForFoodKg,
  threshSeasonTasks,
  threshTasks,
} from '../fields/threshing';
import { allocateDay, type DayAllocation, householdElders, type LaborTaskName } from './labor';
import { laborDay, type AsideWork } from './labor-report';
import { ORCHARD_TASK_NAMES, orchardWorkRemaining } from '../buildings/orchard';
import { laborPerDay } from '../people/people';
import { expeditionLaborToday } from '../trade/trade';
import {
  DRAFT_OXEN,
  COMMON_LABOR_HISTORY_DAYS,
  CROP_ORDER,
  DAY_WORK_ORDER,
  DOMESTIC,
  GRAIN_PITS,
  HARVEST_DAY,
  LATE_HARVEST_DAY,
  ORCHARD_WINDOWS,
  WEEDING_CHILDREN,
  WINTER_THRESH_WINDOW,
  type DayWorkGroup,
} from '../rules';
import type { CraftCoverage, Crop, CropWork, FieldPart, SeedKg, VillageState } from '../types';
import {
  seedKeepKg,
  seedPrepShares,
  seedSowCap,
  seedThreshKg,
  seedUseKg,
  seedStore,
  sowableSeedKg,
  uneatenSeedKg,
} from '../fields/seed';
import {
  TASK_ORDER,
  activeTasks,
  cropTaskDone,
  cropTaskRemaining,
  cropTaskWindows,
  lateSpringCrop,
  ploughRemaining,
  seasonCrop,
  seasonCrops,
  sowPerTill,
  windowEndOf,
  type CropTask,
  springCrop,
  withOnceWeedingRates,
  withoutWinterWeeding,
} from './year-plan';
import { watchWanted } from '../wildlife/wildlife-damage';
import { bestWaterPlan, type CartJobsDay } from './simulate-hauls';
import { DayTask, EPSILON, FieldTaskEntry, householdCount } from './simulate-plan';
import { WEATHER_EFFECTS } from '../rules/rules-disasters';
import { springSowingExtended, springSowingHeld } from '../disasters/weather-effects';
import { partsByIdOf } from './parts-by-id';
import type {
  DayCartJobs,
  DayCartPlan,
  DayPeople,
  DayTaskList,
  DayTravel,
  PloughDay,
  WorkDay,
} from './simulate-work-context';
import { dayCartJobs, dayCartPlan, dayPeople } from './simulate-work-people';
import {
  applyDayTasks,
  commonWorkDay,
  craftsDay,
  smithCartTrips,
  smithHerdingTravel,
  type AppliedTasks,
  type CommonWork,
} from './simulate-work-apply';

/**
 * Polní úlohy dne: práce všech dílů letošní práce po plodinách (bez výmlatu – ten mlátí snopy, `threshTasks`), orba
 * rádlem v oknech kopání (spřežení zvládnou nejvýš `ploughCap` člověkodní za den – oxen.md).
 * Nejbližší konec okna první, při shodě ozim před jaří a pořadí úloh (TASK_ORDER; orba před
 * kopáním, setí zpracované půdy před vracením přílohu). Setí týž den hned za orbou a motykou (fields.md – Práce; Martin 9. 11. 2026: „Setí by
 * mělo probíhat ihned po orbě. Za oráčem by měl jít někdo z rodiny a rovnou zasívat“): úloha setí
 * nese jen zpracovanou půdu do včerejška, orba a kopání nesou setí za sebou (`sowRatio` – kolik
 * dovolí osivo).
 */
export function fieldTasks(
  state: VillageState,
  day: number,
  ploughCap: number,
  ploughFactor: (work: CropWork) => number = () => 1,
): FieldTaskEntry[] {
  const month = dateOfDayIndex(day).month;
  const entries: FieldTaskEntry[] = [];
  // setí jen na tolik dílů, na kolik má ves osivo (fields.md – Úroda, Osivo ze zásob)
  let seed: { byId: ReadonlyMap<number, FieldPart>; sowable: SeedKg } | null = null;
  const seedCap = (crop: Crop, work: CropWork, wanted: number): number => {
    if (work.seedKg === undefined || wanted <= 0) return wanted;
    if (!seed) {
      const keep = seedKeepKg(state, day);
      seed = {
        byId: partsByIdOf(state.parts),
        sowable: {
          grain: sowableSeedKg(state, 'grain', keep),
          legumes: sowableSeedKg(state, 'legumes', keep),
        },
      };
    }
    const allowed = Math.min(wanted, seedSowCap(work, crop, seed.byId, seed.sowable));
    // osivo, které tato plodina dnes vezme, další plodiny téhož dne už nedostanou
    const store = seedStore(crop);
    if (store !== null && allowed > 0) {
      seed.sowable[store] -= seedUseKg(work, crop, seed.byId, allowed, seed.sowable[store]);
    }
    return allowed;
  };
  const add = (crop: Crop, work: CropWork, name: CropTask): void => {
    const windowEnd =
      windowEndOf(cropTaskWindows(crop, name), month) ??
      (name === 'sow' && springSowingExtended(state, day, crop) ? month : null);
    if (windowEnd === null) return;
    // setí zorané a zkopané půdy do včerejška před vracením přílohu téže plodiny – co je zorané,
    // se v okně zaseje, klučení je práce na později (fields.md – Pořadí důležitosti polních
    // prací; D110, Martin 22. 11. 2026: „vyprodukovat co nejvíce za co nejmenší množství práce“)
    const order =
      name === 'sow'
        ? -0.5
        : TASK_ORDER.indexOf(name === 'plough' ? 'dig' : name) - (name === 'plough' ? 0.5 : 0);
    // trhání lnu jde za žněmi obilí skupinou dne (`dayTaskOrder` – DAY_WORK_ORDER)
    const end = windowEnd;
    const rank = CROP_ORDER.indexOf(crop) * TASK_ORDER.length + order;
    let remaining = cropTaskRemaining(work, name);
    // příprava půdy jaře jen na díly, na které je osivo (`seedPrepShares`)
    const prep =
      name === 'sow' || name === 'weed' || name === 'harvest' ? undefined : prepShares?.get(work);
    if (prep !== undefined && remaining > 0) {
      const required = name === 'plough' ? (work.plough?.required ?? 0) : work.required[name];
      remaining = Math.min(remaining, Math.max(0, prep * required - cropTaskDone(work, name)));
    }
    // setí i bez zpracované půdy do včerejška – může jít za dnešní orbou a motykou
    const sowing = name === 'sow' && work.done.sow < work.required.sow - EPSILON;
    if (remaining > 0 || sowing) entries.push({ name, crop, remaining, work, end, rank });
  };
  // jarní okno setí: příprava jaře, luštěnin a lnu jen na díly s osivem (oprava, návrh Clauda
  // 2. 11. 2026 – fields.md, Osivo ze zásob)
  const prepShares =
    state.season !== null && month >= 3 && month <= 4
      ? seedPrepShares(state, day, partsByIdOf(state.parts))
      : null;
  if (state.season !== null) {
    for (const { crop, work } of seasonCrops(state.season)) {
      // dlouhá zima drží setí jařin do 22. 3. (disasters.md – Zima)
      const held = springSowingHeld(state, day, crop);
      const names = activeTasks(work, day, crop, springSowingExtended(state, day, crop));
      // setí za orbou a motykou i bez zpracované půdy do včerejška
      if (!names.includes('sow') && cropTaskRemaining(work, 'dig') + ploughRemaining(work) > 0) {
        names.push('sow');
      }
      for (const name of names) {
        if (name !== 'thresh' && !(held && name === 'sow')) add(crop, work, name);
      }
      if (cropTaskRemaining(work, 'plough') > 0) add(crop, work, 'plough');
    }
  }
  // v září žeň jaře, kterou srpen nedosklidil (fields.md – Žeň jaře i v září)
  const late = lateSpringCrop(state);
  if (
    state.season !== null &&
    late &&
    activeTasks(late, day, 'spring', false, true).includes('harvest')
  ) {
    add('spring', late, 'harvest');
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
  // setí: zpracovaná půda do včerejška a setí za dnešní orbou a motykou, kolik dovolí osivo
  for (const entry of entries) {
    if (entry.name !== 'sow') continue;
    const tillage = (name: CropTask): FieldTaskEntry | undefined =>
      entries.find((e) => e.work === entry.work && e.name === name && e.remaining > 0);
    const plough = tillage('plough');
    const dig = tillage('dig');
    const per = sowPerTill(entry.work);
    const behind = per.plough * (plough?.remaining ?? 0) + per.dig * (dig?.remaining ?? 0);
    const allowed = seedCap(entry.crop, entry.work, entry.remaining + behind);
    const backlog = Math.min(entry.remaining, allowed);
    const share = behind > EPSILON ? (allowed - backlog) / behind : 0;
    entry.remaining = backlog;
    if (share <= EPSILON) continue;
    if (plough && per.plough > 0) plough.sowRatio = per.plough * share;
    if (dig && per.dig > 0) dig.sowRatio = per.dig * share;
  }
  return entries.filter(
    (e) =>
      e.remaining > 0 ||
      (e.name === 'sow' &&
        entries.some((t) => t.work === e.work && (t.sowRatio ?? 0) > 0 && t.remaining > 0)),
  );
}

/**
 * Úloha je trhání lnu – z obecné práce jde za žněmi obilí (`DAY_WORK_ORDER`; fields.md – Len, Martin
 * 9. 11. 2026: „Sklízí se v srpnu, ale obilí má vždy absolutní přednost“), ženy a děti ale trhají
 * napřed (`womenFirst` – Martin 10. 11. 2026), a dřinu nepřidá.
 */
function flaxHarvest(crop: Crop, name: CropTask): boolean {
  return crop === 'flax' && name === 'harvest';
}

/**
 * Čeká ves letos ještě na žeň obilí (plán letošního roku jař, nebo ozim žatý i v srpnu – fields.md,
 * Žně i v srpnu – nesklidil, do HARVEST_DAY; v září jař, kterou srpen nedosklidil – Žeň jaře
 * i v září)? Pak přijde další vymlácené zrno a neúplná obilná jáma počká (production-chains.md –
 * Obilné jámy).
 */
export function springHarvestAhead(state: VillageState, month: number): boolean {
  if (month === LATE_HARVEST_DAY.month && lateSpringCrop(state)) return true;
  const plan = state.season;
  if (!plan || month > HARVEST_DAY.month) return false;
  const ahead = (work: CropWork | undefined): boolean =>
    work !== undefined && work.harvestedKg === null && work.partIds.length > 0;
  return ahead(springCrop(plan)) || ahead(seasonCrop(plan, 'winter'));
}

/** Pořadí výmlatu za všemi polními úlohami všech plodin (shoda konce okna ve skupině dne). */
export const THRESH_RANK = CROP_ORDER.length * TASK_ORDER.length;

/**
 * Orba dne nejvýš `teamDays` dní rádel (wagons.md – Voda ráno ve dny orby; mutuje úlohy a jejich
 * polní záznamy): v pořadí úloh dne, výkon dílu zůstává.
 */
function cutPlough(tasks: readonly DayTask[], teamDays: number): void {
  let left = Math.max(0, teamDays);
  for (const task of tasks) {
    const field = task.field;
    if (task.name !== 'plough' || !field || (field.teamDays ?? 0) <= EPSILON) continue;
    const factor = task.remaining / field.teamDays!;
    const days = Math.min(field.teamDays!, left);
    left -= days;
    task.remaining = days * factor;
    field.remaining = task.remaining;
    field.teamDays = days;
  }
}

/**
 * Kolik zrna se dnes vymlátí napřed na jídlo (`threshForFoodKg`) – jen ze zrna, které ves jí: bez
 * hromady osiva okna a osiva jen na setí (fields.md – Osivo bez cíle osevu). Hromada smí držet
 * všechno vymlácené zrno; jídlo dne se pak vymlátí ze snopů napřed.
 */
export function threshForFoodToday(state: VillageState, day: number): number {
  const edible = { storesKg: state.storesKg - uneatenSeedKg(state) };
  return threshForFoodKg(edible, villageFoodNeed(state, day));
}

/** Skupina úlohy dne podle druhu práce (`DAY_WORK_ORDER`). */
export function dayWorkGroup(task: DayTask): DayWorkGroup {
  if (task.thresh) {
    return task.thresh.urgent ? 'food-thresh' : task.thresh.seed ? 'seed-thresh' : 'thresh';
  }
  const crop = task.field?.crop;
  switch (task.name) {
    case 'harvest':
      return crop === 'flax' ? 'flax-harvest' : 'grain-harvest';
    case 'weed':
      return 'weeding';
    case 'reclaim':
    case 'dig':
    case 'plough':
    case 'sow':
      return 'tillage';
    case 'thresh':
      return 'thresh';
    case 'mow':
      return task.aftermath ? 'aftermath' : 'hay';
    case 'orchard-harvest':
      return 'apples';
    case 'orchard-care':
      return 'orchard-care';
    case 'slaughter':
      return 'slaughter';
    case 'watch':
      return 'watch';
    case 'grain-pit':
      return 'grain-pit';
    case 'herding':
      return 'herding';
  }
}

/**
 * Pořadí úloh dne v rozdělení práce (fields.md – Pořadí důležitosti polních prací a výmlat do
 * zimy; Martin 9. 11. 2026: „Je lepší za každou cenu sklidit to, co už vyrostlo, než začínat
 * pěstování úplně od začátku“): napřed skupina úlohy (`DAY_WORK_ORDER` – výmlat na dnešní jídlo,
 * žeň obilí, trhání lnu, nutná 1. seč, nutná otava, porážka, jablka, pletí, výmlat na osivo,
 * příprava půdy a setí, péče o sad, hlídka polí, výmlat, obilné jámy, dospělý pasák), v přípravě
 * půdy orba rádlem první (oxen.md – Orba má přednost; Martin 24. 10. 2026: „Co může být
 * přednějšího než orba?“ – spřežení potřebuje jen oráče, jinak voli stojí), pak nejbližší konec
 * okna, přednost (`tie`) a pořadí úloh.
 */
export function dayTaskOrder(a: DayTask, b: DayTask): number {
  const group = (t: DayTask): number => DAY_WORK_ORDER.indexOf(dayWorkGroup(t));
  const plough = (t: DayTask): number => (t.name === 'plough' ? 0 : 1);
  return (
    group(a) - group(b) ||
    plough(a) - plough(b) ||
    a.end - b.end ||
    a.tie - b.tie ||
    a.rank - b.rank
  );
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
 * nebere (rozdělení práce je má jen pro postavy – `LaborDay.aside`). Cvičící vojvodova rodina
 * je mimo práci vsi (lord.md – Den rodiny), na pole jde jen ve žních a s přípravou půdy a setím,
 * které ves sama nestíhá (zásobníky `lordHelp`, `lordSowing`), a v zimě s výmlatem. Všechna polní
 * práce má přednost před stavbami
 * (fields.md – Osevní postup po dílech, bod 3; Martin 9. 11. 2026: „Setí – to přece obstará pár
 * mužů s voly a ženy, pletí obstarají ženy a děti. Na sklizni se pak podílejí úplně všichni“) –
 * stavby dostanou, co zbude; muži plejí jen, co ženy a děti nestihnou, a až po stavbách.
 * Vrací, jestli ves dnes nestíhá polní práce v období (dřina), a podíly dne skupin rodiny na poli
 * z práce, kterou dnes úlohy spotřebovaly (`lordFieldShares` – ženy, muži, vojvoda; `trainLordDay`).
 */
export function work(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
  waiting: ReadonlySet<Crop> = new Set(),
): { toil: boolean; lordField: LordFieldShares } {
  // kroky dne v pevném pořadí (village-core.md – Pořadí práce dne): každý krok čte, co spočetly
  // kroky před ním, a mutuje stav jako dřív jedna funkce – stejné losy i pořadí klíčů
  const ctx = startWorkDay(state, day, obstacles, coverage, landscape, waiting);
  // 1. úlohy dne v pořadí důležitosti (DAY_WORK_ORDER)
  const plough = ploughDay(ctx);
  const tasks = dayTaskList(ctx, plough);
  // 2. vozy, lidé a jízdy domluvené předem
  const carts = dayCartPlan(ctx, tasks, plough.afield);
  const people = dayPeople(ctx);
  const cartJobs = dayCartJobs(ctx, tasks, carts, people);
  // 3. rozdělení práce vsi, voda ráno ve dny orby, péče o koně a kování
  const labor = dayLabor(ctx, tasks, people, cartJobs);
  const { jobs, allocation } = morningWaterDay(
    ctx,
    plough,
    tasks,
    carts,
    people,
    cartJobs.jobs,
    labor.allocate(cartJobs.jobs),
    labor.allocate,
  );
  horseCareDay(ctx, labor, allocation);
  // 4. úlohy dne, kovárny, pasení a cesty, společná práce
  const applied = applyDayTasks(ctx, tasks, carts, allocation);
  const travel = smithHerdingTravel(ctx, people, cartJobs, jobs, allocation, applied.adultHerded);
  const common = commonWorkDay(ctx, tasks, carts, people, cartJobs, jobs, allocation, applied);
  // 5. večer: spřežení, které dnes vyjelo a oralo, je u bloku; po zorání okna zpět do ohrady
  settlePloughTeams(state, day, plough.travels, plough.teamsCap <= EPSILON, waiting);
  // 6. dílny, jízdy ke kovářům a všechny jízdy dne do provozu cest na jednom místě (wagons.md)
  const workshops = craftsDay(ctx, carts, people, cartJobs, travel, common.help);
  smithCartTrips(ctx, travel.smithCarts, applied.haulWork);
  flushCartTrips(state, ctx.cartLog);
  // 7. rozdělení práce pro postavy a společná práce do průměrů
  const lordField = laborReport(ctx, {
    people,
    labor,
    allocation,
    applied,
    common,
    travel,
    workshops,
  });
  recordCommonLabor(state, allocation.common, allocation.build ?? allocation.common);
  return { toil: toilToday(ctx, tasks.owned, applied), lordField };
}

/** Začátek dne práce – převod staršího hospodářského roku a kontext dne (`WorkDay`). */
function startWorkDay(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  coverage: CraftCoverage,
  landscape: Landscape | null,
  waiting: ReadonlySet<Crop>,
): WorkDay {
  const month = dateOfDayIndex(day).month;
  // starší hospodářský rok s pletím ozimu – ozim se neplete; pletí jaře, luštěnin a lnu ze
  // starších sazeb na nové (fields.md – Pletí jednou a rychle)
  if (state.season) state.season = withOnceWeedingRates(withoutWinterWeeding(state.season));
  let drives: CartDrives | null | undefined;
  let drives4: CartDrives | null | undefined;
  return {
    state,
    day,
    obstacles,
    coverage,
    landscape,
    waiting,
    month,
    cartLog: [],
    // orba: páry volů s rádlem, se železnou špičkou od kováře rychleji (oxen.md); slabí voli po
    // zimě pomaleji; voli s vozem na výpravě neorají (wagons.md)
    partsById: partsByIdOf(state.parts),
    // voli orají za světla (population.md – Skladba dne podle ročního období) – kapacita spřežení
    // i práce vsi venku podle délky dne
    daylight: daylightFactor(day),
    demand: { road: 0, other: 0, jobs: [] },
    drivesOf: (): CartDrives | null =>
      (drives ??= villageCartDrives(state, day, landscape, obstacles)),
    drives4Of: (): CartDrives | null =>
      (drives4 ??= villageCartDrives(state, day, landscape, obstacles, 'four-wheel')),
  };
}

/** Orba dne – kapacita spřežení za světla a cesta spřežení na poli (oxen.md). */
function ploughDay(ctx: WorkDay): PloughDay {
  const { state, day, obstacles, coverage, landscape, daylight, partsById } = ctx;
  const teamsCap = ploughCapacityPerDay(state, coverage.tools, day) * daylight;
  const ploughCap = teamsCap * teamsHomeShare(state, day);
  // spřežení na poli od rána (oxen.md – Spřežení zůstane na poli) – cesta dne jednou za den
  const afield = ploughTeamsAfield(state, day);
  const travels: PloughTravels = new Map();
  const ploughFactor = (cropWork: CropWork): number =>
    ploughDayFactor(state, day, cropWork, partsById, landscape, obstacles, travels);
  return { teamsCap, ploughCap, afield, travels, ploughFactor };
}

/**
 * Úlohy dne v pořadí důležitosti (fields.md – Pořadí důležitosti polních prací a výmlat do zimy):
 * polní úlohy (`fieldTasks`), výmlat, obilné jámy, hlídka polí, dospělý pasák, sady, nutná seč
 * a porážka, seřazené `dayTaskOrder`.
 */
function dayTaskList(ctx: WorkDay, plough: PloughDay): DayTaskList {
  const { state, day } = ctx;
  const owned = fieldTasks(state, day, plough.ploughCap, plough.ploughFactor);
  const dayTasks: DayTask[] = owned.map((field) => ({
    name: field.name,
    remaining: field.remaining,
    end: field.end,
    tie: 1,
    rank: field.rank,
    field,
  }));
  dayTasks.push(...threshDayTasks(ctx));
  const pits = grainPitDay(ctx);
  if (pits.task) dayTasks.push(pits.task);
  dayTasks.push(...villageDayTasks(ctx));
  // pořadí důležitosti prací dne (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)
  dayTasks.sort(dayTaskOrder);
  return { owned, dayTasks, moreGrain: pits.moreGrain, pitSite: pits.pitSite };
}

/**
 * Výmlat snopů na humnech, jinak nouzově na udusané zemi (production-chains.md – Humno): ozim
 * a luštěniny od srpna, jař od září, do konce února – za polními pracemi a hlídkou polí (fields.md
 * – Pořadí důležitosti polních prací a výmlat do zimy). Chybí-li v zásobách zrno na dnešní jídlo,
 * vymlátí se napřed – před žní i ostatními úlohami (výmlat na dnešní jídlo); chybí-li vymlácené
 * zrno na osivo setí dneška a zítřka, vymlátí se před přípravou půdy (výmlat na osivo).
 */
function threshDayTasks(ctx: WorkDay): DayTask[] {
  const { state, day, coverage } = ctx;
  const threshes = threshTasks(
    state,
    day,
    threshForFoodToday(state, day),
    seedThreshKg(state, day, coverage.tools),
  );
  return threshes.map((thresh) => ({
    name: 'thresh',
    remaining: thresh.remaining,
    end: thresh.end,
    tie: thresh.urgent ? 0 : 1,
    rank: THRESH_RANK + CROP_ORDER.indexOf(thresh.crop),
    thresh,
  }));
}

/**
 * Obilné jámy (production-chains.md – Obilné jámy): vymlácené zrno z humna do jam po polních
 * pracích a výmlatu – v době plnění jam (do zámrazu) za setím ozimu, před stavbami; neúplnou
 * jámu až po výmlatu letošní úrody (ve snopech nic, co ves vymlátí, a jař sklizená).
 */
function grainPitDay(ctx: WorkDay): {
  moreGrain: boolean;
  pitSite: () => { x: number; z: number } | null;
  task: DayTask | null;
} {
  const { state, day, obstacles, landscape, month } = ctx;
  const moreGrain =
    (villageSheaves(state).grainKg > EPSILON && canThresh(state, day)) ||
    springHarvestAhead(state, month);
  // místo nové jámy (jen server – krajina a stavby vsi); bez vhodného místa se letos nekope
  const pitSite = (): { x: number; z: number } | null =>
    chooseGrainPitSite(state, day, landscape, obstacles);
  const pitWork = grainPitTask(state, day, moreGrain, pitSite);
  const task: DayTask | null =
    pitWork > EPSILON
      ? {
          name: 'grain-pit',
          remaining: pitWork,
          end: GRAIN_PITS.fillTo,
          tie: 1,
          rank: THRESH_RANK + CROP_ORDER.length,
        }
      : null;
  return { moreGrain, pitSite, task };
}

/** Úlohy dne mimo pole a výmlat: hlídka polí, dospělý pasák, sady, nutná seč a porážka. */
function villageDayTasks(ctx: WorkDay): DayTask[] {
  const { state, day, month } = ctx;
  const dayTasks: DayTask[] = [];
  // noční hlídka polí (wildlife.md – Noční hlídka vesničanů, 2. stupeň): dospělí z práce vsi za
  // sklizní, nutnou sečí, pletím a přípravou půdy, před výmlatem, stavbami a rybami (fields.md –
  // Pořadí důležitosti polních prací a výmlat do zimy)
  const watchLabor = watchWanted(state, day);
  if (watchLabor > EPSILON) {
    dayTasks.push({ name: 'watch', remaining: watchLabor, end: Infinity, tie: 4, rank: 2 });
  }
  // dospělý pasák (diet.md – Pasáci, Dospělý pasák; Martin 2. 11. 2026): ves bez výrostků pase
  // z práce vsi za polními úlohami dne (i výmlatem a obilnými jamami), nutnou sečí a hlídkou polí,
  // před stavbami (návrh Clauda)
  const adultHerdingWanted = adultHerding(state, day, villageOxen(state));
  if (adultHerdingWanted > EPSILON) {
    dayTasks.push({
      name: 'herding',
      remaining: adultHerdingWanted,
      end: Infinity,
      tie: 4,
      rank: 3,
    });
  }
  const orchard = orchardTask(state, day);
  if (orchard) {
    const tie = orchard.name === ORCHARD_TASK_NAMES.harvest ? 0 : 2;
    dayTasks.push({ ...orchard, tie, rank: 0 });
  }
  // seč (oxen.md – Seno, dvě seče): nutné seno (dnešní stádo) 1. seče i otavy za žní obilí
  // a trháním lnu, před jablky, pletím, orbou a setím i výmlatem (fields.md – Pořadí důležitosti
  // polních prací – 3. sklizeň sena; otava před orbou a setím ozimu – Martin 10. 11. 2026); seč
  // navíc pro růst stád až z práce po stavbách (`freeLaborDay`)
  const neededMowing = mowingNeededRemaining(state, day);
  if (neededMowing > EPSILON) {
    const cut = state.hay?.mowing ? mowingCut(state.hay.mowing) : 1;
    dayTasks.push({
      name: 'mow',
      remaining: neededMowing,
      end: Infinity,
      tie: 3,
      rank: 1,
      ...(cut === 2 ? { aftermath: true as const } : {}),
    });
  }
  // porážka a uzení – za žní, trháním lnu a nutnou sečí i otavou, před jablky (`DAY_WORK_ORDER`;
  // maso je k jídlu hned, práce jen spotřebuje ruce – v zimě se nežne ani neseče, tam jde hned za
  // výmlatem na dnešní jídlo; diet.md – Strava po vrstvách a porážka celý rok)
  const butchery = slaughterRemaining(state);
  if (butchery > 0) {
    dayTasks.push({
      name: 'slaughter',
      remaining: butchery,
      // celý rok – zimní porážka po dnech, letní pro rod vojvody, nouzová porážka i maso z lovu –
      // vždy v měsíci, kdy se porazilo (diet.md)
      end: month,
      tie: 0,
      rank: 1,
    });
  }
  return dayTasks;
}

/** Vstupy rozdělení práce vsi a samo rozdělení (`allocate` – po vodě ráno znovu). */
interface DayLabor {
  readonly horses: ReturnType<typeof villageHorses>;
  readonly horseCare: number;
  readonly shoeingPlan: ReturnType<typeof planShoeing>;
  readonly weeders: ReturnType<typeof weedingChildren>;
  readonly allocate: (jobs: CartJobsDay) => DayAllocation;
}

/**
 * Rozdělení práce vsi (`allocateDay`): péče o koně a kování, žně všemi rukama, pletí dětí a žen,
 * výpravy k sousedům a jízdy vozů domluvené předem.
 */
function dayLabor(
  ctx: WorkDay,
  tasks: DayTaskList,
  people: DayPeople,
  cartJobs: DayCartJobs,
): DayLabor {
  const { state, day, coverage, landscape, daylight } = ctx;
  const { dayTasks } = tasks;
  const { crafts, villagers, manorSkip, harvestDay, chores, waterNeeds, manor, productivity } =
    people;
  const { restingCarry } = cartJobs;
  // péče o koně – hodina denně na koně z práce vsi (horses.md – Péče)
  const horses = villageHorses(state);
  const horseCare = horseCareLabor(horses, day);
  // kování koní (horses.md – Kování): v den termínu vlastní kovář z práce vsi, jinak platba cizímu
  const shoeingPlan = planShoeing(state, day, coverage, landscape);
  // žně všemi rukama (fields.md – Žně všemi rukama): ve žňový den řemeslníci se syny, výrostci
  // a starší jen na žeň a výmlat (cvičící rodina – chlapci cvičí, starší kryjí dvorec – ne)
  // – výrostci a starší (`harvestYouth`) jdou napřed na trhání lnu (fields.md – Len)
  const harvestYouth = harvestDay
    ? harvestHelperLabor(state, day, lordApartIds(state, day), productivity, coverage.pottery)
    : 0;
  const harvestHands = harvestDay
    ? craftHarvestLabor(state, day, crafts, coverage.pottery, productivity) + harvestYouth
    : 0;
  // děti 7–13 let, které nepasou, plejí (fields.md – Pletí – děti) – jen když je co plet
  const weeders = dayTasks.some((t) => t.name === 'weed' && t.remaining > EPSILON)
    ? weedingChildren(state, day)
    : [];
  // plejí hlavně ženy a děti (fields.md – Pletí jednou a rychle) – práce žen vsi nad jejich díl
  // denního minima
  const villageLabor = villagers.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  const womenLabor = villagers.reduce(
    (sum, p) => sum + (p.sex === 'female' ? laborPerDay(p, day) : 0),
    0,
  );
  const weedDaysLeft = weedDaysLeftOf(dayTasks, day);
  // výmlat v zimě – rodina dorovná tempo, které ves k dokončení okna potřebuje (lord.md)
  const threshPace = winterThreshPace(state, day, people);
  // práce rodiny před štěstím (`allocateDay` ji násobí jako práci vsi)
  const beforeProductivity = (labor: number): number =>
    manor && productivity > 0 ? labor / productivity : 0;
  const allocate = (jobs: CartJobsDay): DayAllocation =>
    allocateDay({
      capacity: Math.max(0, villageLabor - restingCarry),
      // ženy řemeslníků: zbytek po domácnosti jde jen na lehčí polní práce se vsí (crafts.md)
      light: craftLightLabor(state, day, crafts, coverage.pottery, productivity),
      harvestHands,
      harvestYouth,
      weedChildren: weeders.length * WEEDING_CHILDREN.perDay,
      womenLabor,
      ...(weedDaysLeft === undefined ? {} : { weedDaysLeft }),
      // muži plejí až po stavbách (fields.md – Pletí jednou a rychle; Martin 9. 11. 2026)
      menWeedLater: true,
      // celá rodina ve žních – jen žeň a výmlat, které ves nestihne (lord.md – Kdy jde rodina na
      // pole), v oknech setí jen příprava půdy a setí, které ves nestihne (D102), v zimě výmlat jen
      // do tempa okna (`threshPace`) – všechno dohromady nejvýš celá práce rodiny; co z minima
      // dvorce rodina nepokryje, platí ves
      lordHelp: beforeProductivity(manor?.help ?? 0),
      lordSowing: beforeProductivity(manor?.sowing ?? 0),
      lordFree: beforeProductivity(manor?.free ?? 0),
      ...(threshPace === undefined ? {} : { threshPace }),
      manorMin: manor?.uncovered ?? 0,
      householdElders: householdElders(villagers, day, manorSkip),
      // péče o koně hned za denním minimem, před výpravami (horses.md – Péče)
      horseCare,
      shoeing: shoeingPlan?.own ? shoeingPlan.manDays : 0,
      // chůze pro vodu nad denní minimum (population.md – Práce, paths.md – Pochůzky pro vodu); vodu,
      // kterou přivezl vůz, nenosí a platí díl práce posádky (wagons.md – Co vozy vozí)
      householdWater: (jobs.water ? jobs.water.water : waterNeeds.map((h) => h.labor)).map(
        (labor, k) => labor + (waterNeeds[k]?.wood ?? 0),
      ),
      minimumShare: chores.minimumShare,
      daylight,
      tasks: allocationTasks(dayTasks),
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
  return { horses, horseCare, shoeingPlan, weeders, allocate };
}

/**
 * Tempo výmlatu v zimě, které ves dnes potřebuje (lord.md – Kdy jde rodina na pole, Výmlat v zimě;
 * Martin 18. 11. 2026 – volba A z D95, pravidlo návrh Clauda): cvičící rodina ve vsi v zimě
 * (WINTER_THRESH_WINDOW – listopad až únor) mimo žňový den, plodiny s výmlatem v okně – zbývající
 * práce výmlatu každé plodiny ÷ dny jejího okna (s dneškem; `threshSeasonTasks`). Co z tempa ves
 * sama nestihne, určí `allocateDay` (pravidelná práce vsi dne). Bez rodiny, ve žňový den, mimo
 * zimu a mimo okno výmlatu undefined.
 */
function winterThreshPace(state: VillageState, day: number, people: DayPeople): number | undefined {
  if (!people.manor || people.harvestDay || people.manor.free <= EPSILON) return undefined;
  const { month } = dateOfDayIndex(day);
  if (!WINTER_THRESH_WINDOW.some(([from, to]) => month >= from && month <= to)) return undefined;
  const tasks = threshSeasonTasks(state, day);
  if (tasks.length === 0) return undefined;
  return tasks.reduce((sum, t) => sum + t.remaining / Math.max(1, t.endDay - day + 1), 0);
}

/**
 * Dní do konce okna pletí i s dneškem (nejbližší konec mezi plodinami) – muži plejí jen, co by
 * ženy a děti do konce okna nestihly; bez pletí dne nic.
 */
function weedDaysLeftOf(dayTasks: readonly DayTask[], day: number): number | undefined {
  const weedEnd = Math.min(
    ...dayTasks.filter((t) => t.name === 'weed' && t.remaining > EPSILON).map((t) => t.end),
  );
  return Number.isFinite(weedEnd)
    ? dayIndexOf(
        weedEnd >= 12
          ? { year: dateOfDayIndex(day).year + 1, month: 1, day: 1 }
          : { year: dateOfDayIndex(day).year, month: weedEnd + 1, day: 1 },
      ) - day
    : undefined;
}

/**
 * Úlohy dne pro rozdělení práce: setí týž den hned za orbou a motykou (`FieldTaskEntry.sowRatio`)
 * – práce úlohy setí plodiny; s trháním lnu rodina vojvody nepomáhá (fields.md – Len, návrh
 * Clauda), trhají napřed ženy a děti (Martin 10. 11. 2026).
 */
function allocationTasks(dayTasks: readonly DayTask[]): Parameters<typeof allocateDay>[0]['tasks'] {
  return dayTasks.map(({ name, remaining, field }) => {
    const ratio = field?.sowRatio ?? 0;
    const index =
      ratio > 0 ? dayTasks.findIndex((t) => t.name === 'sow' && t.field?.work === field?.work) : -1;
    const flax =
      field && flaxHarvest(field.crop, field.name)
        ? { noLordHelp: true as const, womenFirst: true as const }
        : {};
    return index >= 0
      ? { name, remaining, follow: { index, ratio }, ...flax }
      : { name, remaining, ...flax };
  });
}

/**
 * Voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby; Martin 24. 10. 2026: „Rozhodne
 * ekonomika“): pár od rádla sveze vodu, když orba, kterou ves dnes opravdu naplánovala, nechá
 * páru volnou chvíli, nebo když okno orby má rezervu – rádla pak zorají o tolik méně; jen pár,
 * který ráno vyjíždí z ohrady – pár na poli vodu nesveze (oxen.md – Spřežení zůstane na poli).
 * Vrací jízdy vozů a rozdělení práce – s vodou ráno nové.
 */
function morningWaterDay(
  ctx: WorkDay,
  plough: PloughDay,
  tasks: DayTaskList,
  carts: DayCartPlan,
  people: DayPeople,
  jobs: CartJobsDay,
  allocation: DayAllocation,
  allocate: (jobs: CartJobsDay) => DayAllocation,
): { jobs: CartJobsDay; allocation: DayAllocation } {
  const { state, day, landscape, drivesOf, drives4Of } = ctx;
  const { ploughCap, afield, ploughFactor } = plough;
  const { dayTasks } = tasks;
  const { ploughing, fleet, access } = carts;
  const { waterNeeds } = people;
  const pairs = ploughing && !afield && access && !jobs.water ? ploughPairsHome(state, day) : 0;
  if (!(pairs > 0 && fleet['two-wheel'] + fleet['four-wheel'] > 0)) return { jobs, allocation };
  let planned = 0;
  dayTasks.forEach((task, i) => {
    if (task.name !== 'plough' || task.remaining <= EPSILON) return;
    planned += ((allocation.taskAmounts[i] ?? 0) / task.remaining) * (task.field?.teamDays ?? 0);
  });
  // plán vody se počítá na kopii stavu – uložený břeh (`waterCart`) se zapíše, až voda vyhraje
  const scratch: VillageState = { ...state };
  const morning = morningWater({
    plan: () =>
      bestWaterPlan(
        scratch,
        {
          'two-wheel': Math.min(1, fleet['two-wheel']),
          'four-wheel': Math.min(1, fleet['four-wheel']),
          oxen: DRAFT_OXEN.ard,
        },
        { landscape, drives: drivesOf, drives4: drives4Of, water: waterNeeds },
      ),
    capacity: ploughCap,
    pairs,
    planned,
    windows: ploughWindowsToday(state, day, ploughFactor),
  });
  if (morning && scratch.waterCart) state.waterCart = scratch.waterCart;
  if (morning && scratch.waterCart4) state.waterCart4 = scratch.waterCart4;
  if (!morning) return { jobs, allocation };
  const morningTeam = (morning.share * ploughCap) / pairs;
  cutPlough(dayTasks, ploughCap - morningTeam);
  const watered: CartJobsDay = {
    ...jobs,
    carts: jobs.carts + morning.plan.carts,
    water: morning.plan,
  };
  return { jobs: watered, allocation: allocate(watered) };
}

/**
 * Pokrytí péče o koně – bez péče výcvik koně stojí (horses.md – Péče); ves bez koní ho nemá.
 * Kování koní z rozdělení práce do kroniky (horses.md – Kování).
 */
function horseCareDay(ctx: WorkDay, labor: DayLabor, allocation: DayAllocation): void {
  const { state, day } = ctx;
  const { horses, horseCare, shoeingPlan } = labor;
  if (horses.length > 0) {
    state.horsesCaredToday = horseCare > 0 ? Math.min(1, allocation.horseCare / horseCare) : 1;
  } else if (state.horsesCaredToday !== undefined) delete state.horsesCaredToday;
  state.chronicle.push(...finishShoeing(state, day, shoeingPlan, allocation.shoeing ?? 0));
}

/** Co rozdělení práce dne pro postavy čte z kroků dne (`laborReport`). */
interface LaborReportInput {
  readonly people: DayPeople;
  readonly labor: DayLabor;
  readonly allocation: DayAllocation;
  readonly applied: AppliedTasks;
  readonly common: CommonWork;
  readonly travel: DayTravel;
  readonly workshops: ReturnType<typeof craftsDay>;
}

/**
 * Rozdělení práce dne pro postavy (`state.labor` – labor-report.ts). Vrací práci rodiny, kterou
 * dnes úlohy spotřebovaly – napřed ženy a dcery, pak muži, vojvoda až nakonec, v lidech na celý
 * dnešní den (`lordFieldSharesToday`);
 * zbytek dne cvičí (`trainLordDay`).
 */
function laborReport(ctx: WorkDay, input: LaborReportInput): LordFieldShares {
  const { state, day, coverage, daylight } = ctx;
  const { people, labor, allocation, applied, common, travel, workshops } = input;
  const { family, manor } = people;
  const { weeders } = labor;
  const { fieldWork, haulWork, threshing, grainPits, mowLabor, mowingBefore } = applied;
  const { weedMen, game, extraMow, wares, repairs, corvee, constructions } = common;
  const { trade, purchases, herding } = travel;
  const hayMowing = state.hay?.mowing;
  // kdo je na poli – v lidech na celý dnešní den, stejně jako plán (D102 kolo 1)
  const lordField = manor
    ? lordFieldSharesToday(manor, allocation.lordField, daylight)
    : NO_LORD_FIELD;
  state.labor = laborDay(state, day, {
    allocation,
    ...(family && manor
      ? {
          lord: {
            domestic: manor.dailyMin,
            counts: lordDayCounts(family, day, lordField),
          },
        }
      : {}),
    fieldWork,
    ...(weedMen > EPSILON ? { weedMen } : {}),
    ...(wares > EPSILON ? { wares } : {}),
    ...(game.manDays > 0 ? { smallGame: game.shares } : {}),
    ...(extraMow > EPSILON ? { extraMow } : {}),
    ...(weeders.length > 0 ? { weedChildAges: weeders } : {}),
    repairs,
    constructions: corvee.length > 0 ? [...corvee, ...constructions] : constructions,
    workshops,
    trade: trade.shares,
    purchases,
    hauls: haulWork,
    toolCoverage: coverage.tools,
    daylight,
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
            ...(mowLabor !== undefined || extraMow > EPSILON
              ? { labor: (mowLabor ?? 0) + (extraMow > EPSILON ? extraMow : 0) }
              : {}),
          },
        }
      : {}),
  });
  return lordField;
}

/**
 * Společná práce dne do ročního průměru (starší ves začne průměrem 30 dní ještě bez dneška) a díl
 * mužů na stavby (`build` – population.md, Práce, Stavby staví muži) do posledních 30 dní: volná
 * práce v liště, rozpočet správce a „Stavby stojí“ počítají jen s prací, která na stavby opravdu
 * zbude. Roční průměr zůstává celá společná práce (doprava dávek a robota – vassalage.md).
 */
function recordCommonLabor(state: VillageState, common: number, build: number): void {
  state.commonLaborYearly = nextYearlyCommonLabor(yearlyCommonLabor(state), common);
  state.commonLaborHistory.push(build);
  if (state.commonLaborHistory.length > COMMON_LABOR_HISTORY_DAYS) {
    state.commonLaborHistory.splice(0, state.commonLaborHistory.length - COMMON_LABOR_HISTORY_DAYS);
  }
}

/**
 * Dřina: stihne ves dnešním tempem polní práce obou plodin do konce jejich oken? I výmlat ve
 * svém okně jako ostatní polní práce (production-chains.md – Humno); výmlat po okně termín nemá.
 * Do tempa patří i dnešní seč a otava (`mowLabor`) – po seči ta práce přejde na výmlat a polní
 * práce (happiness.md – Plná práce ve špičce, která se stihne, dřinou není; D99 kolo 2).
 */
function toilToday(ctx: WorkDay, owned: readonly FieldTaskEntry[], applied: AppliedTasks): boolean {
  const { state, day } = ctx;
  const { fieldWork, threshing } = applied;
  const pace = fieldWork.reduce(
    (sum, task) => sum + task.amount,
    threshing.floor + threshing.ground + (applied.mowLabor ?? 0),
  );
  // trhání lnu dřinu nepřidá – trhají ženy a děti a práce, která po obilí zbude (fields.md – Len,
  // návrh Clauda)
  const seasonTasks = [
    ...owned
      .filter((task) => !flaxHarvest(task.crop, task.name))
      .map((task) => ({
        remaining: cropTaskRemaining(task.work, task.name),
        endDay:
          windowEndDay(cropTaskWindows(task.crop, task.name), day) ??
          (task.name === 'sow' && springSowingExtended(state, day, task.crop)
            ? day + WEATHER_EFFECTS.longWinterSpringSowExtraDays - dateOfDayIndex(day).day
            : day),
      })),
    ...threshSeasonTasks(state, day),
  ];
  return isToilDay(seasonTasks, pace, day);
}

/**
 * Práce bokem dne – mimo práci vsi, jen pro postavy (population.md – Práce): dojení a sýr
 * z mléka, které se nevypije (nad potřebu energie vsi – diet.md, bez stropů), a péče o zvířata
 * (ženy); domácí výroba žen (`DOMESTIC` po domácnostech a lidech) a denní minimum, které pokryli
 * starší (`eldersDailyMin`).
 */
export function asideWork(state: VillageState, day: number, eldersDailyMin: number): AsideWork {
  const herds = villageHerds(state);
  const dams = villageDams(state);
  const milk = dailyMilk(dams, day);
  const drinkable = villageFoodNeed(state, day);
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
