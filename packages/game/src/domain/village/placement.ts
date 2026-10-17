import {
  heightAtWorld,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
} from '../landscape';
import type { CemeterySquareInput, PartInput } from './actions';
import { cemeteryFoundingCost, distanceToSquare } from './cemetery';
import { partFoundingCost } from './fields';
import { polygonsOverlap, rectangleCorners, type Point } from './polygon';
import {
  CEMETERY,
  CEMETERY_DISTANCE_M,
  DWELLING_FOOTPRINT_M,
  DWELLING_MAX_HEIGHT_DIFF_M,
  FIELD_LIMITS,
} from './rules';
import type { DwellingType, Position, TileCell } from './types';

// Umisťování obydlí, polí a pohřebišť (population.md – Umístění obydlí, fields.md – Založení
// pole, cemetery.md – Stavba). Čisté funkce pro server i klienta (náhled při umisťování).
// Obydlí stojí kdekoli (souřadnice světa scény v metrech), pole a pohřebiště se skládají
// z celých čtverců – políček krajiny (15 × 15 m).

/** Výsledek kontroly umístění; důvod je česky pro hráče. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
}

/** Co z vsi potřebuje kontrola překryvu – VillageState ji splňuje, klient ji složí ze scény. */
export interface PlacementVillage {
  readonly dwellings: readonly { readonly type: DwellingType; readonly position: Position }[];
  readonly constructions: readonly {
    readonly dwellingType: DwellingType | null;
    readonly position: Position | null;
  }[];
  /** Díly polí – každý zabírá své políčko (díl bez políčka se nepočítá). */
  readonly parts: readonly { readonly cell?: TileCell }[];
  /** Pohřebiště – zabírají políčka svých čtverců (bez údaje žádná). */
  readonly cemeteries?: readonly { readonly squares: readonly { readonly cell: TileCell }[] }[];
}

/** Náhled pole ze čtverců – díly pro `foundField` / `foundVillage` a souhrn pro hráče. */
export interface FieldPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Díly – jeden na každý čtverec louky. */
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  /** Čtverce, kam pole nesmí (voda, les, obydlí, jiné pole, moc daleko) – scéna je zčervená. */
  blockedCells: TileCell[];
  check: PlacementCheck;
}

/**
 * Náhled pohřebiště ze čtverců – čtverce pro `foundCemetery`, cena, místo a varování, když je
 * moc blízko obydlí nebo vody (hygienu samotnou hráč nevidí – cemetery.md).
 */
export interface CemeteryPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Čtverce pohřebiště – jeden na každý čtverec louky. */
  squares: CemeterySquareInput[];
  /** Kolik hrobů se do pohřebiště vejde. */
  capacity: number;
  foundingCost: number;
  /** Čtverce, kam pohřebiště nesmí (voda, les, obydlí, pole, jiné pohřebiště) – scéna je zčervená. */
  blockedCells: TileCell[];
  /** Čtverce blíž obydlí než 150 m nebo vodě než 100 m – scéna je může zbarvit varovně. */
  warningCells: TileCell[];
  check: PlacementCheck;
  /** Varování do bubliny (stavbu neblokuje): pohřebiště je moc blízko obydlí nebo vody. */
  warning: string | null;
}

/** Nejvíc čtverců jednoho pole (≈ 34 ha) – ochrana serveru před obřím vstupem. */
export const MAX_FIELD_CELLS = 1500;
/** Nejvíc čtverců jednoho pohřebiště (5 600 hrobů) – ochrana serveru před obřím vstupem. */
export const MAX_CEMETERY_CELLS = 100;
/** Krok vzorkování půdorysu obydlí (m) – výšky a povrch políček pod ním. */
const FOOTPRINT_SAMPLE_STEP_M = 0.5;
const M2_PER_HA = 10_000;

const OK: PlacementCheck = { ok: true, reason: null };

function fail(reason: string): PlacementCheck {
  return { ok: false, reason };
}

/** Číslo s desetinnou čárkou. */
function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Celé číslo s mezerami po tisících. */
function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Rohy půdorysu obydlí ve světě. */
export function dwellingFootprint(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  return rectangleCorners(position.x, position.z, width, depth, position.rotation);
}

/** Rohy políčka (čtverce pole) ve světě. */
export function cellCorners(landscape: Landscape, cell: TileCell): Point[] {
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  return rectangleCorners(center.x, center.z, landscape.cellSizeM, landscape.cellSizeM, 0);
}

function cellIndex(landscape: Landscape, cell: TileCell): number {
  return cell.y * landscape.size + cell.x;
}

/** Políčka, jejichž vnitřek se překrývá s mnohoúhelníkem (dotyk hranou překryv není). */
function cellsUnderPolygon(landscape: Landscape, polygon: readonly Point[]): number[] {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const toTile = (v: number): number =>
    Math.min(landscape.size - 1, Math.max(0, Math.floor((v + half) / landscape.cellSizeM)));
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const out: number[] = [];
  for (let y = toTile(Math.min(...zs)); y <= toTile(Math.max(...zs)); y++) {
    for (let x = toTile(Math.min(...xs)); x <= toTile(Math.max(...xs)); x++) {
      if (polygonsOverlap(cellCorners(landscape, { x, y }), polygon)) {
        out.push(cellIndex(landscape, { x, y }));
      }
    }
  }
  return out;
}

/** Políčka, která už zabírají pole vsi. */
function occupiedCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const part of village?.parts ?? []) {
    if (part.cell) occupied.add(cellIndex(landscape, part.cell));
  }
  return occupied;
}

/** Políčka, která už zabírají pohřebiště vsi. */
function cemeteryCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const cemetery of village?.cemeteries ?? []) {
    for (const square of cemetery.squares) occupied.add(cellIndex(landscape, square.cell));
  }
  return occupied;
}

/** Body mřížky po FOOTPRINT_SAMPLE_STEP_M přes otočený půdorys, včetně okrajů. */
function footprintSamples(type: DwellingType, position: Position): Point[] {
  const { width, depth } = DWELLING_FOOTPRINT_M[type];
  const stepsX = Math.ceil(width / FOOTPRINT_SAMPLE_STEP_M);
  const stepsZ = Math.ceil(depth / FOOTPRINT_SAMPLE_STEP_M);
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  const samples: Point[] = [];
  for (let i = 0; i <= stepsX; i++) {
    for (let j = 0; j <= stepsZ; j++) {
      const lx = -width / 2 + (width * i) / stepsX;
      const lz = -depth / 2 + (depth * j) / stepsZ;
      samples.push([position.x + lx * cos + lz * sin, position.z - lx * sin + lz * cos]);
    }
  }
  return samples;
}

/** Půdorys celý v krajině, ne ve vodě, jen na louce a dost rovný. */
function checkFootprintTerrain(landscape: Landscape, samples: readonly Point[]): PlacementCheck {
  let lowest = Infinity;
  let highest = -Infinity;
  let offMeadow = false;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail('Obydlí musí stát uvnitř krajiny sídla.');
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail('Obydlí nemůže stát ve vodě.');
    if (surface !== 'meadow') offMeadow = true;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (offMeadow) return fail('Obydlí jde zatím stavět jen na louce.');
  const difference = highest - lowest;
  if (difference > DWELLING_MAX_HEIGHT_DIFF_M) {
    return fail(
      `Země je tu příliš nerovná – rozdíl ${formatNumber(difference, 1)} m, ` +
        `nejvýš ${formatNumber(DWELLING_MAX_HEIGHT_DIFF_M, 1)} m.`,
    );
  }
  return OK;
}

/** Půdorys se nepřekrývá s obydlím, rozestavěným obydlím ani se čtvercem pole či pohřebiště. */
function checkFootprintFree(
  landscape: Landscape,
  village: PlacementVillage | null,
  footprint: Point[],
): PlacementCheck {
  if (village === null) return OK;
  for (const d of village.dwellings) {
    if (polygonsOverlap(footprint, dwellingFootprint(d.type, d.position))) {
      return fail('Překrývá se s jiným obydlím.');
    }
  }
  for (const c of village.constructions) {
    if (c.dwellingType === null || c.position === null) continue;
    if (polygonsOverlap(footprint, dwellingFootprint(c.dwellingType, c.position))) {
      return fail('Překrývá se s rozestavěným obydlím.');
    }
  }
  const under = cellsUnderPolygon(landscape, footprint);
  const occupied = occupiedCells(landscape, village);
  if (under.some((i) => occupied.has(i))) return fail('Překrývá se s polem.');
  const cemeteries = cemeteryCells(landscape, village);
  if (under.some((i) => cemeteries.has(i))) return fail('Překrývá se s pohřebištěm.');
  return OK;
}

/**
 * Smí obydlí stát na místě? Rozdíl výšek pod půdorysem nejvýš 0,5 m, všechna políčka pod ním
 * louka (ne voda, zatím ani les), žádný překryv s obydlími, rozestavěnými obydlími, poli
 * a pohřebišti.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
): PlacementCheck {
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return fail('Neplatná poloha obydlí.');
  }
  const terrain = checkFootprintTerrain(landscape, footprintSamples(type, position));
  if (!terrain.ok) return terrain;
  return checkFootprintFree(landscape, village, dwellingFootprint(type, position));
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
export function villageDwellingPositions(village: PlacementVillage | null): Position[] {
  if (village === null) return [];
  const built = village.dwellings.map((d) => d.position);
  const planned = village.constructions.flatMap((c) =>
    c.dwellingType !== null && c.position !== null ? [c.position] : [],
  );
  return [...built, ...planned];
}

type CellsShape = { ok: true; cells: TileCell[] } | { ok: false; reason: string };

/** Co se staví po čtvercích – název v 1. a 2. pádě (obojí rodu středního) a nejvíc čtverců. */
interface SquaresKind {
  nominative: string;
  genitive: string;
  maxCells: number;
}
const FIELD_KIND: SquaresKind = { nominative: 'Pole', genitive: 'pole', maxCells: MAX_FIELD_CELLS };
const CEMETERY_KIND: SquaresKind = {
  nominative: 'Pohřebiště',
  genitive: 'pohřebiště',
  maxCells: MAX_CEMETERY_CELLS,
};

/** Čtverce jako celá čísla uvnitř krajiny, bez opakování, seřazené po řádcích (y, pak x). */
function normalizeCells(
  landscape: Landscape,
  cells: readonly TileCell[],
  kind: SquaresKind,
): CellsShape {
  if (!cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))) {
    return { ok: false, reason: `Neplatné čtverce ${kind.genitive}.` };
  }
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= landscape.size || c.y >= landscape.size)) {
    return { ok: false, reason: `${kind.nominative} musí ležet uvnitř krajiny sídla.` };
  }
  const byIndex = new Map<number, TileCell>();
  for (const c of cells) byIndex.set(cellIndex(landscape, c), { x: c.x, y: c.y });
  if (byIndex.size === 0)
    return { ok: false, reason: `Vyber aspoň jeden čtverec ${kind.genitive}.` };
  if (byIndex.size > kind.maxCells) {
    return {
      ok: false,
      reason: `${kind.nominative} může mít nejvýš ${formatInteger(kind.maxCells)} čtverců.`,
    };
  }
  const sorted = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, cell]) => cell);
  return { ok: true, cells: sorted };
}

/** Čtverce tvoří jednu skupinu, ve které sousedí stranou (4-souvislost). */
function isConnected(landscape: Landscape, cells: readonly TileCell[]): boolean {
  const first = cells[0];
  if (!first) return true;
  const remaining = new Set(cells.map((c) => cellIndex(landscape, c)));
  const stack = [first];
  remaining.delete(cellIndex(landscape, first));
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: x + dx, y: y + dy };
      const index = cellIndex(landscape, next);
      if (next.x < 0 || next.x >= landscape.size || !remaining.has(index)) continue;
      remaining.delete(index);
      stack.push(next);
    }
  }
  return remaining.size === 0;
}

/** Vzdálenost středu políčka k nejbližšímu obydlí (bez obydlí nekonečno). */
function distanceToNearest(landscape: Landscape, cell: TileCell, positions: Position[]): number {
  const c = tileCenterWorld(landscape, cell.x, cell.y);
  return positions.reduce((best, p) => Math.min(best, Math.hypot(p.x - c.x, p.z - c.z)), Infinity);
}

/** Políčka pod obydlími vsi i plánovanými (plánované obydlí bez typu – první – je zemnice). */
function dwellingCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): Set<number> {
  const footprints = [
    ...(village?.dwellings.map((d) => dwellingFootprint(d.type, d.position)) ?? []),
    ...(village?.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null
        ? [dwellingFootprint(c.dwellingType, c.position)]
        : [],
    ) ?? []),
    ...dwellingPositions.map((p) => dwellingFootprint('zemnice', p)),
  ];
  return new Set(footprints.flatMap((f) => cellsUnderPolygon(landscape, f)));
}

/** Co brání čtverci stavby: voda, les, obydlí, pole, pohřebiště. */
interface SquareFlags {
  water: boolean;
  forest: boolean;
  dwelling: boolean;
  field: boolean;
  cemetery: boolean;
}

/** Kontrola jednotlivých čtverců proti krajině a vsi (zabraná políčka se spočítají jednou). */
function squareFlags(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): (cell: TileCell) => SquareFlags {
  const fields = occupiedCells(landscape, village);
  const cemeteries = cemeteryCells(landscape, village);
  const underDwellings = dwellingCells(landscape, village, dwellingPositions);
  return (cell) => {
    const index = cellIndex(landscape, cell);
    const surface = surfaceAt(landscape, cell.x, cell.y);
    return {
      water: surface === 'water',
      forest: surface === 'forest',
      dwelling: underDwellings.has(index),
      field: fields.has(index),
      cemetery: cemeteries.has(index),
    };
  };
}

/** Políčka vody krajiny (indexy) – spočítají se jednou pro každou krajinu. */
const waterTilesCache = new WeakMap<Landscape, Int32Array>();

function waterTiles(landscape: Landscape): Int32Array {
  let tiles = waterTilesCache.get(landscape);
  if (!tiles) {
    const list: number[] = [];
    for (let y = 0; y < landscape.size; y++) {
      for (let x = 0; x < landscape.size; x++) {
        if (surfaceAt(landscape, x, y) === 'water') list.push(y * landscape.size + x);
      }
    }
    tiles = Int32Array.from(list);
    waterTilesCache.set(landscape, tiles);
  }
  return tiles;
}

/**
 * Vzdálenost čtverce (políčka) od nejbližší vody v m – mezi okraji políček, sousední políčko
 * vody 0. Krajina bez vody: dvojnásobek strany krajiny (konečné číslo – ukládá se do JSON).
 */
export function waterDistanceM(landscape: Landscape, cell: TileCell): number {
  let best = Infinity;
  for (const index of waterTiles(landscape)) {
    const dx = Math.max(0, Math.abs((index % landscape.size) - cell.x) - 1);
    const dy = Math.max(0, Math.abs(Math.floor(index / landscape.size) - cell.y) - 1);
    best = Math.min(best, Math.hypot(dx, dy) * landscape.cellSizeM);
  }
  return Number.isFinite(best) ? best : 2 * landscape.size * landscape.cellSizeM;
}

const EMPTY_PREVIEW = {
  cells: [],
  parts: [],
  areaM2: 0,
  averageFertility: 0,
  foundingCost: 0,
  blockedCells: [],
} as const;

/**
 * Pole ze čtverců – políček krajiny (15 × 15 m, díl = celé políčko). Díly jen na louce (les
 * zatím ne). Vzdálenost dílu = od středu políčka k nejbližšímu z `dwellingPositions`. Kontrola
 * v tomto pořadí: platné čtverce v krajině, ne voda, ne les, nepřekrývá obydlí, jiná pole ani
 * pohřebiště, žádný díl dál než 800 m, čtverce sousedí stranou v jednom celku, aspoň 0,1 ha. Náhled
 * (díly, výměra, zakázané čtverce…) se počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
): FieldPreview {
  const shape = normalizeCells(landscape, cells, FIELD_KIND);
  if (!shape.ok)
    return { ...EMPTY_PREVIEW, cells: [], parts: [], blockedCells: [], check: fail(shape.reason) };

  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const problems = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    far: false,
  };
  const parts: PartInput[] = [];
  const blockedCells: TileCell[] = [];
  for (const cell of shape.cells) {
    const index = cellIndex(landscape, cell);
    const surface = surfaceAt(landscape, cell.x, cell.y);
    const distanceM = distanceToNearest(landscape, cell, dwellingPositions);
    const cellProblems = {
      ...flagsOf(cell),
      far: distanceM > FIELD_LIMITS.maxDistanceM,
    };
    let blocked = false;
    for (const key of Object.keys(cellProblems) as (keyof typeof cellProblems)[]) {
      if (!cellProblems[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    if (surface !== 'meadow') continue;
    parts.push({
      areaM2: cellArea,
      distanceM,
      naturalFertility: landscape.fertility[index]!,
      surface: 'meadow',
      obstacleCost: 0,
      cell,
    });
  }

  const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const averageFertility =
    areaM2 > 0 ? parts.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2 : 0;
  const foundingCost = parts.reduce(
    (sum, p) => sum + partFoundingCost(p.surface, p.areaM2, p.obstacleCost),
    0,
  );
  const minCells = Math.ceil(FIELD_LIMITS.minAreaM2 / cellArea);
  const checks: [boolean, () => string][] = [
    [problems.water, () => 'Pole nesmí zasahovat do vody.'],
    [problems.forest, () => 'Pole jde zatím zakládat jen na louce – mýcení lesa přijde později.'],
    [problems.dwelling, () => 'Pole se překrývá s obydlím.'],
    [problems.field, () => 'Pole se překrývá s jiným polem.'],
    [problems.cemetery, () => 'Pole se překrývá s pohřebištěm.'],
    [problems.far, () => `Pole je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [
      !isConnected(landscape, shape.cells),
      () => 'Čtverce pole musí tvořit jeden celek – sousedit stranou.',
    ],
    [
      areaM2 < FIELD_LIMITS.minAreaM2,
      () =>
        `Pole musí mít aspoň ${formatNumber(FIELD_LIMITS.minAreaM2 / M2_PER_HA, 1)} ha, ` +
        `tedy ${minCells} čtverců (teď ${shape.cells.length}).`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    parts,
    areaM2,
    averageFertility,
    foundingCost,
    blockedCells,
    check: failed ? fail(failed[1]()) : OK,
  };
}

/** Celé metry dolů – „149 m“ je opravdu méně než 150 m. */
function wholeMeters(value: number): string {
  return `${formatInteger(Math.floor(value))} m`;
}

/** Varování do bubliny, když je pohřebiště blíž obydlí nebo vodě, než je v pořádku. */
function cemeteryWarning(dwellingM: number, waterM: number): string | null {
  const { dwelling, water } = CEMETERY_DISTANCE_M;
  const nearDwelling = dwellingM < dwelling.ok;
  const nearWater = waterM < water.ok;
  if (nearDwelling && nearWater) {
    return (
      `Pohřebiště je blízko obydlí (${wholeMeters(dwellingM)}) i vody (${wholeMeters(waterM)}) – ` +
      `ves bude zdravější, když bude aspoň ${dwelling.ok} m od obydlí a ${water.ok} m od vody.`
    );
  }
  if (nearDwelling) {
    return (
      `Pohřebiště je blízko obydlí (${wholeMeters(dwellingM)}) – ves bude zdravější, ` +
      `když bude aspoň ${dwelling.ok} m daleko.`
    );
  }
  if (nearWater) {
    return (
      `Pohřebiště je blízko vody (${wholeMeters(waterM)}) – ves bude zdravější, ` +
      `když bude aspoň ${water.ok} m od potoka.`
    );
  }
  return null;
}

/**
 * Pohřebiště ze čtverců – políček krajiny (cemetery.md – Stavba). Čtverce jen na louce (les
 * zatím ne – jako u polí). Kontrola v tomto pořadí: platné čtverce v krajině, ne voda, ne les,
 * nepřekrývá obydlí (i plánovaná z `dwellingPositions`), pole ani jiné pohřebiště, čtverce
 * sousedí stranou v jednom celku. Blízkost obydlí (pod 150 m) a vody (pod 100 m) stavbu
 * neblokuje – jen `warning` a `warningCells`. Náhled se počítá i při neúspěchu – kromě
 * neplatných čtverců.
 */
export function cemeteryPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
): CemeteryPreview {
  const shape = normalizeCells(landscape, cells, CEMETERY_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      capacity: 0,
      foundingCost: 0,
      blockedCells: [],
      warningCells: [],
      check: fail(shape.reason),
      warning: null,
    };
  }

  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const size = landscape.cellSizeM;
  const problems: SquareFlags = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
  };
  const squares: CemeterySquareInput[] = [];
  const blockedCells: TileCell[] = [];
  const warningCells: TileCell[] = [];
  let nearestDwellingM = Infinity;
  let nearestWaterM = Infinity;
  for (const cell of shape.cells) {
    const flags = flagsOf(cell);
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof SquareFlags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    if (flags.water || flags.forest) continue;
    const center = tileCenterWorld(landscape, cell.x, cell.y);
    const square = { cell, x: center.x, z: center.z };
    const water = waterDistanceM(landscape, cell);
    // stejná vzdálenost jako v simulaci (cemetery.ts) – od obydlí k okraji čtverce
    const dwelling = dwellingPositions.reduce(
      (min, p) => Math.min(min, distanceToSquare(p.x, p.z, square, size)),
      Infinity,
    );
    nearestDwellingM = Math.min(nearestDwellingM, dwelling);
    nearestWaterM = Math.min(nearestWaterM, water);
    if (dwelling < CEMETERY_DISTANCE_M.dwelling.ok || water < CEMETERY_DISTANCE_M.water.ok) {
      warningCells.push(cell);
    }
    squares.push({ ...square, waterDistanceM: water, obstacleCost: 0 });
  }

  const checks: [boolean, string][] = [
    [problems.water, 'Pohřebiště nesmí zasahovat do vody.'],
    [problems.forest, 'Pohřebiště jde zatím zakládat jen na louce – mýcení lesa přijde později.'],
    [problems.dwelling, 'Pohřebiště se překrývá s obydlím.'],
    [problems.field, 'Pohřebiště se překrývá s polem.'],
    [problems.cemetery, 'Pohřebiště se překrývá s jiným pohřebištěm.'],
    [
      !isConnected(landscape, shape.cells),
      'Čtverce pohřebiště musí tvořit jeden celek – sousedit stranou.',
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    squares,
    capacity: squares.length * CEMETERY.gravesPerSquare,
    foundingCost: cemeteryFoundingCost(squares),
    blockedCells,
    warningCells,
    check: failed ? fail(failed[1]) : OK,
    warning: squares.length > 0 ? cemeteryWarning(nearestDwellingM, nearestWaterM) : null,
  };
}
