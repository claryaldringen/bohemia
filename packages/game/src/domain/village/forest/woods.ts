import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape';
import { OVERGROWTH_STAGES, VILLAGE_WOOD } from '../rules';
import { GRID_TURNS, rotationCosSin, rotationTurn, sameGrid } from '../placement/square-grid';
import type { SquareGrid, TileCell, VillageState, VillageWood } from '../types';

// Les vsi (fields.md – Zarůstání, Les vsi): čtverec pole, který zarostl lesem a z pole vypadl.
// Les dál roste a jeho stromy jsou herní data jako stromy u pevných cest (roads.md) – překážky
// nad vrstvou krajiny (`ObstacleChanges.added`, obstacles.ts): stromů na čtverci je tolik jako
// v lese krajiny, dospělé (strom = kláda) přibývají se stářím lesa, ostatní jsou mladé stromky.
// Dospělé stromy jde kácet na dřevo staveb a dílen (`nearestMatureTrees`), pole přes les je
// vymýtí s klády. Id stromu = WOOD_TREE_ID_BASE + políčko × 64 + pořadí – stabilní, nezávisí na
// pořadí lesů ve stavu. Bez polohy (`x`, `z` – ves simulovaná bez krajiny) les stromy nemá.

/**
 * Id stromů lesa vsi leží nad id vrstvy překážek (pod 2^27) i stromů u pevných cest
 * (ROAD_TREE_ID_BASE = 2^30 a výš, jejich počet je malý) – 2^31. Celé id se vejde do Uint32.
 */
export const WOOD_TREE_ID_BASE = 2_147_483_648;
/** Políček na řádek v id stromu – krajina má stranu nejvýš tolik políček. */
const CELL_STRIDE = 4096;
/** Míst na stromy v id jednoho políčka. */
const TREES_PER_CELL = 64;
/** Mřížka míst na stromy v čtverci (3 × 3 – plný les má ≈ 5–6 stromů na políčko). */
const GRID = 3;
/** Posun stromu od středu buňky mřížky (podíl buňky). */
const JITTER = 0.6;
const M2_PER_HA = 10_000;
const DAYS_PER_YEAR = 365.25;
/** Les vypadne z pole ve stáří, kdy díl zarostl lesem (OVERGROWTH_STAGES – 30 let). */
const FOREST_FROM_YEARS = OVERGROWTH_STAGES.find((s) => s.stage === 'forest')?.fromYears ?? 30;

/** Id stromu `k` lesa vsi na políčku `cell` (u lesa z natočeného pole buňka z `woodIdCell`). */
export function woodTreeId(cell: TileCell, k: number): number {
  return WOOD_TREE_ID_BASE + (cell.y * CELL_STRIDE + cell.x) * TREES_PER_CELL + k;
}

/** Les vsi pro id a místa stromů: čtverec, střed, plocha a natočení (natočené pole). */
export type WoodPlace = Pick<VillageWood, 'cell' | 'x' | 'z' | 'areaM2'> & {
  grid?: SquareGrid;
  rotation?: number;
};

/** Buňka id lesa z natočeného pole (m) – středy natočených čtverců jsou od sebe aspoň 15 m. */
const ROTATED_ID_CELL_M = CELL_SIZE_M / 2;
/** Řádky id pro les z natočeného pole začínají tady – les na políčku jich má nejvýš 4096 / 2. */
const ROTATED_ID_ROW = CELL_STRIDE / 2;

/** Natočení lesa (z mřížky natočeného pole) – 0, když leží v mřížce krajiny. */
function woodRotation(wood: Pick<WoodPlace, 'grid' | 'rotation'>): number {
  return wood.rotation ?? wood.grid?.rotation ?? 0;
}

/** Leží les natočeně (ne v mřížce krajiny)? */
function isRotatedWood(wood: Pick<WoodPlace, 'grid' | 'rotation'>): boolean {
  const turn = rotationTurn(woodRotation(wood));
  return turn !== null && turn % GRID_TURNS !== 0;
}

/**
 * Políčko pro id stromů lesa vsi: les na políčku krajiny jeho políčko; les z natočeného pole
 * (fields.md – Natočené stavby) buňka 7,5 m pod svým středem v horní polovině řádků id – středy
 * nepřekrývajících se čtverců jsou od sebe aspoň 15 m, do jedné buňky nepadnou dva. Bez středu
 * (ves bez krajiny) jeho čtverec.
 */
export function woodIdCell(
  wood: Pick<WoodPlace, 'cell' | 'x' | 'z' | 'grid' | 'rotation'>,
): TileCell {
  if (!isRotatedWood(wood) || wood.x === undefined || wood.z === undefined) return wood.cell;
  const half = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;
  return {
    x: Math.floor((wood.x + half) / ROTATED_ID_CELL_M),
    y: ROTATED_ID_ROW + Math.floor((wood.z + half) / ROTATED_ID_CELL_M),
  };
}

/** Je to id stromu lesa vsi (ne překážky z vrstvy ani stromu u cesty)? */
export function isWoodTreeId(id: number): boolean {
  return id >= WOOD_TREE_ID_BASE;
}

/** Políčko a pořadí stromu lesa vsi podle id. */
export function woodTreeOf(id: number): { cell: TileCell; k: number } {
  const n = id - WOOD_TREE_ID_BASE;
  const k = n % TREES_PER_CELL;
  const index = (n - k) / TREES_PER_CELL;
  return { cell: { x: index % CELL_STRIDE, y: Math.floor(index / CELL_STRIDE) }, k };
}

/** Stáří lesa vsi v den `day` (roky) – při vypadnutí z pole 30 let. */
export function woodAgeYears(wood: Pick<VillageWood, 'day'>, day: number): number {
  return FOREST_FROM_YEARS + Math.max(0, day - wood.day) / DAYS_PER_YEAR;
}

/** Stromů plného lesa na ploše (m²) – hustota lesa krajiny (VILLAGE_WOOD.treesPerHa). */
export function woodTreesOnArea(areaM2: number): number {
  return (VILLAGE_WOOD.treesPerHa * areaM2) / M2_PER_HA;
}

/** Kolik stromů na čtverci lesa vsi roste (plná hustota lesa krajiny, aspoň jeden). */
export function woodTreeCount(wood: Pick<VillageWood, 'areaM2'>): number {
  const count = Math.round(woodTreesOnArea(wood.areaM2));
  return Math.min(GRID * GRID, Math.max(1, count));
}

/**
 * Podíl dospělých stromů lesa ve stáří `ageYears` (0–1): od VILLAGE_WOOD.matureFromYears (mladý
 * les) do plné hustoty ve VILLAGE_WOOD.fullYears lineárně.
 */
export function woodMatureShare(ageYears: number): number {
  const { matureFromYears: from, fullYears: full } = VILLAGE_WOOD;
  return Math.min(1, Math.max(0, (ageYears - from) / (full - from)));
}

/** Kolik stromů lesa vsi je v den `day` dospělých (dají kládu) – prvních tolik míst. */
export function woodMatureTrees(wood: Pick<VillageWood, 'areaM2' | 'day'>, day: number): number {
  return Math.round(woodTreeCount(wood) * woodMatureShare(woodAgeYears(wood, day)));
}

/** Celočíselný hash → [0, 1) – místa stromů jsou herní data, žádná náhoda ze dne. */
function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ Math.imul(b, 0x27d4eb2d) ^ Math.imul(c, 0x165667b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Místo stromu lesa vsi: id, pořadí a pata ve světě (m, na cm). */
export interface WoodTreeSpot {
  id: number;
  k: number;
  x: number;
  z: number;
}

/**
 * Místa stromů lesa vsi (deterministicky podle políčka): buňky mřížky 3 × 3 přes čtverec
 * v pořadí podle hashe, v každé strom posunutý z jejího středu. Prvních `woodTreeCount` míst –
 * dospělé stromy jsou na prvních místech. Bez polohy lesa žádná.
 */
export function woodTreeSpots(wood: WoodPlace): WoodTreeSpot[] {
  if (wood.x === undefined || wood.z === undefined) return [];
  const side = Math.sqrt(wood.areaM2);
  const step = side / GRID;
  const id = woodIdCell(wood);
  const cells = Array.from({ length: GRID * GRID }, (_, i) => i).sort(
    (a, b) => hash01(id.x, id.y, a) - hash01(id.x, id.y, b) || a - b,
  );
  const count = woodTreeCount(wood);
  // les z natočeného pole stojí v natočeném čtverci (fields.md – Natočené stavby)
  const rotated = isRotatedWood(wood);
  const [c, s] = rotated ? rotationCosSin(woodRotation(wood)) : [1, 0];
  const spots: WoodTreeSpot[] = [];
  for (let k = 0; k < count; k++) {
    const cell = cells[k]!;
    const gx = cell % GRID;
    const gz = (cell - gx) / GRID;
    const jx = (hash01(id.x, id.y, 100 + k) - 0.5) * JITTER;
    const jz = (hash01(id.x, id.y, 200 + k) - 0.5) * JITTER;
    let x: number;
    let z: number;
    if (rotated) {
      const lx = -side / 2 + (gx + 0.5 + jx) * step;
      const lz = -side / 2 + (gz + 0.5 + jz) * step;
      x = wood.x + lx * c + lz * s;
      z = wood.z - lx * s + lz * c;
    } else {
      x = wood.x - side / 2 + (gx + 0.5 + jx) * step;
      z = wood.z - side / 2 + (gz + 0.5 + jz) * step;
    }
    spots.push({
      id: woodTreeId(id, k),
      k,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
    });
  }
  return spots;
}

/** Lesy vsi (bez nich prázdné). */
export function villageWoods(state: Pick<VillageState, 'woods'>): readonly VillageWood[] {
  return state.woods ?? [];
}

/** Les vsi na čtverci `cell` mřížky `grid` (bez ní políčko krajiny), nebo undefined. */
export function woodAt(
  state: Pick<VillageState, 'woods'>,
  cell: TileCell,
  grid?: SquareGrid,
): VillageWood | undefined {
  return villageWoods(state).find(
    (w) => w.cell.x === cell.x && w.cell.y === cell.y && sameGrid(w.grid, grid),
  );
}

/**
 * Les vsi na čtverci zmizí (mutuje stav – pole ho vymýtilo, fields.md – Les vsi): s ním i záznamy
 * o jeho odstraněných a pokácených stromech (kdyby čtverec zase zarostl, les začne znovu). Čtverec
 * v mřížce `grid` natočeného pole (bez ní políčko krajiny).
 */
export function clearWoodAt(state: VillageState, cell: TileCell, grid?: SquareGrid): void {
  const wood = woodAt(state, cell, grid);
  if (!wood) return;
  state.woods = villageWoods(state).filter((w) => w !== wood);
  if (state.woods.length === 0) delete state.woods;
  const idCell = woodIdCell(wood);
  const onCell = (id: number): boolean => {
    if (!isWoodTreeId(id)) return false;
    const tree = woodTreeOf(id).cell;
    return tree.x === idCell.x && tree.y === idCell.y;
  };
  if (state.clearedObstacles) {
    state.clearedObstacles = state.clearedObstacles.filter((c) => !onCell(c.id));
  }
  if (state.felledTrees) state.felledTrees = state.felledTrees.filter((f) => !onCell(f.id));
}

/**
 * Les vsi, ze kterého stavby odstranily všechny stromy (fields.md – Les vsi; Martin 19. 10. 2026 –
 * stavby v lese: les se vyklučí), zmizí jako pod polem (`clearWoodAt`) – na jeho čtverci už nic
 * neroste. Kontroluje jen lesy stromů `ids` (právě odstraněných); mutuje stav, volat na klonu.
 */
export function dropClearedWoods(state: VillageState, ids: readonly number[]): void {
  const touched = new Set<string>();
  for (const id of ids) {
    if (!isWoodTreeId(id)) continue;
    const { cell } = woodTreeOf(id);
    touched.add(`${cell.x},${cell.y}`);
  }
  if (touched.size === 0) return;
  const cleared = new Set((state.clearedObstacles ?? []).map((c) => c.id));
  for (const wood of [...villageWoods(state)]) {
    const idCell = woodIdCell(wood);
    if (!touched.has(`${idCell.x},${idCell.y}`)) continue;
    const spots = woodTreeSpots(wood);
    if (spots.length === 0 || !spots.every((spot) => cleared.has(spot.id))) continue;
    clearWoodAt(state, wood.cell, wood.grid);
  }
}
