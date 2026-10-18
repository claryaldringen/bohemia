import { dateOfDayIndex, isLeapYear } from '../calendar';
import { expectedNetKg } from './fields';
import { PLANNING_DAY, type WindowSegment } from './rules';
import type { CropWork, FieldPart, TaskName, YearPlan } from './types';
import { emptyTaskRecord, partWork, ploughRemaining, type PartWork } from './year-plan';

// Kolik ozimu a kolik jaře ves oseje (fields.md – Ozim a jař, Kolik ves oseje). Ves vybírá díly
// v pořadí přílohové soustavy, dokud nepokryje cíl osevu; každý díl dá do ozimu, pokud ho
// podzimní práce stihne vrátit z přílohu, zkopat a osít do konce října a sklidit v červenci,
// jinak do jaře, pokud se jař vejde do jarní a srpnové práce – kopání jaře přitom jde na podzim,
// kolik ho po ozimu stihne, a na jaro jen zbytek. Co se nevejde nikam, ves letos neoseje.

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
  /** Červenec: sklizeň ozimu. */
  july: number;
  /** Srpen: sklizeň jaře. */
  august: number;
}

/** Práce, kterou ves v oknech už má: sklizeň jablek a zbytek letošního plánu po plodinách. */
export interface SowingLoad {
  orchardAutumn: number;
  winter: Record<TaskName, number>;
  spring: Record<TaskName, number>;
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

/** Zátěž z rozběhnutého plánu (zbytek práce ozimu i jaře) a ze sklizně jablek. */
export function planLoad(plan: YearPlan | null, orchardAutumn: number): SowingLoad {
  return { orchardAutumn, winter: remaining(plan?.winter), spring: remaining(plan ?? undefined) };
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

function addSpring(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.august += work.harvest;
}

/**
 * Rozdělí kandidáty na ozim a jař podle cíle osevu a volné práce v oknech (viz hlavička souboru).
 * Kandidáti jsou díly v pořadí `sowingOrder`, nebo bloky – díly jednoho úseku od domu ven
 * (`sowingBlocks`, fields.md – Hospodaření podle polohy domů): blok jde celý do ozimu, když se tam
 * vejde, jinak celý do jaře; když se nevejde ani tam, rozdělí se po dílech jako dřív. Z bloku se
 * bere jen tolik dílů od domu, kolik cíl ještě potřebuje. Díly nemění; vrací je v pořadí výběru.
 */
export function chooseCrops(
  candidates: readonly FieldPart[] | readonly (readonly FieldPart[])[],
  input: CropChoiceInput,
): { winter: FieldPart[]; spring: FieldPart[] } {
  const { capacity, load: planned } = input;
  const blocks = (candidates as readonly (FieldPart | readonly FieldPart[])[]).map(
    (c): readonly FieldPart[] => (Array.isArray(c) ? c : [c as FieldPart]),
  );
  const winter: FieldPart[] = [];
  const spring: FieldPart[] = [];
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
  let net = input.startKg;
  const workOf = (part: FieldPart): PartWork =>
    partWork(part, input.day, input.toolCoverage, input.plough ?? false);

  for (const block of blocks) {
    if (net >= input.targetKg) break;
    // díly bloku od domu, dokud cíl potřebuje
    const needed: FieldPart[] = [];
    let blockNet = net;
    for (const part of block) {
      if (blockNet >= input.targetKg) break;
      needed.push(part);
      blockNet += expectedNetKg(part, input.day);
    }
    const works = needed.map(workOf);
    const total: PartWork = { ...emptyTaskRecord(), plough: 0 };
    for (const work of works) {
      for (const task of Object.keys(total) as (keyof PartWork)[]) total[task] += work[task];
    }
    if (input.allowWinter && fitsWinter(load, total, capacity)) {
      winter.push(...needed);
      addWinter(load, total);
      net = blockNet;
      continue;
    }
    if (fitsSpring(load, total, capacity)) {
      spring.push(...needed);
      addSpring(load, total);
      net = blockNet;
      continue;
    }
    // celý blok se nevejde – po dílech: ozim, jinak jař, jinak konec
    for (let i = 0; i < needed.length; i++) {
      const part = needed[i]!;
      const work = works[i]!;
      if (input.allowWinter && fitsWinter(load, work, capacity)) {
        winter.push(part);
        addWinter(load, work);
      } else if (fitsSpring(load, work, capacity)) {
        spring.push(part);
        addSpring(load, work);
      } else {
        return { winter, spring };
      }
      net += expectedNetKg(part, input.day);
    }
  }
  return { winter, spring };
}
