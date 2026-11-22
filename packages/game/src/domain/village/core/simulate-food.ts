// Sklizeň, výmlat a jídlo dne.
import { eatDiet, villageFoodNeed, type DietInput } from './diet';
import { recordFieldFood } from '../fields/field-food';
import { harvestFlax } from '../fields/flax';
import { harvestGardens } from '../fields/garden';
import type { Landscape } from '../../landscape';
import { dayMealInput, emergencySlaughter } from '../livestock/emergency-slaughter';
import { summerWinterInput } from '../livestock/husbandry';
import { summerSlaughterDay } from '../livestock/summer-slaughter';
import { drawGrainPits, settleGrainPits } from '../fields/grain-pits';
import { feedHorseGrain } from '../livestock/horse-feed';
import { dayPartLosses } from '../disasters/disasters';
import { addSheaves } from '../fields/threshing';
import { villageLegumesKg } from '../fields/legumes';
import { threshWorkFactor } from '../disasters/weather-effects';
import type {
  CraftCoverage,
  CropWork,
  HarvestStock,
  FarmSeason,
  ThreshedCrop,
  VillageState,
} from '../types';
import { rotateAfterSeason } from '../fields/rotation';
import { wildlifeSeasonEnd } from '../wildlife/wildlife-damage';
import {
  harvestKg,
  lateSpringCrop,
  seasonCrop,
  springCrop,
  taskRemaining,
  threshWorkForSheaves,
  type PartLosses,
} from './year-plan';
import { EPSILON, SATIATION_EPSILON } from './simulate-plan';
import { stockLastsDays, type StockKind } from './food-lasts';
import { NO_CRAFTS } from './productivity';
import {
  hungerSplit,
  rationMinimum,
  rationShares,
  shownGroup,
  type HungerSplit,
} from '../people/hunger-groups';
import { dietHappiness, tierMeal, type DietHappiness } from './tier-meal';

/** Jak se dnes najedly skupiny přednosti v hladu (`hunger-groups.ts`). */
export interface GroupMeal extends HungerSplit {
  /**
   * Energie dne po skupinách (0–1) – rod vojvody, mistři huti, řemeslníci, zbytek vsi (`tierMeal`;
   * prázdná skupina 1).
   */
  energy: readonly number[];
}

/**
 * Práce výmlatu sklizené části – v deštivém létě o 20 % víc (vlhké snopy – disasters.md, Léto).
 */
function threshWork(state: VillageState, day: number, work: number): number {
  return work * threshWorkFactor(state, day);
}

/**
 * Žeň plodiny do snopů (mutuje stav i `work` – fields.md, Žně i v srpnu, Žeň jaře i v září): úroda
 * podle hotové práce žně bez té, která už šla do snopů (`CropWork.sheaved` – 31. 7. ozim, 31. 8.
 * jař), s výmlatem jen této části. Když okno žně ještě běží (`final` false – 31. 7. ozim, 31. 8.
 * jař) a žeň není hotová, plodina zůstává na poli: zapíše se `sheaved` a zbytek se žne další měsíc;
 * jinak je sklizená (`harvestedKg` – celá úroda) a nesklizené propadne. Vrací úrodu, která dnes šla
 * do snopů (kg).
 */
function sheaveCrop(
  state: VillageState,
  day: number,
  crop: ThreshedCrop,
  work: CropWork,
  final: boolean,
  losses: PartLosses | undefined,
): number {
  const from = work.sheaved?.harvest ?? 0;
  const kg = harvestKg(
    work,
    state.parts,
    day,
    crop === 'legume' ? 'legume' : 'spring',
    losses,
    from,
  );
  // výmlat podle kg snopů – běžná úroda jako sazba na hektar (production-chains.md – Humno, Práce
  // výmlatu podle snopů; Martin 18. 11. 2026)
  const sheafWork = threshWorkForSheaves(work, state.parts, crop, kg, from);
  addSheaves(state, crop, kg, threshWork(state, day, sheafWork));
  const total = (work.sheaved?.kg ?? 0) + kg;
  if (final || taskRemaining(work, 'harvest') <= EPSILON) work.harvestedKg = total;
  else work.sheaved = { harvest: work.done.harvest, kg: total };
  return kg;
}

/**
 * Zásoba po sklizni do nových zápisů kroniky (od indexu `from`; kronika – Martin 17. 11. 2026):
 * obilí a luštěniny podle plodiny zápisu, zahrádky luštěniny; počítá se na konci kroku sklizně,
 * ať zásoba zahrnuje i snopy, co sklizeň právě přidala.
 */
export function attachHarvestStocks(
  state: VillageState,
  day: number,
  from: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): void {
  const cache = new Map<StockKind, HarvestStock>();
  const stockOf = (kind: StockKind): HarvestStock => {
    let stock = cache.get(kind);
    if (!stock) {
      const outlook = stockLastsDays(state, day, kind, potteryCoverage);
      stock = { kg: Math.round(outlook.kg), days: outlook.days, people: state.people.length };
      cache.set(kind, stock);
    }
    return stock;
  };
  for (const event of state.chronicle.slice(from)) {
    if (event.day !== day) continue;
    if (event.kind === 'garden-harvest') event.stock = stockOf('legumes');
    else if (event.kind === 'harvest') {
      event.stock = stockOf(event.crop === 'legume' ? 'legumes' : 'grain');
    }
  }
}

/**
 * Žeň ozimu, luštěnin a lnu (po jídle dne): úroda ozimu a luštěnin do snopů – vymlátí se hned po
 * žni na humně (fields.md – Ozim a jař, Luštěniny; production-chains.md – Humno). 31. 7. (`final`
 * false) do snopů, co červenec sklidil (nedosklizená plodina zůstává na poli a žne se v srpnu);
 * 31. 8. (`final`) zbytek žatý v srpnu (fields.md – Žně i v srpnu) a konec trhání lnu – podíl
 * oděvu, na který len je (`harvestFlax`; fields.md – Len, trhá se jen v srpnu). Luštěniny na poli
 * jen dorůstající ve starších vsích.
 */
function harvestEarlyCrops(state: VillageState, day: number, final: boolean): void {
  if (final) {
    const linen = harvestFlax(state, day);
    if (linen) state.chronicle.push(linen);
  }
  // 31. 7. nedosklizená plodina s nulovou úrodou do kroniky nejde (zapíše se 31. 8.)
  const record = (work: CropWork): boolean => final || work.harvestedKg !== null;
  const legume = state.season ? seasonCrop(state.season, 'legume') : undefined;
  if (legume && legume.harvestedKg === null) {
    const losses = dayPartLosses(state, day, 'legume', legume.partIds, undefined);
    const kg = sheaveCrop(state, day, 'legume', legume, final, losses);
    if (record(legume) || Math.round(kg) > 0) {
      state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'legume' });
    }
  }
  const winter = state.season ? seasonCrop(state.season, 'winter') : undefined;
  if (winter && winter.harvestedKg === null) {
    const losses = dayPartLosses(
      state,
      day,
      'winter',
      winter.partIds,
      state.wildlife?.damage?.parts,
    );
    const kg = sheaveCrop(state, day, 'winter', winter, final, losses);
    if (record(winter) || Math.round(kg) > 0) {
      state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'winter' });
    }
  }
}

/**
 * 31. 7. (po jídle dne): sklizeň zahrádek u obydlí – luštěniny (`harvestGardens` – fields.md,
 * Zahrádka u obydlí; `landscape` – úrodnost políček pozemků) a červencová žeň ozimu a luštěnin
 * (`harvestEarlyCrops`).
 */
export function harvestWinter(
  state: VillageState,
  day: number,
  landscape: Landscape | null = null,
  potteryCoverage: number = NO_CRAFTS.pottery,
): void {
  const from = state.chronicle.length;
  harvestGardens(state, day, landscape);
  harvestEarlyCrops(state, day, false);
  attachHarvestStocks(state, day, from, potteryCoverage);
}

/** Sklizeň jaře do kroniky – plán jen s ozimem jař nesklízí (sklizeň bez plodiny). */
function recordSpring(state: VillageState, plan: FarmSeason, day: number, kg: number): void {
  if (!seasonCrop(plan, 'winter')) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg) });
  } else if (kg > 0 || springCrop(plan).partIds.length > 0) {
    state.chronicle.push({ day, kind: 'harvest', kg: Math.round(kg), crop: 'spring' });
  }
}

/**
 * 31. 8. (po jídle dne): úroda jaře do snopů – vymlátí se v září na humně (production-chains.md
 * – Humno) – i se zbytkem ozimu a luštěnin žatým v srpnu, len vytrhaný v srpnu (co nevytrhal,
 * propadne); plán (i s ozimem) jde k výmlatu.
 * Jař, kterou srpen nedosklidil, dá do snopů jen srpnovou žeň (`CropWork.sheaved`) a zůstává na
 * poli – dožne se v září (`harvestLateSpring`; fields.md – Žeň jaře i v září); do kroniky až
 * celá. Je-li jař sklizená, končí sezóna škod zvěře (`wildlifeSeasonEnd`).
 */
export function harvest(
  state: VillageState,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): void {
  const plan = state.season;
  if (plan === null) return;
  const from = state.chronicle.length;
  // co červenec nedosklidil – ozim a luštěniny žaté v srpnu – napřed (pořadí CROP_ORDER) a len
  // vytrhaný v srpnu
  harvestEarlyCrops(state, day, true);
  const spring = springCrop(plan);
  const losses = dayPartLosses(state, day, 'spring', spring.partIds, state.wildlife?.damage?.parts);
  const kg = sheaveCrop(state, day, 'spring', spring, false, losses);
  if (spring.harvestedKg !== null || Math.round(kg) > 0) recordSpring(state, plan, day, kg);
  state.threshingSeason = plan;
  state.season = null;
  if (!lateSpringCrop(state)) wildlifeSeasonEnd(state, day);
  attachHarvestStocks(state, day, from, potteryCoverage);
}

/**
 * V září (po jídle dne): jař, kterou srpen nedosklidil (`lateSpringCrop` – fields.md, Žeň jaře
 * i v září), jde do snopů v den, kdy je dožatá, nejpozději 30. 9. (`final`) – úroda zářijové žně
 * (srpnová už je ve snopech), nesklizené propadne. Teprve pak její díly končí hospodářský rok
 * (`rotateAfterSeason` – do té doby se neorají pod ozim) a končí sezóna škod zvěře.
 */
export function harvestLateSpring(
  state: VillageState,
  day: number,
  final: boolean,
  potteryCoverage: number = NO_CRAFTS.pottery,
): void {
  const plan = state.threshingSeason;
  const late = lateSpringCrop(state);
  if (!plan || !late) return;
  if (!final && taskRemaining(late, 'harvest') > EPSILON) return;
  const losses = dayPartLosses(state, day, 'spring', late.partIds, state.wildlife?.damage?.parts);
  const kg = sheaveCrop(state, day, 'spring', late, true, losses);
  const from = state.chronicle.length;
  recordSpring(state, plan, day, kg);
  const ids = new Set(late.partIds);
  for (const part of state.parts) if (ids.has(part.id)) rotateAfterSeason(part, day);
  wildlifeSeasonEnd(state, day);
  attachHarvestStocks(state, day, from, potteryCoverage);
}

/**
 * 1. 11. (po jídle dne – den po konci okna výmlatu jaře): loňský plán u výmlatu se zahodí. Snopy,
 * které výmlat nestihl, zůstávají ve snopech a mlátí se dál (production-chains.md – Humno; dřív
 * nevymlácená část 1. 3. propadla).
 */
export function endThreshing(state: VillageState): void {
  state.threshingSeason = null;
}

/** Jedla by ves se vstupem jídla `input` plně – příděl do sklizně i dnešní energie celé? */
function eatsFull(input: DietInput): boolean {
  const meal = eatDiet(input);
  return Math.min(meal.outlook, meal.diet.energy) >= 1 - SATIATION_EPSILON;
}

/**
 * Krok 8: jídlo dne ze zásob (`eatDiet`; diet.md – Strava po vrstvách a porážka celý rok) – bez
 * stropů v pořadí pevný příděl medu, čerstvé mléko (dojí se vždy celé – ženy bokem, population.md
 * – Práce), vejce, čerstvé a ostatní uzené maso, díl zásoby z porážky 1. 11. (rovným dílem do
 * zkažení – Martin 18. 11. 2026: „Uzené rozlož“), sýr, ovoce, luštěniny, obilí a v hladu med
 * (hides-honey.md – Med v hladu). Snědené se
 * rozdělí po vrstvách přednosti (`tierMeal` – Kdo dostane co): příděl nad životním minimem a čím
 * se naplní. Vrací nasycení vsi (energie × kvalita stravy), energii,
 * štěstí z masa, ovoce a medu po lidech podle toho, co kdo snědl (`dietHappiness` – Spokojenost ze
 * stravy), a energii vrstev, když jídla není dost; zapíše začátek a konec hladu. Hlad začíná už
 * tehdy, když příděl energie podle výhledu do sklizně klesne pod plný – i když se dnes jí dosyta
 * ovocem a obilí nevystačí až po 1. 3. Po lidech dostanou obilí jezdečtí koně (`feedHorseGrain`).
 */
export function eat(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { satiation: number; energy: number; diet: DietHappiness; groups: GroupMeal | null } {
  const milked = 1;
  const need = villageFoodNeed(state, day);
  // co zásoby ubyly dnes (prodej, platby), jde z otevřené obilné jámy (production-chains.md –
  // Obilné jámy) – ztráta zásob v jídle dne podle jam
  drawGrainPits(state);
  // v létě kus pro rod vojvody, když mu na dnešek nestačí dnešní čerstvé maso (i ryby a oka
  // z práce dne), ostatní uzené a dnešní díl zásoby z porážky 1. 11. (diet.md – Strava po
  // vrstvách a porážka celý rok); práce porážky se udělá další dny
  summerSlaughterDay(state, day, () => summerWinterInput(state, day));
  // nevychází-li výhled do sklizně, ves napřed porazí zvířata navíc – teprve pak šetří přídělem
  // (diet.md – Nouzová porážka)
  // vstup jídla dne se spočte jednou pro porážku i jídlo; po porážce celý znovu – porážka mění
  // stáda (mléko), maso i potřebu z pole (výhled do sklizně) a je jen pár dní za rok
  let mealInput = dayMealInput(state, day, coverage.pottery, milked);
  const emergency = emergencySlaughter(state, day, coverage.pottery, milked, mealInput);
  if (emergency) {
    state.chronicle.push(emergency);
    mealInput = dayMealInput(state, day, coverage.pottery, milked);
  }
  // osivo, které ves nejí (fields.md – Úroda, Osivo ze zásob), zůstane v zásobách
  const seedGrain = state.storesKg - mealInput.grainKg;
  const seedLegumes = villageLegumesKg(state) - (mealInput.legumesKg ?? 0);
  const meal = eatDiet(mealInput);
  state.storesKg = meal.grainKg + seedGrain;
  // jámy po ztrátách a jídle dne – snědené zrno z otevřené jámy, dosloužilé prázdné se zasypou
  settleGrainPits(state, day, coverage.pottery);
  // čerstvé maso dne se snědlo, zbytek je v uzeném (diet.md – Porážka v zimě)
  delete state.freshMeatKg;
  if (state.meatKg !== undefined || meal.meatKg > 0) state.meatKg = meal.meatKg;
  // z toho zásoba z porážky 1. 11. – po převodu vždy číslo (i 0)
  if (state.slaughterMeatKg !== undefined || meal.slaughterMeatKg > 0) {
    state.slaughterMeatKg = meal.slaughterMeatKg;
  }
  if (state.cheeseKg !== undefined || meal.cheeseKg > 0) state.cheeseKg = meal.cheeseKg;
  if (state.legumesKg !== undefined || meal.legumesKg > 0) {
    state.legumesKg = meal.legumesKg + seedLegumes;
  }
  if (state.applesKg !== undefined) state.applesKg = meal.fruitKg;
  // med z klátů – zbytek se hromadí (hides-honey.md – Klát u obydlí); ves bez zboží med nemá
  if (state.wares) state.wares.honeyKg = meal.honeyKg;
  state.diet = meal.diet;
  // kolik z dnešní potřeby musí dát pole – podle toho potřeba z pole ve výhledu zásob k sklizni
  // (fields.md – Výhled zásob k sklizni, Osev podle stravy)
  recordFieldFood(state, need, meal.diet);
  // příděl do sklizně podle výhledu, nebo méně, když se dnes snědlo méně energie (zásoby došly
  // a snopy se nestihly vymlátit – production-chains.md, Humno) – ves šetří i hladoví podle toho,
  // co opravdu snědla
  const ration = Math.min(meal.outlook, meal.diet.energy);
  const hungry = ration < 1 - SATIATION_EPSILON;
  // jídlo po vrstvách (diet.md – Kdo dostane co): každý den – štěstí ze stravy se počítá po lidech
  // podle toho, co kdo snědl (Spokojenost ze stravy)
  const split = hungerSplit(state, day);
  // životní minimum přídělu – v dlouhém hladu příděl k přežití zbytku vsi do žní (Martin
  // 22. 11. 2026: „ano“ – rod se uskrovní)
  const minimum = rationMinimum(state, day, split.needs, mealInput.daysToHarvest);
  const tiers = tierMeal(split, meal.eaten, minimum);
  // přednost v hladu (population.md – Přednost v hladu): nad životním minimem jedí napřed rod
  // vojvody, mistři huti a řemeslníci; hlad po skupinách se vede jen, když jídla není dost nebo
  // když skupiny mají každá jiný hlad – sytá ves má jediný hlad vsi jako dřív
  let groups: GroupMeal | null = null;
  let shownRation = ration;
  if (ration < 1 || meal.diet.energy < 1 || state.starvationGroups !== undefined) {
    groups = { ...split, energy: tiers.energy };
    // příděl do sklizně hráči ukazuje zbytek vsi (nejnižší neprázdná skupina)
    shownRation = rationShares(ration, split.needs, minimum)[shownGroup(split.counts)] ?? ration;
  }
  // příděl do sklizně, když ves šetří – stupeň upozornění (population.md – Co hráč vidí)
  if (hungry) state.ration = shownRation;
  else delete state.ration;
  // šetří jen kvůli osivu, které nejí – se snědeným osivem by jedla plně (absence.md – Upozornění
  // vsi do kroniky): stejný vstup jídla se zrnem celých zásob, jen v den, kdy ves šetří
  if (
    hungry &&
    seedGrain > EPSILON &&
    eatsFull({ ...mealInput, grainKg: mealInput.grainKg + seedGrain })
  ) {
    state.seedRation = true;
  } else delete state.seedRation;
  if (hungry !== state.hungry) {
    state.hungry = hungry;
    state.chronicle.push({ day, kind: hungry ? 'hunger-began' : 'hunger-ended' });
  }
  // obilí koní po lidech – jen co lidem do sklizně zbude navíc (horses.md – Krmení)
  feedHorseGrain(state, day, meal.grainSpareKg, mealInput.daysToHarvest);
  return {
    satiation: meal.diet.satiation,
    energy: meal.diet.energy,
    diet: dietHappiness(tiers, split.eaters),
    groups,
  };
}
