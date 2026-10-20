import { dateOfDayIndex } from '../calendar';
import { storageLossPerYear } from './productivity';
import { GRAIN_PITS } from './rules';
import type { GrainPit, VillageState } from './types';

// Obilné jámy (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „Obilné jámy by asi neměl
// řešit hráč, ale vesničané sami. Takže na příhodném místě obilné jámy po sklizni vykopou, naplní
// obilím a utěsní/zamaskují. … Po zbytek roku budou jámy průběžně otvírat a zrno z nich
// spotřebovávat. Označit půjde jen otevřená jáma – zavřená nebude vidět – a v označení se ukáže
// kolik v ní je zrní. Jámy lze používat opakovaně.“).
//
// Zásoba obilí vsi zůstává `VillageState.storesKg` – jídlo, osev, obchod i platby s ní počítají
// jako dřív a o jamách nevědí. Jámy říkají, kde zrno leží: v zapečetěných jamách (ubývá jen
// o slupku u stěn – GRAIN_PITS.sealedLossPerYear), v otevřené jámě a mimo jámy (na humně a doma –
// ztráty jako dřív podle nádob). Zrno mimo jámy = zásoby bez zrna v jamách; co zásoby ubude
// (jídlo, prodej, platby), jde napřed z něj, pak z otevřené jámy a po ní se otevře další
// (`drawGrainPits`). Vymlácené zrno čeká na humně (`GrainPitWork.queueKg`), dokud ho vesničané
// v době plnění jam (GRAIN_PITS.fillFrom–fillTo) neuloží – práce dne `grain-pit` po polních
// pracích (`grainPitTask`, `workGrainPits`): napřed do prázdných jam, pak do nových, které vykopou
// (místo – grain-pit-site.ts). Prázdná jáma po GRAIN_PITS.lifeYears od vykopání se zasype.

const DAYS_PER_YEAR = 365;
/** Méně zrna (kg) se nepočítá – zaokrouhlení. */
const EPSILON_KG = 1e-6;
/** Méně práce (člověkodny) je hotová. */
const EPSILON = 1e-9;
/** Denní podíl zrna, který v zapečetěné jámě zbude (GRAIN_PITS.sealedLossPerYear spojitě). */
const SEALED_KEEP = (1 - GRAIN_PITS.sealedLossPerYear) ** (1 / DAYS_PER_YEAR);
/** Jak dlouho jáma slouží (dny) – prázdná starší se zasype. */
const LIFE_DAYS = GRAIN_PITS.lifeYears * DAYS_PER_YEAR;

/** Co z vsi jámy potřebují – zásoby, jámy a ukládání zrna. */
type PitsState = Pick<VillageState, 'storesKg' | 'grainPits' | 'grainPitWork'>;

/** Obilné jámy vsi (vsi bez jam prázdné). */
export function villageGrainPits(state: Pick<VillageState, 'grainPits'>): GrainPit[] {
  return state.grainPits ?? [];
}

/** Zrno ve všech jamách (kg). */
export function grainInPitsKg(pits: readonly GrainPit[] | undefined): number {
  let sum = 0;
  for (const p of pits ?? []) sum += p.grainKg;
  return sum;
}

/** Zrno mimo jámy (kg) – na humně a doma: zásoby obilí bez zrna v jamách. */
export function looseGrainKg(state: Pick<VillageState, 'storesKg' | 'grainPits'>): number {
  return Math.max(0, state.storesKg - grainInPitsKg(state.grainPits));
}

/** Denní podíl zrna mimo zapečetěné jámy, který zbude – jako jídlo dne bez jam (`eatDiet`). */
function openKeep(potteryCoverage: number): number {
  return (1 - storageLossPerYear(potteryCoverage)) ** (1 / DAYS_PER_YEAR);
}

/**
 * Denní podíl zásob obilí, který zbude po ztrátách skladováním (production-chains.md – Obilné
 * jámy): zrno v zapečetěných jamách ztrácí GRAIN_PITS.sealedLossPerYear, ostatní (otevřená jáma,
 * humno, doma) jako dosud podle pokrytí nádobami. Bez zapečetěného zrna undefined – jídlo počítá
 * ztrátu jako dřív (bit po bitu).
 */
export function grainStoresKeep(
  state: Pick<VillageState, 'storesKg' | 'grainPits'>,
  potteryCoverage: number,
): number | undefined {
  const total = state.storesKg;
  if (total <= EPSILON_KG) return undefined;
  let sealed = 0;
  for (const p of state.grainPits ?? []) if (p.state === 'sealed') sealed += p.grainKg;
  if (sealed <= EPSILON_KG) return undefined;
  const inSealed = Math.min(sealed, total);
  return (inSealed * SEALED_KEEP + (total - inSealed) * openKeep(potteryCoverage)) / total;
}

/** Vstup jídla dne se ztrátou zásob podle jam (`DietInput.grainKeepPerDay`); bez jam nic. */
export function grainKeepInput(
  state: Pick<VillageState, 'storesKg' | 'grainPits'>,
  potteryCoverage: number,
): { grainKeepPerDay?: number } {
  const keep = grainStoresKeep(state, potteryCoverage);
  return keep === undefined ? {} : { grainKeepPerDay: keep };
}

/** Zapečetěná jáma, která se otevře jako další – zapečetěná nejdéle (pak nejnižší id). */
function nextToOpen(pits: readonly GrainPit[]): GrainPit | null {
  let best: GrainPit | null = null;
  for (const p of pits) {
    if (p.state !== 'sealed' || p.grainKg <= EPSILON_KG) continue;
    const day = p.filledDay ?? p.dugDay;
    const bestDay = best ? (best.filledDay ?? best.dugDay) : Infinity;
    if (best === null || day < bestDay || (day === bestDay && p.id < best.id)) best = p;
  }
  return best;
}

/**
 * Odběr ze zásob (mutuje jámy – production-chains.md, Obilné jámy): co ze zásob ubylo víc, než
 * bylo zrna mimo jámy, vesničané vzali z otevřené jámy; když se vyprázdní, otevřou další –
 * zapečetěnou nejdéle. Jedna otevřená jáma najednou. Vymlácené zrno čekající na jámy
 * (`GrainPitWork.queueKg`) je nejvýš zrno mimo jámy.
 */
export function drawGrainPits(state: PitsState): void {
  const pits = state.grainPits;
  if (!pits) return;
  const stores = Math.max(0, state.storesKg);
  let deficit = grainInPitsKg(pits) - stores;
  while (deficit > EPSILON_KG) {
    let open = pits.find((p) => p.state === 'open') ?? null;
    if (!open) {
      open = nextToOpen(pits);
      if (!open) break;
      open.state = 'open';
    }
    const take = Math.min(open.grainKg, deficit);
    open.grainKg -= take;
    deficit -= take;
    if (open.grainKg <= EPSILON_KG) {
      open.grainKg = 0;
      open.state = 'empty';
      delete open.filledDay;
    }
  }
  const work = state.grainPitWork;
  if (work) {
    const loose = Math.max(0, stores - grainInPitsKg(pits));
    if (work.queueKg > loose) work.queueKg = loose;
  }
}

/**
 * Jámy po ztrátách a jídle dne (mutuje stav – krok jídla simulace, production-chains.md – Obilné
 * jámy): zapečetěné ztratí denní díl GRAIN_PITS.sealedLossPerYear, otevřená jako zrno mimo jámy
 * (stejné ztráty jako `grainStoresKeep` v jídle dne), co se snědlo, ubude z otevřené jámy
 * (`drawGrainPits`), a prázdné jámy starší GRAIN_PITS.lifeYears se zasypou.
 */
export function settleGrainPits(state: VillageState, day: number, potteryCoverage: number): void {
  const pits = state.grainPits;
  if (!pits) return;
  if (pits.length > 0) {
    const open = openKeep(potteryCoverage);
    for (const p of pits) {
      if (p.state === 'sealed') p.grainKg *= SEALED_KEEP;
      else if (p.state === 'open') p.grainKg *= open;
    }
  }
  drawGrainPits(state);
  const kept = pits.filter((p) => !(p.state === 'empty' && pitWornOut(p, day)));
  if (kept.length !== pits.length) state.grainPits = kept;
}

/** Slouží jáma už GRAIN_PITS.lifeYears – prázdná se zasype a kope se nová? */
function pitWornOut(pit: GrainPit, day: number): boolean {
  return day - pit.dugDay >= LIFE_DAYS;
}

/**
 * Vymlácené obilí přibylo do zásob (mutuje stav – výmlat, production-chains.md – Obilné jámy):
 * ve vsi s jamami čeká na humně, než ho vesničané uloží do jam. Ves bez jam (uložená před
 * jamami – převod v use-case) nic.
 */
export function addThreshedGrain(state: VillageState, kg: number): void {
  if (!state.grainPits || kg <= 0) return;
  const work = (state.grainPitWork ??= { queueKg: 0, manDays: 0 });
  work.queueKg += kg;
}

/** Je den `day` v době plnění jam (GRAIN_PITS.fillFrom–fillTo – po výmlatu, než zamrzne zem)? */
export function isPitFillingDay(day: number): boolean {
  const month = dateOfDayIndex(day).month;
  return month >= GRAIN_PITS.fillFrom && month <= GRAIN_PITS.fillTo;
}

/** Jedna dávka zrna do jámy – kolik, do které prázdné jámy (null – vykopat novou) a práce. */
interface PitLoad {
  kg: number;
  pit: GrainPit | null;
  cost: number;
}

/**
 * Dávky, které vesničané dnes chtějí uložit (production-chains.md – Obilné jámy): v době plnění jam
 * vymlácené zrno čekající na humně – po plných jamách, napřed do prázdných (ne dosloužilých), pak do
 * nových. Neúplnou dávku (aspoň GRAIN_PITS.minFillKg) až po výmlatu (`moreGrain` – ve snopech je
 * obilí, které ves ještě vymlátí), v posledním měsíci plnění vždy; menší zbytek zůstane doma.
 */
function pitLoads(state: PitsState, day: number, moreGrain: boolean): PitLoad[] {
  const pits = state.grainPits;
  const work = state.grainPitWork;
  if (!pits || !work || work.queueKg <= EPSILON_KG || !isPitFillingDay(day)) return [];
  let queue = Math.min(work.queueKg, Math.max(0, state.storesKg - grainInPitsKg(pits)));
  const lastMonth = dateOfDayIndex(day).month === GRAIN_PITS.fillTo;
  const empties = pits.filter((p) => p.state === 'empty' && !pitWornOut(p, day));
  const loads: PitLoad[] = [];
  while (queue > EPSILON_KG) {
    const pit = empties[loads.length] ?? null;
    const capacity = pit?.capacityKg ?? GRAIN_PITS.capacityKg;
    const kg = Math.min(queue, capacity);
    const partial = kg < capacity - EPSILON_KG;
    if (partial && (kg < GRAIN_PITS.minFillKg || (moreGrain && !lastMonth))) break;
    loads.push({
      kg,
      pit,
      cost: (pit ? 0 : GRAIN_PITS.digManDays) + GRAIN_PITS.fillManDays,
    });
    queue -= kg;
  }
  return loads;
}

/**
 * Práce dne na obilných jamách (člověkodny – úloha `grain-pit`): dávky, které vesničané dnes chtějí
 * uložit (`pitLoads`), bez práce, kterou do další dávky už vložili. Mimo dobu plnění jam 0.
 */
export function grainPitTask(state: VillageState, day: number, moreGrain: boolean): number {
  const loads = pitLoads(state, day, moreGrain);
  if (loads.length === 0) return 0;
  const cost = loads.reduce((sum, l) => sum + l.cost, 0);
  return Math.max(0, cost - (state.grainPitWork?.manDays ?? 0));
}

/** Práce dne na obilných jamách – kolik a u které jámy (rozdělení práce – labor-report.ts). */
export interface GrainPitDay {
  manDays: number;
  /** Jáma, do které jde dávka (i nová, kterou kopou) – id a střed (m). */
  pit: { id: number; x: number; z: number };
}

/**
 * Práce dne na obilných jamách (mutuje stav – production-chains.md, Obilné jámy): `labor`
 * člověkodnů přibude k práci vložené do další dávky; každá dávka, na kterou práce stačí, se uloží –
 * do prázdné jámy, nebo do nové (vykopané na místě `site()` – vybere se, když se na ní začne
 * pracovat, a drží se, dokud se jáma nevykope); jáma se zapečetí. Vrátí, kde se dnes pracovalo
 * (jáma první dávky dne), bez práce null.
 */
export function workGrainPits(
  state: VillageState,
  day: number,
  labor: number,
  moreGrain: boolean,
  site: () => { x: number; z: number },
): GrainPitDay | null {
  const work = state.grainPitWork;
  const pits = state.grainPits;
  if (!work || !pits || labor <= EPSILON) return null;
  work.manDays += labor;
  let place: GrainPitDay['pit'] | null = null;
  for (;;) {
    const load = pitLoads(state, day, moreGrain)[0];
    if (!load) break;
    const where = load.pit ?? (work.site ??= { id: state.nextId++, ...site() });
    place ??= { id: where.id, x: where.x, z: where.z };
    if (work.manDays + EPSILON < load.cost) break;
    work.manDays -= load.cost;
    let pit = load.pit;
    if (!pit) {
      pit = {
        id: where.id,
        x: where.x,
        z: where.z,
        capacityKg: GRAIN_PITS.capacityKg,
        grainKg: 0,
        state: 'empty',
        dugDay: day,
      };
      pits.push(pit);
      delete work.site;
    }
    pit.grainKg = load.kg;
    pit.state = 'sealed';
    pit.filledDay = day;
    work.queueKg = Math.max(0, work.queueKg - load.kg);
  }
  if (work.manDays < EPSILON) work.manDays = 0;
  return place ? { manDays: labor, pit: place } : null;
}

/**
 * Jámy po odběru zásob (kopie – production-chains.md, Obilné jámy): co zásoby ubyly od posledního
 * dne (akce hráče – prodej, platba), jde už z otevřené jámy jako v simulaci. Pro pohled na ves.
 */
export function currentGrainPits(state: PitsState): GrainPit[] {
  const pits = state.grainPits;
  if (!pits || pits.length === 0) return [];
  const copy: PitsState = { storesKg: state.storesKg, grainPits: pits.map((p) => ({ ...p })) };
  drawGrainPits(copy);
  return copy.grainPits!;
}

/** Otevřené jámy (po odběru – `currentGrainPits`) – jediné vidět ve scéně a jdou označit. */
export function openGrainPits(state: PitsState): GrainPit[] {
  return currentGrainPits(state).filter((p) => p.state === 'open');
}

/**
 * Jámy `ids` zmizí pod stavbou (mutuje stav – production-chains.md, Obilné jámy; návrh Clauda):
 * hráč zavřenou jámu nevidí, stavbu proto nezakazuje – vesničané zrno přendají bez ztráty.
 * Zrno zapečetěné jámy jde do prázdných jam (ne dosloužilých, ne těch pod stavbou), zbytek
 * a zrno otevřené jámy domů (mimo jámy – sní se napřed). Zásoby se nemění. Místo nové jámy pod
 * stavbou se zahodí (vybere se jiné).
 */
export function moveGrainFromPits(
  state: VillageState,
  day: number,
  ids: ReadonlySet<number>,
): void {
  const work = state.grainPitWork;
  if (work?.site && ids.has(work.site.id)) delete work.site;
  const pits = state.grainPits;
  if (!pits || !pits.some((p) => ids.has(p.id))) return;
  const kept = pits.filter((p) => !ids.has(p.id));
  for (const from of pits) {
    if (!ids.has(from.id) || from.state !== 'sealed') continue;
    let left = from.grainKg;
    for (const to of kept) {
      if (left <= EPSILON_KG) break;
      if (to.state !== 'empty' || pitWornOut(to, day)) continue;
      const kg = Math.min(left, to.capacityKg);
      to.grainKg = kg;
      to.state = 'sealed';
      to.filledDay = from.filledDay ?? day;
      left -= kg;
    }
  }
  state.grainPits = kept;
}
