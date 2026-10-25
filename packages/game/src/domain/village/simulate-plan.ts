// Pomocné kroky simulace dne – roční plán osevu, jeho zkrácení, kapacita setí a společné pomocné funkce.
import { dateOfDayIndex, type CalendarDate } from '../calendar';
import type { Landscape } from '../landscape';
import { nextPloughPairs } from './draft';
import { craftHouseholds, workshopLabor } from './crafts';
import { harvestHelperLabor } from './harvest-hands';
import { closeFieldFoodYear, sowingTargets, type SowingTargets } from './field-food';
import { endOfSeason, expectedNetKg, sowingGroup } from './fields';
import { plannedFurrowEfficiency } from './plough-trip';
import { villageLaborFactor } from './happiness';
import { familyHomes, lordApartIds, manorLabor, trainingFamily } from './lord';
import { EMERGENCY_GROUP, sowingBlocks, villageHoldings, workOrder } from './holdings';
import { flaxNeedKg } from './flax';
import { plannedLegumeKg } from './husbandry';
import { ableTeams, oxPens, ploughCapacityPerDay } from './oxen';
import { trimPlanToTarget } from './plan-trim';
import {
  extraPartsOf,
  queueExtraParts,
  reclaimedLogs,
  sowParts,
  unqueueExtraParts,
} from './extra-sowing';
import { pendingThreshLabor, type ThreshTask } from './threshing';
import { adultDailyMin, householdElders, householdWaterLabor, type LaborTaskName } from './labor';
import { orchardWorkRemaining } from './orchard';
import { laborPerDay } from './people';
import { dailyMinPerHousehold, woodToolsLaborFactor } from './productivity';
import {
  FIELD_STORES,
  FOREST_BONUS,
  OXEN,
  PEAK_CAPACITY_SHARE,
  WINDOWS,
  WINTER_WINDOWS,
} from './rules';
import {
  chooseCrops,
  cropLoadOf,
  lordSowingHelp,
  SOWING_CAPACITY_WINDOWS,
  chosenEnergyKg,
  orchardOnlyLoad,
  planLoad,
  windowDaysLeft,
  type CropChoiceInput,
  type SowingCapacity,
} from './sowing';
import type { CraftCoverage, Crop, CropWork, Dwelling, FieldPart, VillageState } from './types';
import { addLogs } from './wood';
import {
  addToCropWork,
  createPlan,
  createSeason,
  seasonPartIds,
  springCrop,
  type CropTask,
} from './year-plan';

export type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

// Řemesla (crafts.md): pokrytí potřeby nástrojů a nádob se spočítá na začátku dne ze zásob
// (`craftCoverage`) a posouvá všechny meze produktivity dne – plán osevu a přidané díly (polní
// práce a vracení přílohu), denní minimum, ztráty zásob a jablka v nádobách. Domácnosti dílen
// pracují jen v dílně (`workCrafts`), polní ani společnou práci nedělají.

/** Díl hotový nejpozději v posledním měsíci setí (duben) jde ještě do letošního plánu. */
export const LAST_JOIN_MONTH = Math.max(...WINDOWS.sow.map(([, to]) => to));

/** Okno bonusu vymýceného lesa trvá roky × 365 dní. */
export const DAYS_PER_BONUS_YEAR = 365;

/** Tolerance, pod kterou se nasycení ještě bere jako plné. */
export const SATIATION_EPSILON = 1e-9;

/** Tolerance proti chybám desetinných čísel (vozy pro uhlí a rudu). */
export const EPSILON = 1e-9;

/** Tolerance porovnání energie úrody s cílem osevu (kg obilí). */
export const SOWING_EPSILON_KG = 1e-6;

export function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

// --- plán osevu -------------------------------------------------------------------------

/**
 * Krok 1 (1. 9.): konec hospodářského roku pro všechny díly a nový plán osevu – ves rozhodne, co
 * oseje ozimem a co jaří (fields.md – Ozim a jař).
 */
export function planYear(
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
    // volná práce vsi bez vojvodovy rodiny – z ní i osev navíc (lord.md – Kdy jde rodina na pole)
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
    state.draft = {
      ...(state.draft ?? { fourWheelOffRoad: true }),
      ...nextPloughPairs(state, need),
    };
  }
  // vojvodova rodina pomůže s potřebným osevem (lord.md – Kdy jde rodina na pole, bod 1): když ho
  // ves bez ní nestihne, vybere znovu i s prací dospělých cvičící rodiny – před nouzovými bloky
  let sowing = choice;
  if (
    trainingFamily(state, day) &&
    chosenEnergyKg(crops, day) < targets.harvestKg - SOWING_EPSILON_KG
  ) {
    const lord = sowingCapacity(state, day, coverage, plough, landscape, undefined, { lord: true });
    sowing = { ...choice, capacity: lord };
    crops = chooseCrops(blocks, sowing);
  }
  // nouzový osev (fields.md – Přílohová soustava, Nouzový osev): když díly od 70 % nedají energii,
  // kterou ves potřebuje sklidit, vezme i přílohy 40–70 % – za ostatními díly, jen s kladnou
  // čistou úrodou; luštěniny, len ani osev navíc je neberou
  if (chosenEnergyKg(crops, day) < targets.harvestKg - SOWING_EPSILON_KG) {
    const emergency = sowingBlocks(state.parts, holdings, EMERGENCY_GROUP)
      .map((block) => block.filter((p) => expectedNetKg(p, day) > 0))
      .filter((block) => block.length > 0);
    if (emergency.length > 0) crops = chooseCrops([...blocks, ...emergency], sowing);
  }
  // plán vzniká před změnou stavu dílů – vrácení přílohu se počítá jen u dílů v přílohu; práce
  // plánu (i orba – železná špička rádla od kováře) platí podle dnešního pokrytí nástroji celý
  // hospodářský rok
  state.season = createSeason(crops, day, coverage.tools, plough, workOrder(holdings));
  // podle potřeby lnu při plánu se při trhání zapíše, na kolik oděvu len je (fields.md – Len)
  state.season.flaxNeedKg = flaxNeed;
  // podíl dne rodiny po oknech – jen kolik ves bez ní nestihne (lord.md – Kdy jde rodina na pole)
  if (sowing !== choice) {
    const help = lordSowingHelp(crops.load, choice.capacity, sowing.capacity);
    if (Object.keys(help).length > 0) state.season.lordHelp = help;
  }
  const sown = [...crops.winter, ...crops.spring, ...crops.legume, ...crops.flax];
  const chosen = new Set(sown.map((p) => p.id));
  // osev navíc: ostatní díly v oběhu, v pořadí výběru – dostanou práci, která zbude po stavbách
  // (fields.md – Osev navíc); příloh 70–95 % ne (`extraSowable`); osévaný díl si pamatuje léta
  // v řadě, než půjde ladem
  const extra = extraPartsOf(blocks.flat().filter((p) => !chosen.has(p.id)));
  if (extra.length > 0) state.season.extra = extra;
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
export function joinFinishedParts(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  const ready = state.parts.filter((p) => p.state === 'ready');
  if (ready.length === 0) return;
  const plan = state.season;
  const inPlan = new Set(plan ? seasonPartIds(plan) : []);
  // díly plánu (oseté) se počítají do cíle první – nové přibudou, jen když ho nepokryjí
  const startKg = state.parts
    .filter((p) => inPlan.has(p.id))
    .reduce((sum, p) => sum + expectedNetKg(p, day), 0);
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo): k plánu, který orá, přibudou díly
  // k orbě; bez plánu podle toho, jestli ves má pár volů s rádlem
  const plough = plan ? springCrop(plan).plough !== undefined : ableTeams(state, day) > 0;
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
    state.season = target;
  } else if (spring.length > 0) {
    addToCropWork(springCrop(target), spring, day, coverage.tools, order);
  }
  sowParts(spring, 'spring');
  // hotové díly, které potřebný osev nevzal, čekají v osevu navíc (fields.md – Osev navíc)
  unqueueExtraParts(target, taken);
  queueExtraParts(target, extraPartsOf(rest));
}

/**
 * Cíle osevu (fields.md – Kolik ves oseje, Osev podle zásob): úroda na rok spotřeby z pole
 * a pojistku bez toho, co ze zásob k příští sklizni zbude; luštěniny podle rovnovážného hospodaření
 * (`plannedLegumeKg` – soupeří cenou v práci se stády, diet.md) a podle své zásoby.
 */
export function fieldSowingTargets(
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
export function trimPlan(state: VillageState, day: number, coverage: CraftCoverage): void {
  if (!state.season) return;
  const targets = fieldSowingTargets(state, day, coverage);
  trimPlanToTarget(state, day, targets.targetKg, FIELD_STORES.trimMarginYears * targets.needKg);
  springLordHelp(state, day, coverage);
}

/**
 * Jarní úprava pomoci vojvodovy rodiny s potřebným osevem (lord.md – Kdy jde rodina na pole,
 * bod 1): v okně setí jaře (březen–duben) přepočítá podíl dne rodiny podle zbytku plánu a volné
 * práce vsi do konce roku stejně jako plán 1. 9. (`lordSowingHelp`) – když ves zaostala, rodina
 * pomůže víc, když dohnala, méně. Jen cvičící rodina; ves, která zbytek stihne sama, pomoc nemá.
 */
function springLordHelp(state: VillageState, day: number, coverage: CraftCoverage): void {
  const plan = state.season;
  const { month } = dateOfDayIndex(day);
  if (!plan || !SOWING_CAPACITY_WINDOWS.spring.some(([from, to]) => month >= from && month <= to)) {
    return;
  }
  if (!trainingFamily(state, day)) return;
  const load = cropLoadOf(planLoad(plan, orchardHarvestLoad(state)));
  const help = lordSowingHelp(
    load,
    sowingCapacity(state, day, coverage),
    sowingCapacity(state, day, coverage, false, null, undefined, { lord: true }),
  );
  if (Object.keys(help).length > 0) plan.lordHelp = help;
  else delete plan.lordHelp;
}

/**
 * Seje se, co je zkopané do včerejška (TASK_ORDER) – v okně setí proto plán počítá s jedním dnem
 * méně, aby se zasel i pruh zkopaný poslední den kopání.
 */
export const SOW_AFTER_DIG_DAYS = 1;

/**
 * Volná práce vsi ve špičkách polních prací od dneška do konce hospodářského roku: všechna
 * práce po denním minimu (PEAK_CAPACITY_SHARE) krát dny oken – podzim pro ozim (září–říjen)
 * a celý podzim (září–listopad) bez výmlatu snopů, který ves čeká (production-chains.md – Humno),
 * jaro (březen–duben), červenec a srpen (sklizně, výmlat ozimu a luštěnin plán přičte). Domácnosti
 * dílen na pole nechodí (crafts.md) – nepočítají se, jen v červenci a srpnu a ve výmlatu jaře
 * v září přijdou žňové ruce (fields.md – Žně všemi rukama: řemeslníci se syny, cvičící muži rodiny,
 * výrostci a starší); práce se zvířaty (diet.md) jde napřed.
 * Ves, která orá (`plough`), má navíc kapacitu spřežení v oknech orby (oxen.md – Jen rádlo):
 * denní orba všech spřežení krát dny oken kopání – září–říjen pro ozim (bez posledního dne, ať se
 * zaseje i poslední zoraný pruh), září–listopad a březen–duben pro jař a luštěniny. Cvičící
 * vojvodova rodina je mimo práci vsi; s `lord` se přičte i práce jejích mužů po minimu dvorce
 * (`manorLabor` – `freeMen`, lord.md – Kdy jde rodina na pole, bod 1) – jen do plánu potřebného osevu.
 */
export function sowingCapacity(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  plough = false,
  landscape: Landscape | null = null,
  pairs?: number,
  options: { lord?: boolean } = {},
): SowingCapacity {
  const crafts = craftHouseholds(state);
  // cvičící vojvodova rodina je mimo práci vsi (lord.md – Den rodiny), jako ji vyřazuje `work()`
  const apart = lordApartIds(state, day);
  // práci násobí štěstí vsi (happiness.md) a dřevěné nářadí od tesaře (wagons.md); zvířata
  // a domácí výroba jdou bokem, denní minimum kryjí napřed starší (population.md – Práce)
  const productivity = villageProductivity(state, coverage);
  const capacity =
    state.people.reduce(
      (sum, p) => sum + (crafts.has(p.dwellingId) || apart.has(p.id) ? 0 : laborPerDay(p, day)),
      0,
    ) * productivity;
  const minimum = dailyMinPerHousehold(coverage.pottery);
  // denní minimum s přirážkou za chůzi pro vodu (population.md – Práce)
  // denní minimum dvorce kryje cvičící rodina (`manorLabor`), ves platí jen, co rodina nepokryje
  const family = trainingFamily(state, day);
  const homes = familyHomes(family);
  const skip = homes.size > 0 ? new Set([...crafts, ...homes]) : crafts;
  const water = householdWaterLabor(state.people, state.dwellings, skip);
  const manor = family ? manorLabor(state, day, coverage.pottery, productivity, family) : null;
  const dailyMin =
    householdElders(state.people, day, skip).reduce(
      (sum, elders, k) => sum + adultDailyMin(minimum + water[k]!, elders, productivity),
      0,
    ) + (manor ? manor.uncovered : 0);
  // s rodinou (`lord` – lord.md, Kdy jde rodina na pole, bod 1) i práce cvičících mužů rodiny
  // po minimu dvorce (`freeMen`; ženy jen při hladu) – jen lidé, spřežení ne
  const lordFree = options.lord === true && manor ? manor.freeMen : 0;
  const villageFree = Math.max(0, capacity - dailyMin);
  const free = (villageFree + lordFree) * PEAK_CAPACITY_SHARE;
  // žně všemi rukama (fields.md – Žně všemi rukama; Martin 24. 10. 2026: „Dílny i vojvodova
  // rodina“): v oknech žní a výmlatu i řemeslníci se syny (`WorkshopLabor` – řemeslo i žeň), cvičící
  // muži rodiny (`freeMen`) a výrostci se staršími (`harvestHelperLabor`) – tytéž ruce jako `work()`
  const hands =
    [...crafts].reduce((sum, id) => {
      const labor = workshopLabor(state, day, id, coverage.pottery, productivity);
      return sum + labor.craft + labor.harvest;
    }, 0) +
    (manor ? manor.freeMen : 0) +
    harvestHelperLabor(state, day, apart, productivity, coverage.pottery) * productivity;
  const harvestFree = (villageFree + hands) * PEAK_CAPACITY_SHARE;
  const days = (
    segments: Parameters<typeof windowDaysLeft>[1],
    sowing = false,
    perDay = free,
  ): number =>
    perDay * Math.max(0, windowDaysLeft(day, segments) - (sowing ? SOW_AFTER_DIG_DAYS : 0));
  // výmlat snopů hned po žni (production-chains.md – Humno) bere podzimní práci: co z něj zbývá
  // (na humnech nejvýš jejich kapacita za dny okna, v roce odkladu i nouzově), ubere podzim ozimu
  // i celý podzim – mlátí se před setím ozimu; žňové ruce mlátí se vsí, ves dá jen svůj díl
  const villageShare = villageFree + hands > 0 ? villageFree / (villageFree + hands) : 1;
  const threshing = (segments: Parameters<typeof windowDaysLeft>[1]): number =>
    pendingThreshLabor(state, day, windowDaysLeft(day, segments)) * villageShare;
  const w = SOWING_CAPACITY_WINDOWS;
  const people: SowingCapacity = {
    autumnWinter: Math.max(0, days(w.autumnWinter, true) - threshing(w.autumnWinter)),
    autumn: Math.max(0, days(w.autumn) - threshing(w.autumn)),
    spring: days(w.spring, true),
    july: days(w.july, false, harvestFree),
    august: days(w.august, false, harvestFree),
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
export function cropsKey(crops: ReturnType<typeof chooseCrops>): string {
  const ids = (parts: readonly FieldPart[]): string => parts.map((p) => p.id).join(',');
  return [crops.winter, crops.spring, crops.legume, crops.flax].map(ids).join('|');
}

/**
 * Páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce; Martin 20. 10. 2026): nejméně
 * párů (nejvýš OXEN.maxPairs), se kterými plán osevu (`choice`, `blocks`) vybere totéž jako bez meze
 * orby – voli zorají celý osev v oknech orby. Kapacita páru jako dřív spřežení
 * (`ploughCapacityPerDay`, délka brázdy).
 */
export function wantedPloughPairsOf(
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
export function orchardHarvestLoad(state: VillageState): number {
  const work = state.orchardWork;
  return work?.task === 'harvest' ? orchardWorkRemaining(work) : 0;
}

/** Do kdy platí okno bonusu úrodnosti lesa vymýceného v den `day`. */
export function forestBonusUntil(day: number): number {
  return day + FOREST_BONUS.windowYears * DAYS_PER_BONUS_YEAR;
}

// --- práce ------------------------------------------------------------------------------

/**
 * Násobek veškeré práce vsi: štěstí (happiness.md – `villageLaborFactor`) krát dřevěné nářadí od
 * tesaře (wagons.md – Tesař, meze WOOD_TOOLS_LABOR; bez tesaře 1).
 */
export function villageProductivity(state: VillageState, coverage: CraftCoverage): number {
  return villageLaborFactor(state) * woodToolsLaborFactor(coverage.woodTools ?? 0);
}

/** Obydlí, ve kterých někdo bydlí (pořadí podle stavu). */
export function occupiedDwellings(state: VillageState): Dwelling[] {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings.filter((d) => occupied.has(d.id));
}

/**
 * Počet domácností – i zakladatelů, kteří do dostavění první zemnice bydlí na staveništi
 * (denní minimum a domácí práce mají taky). Ve vsi s hotovými obydlími = obývaná obydlí.
 */
export function householdCount(state: VillageState): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/** Polní úloha dne: práce plodiny, kterou dostane, a konec jejího okna pro pořadí. */
export interface FieldTaskEntry {
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
 * Sezónní úloha dne v rozdělení práce: polní úloha, práce v sadech, seč sena nebo porážka. Řadí se podle konce okna; při
 * shodě sklizeň jablek a porážka (maso se musí zpracovat hned) před polními úlohami (jablka zrají
 * v září a do konce října spadnou – ozim dostane zbytek podzimu, se kterým plán osevu počítá),
 * péče o sad a seč až po nich.
 */
export interface DayTask {
  name: LaborTaskName;
  remaining: number;
  end: number;
  tie: number;
  rank: number;
  field?: FieldTaskEntry;
  /** Výmlat snopů plodiny (production-chains.md – Humno). */
  thresh?: ThreshTask;
}
