import { dateOfDayIndex, isLeapYear } from '../calendar';
import { expectedNetKg } from './fields';
import { PLANNING_DAY, type WindowSegment } from './rules';
import type { CropWork, FieldPart, TaskName, YearPlan } from './types';
import { emptyTaskRecord, partWork } from './year-plan';

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
}

/** Prázdná zátěž – jen sklizeň jablek. */
export function orchardOnlyLoad(orchardAutumn: number): SowingLoad {
  return { orchardAutumn, winter: emptyTaskRecord(), spring: emptyTaskRecord() };
}

/** Zbytek práce plodiny (potřebné − odvedené po úlohách). */
function remaining(work: CropWork | undefined): Record<TaskName, number> {
  const rest = emptyTaskRecord();
  if (!work) return rest;
  for (const task of Object.keys(rest) as TaskName[]) {
    rest[task] = Math.max(0, work.required[task] - work.done[task]);
  }
  return rest;
}

/** Zátěž z rozběhnutého plánu (zbytek práce ozimu i jaře) a ze sklizně jablek. */
export function planLoad(plan: YearPlan | null, orchardAutumn: number): SowingLoad {
  return { orchardAutumn, winter: remaining(plan?.winter), spring: remaining(plan ?? undefined) };
}

/**
 * Rozdělí kandidáty (v pořadí `sowingOrder`) na ozim a jař podle cíle osevu a volné práce
 * v oknech (viz hlavička souboru). Díly nemění; vrací je v pořadí výběru.
 */
export function chooseCrops(
  candidates: FieldPart[],
  input: CropChoiceInput,
): { winter: FieldPart[]; spring: FieldPart[] } {
  const { capacity, load } = input;
  const winter: FieldPart[] = [];
  const spring: FieldPart[] = [];
  // ozim na podzim: vrácení, kopání a setí; jablka se sklízejí po něm, ale v témže okně
  let winterAutumn = load.orchardAutumn + load.winter.reclaim + load.winter.dig + load.winter.sow;
  let july = load.winter.harvest;
  let springReclaim = load.spring.reclaim;
  let springDig = load.spring.dig;
  let springSow = load.spring.sow;
  let august = load.spring.harvest;
  let net = input.startKg;

  for (const part of candidates) {
    if (net >= input.targetKg) break;
    const work = partWork(part, input.day, input.toolCoverage);
    const autumnWork = work.reclaim + work.dig + work.sow;
    if (
      input.allowWinter &&
      winterAutumn + autumnWork <= capacity.autumnWinter + EPSILON &&
      july + work.harvest <= capacity.july + EPSILON
    ) {
      winter.push(part);
      winterAutumn += autumnWork;
      july += work.harvest;
      net += expectedNetKg(part, input.day);
      continue;
    }
    // jař: kopání na podzim, kolik ho po ozimu, jablkách a vrácení přílohů zbude, zbytek na jaře
    const reclaim = springReclaim + work.reclaim;
    const dig = springDig + work.dig;
    const sow = springSow + work.sow;
    const autumnLeft = Math.max(0, capacity.autumn - winterAutumn - reclaim);
    const springNeed = sow + Math.max(0, dig - autumnLeft);
    if (
      springNeed > capacity.spring + EPSILON ||
      august + work.harvest > capacity.august + EPSILON
    ) {
      break;
    }
    spring.push(part);
    springReclaim = reclaim;
    springDig = dig;
    springSow = sow;
    august += work.harvest;
    net += expectedNetKg(part, input.day);
  }
  return { winter, spring };
}
