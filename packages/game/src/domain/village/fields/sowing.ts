import { dateOfDayIndex, isLeapYear } from '../../calendar';
import { monthDaylight } from '../core/daylight';
import { PLANNING_DAY, WINDOWS, WINTER_WINDOWS, type WindowSegment } from '../rules';
import type { CropWork, LordHelp, LordHelpWindow, TaskName, FarmSeason } from '../types';
import { emptyTaskRecord, ploughRemaining, seasonCrop, type PartWork } from '../core/year-plan';

// Okna volné práce a zátěž osevu (fields.md – Ozim a jař, Osevní postup po dílech): kolik dnů
// okna ještě zbývá (`windowDaysLeft`), práce, kterou rozběhnutý hospodářský rok ještě nese
// (`planLoad`, `cropLoadOf`), a podíl dne rodiny vojvody na žních a na přípravě půdy a setí, když
// je ves sama nestíhá (`lordHarvestHelp`, `lordHelpShare`, `lordSowingHelp`, `lordSowingShare`).
// Které díly se osejí, určuje osevní postup (`rotation.ts`).
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

/**
 * „Světlé dny“ okna (population.md – Skladba dne podle ročního období): součet `daylightFactor`
 * dnů, které počítá `windowDaysLeft` – kolik dnešních člověkodnů dá jeden dospělý venku do konce
 * oken. Plán (kapacita setí, páry k rádlům) tak počítá se stejnou délkou dne jako práce dne.
 */
export function windowDaylightLeft(day: number, segments: readonly WindowSegment[]): number {
  const { year, month, day: dayOfMonth } = dateOfDayIndex(day);
  const startYear = month >= PLANNING_DAY.month ? year : year - 1;
  let light = 0;
  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    const m = ((PLANNING_DAY.month - 1 + i) % MONTHS_PER_YEAR) + 1;
    const y = m >= PLANNING_DAY.month ? startYear : startYear + 1;
    if (y < year || (y === year && m < month)) continue;
    if (!segments.some(([from, to]) => m >= from && m <= to)) continue;
    light += monthDaylight(y, m, y === year && m === month ? dayOfMonth : 1);
  }
  return light;
}

/**
 * Světlé dny okna bez `spareDays` dní rezervy (`SOW_AFTER_DIG_DAYS`): rezerva ubere poměrný díl
 * světlých dnů okna (`windowDaylightLeft` × (dny − rezerva) ÷ dny), nejméně 0.
 */
export function windowDaylightWithout(
  day: number,
  segments: readonly WindowSegment[],
  spareDays: number,
): number {
  const days = windowDaysLeft(day, segments);
  if (days <= 0) return 0;
  return (windowDaylightLeft(day, segments) * Math.max(0, days - spareDays)) / days;
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
   * Září: žeň jaře, kterou srpen nestihne (fields.md – Žeň jaře i v září) – v září zbytek
   * letošního září (dosklizeň loňské jaře), jinak celé září po hospodářském roce.
   */
  september: number;
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
  /**
   * Žeň jaře, kterou srpen nedosklidil (v září – `lateHarvestRemaining`; fields.md – Žeň jaře
   * i v září); jinak 0 – co srpen nestihne, dopočte `lordHarvestHelp`.
   */
  september: number;
  /** Orba ozimu (září–říjen) a orba jaře s luštěninami (podzim, zbytek na jaře). */
  ploughWinter: number;
  ploughSpring: number;
}

/**
 * Jařina místo jaře (len, dorůstající luštěniny starších vsí) – příprava půdy a setí v oknech jaře;
 * žeň luštěnin v červenci (výmlat do zátěže srpna nepatří – počká do zimy, fields.md – Pořadí
 * důležitosti polních prací a výmlat do zimy). Trhání lnu do zátěže žní nejde (`harvest` false) – len
 * se trhá jen z práce, která po obilí zbude, a rodina vojvody s ním nepomáhá (fields.md – Len,
 * návrh Clauda).
 */
function addSideCrop(load: CropLoad, work: PartWork, harvest: boolean): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  if (harvest) load.july += work.harvest;
  load.ploughSpring += work.plough;
}

/** Práce v oknech, kterou ves už má (`SowingLoad`) – zátěž oken pro pomoc rodiny. */
export function cropLoadOf(planned: SowingLoad): CropLoad {
  // ozim na podzim: vrácení, kopání (orba) a setí; jablka se sklízejí po něm, ale v témže okně;
  // v srpnu sklizeň jaře (len a luštěniny přičte addSideCrop); výmlat ozimu počká do zimy za
  // polními pracemi (fields.md – Pořadí důležitosti polních prací a výmlat do zimy)
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
    august: planned.spring.harvest,
    september: 0,
    ploughWinter: planned.winter.plough,
    ploughSpring: planned.spring.plough,
  };
  if (planned.legume) addSideCrop(load, planned.legume, true);
  if (planned.flax) addSideCrop(load, planned.flax, false);
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

/** Září okna žně jaře – po konci okna žně ozimu (fields.md – Žeň jaře i v září). */
const SEPTEMBER_HARVEST = withoutMonths(WINDOWS.harvest, WINTER_WINDOWS.harvest);

/**
 * Měsíce oken volné práce `SowingCapacity` (lidé): podzim ozimu září–říjen, vrácení přílohu
 * a kopání září–listopad i březen–duben, jaro březen–duben, červenec (žeň ozimu, luštěnin a lnu
 * před oknem žně jaře), srpen (sklizeň jaře, zbytek žně z července a výmlat) a září (žeň jaře,
 * kterou srpen nestihne – fields.md, Žeň jaře i v září). Podle nich `sowingCapacity` i podíl dne
 * rodiny na žních (`lordHelpShare`).
 */
export const SOWING_CAPACITY_WINDOWS: Readonly<Record<LordHelpWindow, readonly WindowSegment[]>> = {
  autumnWinter: WINTER_WINDOWS.sow,
  autumn: WINDOWS.reclaim,
  spring: WINDOWS.sow,
  july: withoutMonths(WINTER_WINDOWS.harvest, WINDOWS.harvest),
  august: withoutMonths(WINDOWS.harvest, SEPTEMBER_HARVEST),
  september: SEPTEMBER_HARVEST,
};

/**
 * Žeň jaře, kterou srpen nestihne ani s rodinou (člověkodny – fields.md, Žeň jaře i v září):
 * zátěž srpna i s přetečením z července nad volnou prací srpna (`augustWork` – i s prací rodiny)
 * – žne se v září před orbou a setím ozimu.
 */
export function augustOverflow(load: CropLoad, julyWork: number, augustWork: number): number {
  return Math.max(0, load.august + harvestOverflow(load, julyWork) - augustWork);
}

/**
 * Žeň ozimu, luštěnin a lnu, kterou červenec nestihne (člověkodny – fields.md, Žně i v srpnu):
 * zátěž července nad volnou prací července (`julyWork` – i s prací rodiny, která v červenci
 * pomůže) přejde do srpna, kde jde před žní jaře (CROP_ORDER).
 */
export function harvestOverflow(load: CropLoad, julyWork: number): number {
  return Math.max(0, load.july - julyWork);
}

/** Okna žní, ve kterých pomáhá vojvodova rodina (lord.md – Kdy jde rodina na pole). */
export const HARVEST_HELP_WINDOWS: readonly LordHelpWindow[] = ['july', 'august', 'september'];

/**
 * Okna přípravy půdy a setí, ve kterých pomáhá vojvodova rodina (lord.md – Kdy jde rodina na pole,
 * Příprava půdy a setí; Martin 19. 11. 2026 – D102): ozim září–říjen, podzim září–listopad (jař
 * – vracení přílohu a kopání), jaro březen–duben.
 */
export const SOWING_HELP_WINDOWS: readonly LordHelpWindow[] = ['autumnWinter', 'autumn', 'spring'];

/**
 * Podíl práce vojvodovy rodiny ve žních, aby ves stihla sklidit (lord.md – Kdy jde rodina na
 * pole; Martin 9. 11. 2026): chybějící práce (zátěž `load` nad volnou prací vsi bez rodiny
 * `village`) ÷ práce rodiny v okně (`withLord − village`), nejvýš 1 – jen tolik, kolik chybí. Kdo
 * z rodiny jde (ženy a dcery, pak muži, vojvoda nakonec), určí den (`lordFieldShares`).
 * Červenec, srpen a září; žeň, kterou červenec nestihne ani s rodinou, přejde do srpna
 * (`harvestOverflow`), co nestihne srpen, do září (`augustOverflow` – v září zbytek jaře, kterou
 * srpen nedosklidil, `CropLoad.september`; fields.md – Žeň jaře i v září). V srpnu rodina pomáhá
 * jako dřív, aby jař byla sklizená do konce srpna – zářijová žeň bere práci setí ozimu (návrh
 * Clauda). S přípravou půdy a setím pomáhá zvlášť (`lordSowingHelp`). Okna, kde nic nechybí,
 * chybí; ves, která žně stihne sama, dostane {}.
 */
export function lordHarvestHelp(
  load: CropLoad,
  village: SowingCapacity,
  withLord: SowingCapacity,
): LordHelp {
  const help: LordHelp = {};
  // podíl okna podle chybějící práce; vrací práci, kterou rodina v okně dá
  const add = shareAdder(help, village, withLord);
  // co červenec nestihne ani s rodinou, se žne v srpnu (fields.md – Žně i v srpnu)
  const july = add('july', load.july - village.july);
  const august = add(
    'august',
    load.august + harvestOverflow(load, village.july + july) - village.august,
  );
  // co srpen nestihne ani s rodinou, se žne v září (fields.md – Žeň jaře i v září)
  add(
    'september',
    load.september +
      augustOverflow(load, village.july + july, village.august + august) -
      village.september,
  );
  return help;
}

/**
 * Podíl dnešního dne, který cvičící rodina dá žním (`FarmSeason.lordHelp`, lord.md – Kdy jde
 * rodina na pole): nejvyšší podíl oken žní (`HARVEST_HELP_WINDOWS`), do kterých dnešek padne.
 * Mimo žně a v plánu bez pomoci 0.
 */
export function lordHelpShare(plan: FarmSeason | null, day: number): number {
  return windowShare(plan?.lordHelp, HARVEST_HELP_WINDOWS, day);
}

/**
 * Podíl dnešního dne, který cvičící rodina dá přípravě půdy a setí (`FarmSeason.lordSowing`,
 * lord.md – Kdy jde rodina na pole, Příprava půdy a setí): nejvyšší podíl oken setí
 * (`SOWING_HELP_WINDOWS`), do kterých dnešek padne. Mimo okna setí a v plánu bez pomoci 0.
 */
export function lordSowingShare(plan: FarmSeason | null, day: number): number {
  return windowShare(plan?.lordSowing, SOWING_HELP_WINDOWS, day);
}

/** Nejvyšší podíl z `help` mezi okny `windows`, do kterých dnešek padne; bez podílů 0. */
function windowShare(
  help: LordHelp | undefined,
  windows: readonly LordHelpWindow[],
  day: number,
): number {
  if (!help) return 0;
  const { month } = dateOfDayIndex(day);
  let share = 0;
  for (const window of windows) {
    const inWindow = SOWING_CAPACITY_WINDOWS[window].some(
      ([from, to]) => month >= from && month <= to,
    );
    if (inWindow) share = Math.max(share, help[window] ?? 0);
  }
  return share;
}

/**
 * Podíl práce vojvodovy rodiny na přípravě půdy a setí po oknech (lord.md – Kdy jde rodina na
 * pole, Příprava půdy a setí; Martin 19. 11. 2026 – D102: „Na začátku vsi to jsou spíš zemědělci.
 * Až postupně, když je ves veliká se z rodu knížete stává postupně šlechta“): stejně jako ve žních
 * chybějící práce (zátěž `load` – vracení přílohu, kopání, orba a setí půdy, na kterou má ves
 * osivo, i díly na řadě, které na čelo ještě nepřišly – nad volnou prací vsi bez rodiny `village`)
 * ÷ práce rodiny v okně (`withLord − village`), nejvýš 1. Ozim v září–říjnu (se sklizní jablek,
 * která jde v témže okně). Jař – vracení a kopání v září–listopadu, kolik ves po ozimu zvládne,
 * zbytek se setím na jaře: co chybí, dá rodina napřed na jaře a co jaro nepokryje ani s celou
 * rodinou, už na podzim – okno kopání jaře končí až koncem dubna (návrh Clauda jako dřívější pomoc
 * s osevem do 9. 11. 2026). Okno `autumn` (vracení a kopání) nese i jaro – podzim zvlášť je
 * `autumn − spring`; podzimní podíl kryje i pomoc s ozimem v září–říjnu (den bere nejvyšší podíl –
 * `lordSowingShare`). Okna, kde nic nechybí, chybí; ves, která stihne sama, {}.
 */
export function lordSowingHelp(
  load: CropLoad,
  village: SowingCapacity,
  withLord: SowingCapacity,
): LordHelp {
  const help: LordHelp = {};
  const add = shareAdder(help, village, withLord);
  const autumnWinter = add('autumnWinter', load.winterAutumn - village.autumnWinter);
  // okno `autumn` je celá příprava jaře (září–listopad i březen–duben), `spring` jeho jarní výsek –
  // podzim zvlášť je jejich rozdíl (jaro se nepočítá dvakrát)
  const villageFall = Math.max(0, village.autumn - village.spring);
  const familyFall = Math.max(
    0,
    withLord.autumn - village.autumn - (withLord.spring - village.spring),
  );
  // co ves v září–listopadu po ozimu ještě vrátí a zkope (ozim nad její práci dá rodina)
  const fallLeft = Math.max(0, villageFall - Math.min(load.winterAutumn, village.autumnWinter));
  const over = Math.max(0, load.springReclaim + load.springDig - fallLeft);
  const short = load.springSow + over - village.spring;
  // co jaro nestihne ani s celou rodinou, dá rodina už na podzim (jen příprava půdy) – podzimní
  // podíl nese i pomoc s ozimem v září–říjnu
  const rest = Math.min(over, short - add('spring', short));
  if (rest > EPSILON && familyFall > EPSILON) {
    help.autumn = Math.min(1, (autumnWinter + rest) / familyFall);
  }
  return help;
}

/**
 * Zapíše do `help` podíl okna podle chybějící práce (`missing` ÷ práce rodiny v okně, nejvýš 1)
 * a vrátí práci, kterou rodina v okně dá; okno, kde nic nechybí, nezapíše.
 */
function shareAdder(
  help: LordHelp,
  village: SowingCapacity,
  withLord: SowingCapacity,
): (window: LordHelpWindow, missing: number) => number {
  return (window, missing) => {
    const family = withLord[window] - village[window];
    if (missing <= EPSILON || family <= EPSILON) return 0;
    const share = Math.min(1, missing / family);
    help[window] = share;
    return share * family;
  };
}
