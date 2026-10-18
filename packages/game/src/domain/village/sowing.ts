import { dateOfDayIndex, isLeapYear } from '../calendar';
import { expectedNetKg } from './fields';
import { expectedLegumeKg, legumeEnergy } from './legumes';
import { PLANNING_DAY, type WindowSegment } from './rules';
import type { CropWork, FieldPart, TaskName, YearPlan } from './types';
import { emptyTaskRecord, partWork, ploughRemaining, type PartWork } from './year-plan';

// Kolik ozimu a kolik jaře ves oseje (fields.md – Ozim a jař, Kolik ves oseje). Ves vybírá díly
// v pořadí přílohové soustavy, dokud nepokryje cíl osevu; každý díl dá do ozimu, pokud ho
// podzimní práce stihne vrátit z přílohu, zkopat a osít do konce října a sklidit v červenci,
// jinak do jaře, pokud se jař vejde do jarní a srpnové práce – kopání jaře přitom jde na podzim,
// kolik ho po ozimu stihne, a na jaro jen zbytek. Co se nevejde nikam, ves letos neoseje.
// Luštěniny (fields.md – Luštěniny): obilí má přednost – po výběru obilí dostanou luštěniny díly
// toho výběru od domu, dokud očekávaná úroda nepokryje cíl luštěnin a práce se vejde jako jař
// (sklizeň v červenci), a obilí doplní energii, kterou luštěniny dají méně.

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
  /** Srpen: sklizeň jaře. */
  august: number;
}

/** Práce, kterou ves v oknech už má: sklizeň jablek a zbytek letošního plánu po plodinách. */
export interface SowingLoad {
  orchardAutumn: number;
  winter: Record<TaskName, number>;
  spring: Record<TaskName, number>;
  /** Zbytek práce luštěnin; chybí = žádné. */
  legume?: Record<TaskName, number>;
}

export interface CropChoiceInput {
  targetKg: number;
  /** Očekávaná čistá úroda dílů, které už v plánu jsou (počítá se do cíle). */
  startKg: number;
  capacity: SowingCapacity;
  load: SowingLoad;
  /** Smí ves přidat ozim – jen při ročním plánu k 1. 9. (díly hotové později jdou do jaře). */
  allowWinter: boolean;
  day: number;
  toolCoverage: number;
  /** Ves má spřežení – díly, které rádlo zvládne, orá místo kopání (oxen.md). */
  plough?: boolean;
  /** Cíl luštěnin (kg čisté úrody – fields.md, Luštěniny); bez údaje žádné luštěniny. */
  legumeTargetKg?: number;
  /**
   * Pod kolik energie (kg obilí) luštěniny plán nesmí stáhnout – roční potřeba bez rezervy; bez
   * údaje celý cíl osevu.
   */
  energyFloorKg?: number;
}

/** Prázdná zátěž – jen sklizeň jablek. */
export function orchardOnlyLoad(orchardAutumn: number): SowingLoad {
  return { orchardAutumn, winter: emptyTaskRecord(), spring: emptyTaskRecord() };
}

/** Zbytek práce plodiny (potřebné − odvedené po úlohách; orba se počítá ke kopání). */
function remaining(work: CropWork | undefined): Record<TaskName, number> {
  const rest = emptyTaskRecord();
  if (!work) return rest;
  for (const task of Object.keys(rest) as TaskName[]) {
    rest[task] = Math.max(0, work.required[task] - work.done[task]);
  }
  rest.dig += ploughRemaining(work);
  return rest;
}

/** Zátěž z rozběhnutého plánu (zbytek práce ozimu, jaře a luštěnin) a ze sklizně jablek. */
export function planLoad(plan: YearPlan | null, orchardAutumn: number): SowingLoad {
  return {
    orchardAutumn,
    winter: remaining(plan?.winter),
    spring: remaining(plan ?? undefined),
    ...(plan?.legume ? { legume: remaining(plan.legume) } : {}),
  };
}

/** Práce kandidátů ve špičkách, kterou plán ozimu a jaře už nese (průběžný stav `chooseCrops`). */
interface CropLoad {
  winterAutumn: number;
  july: number;
  springReclaim: number;
  springDig: number;
  springSow: number;
  august: number;
}

/**
 * Podzimní práce ozimu – vrácení přílohu, zpracování půdy (kopání, nebo orba rádlem – stejná
 * okna) a setí; sčítá se ve stejném pořadí jako dřív, ať ves bez hospodářství vyjde bit po bitu.
 */
function autumnWork(work: PartWork): number {
  return work.reclaim + (work.dig + work.plough) + work.sow;
}

/** Ozim pojme práci `work` – podzim (vrácení, kopání, setí) i červencová sklizeň. */
function fitsWinter(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  return (
    load.winterAutumn + autumnWork(work) <= capacity.autumnWinter + EPSILON &&
    load.july + work.harvest <= capacity.july + EPSILON
  );
}

/**
 * Jař pojme práci `work`: kopání na podzim, kolik ho po ozimu, jablkách a vrácení přílohů zbude,
 * zbytek na jaře se setím, a srpnová sklizeň.
 */
function fitsSpring(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  const reclaim = load.springReclaim + work.reclaim;
  // orba rádlem jde do stejných oken jako kopání
  const dig = load.springDig + (work.dig + work.plough);
  const sow = load.springSow + work.sow;
  const autumnLeft = Math.max(0, capacity.autumn - load.winterAutumn - reclaim);
  const springNeed = sow + Math.max(0, dig - autumnLeft);
  return (
    springNeed <= capacity.spring + EPSILON &&
    load.august + work.harvest <= capacity.august + EPSILON
  );
}

function addWinter(load: CropLoad, work: PartWork): void {
  load.winterAutumn += autumnWork(work);
  load.july += work.harvest;
}

/**
 * Luštěniny pojmou práci `work`: jarní práce jako jař (kopání na podzim, kolik zbude, setí na
 * jaře) a sklizeň v červenci vedle ozimu.
 */
function fitsLegume(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  return (
    fitsSpring(load, { ...work, harvest: 0 }, capacity) &&
    load.july + work.harvest <= capacity.july + EPSILON
  );
}

function addLegume(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.july += work.harvest;
}

function addSpring(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.august += work.harvest;
}

/** Průběžný výběr `chooseCrops` – díly po plodinách, zátěž oken a očekávaná úroda. */
interface Choice {
  winter: FieldPart[];
  spring: FieldPart[];
  legume: FieldPart[];
  load: CropLoad;
  /** Očekávaná čistá úroda v kg obilí (luštěniny svou energií). */
  net: number;
  /** Díly, které už plodinu dostaly. */
  used: Set<number>;
}

/**
 * Obilí (ozim a jař) z kandidátů, dokud úroda nepokryje `targetKg`: blok jde celý do ozimu, když se
 * tam vejde, jinak celý do jaře; když se nevejde ani tam, rozdělí se po dílech; když se díl
 * nevejde nikam, výběr končí. Z bloku se bere jen tolik dílů od domu, kolik cíl ještě potřebuje.
 */
function chooseGrain(
  blocks: readonly (readonly FieldPart[])[],
  choice: Choice,
  targetKg: number,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): void {
  const { capacity } = input;
  for (const whole of blocks) {
    if (choice.net >= targetKg) break;
    const block = whole.filter((p) => !choice.used.has(p.id));
    // díly bloku od domu, dokud cíl potřebuje
    const needed: FieldPart[] = [];
    let blockNet = choice.net;
    for (const part of block) {
      if (blockNet >= targetKg) break;
      needed.push(part);
      blockNet += expectedNetKg(part, input.day);
    }
    const works = needed.map(workOf);
    const total: PartWork = { ...emptyTaskRecord(), plough: 0 };
    for (const work of works) {
      for (const task of Object.keys(total) as (keyof PartWork)[]) total[task] += work[task];
    }
    const take = (crop: FieldPart[], parts: FieldPart[]): void => {
      crop.push(...parts);
      for (const p of parts) choice.used.add(p.id);
    };
    if (input.allowWinter && fitsWinter(choice.load, total, capacity)) {
      take(choice.winter, needed);
      addWinter(choice.load, total);
      choice.net = blockNet;
      continue;
    }
    if (fitsSpring(choice.load, total, capacity)) {
      take(choice.spring, needed);
      addSpring(choice.load, total);
      choice.net = blockNet;
      continue;
    }
    // celý blok se nevejde – po dílech: ozim, jinak jař, jinak konec
    for (let i = 0; i < needed.length; i++) {
      const part = needed[i]!;
      const work = works[i]!;
      if (input.allowWinter && fitsWinter(choice.load, work, capacity)) {
        take(choice.winter, [part]);
        addWinter(choice.load, work);
      } else if (fitsSpring(choice.load, work, capacity)) {
        take(choice.spring, [part]);
        addSpring(choice.load, work);
      } else {
        return;
      }
      choice.net += expectedNetKg(part, input.day);
    }
  }
}

function removeWinter(load: CropLoad, work: PartWork): void {
  load.winterAutumn -= autumnWork(work);
  load.july -= work.harvest;
}

function removeSpring(load: CropLoad, work: PartWork): void {
  load.springReclaim -= work.reclaim;
  load.springDig -= work.dig + work.plough;
  load.springSow -= work.sow;
  load.august -= work.harvest;
}

/** Kopie průběžného výběru – krok luštěnin jde vrátit. */
function copyChoice(c: Choice): Choice {
  return {
    winter: [...c.winter],
    spring: [...c.spring],
    legume: [...c.legume],
    load: { ...c.load },
    net: c.net,
    used: new Set(c.used),
  };
}

/**
 * Přesune díl obilí `part` do luštěnin (mutuje `choice`), když se jeho práce vejde jako luštěniny
 * (jarní práce jako jař, sklizeň v červenci); vrací, jestli se přesunul.
 */
function moveToLegume(
  choice: Choice,
  part: FieldPart,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): boolean {
  const work = workOf(part);
  const legumeWork = partWork(part, input.day, input.toolCoverage, input.plough ?? false, 'legume');
  const fromWinter = choice.winter.includes(part);
  if (fromWinter) removeWinter(choice.load, work);
  else removeSpring(choice.load, work);
  if (!fitsLegume(choice.load, legumeWork, input.capacity)) {
    if (fromWinter) addWinter(choice.load, work);
    else addSpring(choice.load, work);
    return false;
  }
  addLegume(choice.load, legumeWork);
  if (fromWinter) choice.winter = choice.winter.filter((p) => p !== part);
  else choice.spring = choice.spring.filter((p) => p !== part);
  choice.legume.push(part);
  choice.net += legumeEnergy(expectedLegumeKg(part, input.day)) - expectedNetKg(part, input.day);
  return true;
}

/**
 * Luštěniny na díly vybrané pro obilí – od domu (díl obilí první v pořadí bloků; střídání plodin –
 * díly, které měly luštěniny loni, až nakonec), dokud očekávaná
 * úroda luštěnin nepokryje `targetKg`. Po každém dílu obilí doplní další díly, kolik energie
 * luštěniny dají méně; když energie plánu i tak klesne pod roční potřebu (`energyFloorKg` – smí
 * jít na rezervu osevu; obilí má přednost), díl zůstane obilím a výběr luštěnin končí. Luštěniny
 * tak leží u domu a díly zůstanou souvislé.
 */
function chooseLegumes(
  blocks: readonly (readonly FieldPart[])[],
  start: Choice,
  targetKg: number,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): Choice {
  let choice = start;
  let legumeNet = 0;
  while (legumeNet < targetKg - EPSILON) {
    const grain = new Set([...choice.winter, ...choice.spring]);
    const order = blocks.flatMap((block) => block.filter((p) => grain.has(p)));
    // střídání plodin: napřed díly, které loni luštěniny neměly
    const next = order.find((p) => p.crop !== 'legume') ?? order[0];
    if (!next) break;
    const trial = copyChoice(choice);
    const energy = Math.min(input.energyFloorKg ?? input.targetKg, trial.net);
    if (!moveToLegume(trial, next, input, workOf)) break;
    chooseGrain(blocks, trial, input.targetKg, input, workOf);
    if (trial.net < energy - EPSILON) break;
    choice = trial;
    legumeNet += expectedLegumeKg(next, input.day);
  }
  return choice;
}

/**
 * Rozdělí kandidáty na ozim, jař a luštěniny podle cíle osevu a volné práce v oknech (viz hlavička
 * souboru). Kandidáti jsou díly v pořadí `sowingOrder`, nebo bloky – díly jednoho úseku od domu
 * ven (`sowingBlocks`, fields.md – Hospodaření podle polohy domů). Luštěniny (fields.md –
 * Luštěniny): nejdřív se vybere obilí na celý cíl osevu, pak luštěniny dostanou díly toho výběru
 * od domu (`chooseLegumes`) na cíl luštěnin (`legumeTargetKg`) a obilí doplní další díly, kolik
 * energie luštěniny dají méně – obilí má přednost: když půda nebo práce na doplnění nestačí,
 * luštěnin je méně. Bez cíle luštěnin jen obilí. Díly nemění; vrací je v pořadí výběru.
 */
export function chooseCrops(
  candidates: readonly FieldPart[] | readonly (readonly FieldPart[])[],
  input: CropChoiceInput,
): { winter: FieldPart[]; spring: FieldPart[]; legume: FieldPart[] } {
  const planned = input.load;
  const blocks = (candidates as readonly (FieldPart | readonly FieldPart[])[]).map(
    (c): readonly FieldPart[] => (Array.isArray(c) ? c : [c as FieldPart]),
  );
  // ozim na podzim: vrácení, kopání a setí; jablka se sklízejí po něm, ale v témže okně
  const load: CropLoad = {
    winterAutumn:
      planned.orchardAutumn + planned.winter.reclaim + planned.winter.dig + planned.winter.sow,
    july: planned.winter.harvest,
    springReclaim: planned.spring.reclaim,
    springDig: planned.spring.dig,
    springSow: planned.spring.sow,
    august: planned.spring.harvest,
  };
  if (planned.legume) addLegume(load, { ...planned.legume, plough: 0 });
  const choice: Choice = {
    winter: [],
    spring: [],
    legume: [],
    load,
    net: input.startKg,
    used: new Set(),
  };
  const workOf = (part: FieldPart): PartWork =>
    partWork(part, input.day, input.toolCoverage, input.plough ?? false);
  const legumeTarget = input.legumeTargetKg ?? 0;
  chooseGrain(blocks, choice, input.targetKg, input, workOf);
  // luštěniny na díly obilí od domu, obilí doplní, co luštěniny dají méně energie
  const result =
    legumeTarget > EPSILON ? chooseLegumes(blocks, choice, legumeTarget, input, workOf) : choice;
  return { winter: result.winter, spring: result.spring, legume: result.legume };
}
