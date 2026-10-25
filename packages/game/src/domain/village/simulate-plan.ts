// Pomocné kroky simulace dne – hospodářský rok a nutné díly, kapacita setí a společné pomocné funkce.
import { dateOfDayIndex, type CalendarDate } from '../calendar';
import type { Landscape } from '../landscape';
import { nextPloughPairs } from './draft';
import { craftHouseholds, workshopLabor } from './crafts';
import { harvestHelperLabor } from './harvest-hands';
import { closeFieldFoodYear, sowingTargets, type SowingTargets } from './field-food';
import { sowingGroup } from './fields';
import { taskPosition, taskSpans } from './field-progress';
import { dropFromWork, moveParts, shrinkInPlan } from './land-taken';
import { plannedFurrowEfficiency } from './plough-trip';
import { villageLaborFactor } from './happiness';
import { familyHomes, lordApartIds, manorLabor, trainingFamily } from './lord';
import { sowingBlocks, villageHoldings, workOrder } from './holdings';
import { flaxNeedKg } from './flax';
import { plannedLegumeKg } from './husbandry';
import { ableTeams, oxPens, ploughCapacityPerDay } from './oxen';
import {
  neededSelection,
  reclaimedLogs,
  returnPart,
  rotateAfterSeason,
  sowingCropToday,
  sowParts,
  windowOpen,
} from './rotation';
import { pendingThreshLabor, type ThreshTask } from './threshing';
import { adultDailyMin, householdElders, householdWaterLabor, type LaborTaskName } from './labor';
import { orchardWorkRemaining } from './orchard';
import { laborPerDay } from './people';
import { dailyMinPerHousehold, woodToolsLaborFactor } from './productivity';
import { FOREST_BONUS, OXEN, PEAK_CAPACITY_SHARE, WINDOWS, WINTER_WINDOWS } from './rules';
import {
  chooseCrops,
  cropLoadOf,
  lordSowingHelp,
  SOWING_CAPACITY_WINDOWS,
  orchardOnlyLoad,
  planLoad,
  windowDaysLeft,
  type CropChoiceInput,
  type SowingCapacity,
} from './sowing';
import type {
  CraftCoverage,
  Crop,
  CropWork,
  Dwelling,
  FarmSeason,
  FieldPart,
  VillageState,
} from './types';
import { addLogs } from './wood';
import {
  addToCropWork,
  createCropWork,
  createSeason,
  dropSeasonCrop,
  putSeasonCrop,
  seasonCrop,
  seasonCrops,
  springCrop,
  type CropTask,
} from './year-plan';

export type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

// Řemesla (crafts.md): pokrytí potřeby nástrojů a nádob se spočítá na začátku dne ze zásob
// (`craftCoverage`) a posouvá všechny meze produktivity dne – plán osevu a přidané díly (polní
// práce a vracení přílohu), denní minimum, ztráty zásob a jablka v nádobách. Domácnosti dílen
// pracují jen v dílně (`workCrafts`), polní ani společnou práci nedělají.

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

// --- hospodářský rok a nutné díly ---------------------------------------------------------

/**
 * Krok 1 (1. 9.): konec hospodářského roku pro všechny díly a nový hospodářský rok bez dílů
 * (fields.md – Osevní postup po dílech): každý díl se posune v postupu (`rotateAfterSeason`),
 * letošní práce přibývá den po dni (`seasonDay`). Ves bez plánu – nic dopředu nevybírá.
 */
export function startSeason(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  // kolik jídla ves za uplynulý rok potřebovala z pole – podle toho potřeba úrody (fields.md –
  // Osev podle stravy)
  closeFieldFoodYear(state);
  for (const part of state.parts) rotateAfterSeason(part, day);
  // ves s párem volů a rádlem orá všechno, motyka nekope (oxen.md – Jen rádlo)
  const plough = ableTeams(state, day) > 0;
  // páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce) – podle nich cvičí voly; mění
  // se, jen když potřeba trvá dva roky (`nextPloughPairs`). Zatím z výběru osevu s kapacitou –
  // páry z postupu dílů přinese Úloha 5 plánu osevního postupu.
  if (oxPens(state).length > 0) {
    const targets = fieldSowingTargets(state, day, coverage);
    const blocks = sowingBlocks(state.parts, villageHoldings(state));
    const choice: CropChoiceInput = {
      targetKg: targets.targetKg,
      startKg: 0,
      capacity: sowingCapacity(state, day, coverage, plough, landscape),
      load: orchardOnlyLoad(orchardHarvestLoad(state)),
      allowWinter: true,
      day,
      toolCoverage: coverage.tools,
      plough,
      legumeTargetKg: targets.legumeKg,
      energyFloorKg: targets.energyFloorKg,
      flaxTargetKg: flaxNeedKg(state, day),
    };
    const need = wantedPloughPairsOf(state, day, coverage, landscape, blocks, choice);
    state.draft = {
      ...(state.draft ?? { fourWheelOffRoad: true }),
      ...nextPloughPairs(state, need),
    };
  }
  // práce (i orba – železná špička rádla od kováře) platí podle pokrytí nástroji dne, kdy díl
  // přibude
  state.season = createSeason({ winter: [], spring: [] }, day, coverage.tools, plough);
  // podle potřeby lnu k 1. 9. se při trhání zapíše, na kolik oděvu len je (fields.md – Len)
  state.season.flaxNeedKg = flaxNeedKg(state, day);
}

/** Plodiny v pořadí hospodářského roku – v tomhle pořadí přibývají díly dne. */
const SEASON_CROPS: readonly Crop[] = ['winter', 'legume', 'flax', 'spring'];

/** Dnes je první den po posledním dni setí plodiny. */
function sowingJustEnded(crop: Crop, day: number): boolean {
  return windowOpen(crop, 'sow', day - 1) && !windowOpen(crop, 'sow', day);
}

/** Díly plodiny, na kterých setí nezačalo (úloha setí nedošla na začátek jejich úseku). */
function unsownPartIds(state: VillageState, work: CropWork, day: number): number[] {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const position = taskPosition(work, 'sow');
  return taskSpans(work, partsById, 'sow', day)
    .filter((span) => position <= span.start + EPSILON)
    .map((span) => span.id);
}

/** Díl vypadne z letošní práce (i s hotovou prací na něm) a vrátí se, jak byl (`returnPart`). */
function releasePart(state: VillageState, season: FarmSeason, id: number, day: number): void {
  const part = state.parts.find((p) => p.id === id);
  if (!part) return;
  shrinkInPlan(state, season, part, 1, day);
  for (const { work } of seasonCrops(season)) {
    if (work.partIds.includes(id)) dropFromWork(work, new Set([id]));
  }
  returnPart(part, season.startDay);
}

/**
 * Konce oken setí (fields.md – Osevní postup po dílech, bod 2): ozim, na kterém do konce října
 * setí nezačalo, jde do jaře i se zkopanou či zoranou částí (`moveParts`); jař, luštěniny a len
 * nezasetý do konce dubna z letošní práce vypadne – díl čeká na další sezónu (`returnPart`).
 */
function sowingWindowsEnd(
  state: VillageState,
  season: FarmSeason,
  day: number,
  tools: number,
): void {
  const winter = seasonCrop(season, 'winter');
  if (winter && sowingJustEnded('winter', day)) {
    const ids = unsownPartIds(state, winter, day);
    if (ids.length > 0) {
      moveParts(state, season, winter, springCrop(season), ids, day, tools);
      const moved = new Set(ids);
      for (const part of state.parts) if (moved.has(part.id)) part.crop = 'spring';
      if (winter.partIds.length === 0) dropSeasonCrop(season, 'winter');
    }
  }
  for (const crop of ['legume', 'flax', 'spring'] as const) {
    const work = seasonCrop(season, crop);
    if (!work || !sowingJustEnded(crop, day)) continue;
    for (const id of unsownPartIds(state, work, day)) releasePart(state, season, id, day);
    if (crop !== 'spring' && work.partIds.length === 0) dropSeasonCrop(season, crop);
  }
}

/**
 * Krok 2 (každý den): nutné díly den po dni (fields.md – Osevní postup po dílech, bod 3). Na
 * koncích oken setí přesune nebo vyřadí nezasetou práci; ve dnech, kdy na dílu může začít ozim
 * nebo jař (září – duben), spočítá potřebu úrody ze stavu dne a přibere díly na řadě, které ji
 * pokryjí (`neededSelection`), nebo uvolní nezačaté díly, které ves už nepotřebuje. Ves bez
 * hospodářského roku (založená během roku) ho dostane s prvním dílem.
 */
export function seasonDay(state: VillageState, day: number, coverage: CraftCoverage): void {
  if (state.season) sowingWindowsEnd(state, state.season, day, coverage.tools);
  if (sowingCropToday('first', day) === null) return;
  const targets = fieldSowingTargets(state, day, coverage);
  const { join, release } = neededSelection(state, day, {
    harvestKg: targets.harvestKg,
    legumeKg: targets.legumeKg,
    needKg: targets.needKg,
    flaxNeedKg: state.season?.flaxNeedKg ?? 0,
  });
  if (join.length > 0) {
    const season = (state.season ??= createSeason(
      { winter: [], spring: [] },
      day,
      coverage.tools,
      ableTeams(state, day) > 0,
    ));
    // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
    const plough = springCrop(season).plough !== undefined;
    const order = workOrder(villageHoldings(state));
    const partsById = new Map(state.parts.map((p) => [p.id, p]));
    for (const crop of SEASON_CROPS) {
      const parts = join.filter((j) => j.crop === crop).map((j) => partsById.get(j.id)!);
      if (parts.length === 0) continue;
      // vrácený mladý les dá za dospělé stromy klády (fields.md – Zarůstání, forest.md – Mýcení)
      addLogs(state, reclaimedLogs(parts, day));
      const work = seasonCrop(season, crop);
      if (work) addToCropWork(work, parts, day, coverage.tools, order, crop);
      else {
        const fresh = createCropWork(parts, day, coverage.tools, plough, order, crop);
        putSeasonCrop(season, { crop, ...fresh });
      }
      sowParts(parts, crop);
    }
  }
  const season = state.season;
  if (season) for (const id of release) releasePart(state, season, id, day);
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
 * Podíl dne vojvodovy rodiny na nutné práci (lord.md – Kdy jde rodina na pole, bod 1): každý den
 * v oknech volné práce (`SOWING_CAPACITY_WINDOWS`) ze zbývající nutné práce hospodářského roku
 * a volné práce vsi od dneška (`lordSowingHelp`) – když ves zaostává, rodina pomůže víc, když
 * dohnala, méně. Jen cvičící rodina; ves, která zbytek stihne sama, pomoc nemá.
 */
export function lordHelpDay(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  const season = state.season;
  if (!season) return;
  const { month } = dateOfDayIndex(day);
  const inWindow = Object.values(SOWING_CAPACITY_WINDOWS).some((segments) =>
    segments.some(([from, to]) => month >= from && month <= to),
  );
  if (!inWindow) return;
  if (!trainingFamily(state, day)) {
    delete season.lordHelp;
    return;
  }
  const plough = springCrop(season).plough !== undefined;
  const load = cropLoadOf(planLoad(season, orchardHarvestLoad(state)));
  const help = lordSowingHelp(
    load,
    sowingCapacity(state, day, coverage, plough, landscape),
    sowingCapacity(state, day, coverage, plough, landscape, undefined, { lord: true }),
  );
  if (Object.keys(help).length > 0) season.lordHelp = help;
  else delete season.lordHelp;
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
