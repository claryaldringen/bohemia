import { dateOfDayIndex, isLeapYear } from '../calendar';
import { expectedNetKg, isSowableFertility } from './fields';
import { expectedFlaxKg } from './flax';
import { expectedLegumeKg, legumeEnergy } from './legumes';
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
import { emptyTaskRecord, partWork, ploughRemaining, seasonCrop, type PartWork } from './year-plan';

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
  /** Ves orá spřežením – všechny díly orá místo kopání (oxen.md – Jen rádlo). */
  plough?: boolean;
  /** Cíl luštěnin (kg čisté úrody – fields.md, Luštěniny); bez údaje žádné luštěniny. */
  legumeTargetKg?: number;
  /** Cíl lnu (kg třeného lnu – fields.md, Len); bez údaje žádný len. */
  flaxTargetKg?: number;
  /**
   * Pod kolik energie (kg obilí) luštěniny plán nesmí stáhnout – roční potřeba bez rezervy; bez
   * údaje celý cíl osevu.
   */
  energyFloorKg?: number;
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

/** Práce kandidátů ve špičkách, kterou plán ozimu a jaře už nese (průběžný stav `chooseCrops`). */
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

/**
 * Podzimní práce ozimu – vrácení přílohu, zpracování půdy (kopání, nebo orba rádlem – stejná
 * okna) a setí; sčítá se ve stejném pořadí jako dřív, ať ves bez hospodářství vyjde bit po bitu.
 */
function autumnWork(work: PartWork): number {
  return work.reclaim + (work.dig + work.plough) + work.sow;
}

/**
 * Ozim pojme práci `work` – podzim (vrácení, kopání, setí), červencová sklizeň i výmlat v srpnu
 * (production-chains.md – Výmlat hned po žni); ves, která orá, i orbu v září–říjnu.
 */
function fitsWinter(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  return (
    load.winterAutumn + autumnWork(work) <= capacity.autumnWinter + EPSILON &&
    load.july + work.harvest <= capacity.july + EPSILON &&
    load.august + work.thresh <= capacity.august + EPSILON &&
    (!capacity.plough || load.ploughWinter + work.plough <= capacity.plough.autumnWinter + EPSILON)
  );
}

/**
 * Orba jaře a luštěnin se vejde: na podzim, kolik spřežením po ozimu zbude, zbytek na jaře (ves
 * bez orby vždy).
 */
function fitsSpringPlough(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  if (!capacity.plough) return true;
  const autumnLeft = Math.max(0, capacity.plough.autumn - load.ploughWinter);
  const springNeed = Math.max(0, load.ploughSpring + work.plough - autumnLeft);
  return springNeed <= capacity.plough.spring + EPSILON;
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
  // vrácení přílohu i kopání se dělá napřed na podzim, co zbude po ozimu, zbytek na jaře
  // (fields.md – Ozim a jař, kopání pod jař i na jaře)
  const autumnLeft = Math.max(0, capacity.autumn - load.winterAutumn);
  const springNeed = sow + Math.max(0, reclaim + dig - autumnLeft);
  return (
    springNeed <= capacity.spring + EPSILON &&
    load.august + work.harvest <= capacity.august + EPSILON &&
    fitsSpringPlough(load, work, capacity)
  );
}

function addWinter(load: CropLoad, work: PartWork): void {
  load.winterAutumn += autumnWork(work);
  load.july += work.harvest;
  load.august += work.thresh;
  load.ploughWinter += work.plough;
}

/**
 * Luštěniny (i len – stejná okna) pojmou práci `work`: jarní práce jako jař (kopání na podzim,
 * kolik zbude, setí na jaře), sklizeň v červenci vedle ozimu a výmlat v srpnu (len se nemlátí).
 */
function fitsLegume(load: CropLoad, work: PartWork, capacity: SowingCapacity): boolean {
  return (
    fitsSpring(load, { ...work, harvest: work.thresh }, capacity) &&
    load.july + work.harvest <= capacity.july + EPSILON
  );
}

function addLegume(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.july += work.harvest;
  load.august += work.thresh;
  load.ploughSpring += work.plough;
}

function addSpring(load: CropLoad, work: PartWork): void {
  load.springReclaim += work.reclaim;
  load.springDig += work.dig + work.plough;
  load.springSow += work.sow;
  load.august += work.harvest;
  load.ploughSpring += work.plough;
}

/** Průběžný výběr `chooseCrops` – díly po plodinách, zátěž oken a očekávaná úroda. */
interface Choice {
  winter: FieldPart[];
  spring: FieldPart[];
  legume: FieldPart[];
  flax: FieldPart[];
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
    const total = emptyPartWork();
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
  load.august -= work.thresh;
  load.ploughWinter -= work.plough;
}

function removeSpring(load: CropLoad, work: PartWork): void {
  load.springReclaim -= work.reclaim;
  load.springDig -= work.dig + work.plough;
  load.springSow -= work.sow;
  load.august -= work.harvest;
  load.ploughSpring -= work.plough;
}

/** Kopie průběžného výběru – krok luštěnin jde vrátit. */
function copyChoice(c: Choice): Choice {
  return {
    winter: [...c.winter],
    spring: [...c.spring],
    legume: [...c.legume],
    flax: [...c.flax],
    load: { ...c.load },
    net: c.net,
    used: new Set(c.used),
  };
}

/** Plodina místo jaře – luštěniny, nebo len. */
export type SideCrop = Extract<Crop, 'legume' | 'flax'>;

/**
 * Střídání plodin (fields.md – Luštěniny, Len): napřed díly, které loni plodinu `crop` neměly,
 * pak ostatní – jinak v pořadí `parts`.
 */
export function rotatedFor(parts: readonly FieldPart[], crop: SideCrop): FieldPart[] {
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

/** Energie dílu plodiny v kg obilí – luštěniny se jedí, len ne. */
function sideCropEnergy(crop: SideCrop, part: FieldPart, day: number): number {
  return crop === 'legume' ? legumeEnergy(expectedLegumeKg(part, day)) : 0;
}

/** Očekávaná úroda dílu plodiny (kg luštěnin, kg třeného lnu). */
function sideCropKg(crop: SideCrop, part: FieldPart, day: number): number {
  return crop === 'legume' ? expectedLegumeKg(part, day) : expectedFlaxKg(part, day);
}

/**
 * Přesune díl obilí `part` do luštěnin nebo lnu (mutuje `choice`), když se jeho práce vejde
 * (jarní práce jako jař, sklizeň v červenci); vrací, jestli se přesunul.
 */
function moveToSideCrop(
  choice: Choice,
  part: FieldPart,
  crop: SideCrop,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): boolean {
  const work = workOf(part);
  const cropWork = partWork(part, input.day, input.toolCoverage, input.plough ?? false, crop);
  const fromWinter = choice.winter.includes(part);
  if (fromWinter) removeWinter(choice.load, work);
  else removeSpring(choice.load, work);
  if (!fitsLegume(choice.load, cropWork, input.capacity)) {
    if (fromWinter) addWinter(choice.load, work);
    else addSpring(choice.load, work);
    return false;
  }
  addLegume(choice.load, cropWork);
  if (fromWinter) choice.winter = choice.winter.filter((p) => p !== part);
  else choice.spring = choice.spring.filter((p) => p !== part);
  choice[crop].push(part);
  choice.net += sideCropEnergy(crop, part, input.day) - expectedNetKg(part, input.day);
  return true;
}

/**
 * Vešla by se práce dílu obilí `part` jako plodina `crop` (jarní práce jako jař, sklizeň
 * v červenci) – bez změny výběru.
 */
function fitsSideCrop(
  choice: Choice,
  part: FieldPart,
  crop: SideCrop,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): boolean {
  const load = { ...choice.load };
  const work = workOf(part);
  if (choice.winter.includes(part)) removeWinter(load, work);
  else removeSpring(load, work);
  const cropWork = partWork(part, input.day, input.toolCoverage, input.plough ?? false, crop);
  return fitsLegume(load, cropWork, input.capacity);
}

/**
 * Luštěniny nebo len na díly vybrané pro obilí – luštěniny od domu (díl obilí první v pořadí
 * bloků), len od konce výběru; střídání plodin – díly, které měly tutéž plodinu loni, až nakonec –,
 * dokud očekávaná úroda plodiny nepokryje `targetKg`. Po každém dílu obilí doplní další díly, kolik
 * energie díl dá méně (len celou – nejí se); když energie plánu i tak klesne pod roční potřebu
 * (`energyFloorKg` – smí jít na rezervu osevu; obilí má přednost), díl zůstane obilím a výběr
 * plodiny končí – len smí obilí ubrat nejvýš o svůj díl, i se zásobami pod pojistkou (je ho málo,
 * bez něj chybí oděv – fields.md, Len napřed). Díly plodiny tak zůstanou souvislé.
 */
function chooseSideCrop(
  blocks: readonly (readonly FieldPart[])[],
  start: Choice,
  crop: SideCrop,
  targetKg: number,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): Choice {
  let choice = start;
  let cropNet = 0;
  while (cropNet < targetKg - EPSILON) {
    const grain = new Set([...choice.winter, ...choice.spring]);
    // luštěniny od domu, len od konce výběru, jen díly od 70 % (nouzový příloh jen na obilí)
    // a se střídáním plodin (`sideCropOrder`)
    const rotated = sideCropOrder(
      blocks.flatMap((block) => block.filter((p) => grain.has(p))),
      crop,
    );
    // len (je ho málo, bez něj chybí oděv) zkusí další díl, když se práce prvního nevejde – třeba
    // jař, když červencovou sklizeň už nese ozim; luštěniny jen první díl (jako dřív)
    const next =
      crop === 'flax'
        ? rotated.find((p) => fitsSideCrop(choice, p, crop, input, workOf))
        : rotated[0];
    if (!next) break;
    const trial = copyChoice(choice);
    const floor = Math.min(input.energyFloorKg ?? input.targetKg, trial.net);
    // len smí ubrat obilí nejvýš o svůj díl, když ho obilí nedoplní (chybí půda či práce) – je ho
    // málo (≈ 1–2 % osevu), i se zásobami pod pojistkou (fields.md – Len napřed)
    const energy = floor - (crop === 'flax' ? expectedNetKg(next, input.day) : 0);
    if (!moveToSideCrop(trial, next, crop, input, workOf)) break;
    chooseGrain(blocks, trial, input.targetKg, input, workOf);
    if (trial.net < energy - EPSILON) break;
    choice = trial;
    cropNet += sideCropKg(crop, next, input.day);
  }
  return choice;
}

/** Očekávaný třený len dílů (kg). */
function flaxKgOf(parts: readonly FieldPart[], day: number): number {
  return parts.reduce((sum, part) => sum + expectedFlaxKg(part, day), 0);
}

/**
 * Len napřed (fields.md – Len, Len napřed): díly lnu se vyberou dřív než obilí – jeho práce se
 * vyhradí v oknech (`base` – výběr před obilím) a obilí se vybere až po něm na volnou práci, která
 * zbude. Kandidáti jako u lnu za obilím: díly výběru obilí `grain` od konce (nejdál od domu
 * napřed, k domu bližší potom), za nimi ostatní díly od domu; díly, které měly len loni, až
 * nakonec. Díl, jehož práce se nevejde, se přeskočí – zkusí se další, bližší (méně chůze) nebo
 * menší. Nouzový příloh pod 70 % len nedostane (jen obilí – fields.md, Nouzový osev). Zásoby ani
 * roční potřeba výběr nebrzdí – len je povinný (oděv) a je ho málo (≈ 1–2 % osevu).
 */
function flaxFirst(
  blocks: readonly (readonly FieldPart[])[],
  base: Choice,
  grain: Choice,
  targetKg: number,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): Choice {
  const choice = copyChoice(base);
  const selected = new Set([...grain.winter, ...grain.spring]);
  const sowable = blocks.flatMap((block) => block.filter(isSowableFertility));
  const order = [
    ...sowable.filter((p) => selected.has(p)).reverse(),
    ...sowable.filter((p) => !selected.has(p)),
  ];
  const rotated = rotatedFor(order, 'flax');
  let kg = 0;
  for (const part of rotated) {
    if (kg >= targetKg - EPSILON) break;
    const work = partWork(part, input.day, input.toolCoverage, input.plough ?? false, 'flax');
    if (!fitsLegume(choice.load, work, input.capacity)) continue;
    addLegume(choice.load, work);
    choice.flax.push(part);
    choice.used.add(part.id);
    kg += expectedFlaxKg(part, input.day);
  }
  chooseGrain(blocks, choice, input.targetKg, input, workOf);
  return choice;
}

/**
 * Len (fields.md – Len): napřed jako dřív – na díly výběru obilí `grain` od konce
 * (`chooseSideCrop`). Když tak potřebu oděvu nepokryje (ves, které na obilí nestačí práce – sklizeň
 * ozimu zaplní červenec a obilí doplněné za každý díl lnu uvolněnou práci hned zase zabere; nebo
 * zásoby pod pojistkou), dostane len díly napřed (`flaxFirst`) – vybere se, co dá víc lnu. Ves,
 * které len za obilím vycházel, má plán beze změny.
 */
function chooseFlax(
  blocks: readonly (readonly FieldPart[])[],
  base: Choice,
  grain: Choice,
  targetKg: number,
  input: CropChoiceInput,
  workOf: (part: FieldPart) => PartWork,
): Choice {
  const after = chooseSideCrop(blocks, grain, 'flax', targetKg, input, workOf);
  const afterKg = flaxKgOf(after.flax, input.day);
  if (afterKg >= targetKg - EPSILON) return after;
  const first = flaxFirst(blocks, base, grain, targetKg, input, workOf);
  return flaxKgOf(first.flax, input.day) > afterKg + EPSILON ? first : after;
}

/** Práce v oknech, kterou ves už má (`SowingLoad`) – výchozí zátěž výběru `chooseCrops`. */
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

/** Očekávaná energie výběru `chooseCrops` (kg obilí; luštěniny svou energií, len se nejí). */
export function chosenEnergyKg(
  crops: {
    winter: readonly FieldPart[];
    spring: readonly FieldPart[];
    legume: readonly FieldPart[];
  },
  day: number,
): number {
  let energy = 0;
  for (const part of [...crops.winter, ...crops.spring]) energy += expectedNetKg(part, day);
  for (const part of crops.legume) energy += sideCropEnergy('legume', part, day);
  return energy;
}

/**
 * Rozdělí kandidáty na ozim, jař, luštěniny a len podle cíle osevu a volné práce v oknech (viz
 * hlavička souboru). Kandidáti jsou díly v pořadí `sowingOrder`, nebo bloky – díly jednoho úseku od domu
 * ven (`sowingBlocks`, fields.md – Hospodaření podle polohy domů). Luštěniny (fields.md –
 * Luštěniny): nejdřív se vybere obilí na celý cíl osevu, pak luštěniny dostanou díly toho výběru
 * od domu (`chooseLegumes`) na cíl luštěnin (`legumeTargetKg`) a obilí doplní další díly, kolik
 * energie luštěniny dají méně – obilí má přednost: když půda nebo práce na doplnění nestačí,
 * luštěnin je méně. Len (fields.md – Len) stejně před luštěninami, od konce výběru – na cíl lnu
 * (`flaxTargetKg`); když tak cíl nepokryje, len napřed před obilím (`chooseFlax`).
 * Bez cíle luštěnin a lnu jen obilí. Díly nemění; vrací je v pořadí výběru.
 */
export function chooseCrops(
  candidates: readonly FieldPart[] | readonly (readonly FieldPart[])[],
  input: CropChoiceInput,
): {
  winter: FieldPart[];
  spring: FieldPart[];
  legume: FieldPart[];
  flax: FieldPart[];
  /** Práce výběru v oknech (s výchozí zátěží) – podle ní pomoc rodiny s osevem (`lordSowingHelp`). */
  load: CropLoad;
} {
  const blocks = (candidates as readonly (FieldPart | readonly FieldPart[])[]).map(
    (c): readonly FieldPart[] => (Array.isArray(c) ? c : [c as FieldPart]),
  );
  const choice: Choice = {
    winter: [],
    spring: [],
    legume: [],
    flax: [],
    load: cropLoadOf(input.load),
    net: input.startKg,
    used: new Set(),
  };
  const workOf = (part: FieldPart): PartWork =>
    partWork(part, input.day, input.toolCoverage, input.plough ?? false);
  const legumeTarget = input.legumeTargetKg ?? 0;
  const flaxTarget = input.flaxTargetKg ?? 0;
  // výběr před obilím – len napřed z něj vychází (`flaxFirst`)
  const base = copyChoice(choice);
  chooseGrain(blocks, choice, input.targetKg, input, workOf);
  // len na díly obilí od konce výběru, obilí doplní energii dílu (len se nejí – fields.md, Len);
  // když to potřebu nepokryje, len napřed před obilím
  const withFlax =
    flaxTarget > EPSILON ? chooseFlax(blocks, base, choice, flaxTarget, input, workOf) : choice;
  // luštěniny na další díly obilí od domu, obilí doplní, co luštěniny dají méně energie
  const result =
    legumeTarget > EPSILON
      ? chooseSideCrop(blocks, withFlax, 'legume', legumeTarget, input, workOf)
      : withFlax;
  return {
    winter: result.winter,
    spring: result.spring,
    legume: result.legume,
    flax: result.flax,
    load: result.load,
  };
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
 * jaře (jarní úprava – `trimPlan` – ho přepočítá podle skutečného zbytku) a co jaro nepokryje ani
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
