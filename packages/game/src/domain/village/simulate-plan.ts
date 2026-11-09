// Pomocné kroky simulace dne – hospodářský rok a nutné díly, kapacita setí a společné pomocné funkce.
import { dateOfDayIndex, type CalendarDate } from '../calendar';
import { springSowingExtended } from './weather-effects';
import type { Landscape } from '../landscape';
import { nextPloughPairs } from './draft';
import { craftHouseholds, workshopLabor } from './crafts';
import { harvestHelperLabor } from './harvest-hands';
import { bufferFill, closeFieldFoodYear, sowingTargets, type SowingTargets } from './field-food';
import { sowingGroup } from './fields';
import { taskPosition, taskSpans, unsownPartIds } from './field-progress';
import { dropFromWork, moveParts, shrinkInPlan } from './land-taken';
import { ploughLayout } from './plough-blocks';
import {
  plannedFurrowEfficiency,
  relayUntouchedBands,
  sowingFurrowEfficiency,
} from './plough-trip';
import { villageLaborFactor } from './happiness';
import { familyHomes, lordApartIds, manorLabor, trainingFamily } from './lord';
import { villageHoldings, workOrder } from './holdings';
import { flaxNeedKg } from './flax';
import { ableTeams, oxPens, pairCapacityPerDay, ploughCapacityPerDay } from './oxen';
import {
  clearedLogs,
  neededSelection,
  nextSowing,
  onTurn,
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
  cropLoadOf,
  lordSowingHelp,
  SOWING_CAPACITY_WINDOWS,
  planLoad,
  windowDaysLeft,
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
import { partCenter } from './forest-clearing';
import { seedOutsideFoodKg, sowingSeedDay } from './seed';
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
import { partsByIdOf } from './parts-by-id';

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
  // práce (i orba – železná špička rádla od kováře) platí podle pokrytí nástroji dne, kdy díl
  // přibude
  state.season = createSeason({ winter: [], spring: [] }, day, coverage.tools, plough);
  // podle potřeby lnu k 1. 9. se při trhání zapíše, na kolik oděvu len je (fields.md – Len)
  state.season.flaxNeedKg = flaxNeedKg(state, day);
  // páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce) – podle nich cvičí voly; nahoru
  // hned, dolů po dvou plánech (`nextPloughPairs`); z dílů na řadě po postupu. Pod
  // pojistkou zásob i z nutných dílů mimo postup (nouzové přílohy) a nahoru hned (oxen.md – Kolik
  // volů ves chce, Pod pojistkou; Martin 27. 10. 2026)
  if (oxPens(state).length > 0) {
    const targets = fieldSowingTargets(state, day, coverage);
    const below = bufferFill(targets) < 1;
    const needed = below
      ? neededSelection(state, day, {
          harvestKg: targets.harvestKg,
          energyFloorKg: targets.energyFloorKg,
          needKg: targets.needKg,
          flaxNeedKg: state.season.flaxNeedKg ?? 0,
        }).join
      : [];
    const need = ploughPairsForRotation(state, day, coverage.tools, landscape, needed);
    state.draft = {
      ...(state.draft ?? { fourWheelOffRoad: true }),
      ...nextPloughPairs(state, need),
    };
  }
}

/** Plodiny v pořadí hospodářského roku – v tomhle pořadí přibývají díly dne. */
const SEASON_CROPS: readonly Crop[] = ['winter', 'legume', 'flax', 'spring'];

/** Dnes je první den po posledním dni setí plodiny. */
function sowingJustEnded(state: VillageState, crop: Crop, day: number): boolean {
  // dlouhá zima: jařiny se dosévají do 14. 5. (`springSowingExtended`) – konec okna je o 2 týdny
  // později (disasters.md – Zima, návrh Clauda)
  const open = (d: number): boolean =>
    windowOpen(crop, 'sow', d) || springSowingExtended(state, d, crop);
  return open(day - 1) && !open(day);
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
    if (!winter || !sowingJustEnded(state, 'winter', day)) continue;
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
    if (!work || !sowingJustEnded(state, work.crop, day)) continue;
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
 * celý strom kláda). Díl si pamatuje, že je vyklučený (`fallowBeforeSeason` bez zarůstání) –
 * uvolněný se vrátí jako příloh bez lesa a křovin a klády podruhé nedá.
 */
function fellReclaimed(state: VillageState, season: FarmSeason, day: number): void {
  let partsById: ReadonlyMap<number, FieldPart> | null = null;
  const parts: FieldPart[] = [];
  for (const { work } of seasonCrops(season)) {
    if (!work.reclaimIds || work.reclaimIds.length === 0 || work.done.reclaim <= 0) continue;
    partsById ??= partsByIdOf(state.parts);
    const byId = partsById;
    const overgrown = work.reclaimIds.some(
      (id) => byId.get(id)?.fallowBeforeSeason?.overgrowthYears !== undefined,
    );
    if (!overgrown) continue;
    const position = taskPosition(work, 'reclaim');
    for (const span of taskSpans(work, byId, 'reclaim', day)) {
      if (span.end > position + EPSILON) break;
      const part = byId.get(span.id);
      if (part?.fallowBeforeSeason?.overgrowthYears !== undefined) parts.push(part);
    }
  }
  if (parts.length === 0) return;
  // klády na hromadu u cesty u prvního vraceného dílu (forest.md – Mýcení a hromada klád)
  addLogs(state, clearedLogs(parts, day), partCenter(state, parts[0]!));
  for (const part of parts) delete part.fallowBeforeSeason!.overgrowthYears;
}

/**
 * Krok 2 (každý den): nutné díly den po dni (fields.md – Osevní postup po dílech, bod 3, a Postup
 * práce po dílech). Napřed klády za včera vyklučený mladý les; na koncích oken setí přesune nebo
 * vyřadí nezasetou práci; ve dnech, kdy na dílu může začít ozim nebo jař (září – duben), spočítá
 * potřebu úrody ze stavu dne a vybere díly na řadě, které ji pokryjí (`neededSelection` – nutné
 * obilí napřed), nebo uvolní nezačaté díly, které ves už nepotřebuje. K práci přibere z výběru
 * jen dávku na čele (`workFront`) – další díly, až čelo dávku dodělá; co do konce okna nepřibere,
 * počká. Ves bez hospodářského roku (založená během roku) ho dostane s prvním dílem. Nakonec
 * hromada osiva okna setí (`sowingSeedDay`). Vrací díly výběru, které čekají (pro podíl rodiny –
 * `lordHelpDay`).
 */
export function seasonDay(state: VillageState, day: number, coverage: CraftCoverage): NeededJoin[] {
  const { waiting } = seasonJoins(state, day, coverage);
  // hromada osiva okna setí po výběru dílů dne (fields.md – Osivo bez cíle osevu)
  sowingSeedDay(state, day);
  return waiting;
}

/**
 * Díly dne do plánu (viz `seasonDay`); vrací vybrané díly, které na čelo nepřišly, a roční
 * potřebu z pole (`energyFloorKg`, null = dnes díl začít nesmí).
 */
function seasonJoins(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { waiting: NeededJoin[]; floorKg: number | null } {
  const none = { waiting: [], floorKg: null };
  if (state.season) {
    fellReclaimed(state, state.season, day);
    sowingWindowsEnd(state, state.season, day, coverage.tools);
  }
  if (sowingCropToday('first', day) === null) {
    if (state.season) delete state.season.selection;
    return none;
  }
  // čelo bez místa pro jakoukoli plodinu – žádný díl dnes nepřibude, ves nový výběr nedělá
  // a čekající díly bere z posledního dne s místem na čele (fields.md – Postup práce po dílech)
  const window = selectionWindow(day);
  const held = state.season?.selection;
  if (held?.window === window) {
    const full = workFront(state, day, coverage);
    if (!SEASON_CROPS.some((crop) => frontRoom(full, crop))) {
      return { waiting: held.waiting, floorKg: held.floorKg };
    }
  }
  const joins = seasonSelection(state, day, coverage);
  if (state.season) {
    state.season.selection = {
      window,
      waiting: joins.waiting.map((j) => ({ id: j.id, crop: j.crop })),
      floorKg: joins.floorKg,
    };
  }
  return joins;
}

/** Měsíc a plodiny, které dnes smí začít – výběr dílů z paměti platí jen ve stejném. */
function selectionWindow(day: number): string {
  const first = sowingCropToday('first', day);
  const spring = sowingCropToday('spring', day);
  return `${dateOfDayIndex(day).month}:${first}:${spring}`;
}

/** Výběr dílů dne a přibrání dávky na čelo (viz `seasonDay`). */
function seasonSelection(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { waiting: NeededJoin[]; floorKg: number | null } {
  const targets = fieldSowingTargets(state, day, coverage);
  const { join: selected, release } = neededSelection(state, day, {
    harvestKg: targets.harvestKg,
    energyFloorKg: targets.energyFloorKg,
    needKg: targets.needKg,
    flaxNeedKg: state.season?.flaxNeedKg ?? 0,
  });
  const season0 = state.season;
  if (season0) for (const id of release) releasePart(state, season0, id, day);
  const join = promoteSurplus(state, selected, day, coverage.tools);
  const floorKg = targets.energyFloorKg;
  if (join.length === 0) return { waiting: [], floorKg };
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
  const plough = state.season
    ? springCrop(state.season).plough !== undefined
    : ableTeams(state, day) > 0;
  const front = workFront(state, day, coverage);
  const partsById = partsByIdOf(state.parts);
  // spřežení orá po pásech (oxen.md – Co nejdelší brázda): díl přibude s celým svým pásem
  // z rozvržení výběru plodiny, ať dávka dne nezkrátí brázdu (návrh Clauda, 25. 10. 2026)
  const bandOf = plough ? joinBands(join, partsById) : null;
  const taken: NeededJoin[] = [];
  const waiting: NeededJoin[] = [];
  const inTaken = new Set<number>();
  for (const j of join) {
    if (inTaken.has(j.id)) continue;
    // co se do čela nevejde, počká – díly s pozdějším koncem okna nepředběhnou
    if (!frontRoom(front, j.crop)) {
      waiting.push(j);
      continue;
    }
    for (const id of bandOf?.get(j.id) ?? [j.id]) {
      if (inTaken.has(id)) continue;
      inTaken.add(id);
      taken.push({ id, crop: j.crop });
      const work = partWork(partsById.get(id)!, day, coverage.tools, plough, j.crop);
      addToFront(front, j.crop, work, work.plough);
    }
  }
  if (taken.length === 0) return { waiting, floorKg };
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
    if (work) {
      addToCropWork(work, parts, day, coverage.tools, order, crop);
      // dávka dne se nezačatými díly – pásy jako najednou (oxen.md – Co nejdelší brázda)
      relayUntouchedBands(work, partsById, day);
    } else {
      const fresh = createCropWork(parts, day, coverage.tools, plough, order, crop);
      putSeasonCrop(season, { crop, ...fresh });
    }
    sowParts(parts, crop);
  }
  return { waiting, floorKg };
}

/**
 * Pás každého dílu výběru (díly téže plodiny pásu v pořadí orby) z rozvržení orby dílů výběru po
 * plodinách (`ploughLayout`).
 */
function joinBands(
  join: readonly NeededJoin[],
  partsById: ReadonlyMap<number, FieldPart>,
): Map<number, number[]> {
  const bandOf = new Map<number, number[]>();
  for (const crop of SEASON_CROPS) {
    const parts = join.filter((j) => j.crop === crop).map((j) => partsById.get(j.id)!);
    if (parts.length === 0) continue;
    for (const band of ploughLayout(parts).bands) {
      for (const id of band.partIds) bandOf.set(id, band.partIds);
    }
  }
  return bandOf;
}

/**
 * Cíle osevu (fields.md – Kolik ves oseje, Osev podle zásob): úroda na rok spotřeby z pole
 * a pojistku bez toho, co ze zásob k příští sklizni zbude (luštěniny ves na poli nepěstuje –
 * fields.md, Luštěniny, zrušeno; jí je jen ze zásoby). Hromadu osiva okna setí a osivo jen na setí
 * (`seedOutsideFoodKg` – i osivo zakladatelů v lhůtě) zásoby k sklizni nekrmí; s `reserveSeed = false`
 * krmí (správce – vystačí zásoby do žní, i kdyby ves snědla osivo? steward.md – Cíl, Režim
 * správce).
 */
export function fieldSowingTargets(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  reserveSeed = true,
): SowingTargets {
  return sowingTargets(
    state,
    day,
    coverage.pottery,
    reserveSeed ? seedOutsideFoodKg(state, day) : 0,
  );
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
    const partsById = partsByIdOf(state.parts);
    for (const { id, crop } of waiting) {
      const part = partsById.get(id);
      if (!part) continue;
      const add = partWork(part, day, coverage.tools, plough, crop);
      const into = (rest[crop] ??= zeroWork(add));
      for (const key of Object.keys(add) as (keyof PartWork)[]) into[key] += add[key];
    }
  }
  const load = cropLoadOf(rest);
  const village = sowingCapacity(state, day, coverage, plough, landscape);
  // orba spřežení na rodině nezávisí – podruhé se nepočítá (výkon; výsledek týž)
  const withLord = sowingCapacity(state, day, coverage, plough, landscape, undefined, {
    lord: true,
    ...(village.plough ? { ploughCapacity: village.plough } : {}),
  });
  const help = lordSowingHelp(load, village, withLord);
  if (Object.keys(help).length > 0) season.lordHelp = help;
  else delete season.lordHelp;
}

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
 * Žně všemi rukama (fields.md – Žně všemi rukama; Martin 24. 10. 2026: „Dílny i vojvodova
 * rodina“): v oknech žní a výmlatu i řemeslníci se syny (`WorkshopLabor` – řemeslo i žeň), cvičící
 * muži rodiny (`freeMen`) a výrostci se staršími (`harvestHelperLabor`) – tytéž ruce jako `work()`.
 */
function harvestHands(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  { crafts, apart, productivity, manor }: FreeLabor,
): number {
  return (
    [...crafts].reduce((sum, id) => {
      const labor = workshopLabor(state, day, id, coverage.pottery, productivity);
      return sum + labor.craft + labor.harvest;
    }, 0) +
    (manor ? manor.freeMen : 0) +
    harvestHelperLabor(state, day, apart, productivity, coverage.pottery) * productivity
  );
}

/**
 * Práce vsi za den na poli ve žních a výmlatu (člověkodny – den oken `july` a `august`
 * v `sowingCapacity`): volná práce vsi po denním minimu se žňovými rukama, ve špičce
 * PEAK_CAPACITY_SHARE. Podle ní i výhled výmlatu (`sheavesOutlook` – ruce do konce okna).
 */
export function harvestLaborPerDay(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): number {
  const labor = freeLabor(state, day, coverage);
  return (labor.villageFree + harvestHands(state, day, coverage, labor)) * PEAK_CAPACITY_SHARE;
}

/**
 * Rezerva dne v okně setí, se kterou počítá plán kapacity osevu (`sowingCapacity`, páry k rádlům):
 * seje se sice týž den hned za orbou a motykou (fields.md – Práce), plán ale dál počítá s jedním
 * dnem méně (návrh Clauda – odhad zůstává opatrný; celé okno by posunulo zakládání polí správcem,
 * samostatná změna k ověření).
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
 * denní orba všech spřežení krát dny oken kopání – září–říjen pro ozim (bez dne rezervy
 * `SOW_AFTER_DIG_DAYS`), září–listopad a březen–duben pro jař a luštěniny. Cvičící
 * vojvodova rodina je mimo práci vsi; s `lord` se přičte i práce jejích mužů po minimu dvorce
 * (`manorLabor` – `freeMen`, lord.md – Kdy jde rodina na pole, bod 1) – jen do plánu potřebného osevu.
 * `ploughCapacity` – orba spřežení z jiného volání téhož dne a vsi (na `lord` nezávisí), jen se
 * převezme.
 */
export function sowingCapacity(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  plough = false,
  landscape: Landscape | null = null,
  pairs?: number,
  options: { lord?: boolean; ploughCapacity?: NonNullable<SowingCapacity['plough']> } = {},
): SowingCapacity {
  const labor = freeLabor(state, day, coverage);
  const { manor, villageFree } = labor;
  // s rodinou (`lord` – lord.md, Kdy jde rodina na pole, bod 1) i práce cvičících mužů rodiny
  // po minimu dvorce (`freeMen`; ženy jen při hladu) – jen lidé, spřežení ne
  const lordFree = options.lord === true && manor ? manor.freeMen : 0;
  const free = (villageFree + lordFree) * PEAK_CAPACITY_SHARE;
  const hands = harvestHands(state, day, coverage, labor);
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
  if (options.ploughCapacity) return { ...people, plough: { ...options.ploughCapacity } };
  // výkon podle délky brázd polí, na která ves může zasít – na pevných cestách se brázda láme
  // (oxen.md – Co nejdelší brázda, Brázdy končí na cestě)
  const perDay =
    ploughCapacityPerDay(state, coverage.tools, day, pairs) *
    sowingFurrowEfficiency(
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

/**
 * Páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce; fields.md – Osevní postup po dílech,
 * Páry k rádlům): nejméně párů (nejvýš OXEN.maxPairs), které v oknech orby zorají všechny díly na
 * řadě v hospodářském roce od `day` (1. 9. po postupu dílů) – nutné i nad potřebu, ves chce zorat
 * všechno (návrh Clauda). Ozim (první osev, ozim po jaři) se orá v podzimním okně ozimu, jař po
 * ozimu na podzim po ozimu nebo na jaře; výkon páru `ploughCapacityPerDay` podle délky brázd dílů
 * (`plannedFurrowEfficiency`); nejvýš tolik párů, kolik ves obslouží lidmi (`OXEN.crewPerPair`).
 * Přílohy 70–95 % a nouzové (jen při hladu) nepočítá – kromě nutných dílů `needed` (pod
 * pojistkou zásob výběr nutných dílů k 1. 9., i nouzové přílohy – oxen.md, Kolik volů ves chce,
 * Pod pojistkou): ty, které na řadě nejsou, přičte – ozim k ozimu, ostatní k jaři.
 */
export function ploughPairsForRotation(
  state: VillageState,
  day: number,
  toolCoverage: number,
  landscape: Landscape | null,
  needed: readonly NeededJoin[] = [],
): number {
  const autumn: FieldPart[] = [];
  const spring: FieldPart[] = [];
  const counted = new Set<number>();
  for (const part of state.parts) {
    const kind = nextSowing(part);
    if (!onTurn(kind)) continue;
    (kind === 'spring' ? spring : autumn).push(part);
    counted.add(part.id);
  }
  if (needed.length > 0) {
    const partsById = new Map(state.parts.map((p) => [p.id, p]));
    for (const { id, crop } of needed) {
      const part = partsById.get(id);
      if (!part || counted.has(id)) continue;
      counted.add(id);
      (crop === 'winter' ? autumn : spring).push(part);
    }
  }
  if (autumn.length + spring.length === 0) return 1;
  const load = (parts: readonly FieldPart[], crop: Crop): number =>
    parts.reduce((sum, p) => sum + partWork(p, day, toolCoverage, true, crop).plough, 0);
  const autumnLoad = load(autumn, 'winter');
  const allLoad = autumnLoad + load(spring, 'spring');
  const perPair =
    pairCapacityPerDay(toolCoverage) *
    plannedFurrowEfficiency([...autumn, ...spring], state, landscape);
  // páry, které ves s lidmi, co má, obslouží: oráč na pár a setí za ním (`OXEN.crewPerPair`)
  const crew = state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  const staffed = Math.max(1, Math.floor(crew / OXEN.crewPerPair + EPSILON));
  const cap = Math.min(OXEN.maxPairs, staffed);
  if (perPair <= 0) return cap;
  // dny oken orby do konce hospodářského roku – ozim jen na podzim, jař na podzim i na jaře
  const days = (crop: Crop): number =>
    Math.max(1, windowDaysLeft(day, cropTaskWindows(crop, 'plough')) - SOW_AFTER_DIG_DAYS);
  const pairs = Math.max(
    autumnLoad / (perPair * days('winter')),
    allLoad / (perPair * days('spring')),
  );
  return Math.min(cap, Math.max(1, Math.ceil(pairs - EPSILON)));
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
  /**
   * Orba a kopání: setí týž den hned za úlohou (fields.md – Práce) – člověkodny setí na člověkoden
   * úlohy, kolik dnes dovolí osivo. Chybí = za úlohou se dnes neseje.
   */
  sowRatio?: number;
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
