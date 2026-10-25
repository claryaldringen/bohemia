import { dateOfDayIndex, isLeapYear } from '../calendar';
import { isSowableFertility } from './fields';
import { PLANNING_DAY, WINDOWS, WINTER_WINDOWS, type WindowSegment } from './rules';
import type {
  Crop,
  CropWork,
  FieldPart,
  LordHelp,
  LordHelpWindow,
  TaskName,
  FarmSeason,
} from './types';
import { emptyTaskRecord, ploughRemaining, seasonCrop, type PartWork } from './year-plan';

// Kolik ozimu a kolik jaře ves oseje (fields.md – Ozim a jař, Kolik ves oseje). Ves vybírá díly
// v pořadí přílohové soustavy, dokud nepokryje cíl osevu; každý díl dá do ozimu, pokud ho
// podzimní práce stihne vrátit z přílohu, zkopat a osít do konce října a sklidit v červenci,
// jinak do jaře, pokud se jař vejde do jarní a srpnové práce – kopání jaře přitom jde na podzim,
// kolik ho po ozimu stihne, a na jaro jen zbytek. Co se nevejde nikam, ves letos neoseje.
// Luštěniny (fields.md – Luštěniny): obilí má přednost – po výběru obilí dostanou luštěniny díly
// toho výběru od domu, dokud očekávaná úroda nepokryje cíl luštěnin a práce se vejde jako jař
// (sklizeň v červenci), a obilí doplní energii, kterou luštěniny dají méně. Len (fields.md – Len)
// stejně, jen před luštěninami a od konce výběru obilí (vysiluje půdu – jeho delší příloh neleží
// domům v cestě): dostane díly, dokud nepokryje potřebu vsi na oděv, a obilí doplní celou energii
// dílu (len se nejí). Len je povinný (Len napřed): když za obilím potřebu nepokryje – ves nemá
// volnou práci, sklizeň ozimu zaplní červenec –, vyhradí se jeho díly a práce napřed a obilí se
// vybere až po něm.
// Ves se spřežením (oxen.md – Jen rádlo) orá všechno a nekope: díl se vejde, jen když ho spřežení
// v oknech orby stihnou zorat (orba ozimu v září–říjnu, jaře na podzim, kolik po ozimu zbude,
// a zbytek na jaře) – víc ohrad se spřežením = víc kapacity. Orbu přitom dělají i lidé (oráč
// a honáček), takže se počítá i do práce lidí jako kopání.

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
  /** Červenec: sklizeň ozimu a luštěnin. */
  july: number;
  /** Srpen: sklizeň jaře a výmlat ozimu a luštěnin hned po žni (production-chains.md – Humno). */
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

function addLegume(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.july += work.harvest;
  load.august += work.thresh;
  load.ploughSpring += work.plough;
}

/** Plodina místo jaře – luštěniny, nebo len. */
export type SideCrop = Extract<Crop, 'legume' | 'flax'>;

/**
 * Střídání plodin (fields.md – Luštěniny, Len): napřed díly, které loni plodinu `crop` neměly,
 * pak ostatní – jinak v pořadí `parts`.
 */
function rotatedFor(parts: readonly FieldPart[], crop: SideCrop): FieldPart[] {
  return [...parts.filter((p) => p.crop !== crop), ...parts.filter((p) => p.crop === crop)];
}

/**
 * Pořadí dílů pro luštěniny nebo len z dílů seřazených od domu (fields.md – Luštěniny, Len):
 * luštěniny od domu (půdu zlepší), len od konce – vysiluje půdu, jeho delší příloh tak neleží
 * domům v cestě; jen díly od 70 % (nouzový příloh jen na obilí) a se střídáním plodin.
 */
export function sideCropOrder(fromHome: readonly FieldPart[], crop: SideCrop): FieldPart[] {
  const sowable = fromHome.filter(isSowableFertility);
  return rotatedFor(crop === 'flax' ? sowable.reverse() : sowable, crop);
}

/** Práce v oknech, kterou ves už má (`SowingLoad`) – zátěž oken pro pomoc rodiny. */
export function cropLoadOf(planned: SowingLoad): CropLoad {
  // ozim na podzim: vrácení, kopání (orba) a setí; jablka se sklízejí po něm, ale v témže okně;
  // v srpnu sklizeň jaře a výmlat ozimu (luštěniny přičte addLegume)
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
  if (planned.legume) addLegume(load, planned.legume);
  if (planned.flax) addLegume(load, planned.flax);
  return load;
}

/**
 * Měsíce oken volné práce `SowingCapacity` (lidé): podzim ozimu září–říjen, vrácení přílohu
 * a kopání září–listopad i březen–duben, jaro březen–duben, sklizeň ozimu červenec, sklizeň jaře
 * a výmlat srpen. Podle nich `sowingCapacity` i podíl dne rodiny na osevu (`lordHelpShare`).
 */
export const SOWING_CAPACITY_WINDOWS: Readonly<Record<LordHelpWindow, readonly WindowSegment[]>> = {
  autumnWinter: WINTER_WINDOWS.sow,
  autumn: WINDOWS.reclaim,
  spring: WINDOWS.sow,
  july: WINTER_WINDOWS.harvest,
  august: WINDOWS.harvest,
};

/**
 * Podíl dne mužů cvičící vojvodovy rodiny po oknech, aby ves stihla výběr osevu `load`
 * (lord.md – Kdy jde rodina na pole, bod 1): chybějící práce (zátěž nad volnou prací vsi bez
 * rodiny `village`) ÷ práce rodiny v okně (`withLord − village`), nejvýš 1. Podzim ozimu,
 * červenec a srpen přímo. Jař jako `fitsSpring` – vrácení a kopání na podzim, kolik po ozimu
 * zbude (i s pomocí rodiny v září–říjnu), zbytek se setím na jaře: co chybí, dá rodina napřed na
 * jaře (`lordHelpDay` ho každý den přepočítá podle skutečného zbytku) a co jaro nepokryje ani
 * s celou rodinou, z podzimu jaře (návrh Clauda). Podzim jaře zahrnuje i září–říjen, kde už rodina
 * pomáhá s ozimem – jeho podíl kryje obojí (den bere nejvyšší podíl, `lordHelpShare`). Okna, kde
 * nic nechybí, chybí; ves, která stihne vše sama, dostane {}.
 */
export function lordSowingHelp(
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
  const autumnWinter = add('autumnWinter', load.winterAutumn - village.autumnWinter);
  add('july', load.july - village.july);
  add('august', load.august - village.august);
  const autumnLeft = Math.max(0, village.autumn + autumnWinter - load.winterAutumn);
  const over = Math.max(0, load.springReclaim + load.springDig - autumnLeft);
  const short = load.springSow + over - village.spring;
  const rest = Math.min(over, short - add('spring', short));
  if (rest > EPSILON) add('autumn', autumnWinter + rest);
  return help;
}

/**
 * Podíl dnešního dne, který muži cvičící rodiny dají potřebnému osevu (`FarmSeason.lordHelp`,
 * lord.md – Kdy jde rodina na pole, bod 1): nejvyšší podíl oken, do kterých dnešek padne. Mimo
 * okna (zima, květen–červen) a v plánu bez pomoci (i u starších vsí) 0.
 */
export function lordHelpShare(plan: FarmSeason | null, day: number): number {
  const help = plan?.lordHelp;
  if (!help) return 0;
  const { month } = dateOfDayIndex(day);
  let share = 0;
  for (const window of Object.keys(SOWING_CAPACITY_WINDOWS) as LordHelpWindow[]) {
    const inWindow = SOWING_CAPACITY_WINDOWS[window].some(
      ([from, to]) => month >= from && month <= to,
    );
    if (inWindow) share = Math.max(share, help[window] ?? 0);
  }
  return share;
}
