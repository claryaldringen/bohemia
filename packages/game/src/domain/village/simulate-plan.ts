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
  clearedLogs,
  neededSelection,
  returnPart,
  rotateAfterSeason,
  sowingCropToday,
  sowParts,
  windowOpen,
  type NeededJoin,
} from './rotation';
import { pendingThreshLabor, type ThreshTask } from './threshing';
import { adultDailyMin, householdElders, householdWaterLabor, type LaborTaskName } from './labor';
import { orchardWorkRemaining } from './orchard';
import { laborPerDay } from './people';
import { dailyMinPerHousehold, woodToolsLaborFactor } from './productivity';
import {
  FOREST_BONUS,
  OXEN,
  PEAK_CAPACITY_SHARE,
  WINDOWS,
  WINTER_WINDOWS,
  WORK_FRONT_DAYS,
} from './rules';
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
  SeasonCrop,
  VillageState,
} from './types';
import { addLogs } from './wood';
import {
  addToCropWork,
  createCropWork,
  createSeason,
  cropTaskWindows,
  dropSeasonCrop,
  nearestFirst,
  partWork,
  ploughRemaining,
  putSeasonCrop,
  seasonCrop,
  seasonCrops,
  springCrop,
  surplusCrop,
  type CropTask,
  type PartWork,
  windowEndOf,
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

/** Plodina hospodářského roku – nutná, nebo nad potřebu; chybí-li, založí se bez dílů. */
function cropOf(
  season: FarmSeason,
  crop: Crop,
  surplus: boolean,
  day: number,
  tools: number,
): SeasonCrop {
  const found =
    surplus && crop !== 'legume' && crop !== 'flax'
      ? surplusCrop(season, crop)
      : seasonCrop(season, crop);
  if (found) return found;
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
  const plough = springCrop(season).plough !== undefined;
  const work: SeasonCrop = {
    crop,
    ...(surplus ? { surplus: true as const } : {}),
    ...createCropWork([], day, tools, plough, nearestFirst, crop),
  };
  putSeasonCrop(season, work);
  return work;
}

/**
 * Konce oken setí (fields.md – Osevní postup po dílech, bod 2): ozim, na kterém do konce října
 * setí nezačalo, jde do jaře i se zkopanou či zoranou částí (`moveParts`) – nutný do nutné jaře,
 * nad potřebu do jaře nad potřebu; jař, luštěniny a len nezasetý do konce dubna z letošní práce
 * vypadne – díl čeká na další sezónu (`returnPart`).
 */
function sowingWindowsEnd(
  state: VillageState,
  season: FarmSeason,
  day: number,
  tools: number,
): void {
  for (const surplus of [false, true]) {
    const winter = surplus ? surplusCrop(season, 'winter') : seasonCrop(season, 'winter');
    if (!winter || !sowingJustEnded('winter', day)) continue;
    const ids = unsownPartIds(state, winter, day);
    if (ids.length === 0) continue;
    moveParts(
      state,
      season,
      winter,
      cropOf(season, 'spring', surplus, day, tools),
      ids,
      day,
      tools,
    );
    const moved = new Set(ids);
    for (const part of state.parts) if (moved.has(part.id)) part.crop = 'spring';
    if (winter.partIds.length === 0) dropSeasonCrop(season, 'winter', surplus);
  }
  const ended: [SeasonCrop | undefined, boolean][] = [
    [seasonCrop(season, 'legume'), false],
    [seasonCrop(season, 'flax'), false],
    [seasonCrop(season, 'spring'), false],
    [surplusCrop(season, 'spring'), true],
  ];
  for (const [work, surplus] of ended) {
    if (!work || !sowingJustEnded(work.crop, day)) continue;
    for (const id of unsownPartIds(state, work, day)) releasePart(state, season, id, day);
    if ((surplus || work.crop !== 'spring') && work.partIds.length === 0) {
      dropSeasonCrop(season, work.crop, surplus);
    }
  }
}

/**
 * Díly nad potřebu, které se staly nutnými (fields.md – Osevní postup po dílech, bod 3): přejdou
 * do nutné plodiny i s hotovou prací (`moveParts`) – na čelo práce nečekají, práce na nich už
 * začala. Vrací díly výběru, které nejsou povýšené.
 */
function promoteSurplus(
  state: VillageState,
  join: readonly NeededJoin[],
  day: number,
  tools: number,
): NeededJoin[] {
  const season = state.season;
  if (!season) return [...join];
  const rest: NeededJoin[] = [];
  for (const j of join) {
    const from =
      j.crop === 'winter' || j.crop === 'spring' ? surplusCrop(season, j.crop) : undefined;
    if (!from || !from.partIds.includes(j.id)) {
      rest.push(j);
      continue;
    }
    moveParts(state, season, from, cropOf(season, j.crop, false, day, tools), [j.id], day, tools);
    if (from.partIds.length === 0) dropSeasonCrop(season, j.crop, true);
  }
  return rest;
}

/** Úlohy přípravy půdy a setí, které čelo práce nutných dílů hlídá. */
const FRONT_TASKS = ['reclaim', 'dig', 'sow'] as const;

/**
 * Rozdělaná práce čela po plodinách – lidé a spřežení (člověkodny) – a kolik jí ves za
 * `WORK_FRONT_DAYS` udělá.
 */
interface Front {
  day: number;
  people: Partial<Record<Crop, number>>;
  plough: Partial<Record<Crop, number>>;
  peopleRoom: number;
  ploughRoom: number;
}

/** Přičte k čelu práci úloh plodiny, jejichž okno dnes běží (`work` – zbytek nebo práce dílu). */
function addToFront(
  front: Front,
  crop: Crop,
  work: Readonly<Record<(typeof FRONT_TASKS)[number], number>>,
  plough: number,
): void {
  let people = 0;
  for (const task of FRONT_TASKS) if (windowOpen(crop, task, front.day)) people += work[task];
  if (windowOpen(crop, 'dig', front.day)) {
    // bez spřežení doma orbu dodělá motyka – počítá se do práce lidí
    if (front.ploughRoom > 0) front.plough[crop] = (front.plough[crop] ?? 0) + plough;
    else people += plough;
  }
  front.people[crop] = (front.people[crop] ?? 0) + people;
}

/**
 * Čelo práce nutných dílů (fields.md – Osevní postup po dílech, Postup práce po dílech): zbytek
 * přípravy půdy a setí plodin hospodářského roku v oknech, která dnes běží, proti tomu, kolik ves
 * udělá za `WORK_FRONT_DAYS` dní – lidé volnou prací po denním minimu, spřežení orbou.
 */
function workFront(state: VillageState, day: number, coverage: CraftCoverage): Front {
  const front: Front = {
    day,
    people: {},
    plough: {},
    peopleRoom: WORK_FRONT_DAYS * freeLabor(state, day, coverage).villageFree,
    ploughRoom: WORK_FRONT_DAYS * ploughCapacityPerDay(state, coverage.tools, day),
  };
  if (!state.season) return front;
  for (const { crop, work } of seasonCrops(state.season)) {
    // díly nad potřebu dostanou jen práci po stavbách – čelo nutných dílů nebrzdí
    if (work.surplus) continue;
    const rest = (task: (typeof FRONT_TASKS)[number]): number =>
      Math.max(0, work.required[task] - work.done[task]);
    const left = { reclaim: rest('reclaim'), dig: rest('dig'), sow: rest('sow') };
    addToFront(front, crop, left, ploughRemaining(work));
  }
  return front;
}

/** Konec dnešního okna přípravy půdy plodiny (měsíc) – podle něj pořadí práce dne. */
function prepEnd(crop: Crop, day: number): number {
  return windowEndOf(cropTaskWindows(crop, 'dig'), dateOfDayIndex(day).month) ?? Infinity;
}

/**
 * Na čele je místo pro další díl plodiny – rozdělaná práce lidí i spřežení, která má v práci dne
 * přednost nebo stejný konec okna (`prepEnd`), je pod tím, co ves stihne. Len, luštěniny a jař
 * s oknem do listopadu tak na podzim nebrzdí ozim.
 */
function frontRoom(front: Front, crop: Crop): boolean {
  const end = prepEnd(crop, front.day);
  let people = 0;
  let plough = 0;
  for (const c of Object.keys(front.people) as Crop[]) {
    if (prepEnd(c, front.day) > end) continue;
    people += front.people[c] ?? 0;
    plough += front.plough[c] ?? 0;
  }
  return (
    people < front.peopleRoom - EPSILON &&
    (front.ploughRoom <= 0 || plough < front.ploughRoom - EPSILON)
  );
}

/**
 * Klády za mladý les skácený při vracení přílohu (fields.md – Zarůstání, forest.md – Mýcení): za
 * díly, přes které čelo vracení přílohu došlo, dospělé stromy jako v lese vsi stejného stáří (za
 * celý strom kláda). Díl si pamatuje, že je vyklučený (`fallowBeforePlan` bez zarůstání) –
 * uvolněný se vrátí jako příloh bez lesa a křovin a klády podruhé nedá.
 */
function fellReclaimed(state: VillageState, season: FarmSeason, day: number): void {
  let partsById: Map<number, FieldPart> | null = null;
  const parts: FieldPart[] = [];
  for (const { work } of seasonCrops(season)) {
    if (!work.reclaimIds || work.reclaimIds.length === 0 || work.done.reclaim <= 0) continue;
    partsById ??= new Map(state.parts.map((p) => [p.id, p]));
    const byId = partsById;
    const overgrown = work.reclaimIds.some(
      (id) => byId.get(id)?.fallowBeforePlan?.overgrowthYears !== undefined,
    );
    if (!overgrown) continue;
    const position = taskPosition(work, 'reclaim');
    for (const span of taskSpans(work, byId, 'reclaim', day)) {
      if (span.end > position + EPSILON) break;
      const part = byId.get(span.id);
      if (part?.fallowBeforePlan?.overgrowthYears !== undefined) parts.push(part);
    }
  }
  if (parts.length === 0) return;
  addLogs(state, clearedLogs(parts, day));
  for (const part of parts) delete part.fallowBeforePlan!.overgrowthYears;
}

/**
 * Krok 2 (každý den): nutné díly den po dni (fields.md – Osevní postup po dílech, bod 3, a Postup
 * práce po dílech). Napřed klády za včera vyklučený mladý les; na koncích oken setí přesune nebo
 * vyřadí nezasetou práci; ve dnech, kdy na dílu může začít ozim nebo jař (září – duben), spočítá
 * potřebu úrody ze stavu dne a vybere díly na řadě, které ji pokryjí (`neededSelection` – nutné
 * obilí napřed), nebo uvolní nezačaté díly, které ves už nepotřebuje. K práci přibere z výběru
 * jen dávku na čele (`workFront`) – další díly, až čelo dávku dodělá; co do konce okna nepřibere,
 * počká. Ves bez hospodářského roku (založená během roku) ho dostane s prvním dílem. Vrací díly
 * výběru, které čekají (pro podíl rodiny – `lordHelpDay`).
 */
export function seasonDay(state: VillageState, day: number, coverage: CraftCoverage): NeededJoin[] {
  if (state.season) {
    fellReclaimed(state, state.season, day);
    sowingWindowsEnd(state, state.season, day, coverage.tools);
  }
  if (sowingCropToday('first', day) === null) return [];
  const targets = fieldSowingTargets(state, day, coverage);
  const { join: selected, release } = neededSelection(state, day, {
    harvestKg: targets.harvestKg,
    energyFloorKg: targets.energyFloorKg,
    legumeKg: targets.legumeKg,
    needKg: targets.needKg,
    flaxNeedKg: state.season?.flaxNeedKg ?? 0,
  });
  const season0 = state.season;
  if (season0) for (const id of release) releasePart(state, season0, id, day);
  const join = promoteSurplus(state, selected, day, coverage.tools);
  if (join.length === 0) return [];
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
  const plough = state.season
    ? springCrop(state.season).plough !== undefined
    : ableTeams(state, day) > 0;
  const front = workFront(state, day, coverage);
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const taken: NeededJoin[] = [];
  const waiting: NeededJoin[] = [];
  for (const j of join) {
    // co se do čela nevejde, počká – díly s pozdějším koncem okna nepředběhnou
    if (!frontRoom(front, j.crop)) {
      waiting.push(j);
      continue;
    }
    taken.push(j);
    const work = partWork(partsById.get(j.id)!, day, coverage.tools, plough, j.crop);
    addToFront(front, j.crop, work, work.plough);
  }
  if (taken.length === 0) return waiting;
  const season = (state.season ??= createSeason(
    { winter: [], spring: [] },
    day,
    coverage.tools,
    plough,
  ));
  // dávka dne po úsecích od domu ven (fields.md – Postup práce po čtvercích); dávky jdou za sebou
  // v pořadí výběru – nouzové přílohy až po připravených dílech
  const order = workOrder(villageHoldings(state));
  for (const crop of SEASON_CROPS) {
    const parts = taken.filter((j) => j.crop === crop).map((j) => partsById.get(j.id)!);
    if (parts.length === 0) continue;
    const work = seasonCrop(season, crop);
    if (work) addToCropWork(work, parts, day, coverage.tools, order, crop);
    else {
      const fresh = createCropWork(parts, day, coverage.tools, plough, order, crop);
      putSeasonCrop(season, { crop, ...fresh });
    }
    sowParts(parts, crop);
  }
  return waiting;
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

/** Nulová práce dílu stejného tvaru. */
function zeroWork(work: PartWork): PartWork {
  const zero = { ...work };
  for (const key of Object.keys(zero) as (keyof PartWork)[]) zero[key] = 0;
  return zero;
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
  waiting: readonly NeededJoin[] = [],
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
  // i nutné díly, které na čelo práce ještě nepřibyly – ves je potřebuje a zaostává
  const rest = planLoad(season, orchardHarvestLoad(state));
  if (waiting.length > 0) {
    const partsById = new Map(state.parts.map((p) => [p.id, p]));
    for (const { id, crop } of waiting) {
      const part = partsById.get(id);
      if (!part) continue;
      const add = partWork(part, day, coverage.tools, plough, crop);
      const into = (rest[crop] ??= zeroWork(add));
      for (const key of Object.keys(add) as (keyof PartWork)[]) into[key] += add[key];
    }
  }
  const load = cropLoadOf(rest);
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

/** Volná práce vsi za den a z čeho se počítá (viz `freeLaborPerDay`). */
interface FreeLabor {
  crafts: ReadonlySet<number>;
  apart: ReadonlySet<number>;
  productivity: number;
  manor: ReturnType<typeof manorLabor> | null;
  villageFree: number;
}

/**
 * Volná práce vsi za den (population.md – Práce): lidé mimo dílny a cvičící vojvodovu rodinu
 * krát produktivita, bez denního minima domácností s chůzí pro vodu a bez minima dvorce, které
 * rodina nepokryje. Podle ní kapacita setí i čelo práce nutných dílů (`frontRoom`).
 */
function freeLabor(state: VillageState, day: number, coverage: CraftCoverage): FreeLabor {
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
  return {
    crafts,
    apart,
    productivity,
    manor,
    villageFree: Math.max(0, capacity - dailyMin),
  };
}

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
  const { crafts, apart, productivity, manor, villageFree } = freeLabor(state, day, coverage);
  // s rodinou (`lord` – lord.md, Kdy jde rodina na pole, bod 1) i práce cvičících mužů rodiny
  // po minimu dvorce (`freeMen`; ženy jen při hladu) – jen lidé, spřežení ne
  const lordFree = options.lord === true && manor ? manor.freeMen : 0;
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
