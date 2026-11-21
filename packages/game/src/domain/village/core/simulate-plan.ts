// Pomocné kroky simulace dne – hospodářský rok a díly na řadě, kapacita setí a společné pomocné funkce.
import { dateOfDayIndex, type CalendarDate } from '../../calendar';
import { springSowingExtended } from '../disasters/weather-effects';
import type { Landscape } from '../../landscape';
import { nextPloughPairs } from '../livestock/draft';
import { craftHouseholds, workshopLabor } from '../crafts/crafts';
import { harvestHandsDay, harvestHelperLabor } from '../fields/harvest-hands';
import { closeFieldFoodYear, storesOutlook, type StoresOutlook } from '../fields/field-food';
import { sowingGroup } from '../fields/fields';
import { taskPosition, taskSpans, unsownPartIds } from '../fields/field-progress';
import { dropFromWork, moveParts, shrinkInPlan } from '../buildings/land-taken';
import { ploughBandFinder } from '../livestock/plough-blocks';
import {
  plannedFurrowEfficiency,
  relayUntouchedBands,
  sowingFurrowEfficiency,
} from '../livestock/plough-trip';
import { villageLaborFactor } from '../people/happiness';
import { familyHomes, lordApartIds, manorLabor, trainingFamily } from '../people/lord';
import { villageHoldings, workOrder } from '../fields/holdings';
import { flaxNeedKg } from '../fields/flax';
import { ableTeams, oxPens, pairCapacityPerDay, ploughCapacityPerDay } from '../livestock/oxen';
import {
  clearedLogs,
  nextSowing,
  onTurn,
  returnPart,
  rotateAfterSeason,
  sowingCropToday,
  sowParts,
  springStartable,
  turnSelection,
  windowOpen,
  type SeasonJoin,
} from '../fields/rotation';
import { grainThreshWork, sheavesOutlook, type ThreshTask } from '../fields/threshing';
import { HAY_WINTER_MONTHS, mowingNeededRemaining } from '../livestock/hay';
import {
  LIVESTOCK,
  cullingMeatKg,
  slaughterRemaining,
  slaughterSeasonDaysLeft,
} from '../livestock/livestock';
import {
  adultDailyMin,
  HARVEST_CHORES,
  householdElders,
  householdWaterLabor,
  SUMMER_CHORES,
  type DayChores,
  type LaborTaskName,
} from './labor';
import { dayChores } from './day-chores';
import { planVillagers } from './morning-water';
import { daylightFactor, monthDaylight } from './daylight';
import { orchardWorkRemaining } from '../buildings/orchard';
import { laborPerDay } from '../people/people';
import { dailyMinPerHousehold, woodToolsLaborFactor } from './productivity';
import {
  FOREST_BONUS,
  OXEN,
  PEAK_CAPACITY_SHARE,
  PLANNING_DAY,
  WINDOWS,
  WINTER_WINDOWS,
  WORK_FRONT_DAYS,
  type WindowSegment,
} from '../rules';
import {
  cropLoadOf,
  lordHarvestHelp,
  lordSowingHelp,
  HARVEST_HELP_WINDOWS,
  SOWING_CAPACITY_WINDOWS,
  SOWING_HELP_WINDOWS,
  planLoad,
  windowDaylightLeft,
  windowDaylightWithout,
  windowDaysLeft,
  type SowingCapacity,
  type SowingLoad,
} from '../fields/sowing';
import type {
  CraftCoverage,
  Crop,
  CropWork,
  Dwelling,
  FarmSeason,
  FieldPart,
  LordHelp,
  LordHelpWindow,
  SeasonCrop,
  VillageState,
} from '../types';
import { addLogs } from '../forest/wood';
import { partCenter } from '../forest/forest-clearing';
import {
  reservedSeedKg,
  seedForSowingKg,
  seedKeepKg,
  seedOutsideFoodKg,
  seedStore,
  sowingSeedDay,
  windowSeedThreshKg,
  workSeedKg,
} from '../fields/seed';
import {
  addToCropWork,
  createCropWork,
  createSeason,
  cropSeedPerHa,
  cropTaskWindows,
  dropSeasonCrop,
  emptyTaskRecord,
  lateHarvestRemaining,
  lateSpringCrop,
  nearestFirst,
  partWork,
  ploughRemaining,
  putSeasonCrop,
  seasonCrop,
  seasonCrops,
  springCrop,
  type CropTask,
  windowEndOf,
} from './year-plan';
import { partsByIdOf } from './parts-by-id';

export type DayOfYear = Readonly<Pick<CalendarDate, 'month' | 'day'>>;

// Řemesla (crafts.md): pokrytí potřeby nástrojů a nádob se spočítá na začátku dne ze zásob
// (`craftCoverage`) a posouvá všechny meze produktivity dne – práci dílů hospodářského roku
// (polní práce a vracení přílohu), denní minimum, ztráty zásob a jablka v nádobách. Domácnosti dílen
// pracují jen v dílně (`workCrafts`), polní ani společnou práci nedělají.

/** Okno bonusu vymýceného lesa trvá roky × 365 dní. */
const DAYS_PER_BONUS_YEAR = 365;

/** Tolerance, pod kterou se nasycení ještě bere jako plné. */
export const SATIATION_EPSILON = 1e-9;

/** Tolerance proti chybám desetinných čísel (vozy pro uhlí a rudu). */
export const EPSILON = 1e-9;
const M2_PER_HA = 10_000;

export function isOn(date: CalendarDate, target: DayOfYear): boolean {
  return date.month === target.month && date.day === target.day;
}

// --- hospodářský rok a díly na řadě --------------------------------------------------------

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
  // kolik jídla ves za uplynulý rok potřebovala z pole – podle toho potřeba z pole ve výhledu
  // zásob k sklizni (fields.md – Výhled zásob k sklizni, Osev podle stravy)
  closeFieldFoodYear(state);
  // díly jaře, kterou srpen nedosklidil, hospodářský rok končí, až jde do snopů – do té doby se
  // neorají pod ozim (`harvestLateSpring`; fields.md – Žeň jaře i v září)
  const late = new Set(lateSpringCrop(state)?.partIds ?? []);
  for (const part of state.parts) if (!late.has(part.id)) rotateAfterSeason(part, day);
  // ves s párem volů a rádlem orá všechno, motyka nekope (oxen.md – Jen rádlo)
  const plough = ableTeams(state, day) > 0;
  // práce (i orba – železná špička rádla od kováře) platí podle pokrytí nástroji dne, kdy díl
  // přibude
  state.season = createSeason({ winter: [], spring: [] }, day, coverage.tools, plough);
  // len do potřeby na oděv k 1. 9. – podle ní ves vybírá díly lnu a při trhání zapíše, na kolik
  // oděvu len je (fields.md – Len)
  state.season.flaxNeedKg = flaxNeedKg(state, day);
  // páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce) – podle nich cvičí voly; nahoru
  // hned, dolů po dvou plánech (`nextPloughPairs`); z celého pořadí dílů na řadě po postupu
  if (oxPens(state).length > 0) {
    const need = ploughPairsForRotation(state, day, coverage.tools, landscape);
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

/** Plodina hospodářského roku; chybí-li, založí se bez dílů. */
function cropOf(season: FarmSeason, crop: Crop, day: number, tools: number): SeasonCrop {
  const found = seasonCrop(season, crop);
  if (found) return found;
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
  const plough = springCrop(season).plough !== undefined;
  const work: SeasonCrop = {
    crop,
    ...createCropWork([], day, tools, plough, nearestFirst, crop),
  };
  putSeasonCrop(season, work);
  return work;
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
  if (winter && sowingJustEnded(state, 'winter', day)) {
    const ids = unsownPartIds(state, winter, day);
    if (ids.length > 0) {
      moveParts(state, season, winter, cropOf(season, 'spring', day, tools), ids, day, tools);
      const moved = new Set(ids);
      for (const part of state.parts) if (moved.has(part.id)) part.crop = 'spring';
      if (winter.partIds.length === 0) dropSeasonCrop(season, 'winter');
    }
  }
  for (const crop of ['legume', 'flax', 'spring'] as const) {
    const work = seasonCrop(season, crop);
    if (!work || !sowingJustEnded(state, work.crop, day)) continue;
    for (const id of unsownPartIds(state, work, day)) releasePart(state, season, id, day);
    if (work.crop !== 'spring' && work.partIds.length === 0) dropSeasonCrop(season, work.crop);
  }
}

/** Úlohy přípravy půdy a setí, které čelo práce hlídá. */
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
 * Čelo práce (fields.md – Osevní postup po dílech, Postup práce po dílech): zbytek
 * přípravy půdy a setí plodin hospodářského roku v oknech, která dnes běží, proti tomu, kolik ves
 * udělá za `WORK_FRONT_DAYS` dní – lidé volnou prací po denním minimu i s pomocí rodiny
 * s přípravou půdy a setím (`frontLabor`), spřežení orbou.
 */
function workFront(state: VillageState, day: number, coverage: CraftCoverage): Front {
  const front: Front = {
    day,
    people: {},
    plough: {},
    // dnešní délka dne a skladba dne jako práce dne (population.md – Skladba dne podle období);
    // žeň jaře, kterou srpen nedosklidil, jde v září před orbou a setím (fields.md – Žeň jaře
    // i v září; Martin 9. 11. 2026) – čelo má jen práci, která po ní zbude
    peopleRoom: Math.max(
      0,
      WORK_FRONT_DAYS *
        frontLabor(freeLabor(state, day, coverage, dayChores(state, day))) *
        daylightFactor(day) -
        lateHarvestRemaining(state),
    ),
    ploughRoom:
      WORK_FRONT_DAYS * ploughCapacityPerDay(state, coverage.tools, day) * daylightFactor(day),
  };
  if (!state.season) return front;
  for (const { crop, work } of seasonCrops(state.season)) {
    const rest = (task: (typeof FRONT_TASKS)[number]): number =>
      Math.max(0, work.required[task] - work.done[task]);
    const left = { reclaim: rest('reclaim'), dig: rest('dig'), sow: rest('sow') };
    addToFront(front, crop, left, ploughRemaining(work));
  }
  return front;
}

/**
 * Práce lidí na čele za den: volná práce vsi a pomoc cvičící rodiny s přípravou půdy a setím
 * (`manorLabor` – `sowing`, podíl dne z plánu `FarmSeason.lordSowing`; lord.md – Kdy jde rodina na
 * pole, Příprava půdy a setí – D102), ať čelo nese i práci, kterou dnes dá rodina.
 */
function frontLabor(labor: FreeLabor): number {
  return labor.villageFree + (labor.manor?.sowing ?? 0);
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
 * Krok 2 (každý den): díly na řadě den po dni (fields.md – Osevní postup po dílech, bod 3, a
 * Postup práce po dílech). Napřed klády za včera vyklučený mladý les; na koncích oken setí přesune
 * nebo vyřadí nezasetou práci; ve dnech, kdy na dílu může začít ozim nebo jař (září – duben),
 * vybere všechny díly na řadě v pořadí přílohové soustavy (`turnSelection` – bez odhadu úrody
 * a bez stropu). K práci přibere z výběru jen dávku na čele (`workFront`) – další díly, až čelo
 * dávku dodělá; co do konce okna nepřibere, počká. Ves bez hospodářského roku (založená během
 * roku) ho dostane s prvním dílem. Nakonec hromada osiva okna setí a zimní osivo
 * (`sowingSeedDay`). Vrací díly výběru, které na čelo práce nepřišly (`work()` – čekající plodiny).
 */
export function seasonDay(state: VillageState, day: number, coverage: CraftCoverage): SeasonJoin[] {
  const { waiting } = seasonJoins(state, day, coverage);
  // hromada osiva okna setí po výběru dílů dne (fields.md – Osivo bez cíle osevu)
  sowingSeedDay(state, day);
  return waiting;
}

/** Díly dne do plánu (viz `seasonDay`); vrací vybrané díly, které na čelo nepřišly. */
function seasonJoins(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { waiting: SeasonJoin[] } {
  const none = { waiting: [] };
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
      return { waiting: held.waiting };
    }
  }
  const joins = seasonSelection(state, day, coverage);
  if (state.season) {
    state.season.selection = {
      window,
      waiting: joins.waiting.map((j) => ({ id: j.id, crop: j.crop })),
    };
  }
  return joins;
}

/** Měsíc a plodiny, které dnes smí začít – výběr dílů z paměti platí jen ve stejném. */
function selectionWindow(day: number): string {
  const first = sowingCropToday('first', day);
  return `${dateOfDayIndex(day).month}:${first}:${springStartable(day)}`;
}

/** Výběr dílů dne a přibrání dávky na čelo (viz `seasonDay`). */
function seasonSelection(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): { waiting: SeasonJoin[] } {
  const join = turnSelection(state, day, {
    flaxNeedKg: state.season?.flaxNeedKg ?? 0,
    shortage: grainShortage(state, day),
  });
  if (join.length === 0) return { waiting: [] };
  // jař se buď celá orá, nebo celá kope (oxen.md – Jen rádlo) – nové plodiny jako jař
  const plough = state.season
    ? springCrop(state.season).plough !== undefined
    : ableTeams(state, day) > 0;
  const front = workFront(state, day, coverage);
  const partsById = partsByIdOf(state.parts);
  // spřežení orá po pásech (oxen.md – Díly po dávkách): s dílem na řadě přibudou další díly jeho
  // pásu, ať dávka dne nezkrátí brázdu (návrh Clauda, 25. 10. 2026) – pás jen z dílů stejné
  // skupiny přílohové soustavy (`joinBands`) a každý díl jen s místem na čele, ať pás nepředběhne
  // Pořadí dávek (fields.md; návrh Clauda 19. 11. 2026 – D101)
  const bandOf = plough ? joinBands(join, partsById) : null;
  const taken: SeasonJoin[] = [];
  const waiting: SeasonJoin[] = [];
  const inTaken = new Set<number>();
  for (const j of join) {
    if (inTaken.has(j.id)) continue;
    // co se do čela nevejde, počká – díly s pozdějším koncem okna nepředběhnou
    if (!frontRoom(front, j.crop)) {
      waiting.push(j);
      continue;
    }
    for (const id of bandFrom(bandOf?.(j), j.id)) {
      if (inTaken.has(id)) continue;
      // místo na čele u každého dílu pásu – čelo se jen plní, takže zbytek pásu počká ve výběru
      if (!frontRoom(front, j.crop)) break;
      inTaken.add(id);
      taken.push({ id, crop: j.crop });
      const work = partWork(partsById.get(id)!, day, coverage.tools, plough, j.crop);
      addToFront(front, j.crop, work, work.plough);
    }
  }
  if (taken.length === 0) return { waiting };
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
  return { waiting };
}

/**
 * Skutečný nedostatek (fields.md – Osevní postup po dílech, bod 3, „na řadě“ – návrh Clauda): zrno
 * k sklizni – zásoby i s hromadou osiva okna a snopy, které ves vymlátí – je pod přežívací zásobou
 * do žní (`seedKeepKg`). Hromada osiva se do zásob počítá – nedostatek nevzniká tím, že ves odloží
 * osivo; osivo, které ves má jen na setí (`reservedSeedKg`), jídlem není.
 */
function grainShortage(state: VillageState, day: number): boolean {
  const grainKg =
    Math.max(0, state.storesKg - reservedSeedKg(state)) + sheavesOutlook(state, day).grainKg;
  return grainKg < seedKeepKg(state, day) - EPSILON;
}

/**
 * Pás každého dílu výběru (díly pásu v pořadí orby) z rozvržení orby dílů výběru téže plodiny
 * a téže skupiny přílohové soustavy (`sowingGroup`, nouzové přílohy zvlášť – `ploughLayout`):
 * k připravenému dílu tak pás nepřitáhne zarostlý příloh a k přílohu nouzový (fields.md – Pořadí
 * dávek; návrh Clauda 19. 11. 2026 – D101, dřív pás z celého výběru plodiny). Líně, jen bloky
 * dílů, na které se volající zeptá (`ploughBandFinder`; id ve výběru jsou různá –
 * `turnSelection`). Díl bez pásu undefined.
 */
function joinBands(
  join: readonly SeasonJoin[],
  partsById: ReadonlyMap<number, FieldPart>,
): (j: SeasonJoin) => readonly number[] | undefined {
  const keyOf = (j: SeasonJoin): string =>
    `${j.crop}:${sowingGroup(partsById.get(j.id)!) ?? 'emergency'}`;
  // díly výběru po plodině a skupině – jedním průchodem, až je potřeba
  let lists: Map<string, FieldPart[]> | null = null;
  const finders = new Map<string, (id: number) => readonly number[] | undefined>();
  return (j) => {
    if (!SEASON_CROPS.includes(j.crop)) return undefined;
    const key = keyOf(j);
    let find = finders.get(key);
    if (!find) {
      if (!lists) {
        lists = new Map();
        for (const x of join) {
          const k = keyOf(x);
          const list = lists.get(k);
          if (list) list.push(partsById.get(x.id)!);
          else lists.set(k, [partsById.get(x.id)!]);
        }
      }
      find = ploughBandFinder(lists.get(key) ?? []);
      finders.set(key, find);
    }
    return find(j.id);
  };
}

/**
 * Díly pásu v pořadí, ve kterém přibývají na čelo (`seasonSelection`): díl na řadě, pak dál podél
 * brázdy do konce pásu a nakonec od něj zpět k začátku pásu – kus pásu, který čelo utne, je tak
 * souvislý a díl na řadě v něm je vždy (návrh Clauda 19. 11. 2026 – D101). Díl bez pásu sám.
 */
function bandFrom(band: readonly number[] | undefined, id: number): readonly number[] {
  const at = band ? band.indexOf(id) : -1;
  if (!band || at < 0) return [id];
  return [...band.slice(at), ...band.slice(0, at).reverse()];
}

/**
 * Výhled zásob z pole k příští sklizni (fields.md – Výhled zásob k sklizni; `storesOutlook`).
 * Osivo, které ves z hromady ještě zaseje, a osivo jen na setí (`seedOutsideFoodKg` – i osivo
 * zakladatelů v lhůtě) zásoby k sklizni nekrmí; s `reserveSeed = false` krmí (správce – vystačí
 * zásoby do žní, i kdyby ves snědla osivo? steward.md – Cíl, Režim správce).
 */
export function fieldStoresOutlook(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  reserveSeed = true,
): StoresOutlook {
  return storesOutlook(
    state,
    day,
    coverage.pottery,
    reserveSeed ? seedOutsideFoodKg(state, day, coverage.tools) : 0,
  );
}

/**
 * Podíly dne vojvodovy rodiny (lord.md – Kdy jde rodina na pole): každý den v oknech žní
 * (`HARVEST_HELP_WINDOWS` – červenec, srpen, září) ze zbývající práce hospodářského roku a volné
 * práce vsi od dneška (`lordHarvestHelp` → `FarmSeason.lordHelp`) a v oknech setí
 * (`SOWING_HELP_WINDOWS` – září–listopad, březen–duben; Martin 19. 11. 2026 – D102) z práce
 * přípravy půdy a setí půdy, na kterou má ves osivo, i s díly na řadě mimo čelo práce
 * (`sowingHelpLoad`, `lordSowingHelp` → `FarmSeason.lordSowing`) – když ves zaostává, rodina pomůže
 * víc, když dohnala, méně. Jen cvičící rodina; ves, která práci okna stihne sama, pomoc nemá.
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
  const open = (windows: readonly LordHelpWindow[]): boolean =>
    windows.some((window) =>
      SOWING_CAPACITY_WINDOWS[window].some(([from, to]) => month >= from && month <= to),
    );
  const harvest = open(HARVEST_HELP_WINDOWS);
  const sowing = open(SOWING_HELP_WINDOWS);
  if (!harvest && !sowing) return;
  if (!trainingFamily(state, day)) {
    if (harvest) delete season.lordHelp;
    if (sowing) delete season.lordSowing;
    return;
  }
  const plough = springCrop(season).plough !== undefined;
  // volná práce vsi v oknech setí bez úloh dne, které jdou před přípravou půdy (D102 kolo 1)
  const village = sowingCapacity(state, day, coverage, plough, landscape, undefined, {
    beforeTillage: true,
  });
  // orba spřežení na rodině nezávisí – podruhé se nepočítá (výkon; výsledek týž)
  const withLord = sowingCapacity(state, day, coverage, plough, landscape, undefined, {
    lord: true,
    beforeTillage: true,
    ...(village.plough ? { ploughCapacity: village.plough } : {}),
  });
  if (harvest) {
    // v září žeň jaře, kterou srpen nedosklidil (fields.md – Žeň jaře i v září)
    const load = {
      ...cropLoadOf(planLoad(season, orchardHarvestLoad(state))),
      september: lateHarvestRemaining(state),
    };
    putShares(season, 'lordHelp', lordHarvestHelp(load, village, withLord));
  }
  if (sowing) {
    const load = cropLoadOf(sowingHelpLoad(state, day, coverage.tools, plough, village.plough));
    putShares(season, 'lordSowing', lordSowingHelp(load, village, withLord));
  }
}

/** Zapíše podíly dne rodiny do plánu; bez podílu klíč zmizí. */
function putShares(season: FarmSeason, key: 'lordHelp' | 'lordSowing', help: LordHelp): void {
  if (Object.keys(help).length > 0) season[key] = help;
  else delete season[key];
}

/** Úlohy přípravy půdy a setí v zátěži pomoci rodiny (`sowingHelpLoad`). */
const HELP_TILLAGE = ['reclaim', 'dig', 'sow'] as const;

/**
 * Práce přípravy půdy a setí pro pomoc rodiny (lord.md – Kdy jde rodina na pole, Příprava půdy
 * a setí; D102 – podoba „co ves sama nestihne“ návrh Clauda): zbytek letošní práce plodin
 * (`planLoad` – i sklizeň jablek, které jdou v témže okně) a díly na řadě, které na čelo práce
 * dnes nepřišly (`FarmSeason.selection` – čekající díly výběru dne), obojí jen na půdu, kterou by
 * ves s dost rukama osela: na kterou má osivo (`seedForSowingKg`) a kterou spřežení do konce okna
 * zorají (`teams` – orba spřežení `SowingCapacity.plough`, jen ves, která orá; ozim do konce října,
 * jař s lnem v celém okně kopání – víc rukou orbu nezrychlí). Osivo a orbu dostane napřed letošní
 * práce v pořadí plodin (vracení, kopání, orba a setí jen podílu, na který osivo je – jako
 * `seedPrepShares`; orba nad orbu spřežení i se setím za ní pryč), pak čekající díly v pořadí
 * výběru; díl, na který osivo nebo orba nezbude, se nepočítá (na hraně jen jeho podíl). Len osivo
 * ze zásob nemá. Žeň a ostatní úlohy čekajících dílů se nepřičítají. Žádný cíl osevu – ves seje
 * maximum (fields.md – Osevní postup po dílech).
 */
export function sowingHelpLoad(
  state: VillageState,
  day: number,
  tools: number,
  plough: boolean,
  teams: SowingCapacity['plough'],
): SowingLoad {
  return sowingHelpWork(state, day, tools, plough, teams).load;
}

/**
 * Zátěž pomoci rodiny (`sowingHelpLoad`) a osivo plochy, na kterou práce setí v ní ještě zbývá
 * (kg – D102 kolo 2, I2: strop výmlatu na osivo, `windowSeedThreshKg`): osivo dílu je jeho podíl
 * zbývajícího setí; čekající díly nesou osivo svého podílu.
 */
function sowingHelpWork(
  state: VillageState,
  day: number,
  tools: number,
  plough: boolean,
  teams: SowingCapacity['plough'],
): { load: SowingLoad; seedKg: number } {
  const season = state.season;
  const load = planLoad(season, orchardHarvestLoad(state));
  let seedKg = 0;
  if (!season) return { load, seedKg };
  const pool = seedForSowingKg(state, day);
  const byId = partsByIdOf(state.parts);
  const cropLoad = (crop: Crop): SowingLoad['winter'] =>
    (load[crop] ??= { ...emptyTaskRecord(), plough: 0 });
  // orba spřežení do konce okna: ozim do konce října, všechny plodiny v celém okně kopání
  const team = plough && teams ? { winter: teams.autumnWinter, all: teams.autumn } : null;
  const teamRoom = (crop: Crop): number =>
    team ? (crop === 'winter' ? Math.min(team.winter, team.all) : team.all) : Infinity;
  const useTeams = (crop: Crop, ploughWork: number): void => {
    if (!team) return;
    team.all = Math.max(0, team.all - ploughWork);
    if (crop === 'winter') team.winter = Math.max(0, team.winter - ploughWork);
  };
  for (const { crop, work } of seasonCrops(season)) {
    const rest = cropLoad(crop);
    const store = seedStore(crop);
    const total = store === null ? 0 : workSeedKg(work, byId, crop);
    if (work.seedKg !== undefined && total > EPSILON) {
      const cover = Math.min(Math.max(0, total - work.seedKg), pool[store!]);
      pool[store!] -= cover;
      const share = Math.min(1, (work.seedKg + cover) / total);
      for (const task of HELP_TILLAGE) {
        rest[task] = Math.max(0, share * work.required[task] - work.done[task]);
      }
      if (work.plough) rest.plough = Math.max(0, share * work.plough.required - work.plough.done);
    }
    // orba nad orbu spřežení do konce okna se nestihne ani s rodinou – i se setím za ní
    const excess = Math.max(0, rest.plough - teamRoom(crop));
    if (excess > EPSILON && work.plough && work.plough.required > EPSILON) {
      rest.sow = Math.max(0, rest.sow - (excess * work.required.sow) / work.plough.required);
      rest.plough -= excess;
    }
    useTeams(crop, rest.plough);
    if (total > EPSILON && work.required.sow > EPSILON) {
      seedKg += (total * rest.sow) / work.required.sow;
    }
  }
  for (const { id, crop } of season.selection?.waiting ?? []) {
    const part = byId.get(id);
    if (!part) continue;
    const work = partWork(part, day, tools, plough, crop);
    let share = work.plough > EPSILON ? Math.min(1, teamRoom(crop) / work.plough) : 1;
    const store = seedStore(crop);
    const seed = store === null ? 0 : (part.areaM2 / M2_PER_HA) * cropSeedPerHa(crop);
    if (seed > EPSILON) share = Math.min(share, pool[store!] / seed);
    if (share <= EPSILON) continue;
    if (seed > EPSILON) {
      pool[store!] = Math.max(0, pool[store!] - share * seed);
      seedKg += share * seed;
    }
    useTeams(crop, share * work.plough);
    const into = cropLoad(crop);
    for (const task of HELP_TILLAGE) into[task] += share * work[task];
    into.plough += share * work.plough;
  }
  return { load, seedKg };
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
 * rodina nepokryje – podle skladby dne `chores` (population.md – Skladba dne podle ročního
 * období; plán bere léto pro okna setí a žňový den pro žně). Podle ní kapacita setí i čelo práce
 * nutných dílů (`frontRoom`). Za den práce – venku ji násobí délka dne (`daylightFactor`).
 */
function freeLabor(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  chores: DayChores = SUMMER_CHORES,
): FreeLabor {
  const crafts = craftHouseholds(state);
  // cvičící vojvodova rodina je mimo práci vsi (lord.md – Den rodiny), jako ji vyřazuje `work()`
  const apart = lordApartIds(state, day);
  // práci násobí štěstí vsi (happiness.md) a dřevěné nářadí od tesaře (wagons.md); zvířata
  // a domácí výroba jdou bokem, denní minimum kryjí napřed starší (population.md – Práce)
  const productivity = villageProductivity(state, coverage);
  // tytéž lidi jako den (`villagersToday`): bez mistrů huti a kněze mezi stavbami a trvale
  // nepřítomných (D102 kolo 2, oprava chyby z 11. 11. 2026); denní nepřítomnosti plán nezná
  const folk = planVillagers(state, day);
  const capacity =
    folk.reduce(
      (sum, p) => sum + (crafts.has(p.dwellingId) || apart.has(p.id) ? 0 : laborPerDay(p, day)),
      0,
    ) * productivity;
  const minimum = dailyMinPerHousehold(coverage.pottery);
  // denní minimum s přirážkou za chůzi pro vodu (population.md – Práce)
  // denní minimum dvorce kryje cvičící rodina (`manorLabor`), ves platí jen, co rodina nepokryje
  const family = trainingFamily(state, day);
  const homes = familyHomes(family);
  const skip = homes.size > 0 ? new Set([...crafts, ...homes]) : crafts;
  const water = householdWaterLabor(folk, state.dwellings, skip, chores);
  const manor = family
    ? manorLabor(state, day, coverage.pottery, productivity, family, chores)
    : null;
  const own = minimum * chores.minimumShare;
  const dailyMin =
    householdElders(folk, day, skip).reduce(
      (sum, elders, k) => sum + adultDailyMin(own + water[k]!, elders, productivity),
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
 * rodina“): v oknech žní a výmlatu i řemeslníci se syny (`WorkshopLabor` – řemeslo i žeň)
 * a výrostci se staršími (`harvestHelperLabor`) – tytéž ruce jako `work()`. Vojvodova rodina jde
 * na žně jen, když je ves sama nestíhá (`sowingCapacity` s `lord`, lord.md – Kdy jde rodina na pole).
 */
function harvestHands(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  { crafts, apart, productivity }: FreeLabor,
): number {
  return (
    [...crafts].reduce((sum, id) => {
      const labor = workshopLabor(state, day, id, coverage.pottery, productivity);
      return sum + labor.craft + labor.harvest;
    }, 0) +
    harvestHelperLabor(state, day, apart, productivity, coverage.pottery) * productivity
  );
}

/**
 * Práce vsi za den na poli ve žních a výmlatu (člověkodny – den oken `july` a `august`
 * v `sowingCapacity`): volná práce vsi po denním minimu žňového dne (`HARVEST_CHORES`) se žňovými
 * rukama, ve špičce PEAK_CAPACITY_SHARE, dnešní délkou dne (`daylightFactor`). Podle ní i výhled
 * výmlatu (`sheavesOutlook` – ruce do konce okna).
 */
export function harvestLaborPerDay(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): number {
  const labor = freeLabor(state, day, coverage, HARVEST_CHORES);
  return (
    (labor.villageFree + harvestHands(state, day, coverage, labor)) *
    PEAK_CAPACITY_SHARE *
    daylightFactor(day)
  );
}

/**
 * Rezerva dne v okně setí, se kterou počítá plán kapacity osevu (`sowingCapacity`, páry k rádlům):
 * seje se sice týž den hned za orbou a motykou (fields.md – Práce), plán ale dál počítá s jedním
 * dnem méně (návrh Clauda – odhad zůstává opatrný; celé okno by posunulo zakládání polí správcem,
 * samostatná změna k ověření).
 */
export const SOW_AFTER_DIG_DAYS = 1;

/**
 * Světlé dny září pro žeň jaře, kterou srpen nestihne (fields.md – Žeň jaře i v září): v září
 * zbytek letošního září, jinak celé září po hospodářském roce (`SowingCapacity.september`).
 */
function septemberHarvestDaylight(day: number): number {
  const { year, month } = dateOfDayIndex(day);
  const september = SOWING_CAPACITY_WINDOWS.september;
  if (september.some(([from, to]) => month >= from && month <= to)) {
    return windowDaylightLeft(day, september);
  }
  const nextYear = month >= PLANNING_DAY.month ? year + 1 : year;
  return september.reduce(
    (sum, [from, to]) =>
      sum +
      Array.from({ length: to - from + 1 }, (_, i) => monthDaylight(nextYear, from + i)).reduce(
        (a, b) => a + b,
        0,
      ),
    0,
  );
}

/** Leží dnešek v měsících okna `segments`? */
function inMonths(day: number, segments: readonly WindowSegment[]): boolean {
  const { month } = dateOfDayIndex(day);
  return segments.some(([from, to]) => month >= from && month <= to);
}

/**
 * Práce vsi na úlohách dne, které jdou v pořadí dne před přípravou půdy (`DAY_WORK_ORDER`; D102
 * kolo 1, návrh Clauda – jako dosklizeň jaře v září) a udělají se hned, do oken setí, ve kterých
 * dnešek leží: nutná otava do konce září (`mowingNeededRemaining` – zbytek plánu `planAftermath`),
 * porážka a uzení, které čekají (`slaughterRemaining`), a výmlat na osivo do konce okna setí
 * (`windowSeedThreshKg` nejvýš na osivo plochy zátěže `sowingHelpLoad`, `grainThreshWork` – žňové
 * ruce mlátí se vsí, ves dá jen svůj díl `threshShare`). Zimní porážku po dnech počítá `winterSlaughterWork`, sklizeň jablek nese zátěž
 * (`planLoad`), dosklizeň jaře `sowingCapacity`. 1. seč, pletí a trhání lnu do oken setí nepadnou;
 * výmlat na dnešní jídlo a porážky, které ves ještě neudělala (letní porážka pro rod vojvody, kusy
 * na zimu před 1. 11.), se neodhadují – přepočet dne je vidí, až nastanou.
 */
function beforeTillageToday(
  state: VillageState,
  day: number,
  tools: number,
  threshShare: number,
  areaSeedKg: () => number,
): number {
  return (
    mowingNeededRemaining(state, day) +
    slaughterRemaining(state) +
    grainThreshWork(state, windowSeedThreshKg(state, day, tools, areaSeedKg)) * threshShare
  );
}

/**
 * Práce zimní porážky (`winterSlaughterDay` – kusy čekající na porážku se porážejí po dnech
 * do 31. 3.), která padne do dní okna `segments` v zimě (listopad, březen): práce porážky masa
 * čekajících kusů (`cullingMeatKg`) poměrem dní okna v zimě ke zbývajícím dnům zimy. Mimo zimu 0.
 */
function winterSlaughterWork(
  state: VillageState,
  day: number,
  segments: readonly WindowSegment[],
): number {
  const left = slaughterSeasonDaysLeft(day);
  if (left <= 0) return 0;
  const winter: WindowSegment[] = segments.flatMap(([from, to]) =>
    HAY_WINTER_MONTHS.filter((m) => m >= from && m <= to).map((m): WindowSegment => [m, m]),
  );
  const share = Math.min(1, windowDaysLeft(day, winter) / left);
  return (cullingMeatKg(state) / LIVESTOCK.slaughterKgPerManDay) * share;
}

/**
 * Volná práce vsi ve špičkách polních prací od dneška do konce hospodářského roku: všechna
 * práce po denním minimu (PEAK_CAPACITY_SHARE) krát dny oken – podzim pro ozim (září–říjen)
 * a celý podzim (září–listopad) bez výmlatu snopů, který ves čeká (production-chains.md – Humno),
 * jaro (březen–duben), červenec a srpen (sklizně, výmlat ozimu a luštěnin plán přičte). Domácnosti
 * dílen na pole nechodí (crafts.md) – nepočítají se, jen v červenci a srpnu a ve výmlatu jaře
 * v září přijdou žňové ruce (fields.md – Žně všemi rukama: řemeslníci se syny, výrostci
 * a starší); práce se zvířaty (diet.md) jde napřed.
 * Ves, která orá (`plough`), má navíc kapacitu spřežení v oknech orby (oxen.md – Jen rádlo):
 * denní orba všech spřežení krát dny oken kopání – září–říjen pro ozim (bez dne rezervy
 * `SOW_AFTER_DIG_DAYS`), září–listopad a březen–duben pro jař a luštěniny. Cvičící
 * vojvodova rodina je mimo práci vsi; s `lord` se ve žních (červenec, srpen, září) i v oknech setí
 * přičte práce celé rodiny po minimu dvorce (`manorLabor` – `free`, lord.md – Kdy jde rodina na
 * pole) – pomoc ve žních a s přípravou půdy a setím (D102); v září dá rodina napřed žni jaře, co
 * ves se žňovými rukama nestihne, a setí jen zbytek (D102 kolo 1).
 * `ploughCapacity` – orba spřežení z jiného volání téhož dne a vsi (na `lord` nezávisí), jen se
 * převezme. Žeň jaře, kterou srpen nedosklidil, jde v září před setím ozimu – ubere podzim (bez
 * `withoutLateHarvest`); září je okno její žně (`september` – fields.md, Žeň jaře i v září).
 * S `beforeTillage` ubere vsi v oknech setí i úlohy dne, které jdou před přípravou půdy – otavu,
 * porážku a výmlat na osivo (`beforeTillageToday`, `winterSlaughterWork`); rodině ne – s nimi
 * nepomáhá.
 */
export function sowingCapacity(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  plough = false,
  landscape: Landscape | null = null,
  pairs?: number,
  options: {
    lord?: boolean;
    ploughCapacity?: NonNullable<SowingCapacity['plough']>;
    /** Bez dosklizně jaře v září (dlouhodobý výhled správce – jednorázová, kapacitu nemění). */
    withoutLateHarvest?: boolean;
    /**
     * Bez práce vsi na úlohách dne, které jdou před přípravou půdy (`beforeTillageWork` – pomoc
     * rodiny a výhled polí; D102 kolo 1).
     */
    beforeTillage?: boolean;
  } = {},
): SowingCapacity {
  const labor = freeLabor(state, day, coverage);
  const { villageFree } = labor;
  // žně se skladbou žňového dne – poloviční minimum, voda na pole (population.md – Skladba dne
  // podle ročního období)
  const harvestLabor = freeLabor(state, day, coverage, HARVEST_CHORES);
  // s rodinou (`lord` – lord.md, Kdy jde rodina na pole) ve žních i práce celé cvičící rodiny po
  // minimu dvorce (`free`) – jen lidé, spřežení ne; v oknech setí totéž se skladbou dne setí
  // (příprava půdy a setí – D102)
  const lordFree = options.lord === true && harvestLabor.manor ? harvestLabor.manor.free : 0;
  const lordSowFree = options.lord === true && labor.manor ? labor.manor.free : 0;
  const free = villageFree * PEAK_CAPACITY_SHARE;
  const lordSow = lordSowFree * PEAK_CAPACITY_SHARE;
  const hands = harvestHands(state, day, coverage, labor);
  const harvestFree = (harvestLabor.villageFree + hands + lordFree) * PEAK_CAPACITY_SHARE;
  // venkovní práce podle světla: den okna dá `daylightFactor` dnešního člověkodne – světlé dny
  // okna (`windowDaylightWithout`), stejná délka dne jako práce dne
  const days = (
    segments: Parameters<typeof windowDaysLeft>[1],
    sowing = false,
    perDay = free,
  ): number => perDay * windowDaylightWithout(day, segments, sowing ? SOW_AFTER_DIG_DAYS : 0);
  // výmlat snopů podzimní práci nebere – čeká za přípravou půdy a setím do konce února (fields.md
  // – Pořadí důležitosti polních prací a výmlat do zimy); žňové ruce žnou se vsí, ves dá jen svůj díl
  const villageShare = villageFree + hands > 0 ? villageFree / (villageFree + hands) : 1;
  // žeň jaře, kterou srpen nedosklidil, jde v září před orbou a setím ozimu (fields.md – Žeň jaře
  // i v září; Martin 9. 11. 2026) – ubere podzim; žňové ruce žnou se vsí, ves dá jen svůj díl
  const lateTotal = options.withoutLateHarvest ? 0 : lateHarvestRemaining(state);
  const w = SOWING_CAPACITY_WINDOWS;
  const septemberLight = septemberHarvestDaylight(day);
  // žňové ruce vsi do konce září (ves se žňovými rukama) – víc žně ves nestihne, tak ani neubere
  // (D102 kolo 2, N1: rodina dá jen přesah nad tím, `lordLate`)
  const septemberHands = (harvestLabor.villageFree + hands) * PEAK_CAPACITY_SHARE * septemberLight;
  const late = Math.min(lateTotal, septemberHands) * villageShare;
  // práce rodiny v září jen jednou (D102 kolo 1, M6): žeň jaře, kterou ves se žňovými rukama
  // do konce září nestihne, dá rodina napřed (žeň jde v pořadí dne před přípravou půdy) – setí
  // jen ze zbytku
  const lordLate =
    lordFree > 0 && inMonths(day, w.september)
      ? Math.min(
          lordFree * PEAK_CAPACITY_SHARE * septemberLight,
          Math.max(0, lateTotal - septemberHands),
        )
      : 0;
  // orba spřežení (oxen.md – Jen rádlo): z jiného volání téhož dne, nebo podle délky brázd polí, na
  // která ves může zasít – na pevných cestách se brázda láme (oxen.md – Co nejdelší brázda,
  // Brázdy končí na cestě); na `busy` ani `lord` nezávisí, počítá se jednou
  let ploughCache: SowingCapacity['plough'] | undefined;
  const ploughOf = (): SowingCapacity['plough'] | undefined => {
    if (!plough) return undefined;
    if (options.ploughCapacity) return { ...options.ploughCapacity };
    if (!ploughCache) {
      const perDay =
        ploughCapacityPerDay(state, coverage.tools, day, pairs) *
        sowingFurrowEfficiency(
          state.parts.filter((p) => sowingGroup(p) !== null),
          state,
          landscape,
        );
      // voli orají za světla – světlé dny oken orby
      const ploughDays = (segments: Parameters<typeof windowDaysLeft>[1], sowing = false): number =>
        perDay * windowDaylightWithout(day, segments, sowing ? SOW_AFTER_DIG_DAYS : 0);
      // okna kopání jaře: podzim jako vracení přílohu, jaro jako setí
      ploughCache = {
        autumnWinter: ploughDays(WINTER_WINDOWS.dig, true),
        autumn: ploughDays(WINDOWS.reclaim),
        spring: ploughDays(WINDOWS.sow, true),
      };
    }
    return { ...ploughCache };
  };
  // úlohy dne před přípravou půdy (D102 kolo 1) – jen díl vsi, žňové ruce mlátí se vsí
  const busyToday = options.beforeTillage
    ? beforeTillageToday(
        state,
        day,
        coverage.tools,
        harvestHandsDay(state, day) ? villageShare : 1,
        // osivo plochy, kterou počítá zátěž pomoci rodiny (D102 kolo 2, I2) – jen když je co mlátit
        () => sowingHelpWork(state, day, coverage.tools, plough, ploughOf()).seedKg,
      )
    : 0;
  const busy = (segments: readonly WindowSegment[]): number =>
    options.beforeTillage
      ? (inMonths(day, segments) ? busyToday : 0) + winterSlaughterWork(state, day, segments)
      : 0;
  // co vsi v okně setí zbude po dosklizni jaře a úlohách před přípravou půdy, a práce rodiny bez
  // toho, co dá žni
  const sowing = (
    segments: readonly WindowSegment[],
    sowingDay: boolean,
    villageBusy: number,
    lordBusy: number,
  ): number =>
    Math.max(0, days(segments, sowingDay) - villageBusy) +
    Math.max(0, days(segments, sowingDay, lordSow) - lordBusy);
  const people: SowingCapacity = {
    autumnWinter: sowing(w.autumnWinter, true, late + busy(w.autumnWinter), lordLate),
    autumn: sowing(w.autumn, false, late + busy(w.autumn), lordLate),
    spring: sowing(w.spring, true, busy(w.spring), 0),
    july: days(w.july, false, harvestFree),
    august: days(w.august, false, harvestFree),
    september: harvestFree * septemberLight,
  };
  const ploughCap = ploughOf();
  return ploughCap ? { ...people, plough: ploughCap } : people;
}

/**
 * Páry k rádlům, které ves chce (oxen.md – Kolik volů ves chce; fields.md – Osevní postup po dílech,
 * Páry k rádlům): nejméně párů (nejvýš OXEN.maxPairs), které v oknech orby zorají všechny díly na
 * řadě v hospodářském roce od `day` (1. 9. po postupu dílů) – celé pořadí, ves chce zorat
 * všechno (návrh Clauda). První osev oběhu (odpočatý příloh, nový díl) se orá v podzimním okně
 * ozimu, díl v osevu kdykoli v oknech orby za rok – na podzim pod ozim nebo jař, na jaře pod jař
 * (fields.md – Přílohová soustava do roku 1100; návrh Clauda – páry jako za pevného sledu); výkon
 * páru `ploughCapacityPerDay` podle délky brázd dílů (`plannedFurrowEfficiency`); nejvýš tolik párů, kolik ves obslouží lidmi (`OXEN.crewPerPair`).
 * Přílohy 70–95 % (až po dílech na řadě) a nouzové (jen při nedostatku) nepočítá.
 */
export function ploughPairsForRotation(
  state: VillageState,
  day: number,
  toolCoverage: number,
  landscape: Landscape | null,
): number {
  const autumn: FieldPart[] = [];
  const anytime: FieldPart[] = [];
  for (const part of state.parts) {
    const kind = nextSowing(part);
    if (!onTurn(kind)) continue;
    (kind === 'again' ? anytime : autumn).push(part);
  }
  if (autumn.length + anytime.length === 0) return 1;
  const load = (parts: readonly FieldPart[], crop: Crop): number =>
    parts.reduce((sum, p) => sum + partWork(p, day, toolCoverage, true, crop).plough, 0);
  const autumnLoad = load(autumn, 'winter');
  const allLoad = autumnLoad + load(anytime, 'spring');
  const perPair =
    pairCapacityPerDay(toolCoverage) *
    plannedFurrowEfficiency([...autumn, ...anytime], state, landscape);
  // páry, které ves s lidmi, co má, obslouží: oráč na pár a setí za ním (`OXEN.crewPerPair`)
  const crew = state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  const staffed = Math.max(1, Math.floor(crew / OXEN.crewPerPair + EPSILON));
  const cap = Math.min(OXEN.maxPairs, staffed);
  if (perPair <= 0) return cap;
  // dny oken orby do konce hospodářského roku – ozim jen na podzim, jař na podzim i na jaře
  // světlé dny oken (voli orají za světla – population.md, Skladba dne podle ročního období)
  const days = (crop: Crop): number =>
    Math.max(1, windowDaylightWithout(day, cropTaskWindows(crop, 'plough'), SOW_AFTER_DIG_DAYS));
  const pairs = Math.max(
    autumnLoad / (perPair * days('winter')),
    allLoad / (perPair * days('spring')),
  );
  return Math.min(cap, Math.max(1, Math.ceil(pairs - EPSILON)));
}

/** Zbývající sklizeň jablek (září–říjen) – kapacita práce v oknech s ní počítá (orchard.md). */
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
 * Sezónní úloha dne v rozdělení práce: polní úloha, práce v sadech, seč sena nebo porážka. Řadí se
 * napřed podle skupiny úloh (`DAY_WORK_ORDER` – `dayTaskOrder`): porážka a uzení za žní, trháním
 * lnu a nutnou sečí i otavou, před sklizní jablek; jablka před přípravou půdy a setím (zrají v září
 * a do konce října spadnou – ozim dostane zbytek podzimu, se kterým kapacita práce počítá), péče
 * o sad za nimi. Uvnitř skupiny napřed orba, pak podle konce okna, při shodě podle přednosti
 * `tie` a nakonec pořadí `rank`.
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
  /**
   * Seč je otava (2. seč – oxen.md, Seno, dvě seče): vlastní skupina hned za 1. sečí, před orbou
   * a setím ozimu (`DAY_WORK_ORDER` – fields.md, Pořadí důležitosti polních prací a výmlat do zimy).
   */
  aftermath?: true;
}
