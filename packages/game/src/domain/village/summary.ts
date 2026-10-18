import { TOTAL_GAME_DAYS, dateOfDayIndex } from '../calendar';
import {
  burialOrder,
  cemeteryCapacity,
  freeGraves,
  readySquares,
  villageCemeteries,
} from './cemetery';
import { isFull, isOvercrowded, waitingHouseholds } from './dwellings';
import { fallowYears } from './fields';
import { daysUntilAppleRot, eatMeal, isAppleRotDay } from './food';
import {
  orchardAgeYears,
  orchardAreaM2,
  orchardExpectedYieldKg,
  villageApplesKg,
  villageOrchards,
} from './orchard';
import { ageGroup, foodNeedPerDay, occupants } from './people';
import { NO_CRAFTS } from './productivity';
import { CHRONICLE_MAX_EVENTS, CROP_WINDOWS, DWELLINGS, OVERGROWTH_STAGES } from './rules';
import type {
  Construction,
  ConstructionKind,
  Crop,
  DwellingType,
  FieldPart,
  VillageState,
} from './types';
import { treesToFell, woodFellingCost, woodLogs } from './wood';
import { daysUntilFoodHarvest } from './year-plan';

// Souhrn vsi pro panel hráče a scénu – jen čte stav, nic nemění.

/** Stadium dílu pro scénu: zakládá se, připravený, osetý, nebo příloh podle let zarůstání. */
export type PartStage =
  'founding' | 'ready' | 'sown' | 'young-fallow' | 'meadow' | 'young-growth' | 'shrub' | 'forest';

export interface HouseholdSummary {
  dwellingId: number;
  type: DwellingType;
  occupants: number;
  capacity: number;
  full: boolean;
  overcrowded: boolean;
  condition: number;
}

export interface ConstructionSummary {
  id: number;
  kind: ConstructionKind;
  dwellingType: DwellingType | null;
  dwellingId: number | null;
  fieldId: number | null;
  /** Výměra zakládaného pole (m²), u obydlí null. */
  areaM2: number | null;
  /** Zakládané pohřebiště a počet jeho čtverců, u ostatních staveb null. */
  cemeteryId: number | null;
  squares: number | null;
  /** Vysazovaný sad, u ostatních staveb null (výměra v `areaM2`). */
  orchardId: number | null;
  /** Průběh 0–1. */
  progress: number;
  /** Průběh samotné stavby bez kácení dřeva 0–1 (staveniště ve scéně). */
  buildProgress: number;
  /** Kolik stromů stavba ještě musí skácet (forest.md). */
  treesToFell: number;
}

/** Pohřebiště pro panel – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
export interface CemeterySummary {
  id: number;
  squares: number;
  /** Vytyčené a ohrazené – přijímá mrtvé. */
  built: boolean;
  capacity: number;
  graves: number;
  freeGraves: number;
  /**
   * Odhad, za kolik let se zaplní – podle úmrtí posledních let a pořadí pohřbívání (nejdřív
   * pohřebiště nejblíž k obydlím). Bez úmrtí null.
   */
  yearsLeft: number | null;
}

/** Jabloňový sad pro panel – plocha, stáří a odhad úrody (orchard.md – Co hráč vidí). */
export interface OrchardSummary {
  id: number;
  areaM2: number;
  squares: number;
  /** Kolik čtverců už je vysazeno. */
  plantedSquares: number;
  /** Stáří v celých letech od výsadby; dokud se nic nevysadilo, null. */
  ageYears: number | null;
  /** Úroda nejbližší sklizně při plné sklizni (kg jablek). */
  expectedYieldKg: number;
}

export interface VillageSummary {
  people: { children: number; adults: number; elders: number };
  households: HouseholdSummary[];
  storesKg: number;
  /** Zásoby jablek (kg) – jí se před obilím, 1. 3. shnijí. */
  applesKg: number;
  /** Klády na hromadě u vsi (forest.md). */
  woodLogs: number;
  /** Na kolik měsíců zásoby obilí vystačí při dnešní potřebě (bez lidí 0). */
  storesMonths: number;
  /** Nasycení příštího dne 0–1 podle přídělového systému. */
  satiation: number;
  /** Průměrná společná práce za den (posledních 30 dní). */
  commonLaborPerDay: number;
  /**
   * Některá domácnost je plná (4 dospělí 14–44) a nečeká na ni žádné nové obydlí – upozornění
   * pro hráče, stavbu nepodmiňuje.
   */
  fullHousehold: boolean;
  constructions: ConstructionSummary[];
  /** Ves hladoví – zásoby nevystačí do sklizně (jako `hunger-began` v kronice). */
  hungry: boolean;
  /** Stavby stojí – posledních STALL_DAYS dní nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  /** Pohřebiště v pořadí pohřbívání. */
  cemeteries: CemeterySummary[];
  /** Úmrtí za rok v posledních letech (odhad z kroniky) – pro odhad místa na pohřebištích. */
  deathsPerYear: number;
  /** Jabloňové sady v pořadí založení. */
  orchards: OrchardSummary[];
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
/** Úmrtí za kolik posledních let se průměrují pro odhad místa na pohřebištích. */
export const RECENT_DEATHS_YEARS = 10;
/** Kolik posledních dní bez společné práce znamená, že stavby stojí. */
export const STALL_DAYS = 3;
/** Méně společné práce za den (člověkodny) se bere jako žádná. */
const NO_LABOR = 0.01;

/** Stadium dílu v daný den; příloh podle celých let zarůstání (fields.md – Zarůstání). */
export function partStage(part: FieldPart, day: number): PartStage {
  if (part.state !== 'fallow') return part.state;
  const years = fallowYears(part, day);
  return OVERGROWTH_STAGES.find((s) => years <= s.maxYears)?.stage ?? 'forest';
}

/**
 * Viditelný stav obilí na osetém dílu (fields.md – Ozim a jař, Co hráč vidí): holá zem (zkopáno,
 * ještě nezaseto), vzešlé osení, zelené obilí, zralé obilí, strniště. Sníh přidávají roční období
 * ve scéně.
 */
export type CropState = 'bare' | 'sprouted' | 'green' | 'ripe' | 'stubble';

/** Od kterého měsíce je zaseté obilí plně zelené (ozim po zimě, jař po jarním vzejití). */
const CROP_GREEN_FROM_MONTH: Record<Crop, number> = { winter: 4, spring: 5 };

/**
 * Stav obilí dílu v den `day` podle simulace: plodina dílu, jak daleko je setí a sklizeň jeho
 * plodiny a den v roce; mimo osev null. Plán práci nevede po dílech – díly plodiny se berou
 * v pořadí plánu (nejbližší první), takže při podílu setí 0,5 je zaseta první polovina.
 */
export function partCropState(state: VillageState, part: FieldPart, day: number): CropState | null {
  if (part.state !== 'sown') return null;
  const crop = part.crop ?? 'spring';
  // 31. 8. po sklizni jaře je plán už u výmlatu – do plánu 1. 9. strniště
  const plan = state.plan ?? state.threshingFromPlan;
  const work = plan ? (crop === 'winter' ? plan.winter : plan) : undefined;
  const index = work ? work.partIds.indexOf(part.id) : -1;
  if (!work || index < 0) return 'bare';
  const position = (index + 0.5) / work.partIds.length;
  const share = (task: 'sow' | 'harvest'): number =>
    work.required[task] > 0 ? work.done[task] / work.required[task] : 0;
  if (work.harvestedKg !== null || share('harvest') >= position) return 'stubble';
  if (share('sow') < position) return 'bare';
  const month = dateOfDayIndex(day).month;
  if (CROP_WINDOWS[crop].harvest.some(([from, to]) => month >= from && month <= to)) return 'ripe';
  const green =
    month >= CROP_GREEN_FROM_MONTH[crop] && month < (CROP_WINDOWS[crop].harvest[0]?.[0] ?? 13);
  return green ? 'green' : 'sprouted';
}

function peopleByGroup(state: VillageState, day: number): VillageSummary['people'] {
  const people = { children: 0, adults: 0, elders: 0 };
  for (const person of state.people) {
    const group = ageGroup(person, day);
    if (group === 'child') people.children++;
    else if (group === 'adult') people.adults++;
    else people.elders++;
  }
  return people;
}

function households(state: VillageState, day: number): HouseholdSummary[] {
  return state.dwellings.map((d) => ({
    dwellingId: d.id,
    type: d.type,
    occupants: occupants(state, d.id).length,
    capacity: DWELLINGS[d.type].capacity,
    full: isFull(state, d.id, day),
    overcrowded: isOvercrowded(state, d.id, day),
    condition: d.condition,
  }));
}

/**
 * Nasycení příštího dne: příděl ze zásob obilí a jablek do sklizně, se kterou ves počítá
 * (i červencová sklizeň ozimu – stejně jako eatMeal v simulaci; 1. 3. ráno jablka shnijí).
 */
function nextDaySatiation(state: VillageState, day: number, needPerDay: number): number {
  if (needPerDay <= 0) return 1;
  const next = Math.min(day + 1, TOTAL_GAME_DAYS - 1);
  const apples = isAppleRotDay(next) ? 0 : villageApplesKg(state);
  return eatMeal(
    state.storesKg,
    apples,
    needPerDay,
    daysUntilFoodHarvest(state.plan, state.parts, next, needPerDay),
    daysUntilAppleRot(next),
    NO_CRAFTS.pottery,
  ).satiation;
}

function constructionSummary(state: VillageState, c: Construction): ConstructionSummary {
  const orchard =
    c.kind === 'orchard' ? villageOrchards(state).find((o) => o.id === c.orchardId) : undefined;
  const areaM2 =
    c.kind === 'field'
      ? state.parts.filter((p) => p.fieldId === c.fieldId).reduce((s, p) => s + p.areaM2, 0)
      : c.kind === 'orchard'
        ? orchard
          ? orchardAreaM2(orchard)
          : 0
        : null;
  return {
    id: c.id,
    kind: c.kind,
    dwellingType: c.dwellingType,
    dwellingId: c.dwellingId,
    fieldId: c.fieldId,
    areaM2,
    cemeteryId: c.kind === 'cemetery' ? (c.cemeteryId ?? null) : null,
    squares: c.kind === 'cemetery' ? constructionSquares(state, c) : null,
    orchardId: c.kind === 'orchard' ? (c.orchardId ?? null) : null,
    progress: c.cost > 0 ? Math.min(1, c.done / c.cost) : 1,
    buildProgress: buildProgress(c),
    treesToFell: treesToFell(c),
  };
}

/** Průběh stavby po skácení dřeva – kácí se jako první část práce. */
function buildProgress(c: Construction): number {
  const felling = woodFellingCost(c.wood);
  const building = c.cost - felling;
  if (building <= 0) return c.done >= c.cost ? 1 : 0;
  return Math.min(1, Math.max(0, (c.done - felling) / building));
}

/** Kolik čtverců stavba hřbitova ohrazuje – rozšíření jen svoje, založení ostatní. */
function constructionSquares(state: VillageState, c: Construction): number {
  const cemetery = villageCemeteries(state).find((x) => x.id === c.cemeteryId);
  if (!cemetery) return 0;
  const own = cemetery.squares.filter((s) => s.constructionId === c.id).length;
  return own > 0 ? own : readySquares(cemetery.squares).length;
}

/**
 * Úmrtí za rok podle kroniky za posledních RECENT_DEATHS_YEARS let. Zkrácená kronika (drží jen
 * posledních CHRONICLE_MAX_EVENTS událostí) pokryje kratší dobu – počítá se od její první
 * události; doba se bere nejméně jako jeden rok, aby jedno úmrtí v mladé vsi odhad nezkreslilo.
 */
export function recentDeathsPerYear(state: VillageState, day: number): number {
  let from = Math.max(state.foundedDay, day - RECENT_DEATHS_YEARS * DAYS_PER_YEAR);
  const oldest = state.chronicle[0];
  if (state.chronicle.length >= CHRONICLE_MAX_EVENTS && oldest) from = Math.max(from, oldest.day);
  const deaths = state.chronicle.filter((e) => e.kind === 'death' && e.day >= from).length;
  return deaths / Math.max(1, (day - from) / DAYS_PER_YEAR);
}

/**
 * Pohřebiště v pořadí pohřbívání (nejblíž k obydlím první) s odhadem, za kolik let se zaplní:
 * pohřebiště se plní postupně, takže se sčítá volné místo všech pohřebišť před ním. Rozestavěná
 * se počítají, jako by už stála (stavba trvá krátce).
 */
function cemeterySummaries(state: VillageState, deathsPerYear: number): CemeterySummary[] {
  const ordered = burialOrder(
    villageCemeteries(state),
    state.dwellings.map((d) => d.position),
  );
  let freeBefore = 0;
  return ordered.map((c) => {
    const free = freeGraves(c);
    freeBefore += free;
    return {
      id: c.id,
      squares: c.squares.length,
      built: c.builtDay !== null,
      capacity: cemeteryCapacity(c),
      graves: c.graves,
      freeGraves: free,
      yearsLeft: free === 0 ? 0 : deathsPerYear > 0 ? freeBefore / deathsPerYear : null,
    };
  });
}

/** Stavby stojí: nějaká se staví a posledních STALL_DAYS dní na ni nezbyla společná práce. */
function stalled(state: VillageState): boolean {
  const recent = state.commonLaborHistory.slice(-STALL_DAYS);
  return (
    state.constructions.length > 0 &&
    recent.length === STALL_DAYS &&
    recent.every((labor) => labor < NO_LABOR)
  );
}

/** Souhrn vsi v den `day` (stav má být dopočítaný do tohoto dne). */
export function summarizeVillage(state: VillageState, day: number): VillageSummary {
  const needPerDay = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  const history = state.commonLaborHistory;
  const deathsPerYear = recentDeathsPerYear(state, day);
  return {
    people: peopleByGroup(state, day),
    households: households(state, day),
    storesKg: state.storesKg,
    applesKg: villageApplesKg(state),
    woodLogs: woodLogs(state),
    storesMonths:
      needPerDay > 0 ? state.storesKg / ((needPerDay * DAYS_PER_YEAR) / MONTHS_PER_YEAR) : 0,
    satiation: nextDaySatiation(state, day, needPerDay),
    commonLaborPerDay: history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0,
    fullHousehold: waitingHouseholds(state, day) > 0,
    constructions: state.constructions.map((c) => constructionSummary(state, c)),
    hungry: state.hungry,
    constructionsStalled: stalled(state),
    cemeteries: cemeterySummaries(state, deathsPerYear),
    deathsPerYear,
    orchards: villageOrchards(state).map((o) => ({
      id: o.id,
      areaM2: orchardAreaM2(o),
      squares: o.squares.length,
      plantedSquares: o.squares.filter((s) => s.plantedDay !== null).length,
      ageYears: orchardAgeYears(o, day),
      expectedYieldKg: orchardExpectedYieldKg(o, day),
    })),
  };
}
