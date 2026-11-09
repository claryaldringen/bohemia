import { dateOfDayIndex, isLeapYear } from '../calendar';
import { isSowableFertility } from './fields';
import { PLANNING_DAY, WINDOWS, WINTER_WINDOWS, type WindowSegment } from './rules';
import type { CropWork, FieldPart, LordHelp, LordHelpWindow, TaskName, FarmSeason } from './types';
import { emptyTaskRecord, ploughRemaining, seasonCrop, type PartWork } from './year-plan';

// Okna volné práce a zátěž osevu (fields.md – Ozim a jař, Osevní postup po dílech): kolik dnů
// okna ještě zbývá (`windowDaysLeft`), práce, kterou rozběhnutý hospodářský rok ještě nese
// (`planLoad`, `cropLoadOf`), a podíl dne rodiny vojvody na žních, když je ves sama nestíhá
// (`lordHarvestHelp`, `lordHelpShare`). Které díly se osejí, určuje osevní postup
// (`rotation.ts`); tady zůstalo jen pořadí dílů pro len (`flaxOrder`).
// Ves se spřežením (oxen.md – Jen rádlo) orá všechno a nekope; orba se počítá do práce lidí
// (oráč a honáček) jako kopání.

/** Tolerance proti chybám desetinných čísel při porovnání práce s kapacitou. */
const EPSILON = 1e-9;
const MONTHS_PER_YEAR = 12;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Kolik dní od dneška (včetně) do konce hospodářského roku (31. 8.) padne do měsíců oken.
 * Bez dayIndexOf – na podzim 1499 by sahal na rok 1500, který už ve světě není.
 */
export function windowDaysLeft(day: number, segments: readonly WindowSegment[]): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const startYear = month >= PLANNING_DAY.month ? year : year - 1;
  let days = 0;
  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    const m = ((PLANNING_DAY.month - 1 + i) % MONTHS_PER_YEAR) + 1;
    const y = m >= PLANNING_DAY.month ? startYear : startYear + 1;
    if (y < year || (y === year && m < month)) continue;
    if (!segments.some(([from, to]) => m >= from && m <= to)) continue;
    const length = m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1]!;
    days += y === year && m === month ? length - dayOfMonth + 1 : length;
  }
  return days;
}

/** Volná práce vsi (člověkodny) v oknech polních prací od dneška do konce hospodářského roku. */
export interface SowingCapacity {
  /** Září–říjen: ozim (vrácení přílohu, kopání, setí) a sklizeň jablek. */
  autumnWinter: number;
  /** Září–listopad celkem – co po ozimu a jablkách zbude, jde na jař (vrácení, kopání). */
  autumn: number;
  /** Březen–duben: setí jaře a kopání, které podzim nestihl. */
  spring: number;
  /** Červenec: žeň ozimu, luštěnin a lnu (co nestihne, přejde do srpna – `harvestOverflow`). */
  july: number;
  /**
   * Srpen: žeň jaře, zbytek žně ozimu, luštěnin a lnu z července (fields.md – Žně i v srpnu)
   * a výmlat ozimu a luštěnin hned po žni (production-chains.md – Humno).
   */
  august: number;
  /**
   * Orba spřežení v člověkodnech orby (oxen.md – Jen rádlo) – jen ves, která orá: září–říjen
   * (ozim), září–listopad celkem (co po ozimu zbude, jde na jař) a březen–duben (zbytek jaře
   * a luštěnin). Chybí = ves neorá, orba se nehlídá.
   */
  plough?: { autumnWinter: number; autumn: number; spring: number };
}

/**
 * Práce, kterou ves v oknech už má: sklizeň jablek a zbytek letošního plánu po plodinách (úlohy
 * a orba).
 */
export interface SowingLoad {
  orchardAutumn: number;
  winter: PartWork;
  spring: PartWork;
  /** Zbytek práce luštěnin; chybí = žádné. */
  legume?: PartWork;
  /** Zbytek práce lnu; chybí = žádný. */
  flax?: PartWork;
}

/** Prázdná práce dílu – úlohy i orba nulové. */
function emptyPartWork(): PartWork {
  return { ...emptyTaskRecord(), plough: 0 };
}

/** Prázdná zátěž – jen sklizeň jablek. */
export function orchardOnlyLoad(orchardAutumn: number): SowingLoad {
  return { orchardAutumn, winter: emptyPartWork(), spring: emptyPartWork() };
}

/** Zbytek práce plodiny (potřebné − odvedené po úlohách a zbývající orba). */
function remaining(work: CropWork | undefined): PartWork {
  const rest = emptyPartWork();
  if (!work) return rest;
  for (const task of Object.keys(emptyTaskRecord()) as TaskName[]) {
    rest[task] = Math.max(0, work.required[task] - work.done[task]);
  }
  rest.plough = ploughRemaining(work);
  return rest;
}

/** Zátěž z rozběhnutého plánu (zbytek práce ozimu, jaře, luštěnin a lnu) a ze sklizně jablek. */
export function planLoad(plan: FarmSeason | null, orchardAutumn: number): SowingLoad {
  return {
    orchardAutumn,
    winter: remaining(plan ? seasonCrop(plan, 'winter') : undefined),
    spring: remaining(plan ? seasonCrop(plan, 'spring') : undefined),
    ...(plan && seasonCrop(plan, 'legume')
      ? { legume: remaining(seasonCrop(plan, 'legume')) }
      : {}),
    ...(plan && seasonCrop(plan, 'flax') ? { flax: remaining(seasonCrop(plan, 'flax')) } : {}),
  };
}

/** Práce kandidátů ve špičkách, kterou plán ozimu a jaře už nese (zbytek práce plánu). */
export interface CropLoad {
  winterAutumn: number;
  july: number;
  springReclaim: number;
  springDig: number;
  springSow: number;
  august: number;
  /** Orba ozimu (září–říjen) a orba jaře s luštěninami (podzim, zbytek na jaře). */
  ploughWinter: number;
  ploughSpring: number;
}

/** Jařina místo jaře (len, dorůstající luštěniny starších vsí) – práce v oknech jako luštěniny. */
function addSideCrop(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.july += work.harvest;
  load.august += work.thresh;
  load.ploughSpring += work.plough;
}

/**
 * Pořadí dílů pro len z dílů seřazených od domu (fields.md – Len): od konce – vysiluje půdu, jeho
 * delší příloh tak neleží domům v cestě; jen díly od 70 % (nouzový příloh jen na obilí) a se
 * střídáním plodin – napřed díly, které loni len neměly.
 */
export function flaxOrder(fromHome: readonly FieldPart[]): FieldPart[] {
  const sowable = fromHome.filter(isSowableFertility).reverse();
  return [...sowable.filter((p) => p.crop !== 'flax'), ...sowable.filter((p) => p.crop === 'flax')];
}

/** Práce v oknech, kterou ves už má (`SowingLoad`) – zátěž oken pro pomoc rodiny. */
export function cropLoadOf(planned: SowingLoad): CropLoad {
  // ozim na podzim: vrácení, kopání (orba) a setí; jablka se sklízejí po něm, ale v témže okně;
  // v srpnu sklizeň jaře a výmlat ozimu (len a luštěniny přičte addSideCrop)
  const load: CropLoad = {
    winterAutumn:
      planned.orchardAutumn +
      planned.winter.reclaim +
      (planned.winter.dig + planned.winter.plough) +
      planned.winter.sow,
    july: planned.winter.harvest,
    springReclaim: planned.spring.reclaim,
    springDig: planned.spring.dig + planned.spring.plough,
    springSow: planned.spring.sow,
    august: planned.spring.harvest + planned.winter.thresh,
    ploughWinter: planned.winter.plough,
    ploughSpring: planned.spring.plough,
  };
  if (planned.legume) addSideCrop(load, planned.legume);
  if (planned.flax) addSideCrop(load, planned.flax);
  return load;
}

/**
 * Úseky okna `segments` bez měsíců okna `other` (měsíce včetně; úseky po sobě).
 */
function withoutMonths(
  segments: readonly WindowSegment[],
  other: readonly WindowSegment[],
): WindowSegment[] {
  const result: [number, number][] = [];
  for (const [from, to] of segments) {
    for (let month = from; month <= to; month++) {
      if (other.some(([a, b]) => month >= a && month <= b)) continue;
      const last = result.at(-1);
      if (last && last[1] === month - 1) last[1] = month;
      else result.push([month, month]);
    }
  }
  return result;
}

/**
 * Měsíce oken volné práce `SowingCapacity` (lidé): podzim ozimu září–říjen, vrácení přílohu
 * a kopání září–listopad i březen–duben, jaro březen–duben, červenec (žeň ozimu, luštěnin a lnu
 * před oknem žně jaře), sklizeň jaře, zbytek žně z července a výmlat srpen. Podle nich
 * `sowingCapacity` i podíl dne rodiny na žních (`lordHelpShare`).
 */
export const SOWING_CAPACITY_WINDOWS: Readonly<Record<LordHelpWindow, readonly WindowSegment[]>> = {
  autumnWinter: WINTER_WINDOWS.sow,
  autumn: WINDOWS.reclaim,
  spring: WINDOWS.sow,
  july: withoutMonths(WINTER_WINDOWS.harvest, WINDOWS.harvest),
  august: WINDOWS.harvest,
};

/**
 * Žeň ozimu, luštěnin a lnu, kterou červenec nestihne (člověkodny – fields.md, Žně i v srpnu):
 * zátěž července nad volnou prací července (`julyWork` – i s prací rodiny, která v červenci
 * pomůže) přejde do srpna, kde jde před žní jaře (CROP_ORDER).
 */
export function harvestOverflow(load: CropLoad, julyWork: number): number {
  return Math.max(0, load.july - julyWork);
}

/** Okna žní, ve kterých pomáhá vojvodova rodina (lord.md – Kdy jde rodina na pole). */
export const HARVEST_HELP_WINDOWS: readonly LordHelpWindow[] = ['july', 'august'];

/**
 * Podíl dne celé vojvodovy rodiny ve žních, aby ves stihla sklidit (lord.md – Kdy jde rodina na
 * pole; Martin 9. 11. 2026: „Pokud by se nestíhala sklizeň, ať se zapojí i celá vojvodova rodina,
 * pokud je zrovna ve vsi“): chybějící práce (zátěž `load` nad volnou prací vsi bez rodiny
 * `village`) ÷ práce rodiny v okně (`withLord − village`), nejvýš 1 – jen tolik, kolik chybí.
 * Červenec a srpen; žeň, kterou červenec nestihne ani s rodinou, přejde do srpna
 * (`harvestOverflow`). S osevem rodina nepomáhá. Okna, kde nic nechybí, chybí; ves, která žně
 * stihne sama, dostane {}.
 */
export function lordHarvestHelp(
  load: CropLoad,
  village: SowingCapacity,
  withLord: SowingCapacity,
): LordHelp {
  const help: LordHelp = {};
  // podíl okna podle chybějící práce; vrací práci, kterou rodina v okně dá
  const add = (window: LordHelpWindow, missing: number): number => {
    const family = withLord[window] - village[window];
    if (missing <= EPSILON || family <= EPSILON) return 0;
    const share = Math.min(1, missing / family);
    help[window] = share;
    return share * family;
  };
  // co červenec nestihne ani s rodinou, se žne v srpnu (fields.md – Žně i v srpnu)
  const july = add('july', load.july - village.july);
  add('august', load.august + harvestOverflow(load, village.july + july) - village.august);
  return help;
}

/**
 * Podíl dnešního dne, který cvičící rodina dá žním (`FarmSeason.lordHelp`, lord.md – Kdy jde
 * rodina na pole): nejvyšší podíl oken žní (`HARVEST_HELP_WINDOWS`), do kterých dnešek padne.
 * Mimo žně a v plánu bez pomoci 0.
 */
export function lordHelpShare(plan: FarmSeason | null, day: number): number {
  const help = plan?.lordHelp;
  if (!help) return 0;
  const { month } = dateOfDayIndex(day);
  let share = 0;
  for (const window of HARVEST_HELP_WINDOWS) {
    const inWindow = SOWING_CAPACITY_WINDOWS[window].some(
      ([from, to]) => month >= from && month <= to,
    );
    if (inWindow) share = Math.max(share, help[window] ?? 0);
  }
  return share;
}
