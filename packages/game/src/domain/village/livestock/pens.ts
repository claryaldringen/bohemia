import { isDisused } from '../buildings/disused';
import { HOMESTEAD_HERD, OXEN, PEN_GRACE, PEN_PLACES_PER_SQUARE, PEN_SQUARES } from '../rules';
import { sameGrid } from '../placement/square-grid';
import type {
  HerdSpecies,
  Ox,
  Pen,
  PenSpecies,
  PenSquare,
  SquareGrid,
  TileCell,
  VillageState,
} from '../types';

// Ohrady podle druhu (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Zvířata je potřeba na noc
// zavírat do ohrad. Každý druh zvířete by měl mít vlastní ohradu, ať se nemíchají. Velikost ohrady
// by mělo jít určovat podobně, jako když se staví hřbitov. Velikost ohrady bude mít vliv na
// velikost stáda. Zároveň velikost ohrady bude omezená – má to být ohrada, ne výběh.“). Ohrada
// má druh (ovce, kozy, prasata, skot, voli) a 1–4 čtverce; hotové čtverce dávají místa na noc
// pro stádo svého druhu (`penCapacity`), ohrada volů pro voly (`penPlaces`). Bez ohrady udrží každá domácnost u domu jen pár kusů
// (`homesteadRoom`). Místa ohrad a u domů (`herdRoom`) omezují stádo vedle pastvy, sena, lesa
// a pasáků (`winterTargets` – vstup `room`). Nezávisí na stádech ani spřežení (bez cyklů importu).

/** Druhy ohrad v pořadí, jak je přepíná Tab při umisťování (oxen.md – Výběr druhu). */
export const PEN_SPECIES: readonly PenSpecies[] = [
  'sheep',
  'goat',
  'pig',
  'cattle',
  'team',
  'horse',
];

/** Druh stáda, které ohrada drží (skot = krávy a telata); spřežení stádo nedrží (null). */
export function penHerdSpecies(species: PenSpecies): HerdSpecies | null {
  if (species === 'cattle') return 'cow';
  if (species === 'team' || species === 'horse') return null;
  return species;
}

/** Ohrada pro druh stáda (krávy → skot). */
export function herdPenSpecies(species: HerdSpecies): PenSpecies {
  return species === 'cow' ? 'cattle' : species;
}

/**
 * Druh ohrady. Ohrada uložená dřív bez druhu (do převodu `withPenSpecies`): se spřežením nebo
 * výcvikem spřežení, jinak skot – dnes v ní zimují krávy.
 */
export function penSpecies(pen: {
  readonly species?: PenSpecies;
  readonly team?: Pen['team'];
  readonly training?: Pen['training'];
}): PenSpecies {
  if (pen.species) return pen.species;
  return (pen.team ?? null) !== null || (pen.training ?? null) !== null ? 'team' : 'cattle';
}

/** Všechny čtverce ohrady – první (přístřešek a jesle) a další (`extraSquares`). */
export function penSquares(pen: Pick<Pen, 'cell' | 'x' | 'z' | 'extraSquares'>): PenSquare[] {
  return [{ cell: pen.cell, x: pen.x, z: pen.z }, ...(pen.extraSquares ?? [])];
}

/** Hotové čtverce ohrady (bez rozšíření ve stavbě; rozestavěná ohrada žádné). */
export function builtPenSquares(
  pen: Pick<Pen, 'cell' | 'x' | 'z' | 'extraSquares' | 'builtDay'>,
): PenSquare[] {
  if (pen.builtDay === null) return [];
  return penSquares(pen).filter((s) => s.constructionId === undefined);
}

/** Staví se ohrada (založení), nebo její rozšíření? */
export function isPenBuilding(pen: Pick<Pen, 'builtDay' | 'extraSquares'>): boolean {
  return (
    pen.builtDay === null || (pen.extraSquares ?? []).some((s) => s.constructionId !== undefined)
  );
}

/**
 * Místa ohrady na noc – hotové čtverce × místa na čtverec: kusy svého stáda, u ohrady volů voli
 * i s telaty ve výcviku (oxen.md – Ohrada volů).
 */
export function penPlaces(pen: Pen): number {
  const species = penSpecies(pen);
  const herd = penHerdSpecies(species);
  return (
    builtPenSquares(pen).length *
    PEN_PLACES_PER_SQUARE[herd ?? (species === 'horse' ? 'horse' : 'team')]
  );
}

const DAYS_PER_YEAR = 365.25;

/** Den, kdy je tele, které začalo výcvik v den `startDay`, vycvičené (OXEN.trainingYears). */
export function oxTrainedDay(startDay: number): number {
  return Math.ceil(startDay + OXEN.trainingYears * DAYS_PER_YEAR - 1e-9);
}

/**
 * Voli ohrady volů (oxen.md – Voli po kusech) – vycvičení i telata ve výcviku; jiné ohrady
 * žádné. Ohrada uložená dřív (do převodu `withOxen`): spřežení = 2 vycvičení voli se stejným dnem,
 * výcvik = 2 telata, která se vycvičí za OXEN.trainingYears od zadání.
 */
export function oxenOf(pen: {
  readonly oxen?: readonly Ox[];
  readonly team?: Pen['team'];
  readonly training?: Pen['training'];
}): readonly Ox[] {
  if (pen.oxen) return pen.oxen;
  const out: Ox[] = [];
  const team = pen.team ?? null;
  const training = pen.training ?? null;
  for (let k = 0; k < OXEN.teamSize && team; k++) {
    out.push({
      trainedDay: team.readyDay,
      ...(team.weak === undefined ? {} : { weak: team.weak }),
    });
  }
  for (let k = 0; k < OXEN.teamSize && training; k++) {
    out.push({ trainedDay: oxTrainedDay(training.startDay) });
  }
  return out;
}

function herdZeros(): Record<HerdSpecies, number> {
  return { sheep: 0, goat: 0, pig: 0, cow: 0 };
}

/**
 * Kapacita ohrad vsi po druzích stáda (kusy na noc – dospělí i jarní mláďata): součet míst
 * hotových čtverců hotových ohrad daného druhu (oxen.md – Kapacita ohrady).
 */
export function penCapacity(state: Pick<VillageState, 'pens'>): Record<HerdSpecies, number> {
  const out = herdZeros();
  for (const pen of state.pens ?? []) {
    const herd = penHerdSpecies(penSpecies(pen));
    if (herd) out[herd] += penPlaces(pen);
  }
  return out;
}

/** Domácnosti vsi – i zakladatelé, kteří bydlí na staveništi první zemnice. */
function households(state: Pick<VillageState, 'people'>): number {
  return new Set(state.people.map((p) => p.dwellingId)).size;
}

/**
 * Místa u domů bez ohrady (diet.md – Bez ohrady u domu): každá domácnost udrží pár kusů
 * (HOMESTEAD_HERD – 2 ovce, 1 koza, 1 prase, krávy ne).
 */
export function homesteadRoom(state: Pick<VillageState, 'people'>): Record<HerdSpecies, number> {
  const n = households(state);
  return {
    sheep: n * HOMESTEAD_HERD.sheep,
    goat: n * HOMESTEAD_HERD.goat,
    pig: n * HOMESTEAD_HERD.pig,
    cow: n * HOMESTEAD_HERD.cow,
  };
}

/**
 * Kolik kusů stáda (dospělí i jarní mláďata) ves na noc ustájí – ohrady svého druhu a pár kusů
 * u domů (oxen.md – Ohrady podle druhu, diet.md – Bez ohrady u domu). Samostatný vstup nosnosti
 * stáda (`WinterInput.room`); chovný pár zůstane vždy (livestock.ts).
 */
export function herdRoom(
  state: Pick<VillageState, 'pens' | 'people'>,
): Record<HerdSpecies, number> {
  const pens = penCapacity(state);
  const home = homesteadRoom(state);
  return {
    sheep: pens.sheep + home.sheep,
    goat: pens.goat + home.goat,
    pig: pens.pig + home.pig,
    cow: pens.cow + home.cow,
  };
}

/**
 * Kolik zvířat je v noci v které ohradě (id → kusy, oxen.md – Na noc v ohradě): stádo druhu
 * (i s letošními mláďaty, zaokrouhleně) se rozdělí do hotových ohrad svého druhu podle id do
 * jejich míst, co se nevejde, zůstane u domů; ohrada volů má své voly i telata ve výcviku.
 */
export function penOccupancy(state: Pick<VillageState, 'pens' | 'livestock'>): Map<number, number> {
  const out = new Map<number, number>();
  const left = herdZeros();
  // stádo už letošní mláďata obsahuje (`young` je jen jejich podíl)
  const herds = state.livestock?.herds;
  if (herds) {
    for (const s of ['sheep', 'goat', 'pig', 'cow'] as const) left[s] = Math.round(herds[s]);
  }
  // opuštěná ohrada stádo nedrží (demolition.md – Opuštění)
  const pens = [...(state.pens ?? [])].filter((p) => !isDisused(p)).sort((a, b) => a.id - b.id);
  for (const pen of pens) {
    const species = penSpecies(pen);
    if (species === 'team') {
      out.set(pen.id, oxenOf(pen).length);
      continue;
    }
    if (species === 'horse') {
      out.set(pen.id, (pen.horses ?? []).length);
      continue;
    }
    const herd = penHerdSpecies(species)!;
    const inside = Math.min(left[herd], penPlaces(pen));
    left[herd] -= inside;
    out.set(pen.id, inside);
  }
  return out;
}

/**
 * Ohrady s druhem (oxen.md – Ohrady podle druhu, převod starých vsí): ohrada uložená bez druhu se
 * spřežením nebo výcvikem je ohrada spřežení, jinak skot (dnes v ní zimují krávy). Jednou – ves,
 * kde mají všechny ohrady druh, se nemění (vrátí týž stav).
 */
export function withPenSpecies(state: VillageState): VillageState {
  if (!(state.pens ?? []).some((p) => p.species === undefined)) return state;
  return {
    ...state,
    pens: state.pens!.map((p) => (p.species ? p : { ...p, species: penSpecies(p) })),
  };
}

/**
 * Roční odklad míst pro ves uloženou dřív (oxen.md – Ohrady podle druhu, roční odklad): stáda bez
 * dne odkladu ho dostanou od dneška (`today`, nejdřív `lastDay`; + PEN_GRACE –
 * `LivestockState.pensFromDay`).
 * Jen při načtení vsi (`updateVillage`) – dopočet sám den nemění (výsledek nezávisí na kouscích).
 * Jednou – ves s dnem odkladu (i nová ves) se nemění (vrátí týž stav).
 */
export function withPenGrace(state: VillageState, today: number = state.lastDay): VillageState {
  const livestock = state.livestock;
  if (!livestock || livestock.pensFromDay !== undefined) return state;
  const day = Math.max(state.lastDay, today);
  return { ...state, livestock: { ...livestock, pensFromDay: penGraceEnd(day) } };
}

/** Den, od kterého stádo omezují místa – rok po dni `day` (založení vsi, převod). */
export function penGraceEnd(day: number): number {
  return day + PEN_GRACE.graceDays;
}

/**
 * Omezují v den `day` stádo místa ohrad a u domů? Až po ročním odkladu (`pensFromDay`); bez dne
 * hned (oxen.md – Ohrady podle druhu, roční odklad).
 */
export function pensLimitHerds(state: Pick<VillageState, 'livestock'>, day: number): boolean {
  const from = state.livestock?.pensFromDay;
  return from === undefined || day >= from;
}

/**
 * Druhy stád, která se na noc nevejdou do ohrad svého druhu a k domům (`herdRoom`; chovný pár
 * zůstane vždy) – upozornění „Stáda se nevejdou do ohrad“, i během ročního odkladu.
 */
export function herdsOverRoom(
  state: Pick<VillageState, 'pens' | 'people' | 'livestock'>,
): HerdSpecies[] {
  const herds = state.livestock?.herds;
  if (!herds) return [];
  const room = herdRoom(state);
  return (['sheep', 'goat', 'pig', 'cow'] as const).filter(
    (s) => Math.round(herds[s]) > Math.max(room[s], BREEDING_PAIR),
  );
}

/** Chovný pár druhu zůstane vždy (LIVESTOCK.breedingMin – bez importu livestock.ts). */
const BREEDING_PAIR = 2;

function sharesEdge(a: TileCell, b: TileCell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Čtverce ohrady v její mřížce – první a další. */
export function penCells(pen: {
  readonly cell: TileCell;
  readonly extraSquares?: readonly { readonly cell: TileCell }[];
}): TileCell[] {
  return [pen.cell, ...(pen.extraSquares ?? []).map((q) => q.cell)];
}

/** Ohrada pro navazování – čtverce, mřížka a druh (i ohrada z kontroly umístění). */
export interface TouchablePen {
  readonly id?: number;
  readonly cell: TileCell;
  readonly extraSquares?: readonly { readonly cell: TileCell }[];
  readonly grid?: SquareGrid;
  readonly species?: PenSpecies;
  readonly team?: Pen['team'];
  readonly training?: Pen['training'];
}

/**
 * Ohrady téhož druhu, na které čtverce navazují stranou (rozšíření jako u hřbitova – jedna =
 * čtverce ji rozšíří, žádná = nová ohrada). Navazuje se jen ve stejné mřížce. Pořadí seznamu.
 */
export function touchingPens<P extends TouchablePen>(
  pens: readonly P[],
  cells: readonly TileCell[],
  species: PenSpecies,
  grid?: SquareGrid,
): P[] {
  return pens.filter(
    (p) =>
      penSpecies(p) === species &&
      sameGrid(p.grid, grid) &&
      penCells(p).some((c) => cells.some((cell) => sharesEdge(c, cell))),
  );
}

/** Jsou čtverce souvislé stranou (jedna skupina – plot ohrady jde kolem dokola)? */
export function connectedCells(cells: readonly TileCell[]): boolean {
  if (cells.length <= 1) return true;
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.pop()!;
    cells.forEach((c, j) => {
      if (!seen.has(j) && sharesEdge(cells[i]!, c)) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  return seen.size === cells.length;
}

/** Nejvíc čtverců jedné ohrady (ohrada, ne výběh – Martin). */
export const MAX_PEN_SQUARES = PEN_SQUARES.max;
