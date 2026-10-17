import {
  heightAtWorld,
  obstaclesOf,
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '../landscape';
import type { PartInput } from './actions';
import { partFoundingCost } from './fields';
import {
  cellObstacles,
  dwellingObstacles,
  obstacleChangesAt,
  obstacleStatus,
  outcropUnder,
  type ObstacleChanges,
} from './obstacles';
import { polygonsOverlap, rectangleCorners, type Point } from './polygon';
import { DWELLING_FOOTPRINT_M, DWELLING_MAX_HEIGHT_DIFF_M, FIELD_LIMITS } from './rules';
import type { DwellingType, Position, TileCell, VillageState } from './types';

// Umisťování obydlí a polí (population.md – Umístění obydlí, fields.md – Založení pole).
// Čisté funkce pro server i klienta (náhled při umisťování). Obydlí stojí kdekoli (souřadnice
// světa scény v metrech), pole se skládá z celých čtverců – políček krajiny (15 × 15 m).

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
  /** Překážky, které ves už odstranila nebo pokácela (`obstacleChangesAt`); bez nich žádné. */
  readonly obstacleChanges?: ObstacleChanges;
}

/** Kontrola umístění obydlí s cenou překážek na vyklízené ploše. */
export interface DwellingPlacementCheck extends PlacementCheck {
  /** Práce navíc za překážky (člověkodny, tabulka ve fields.md). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: number[];
  /** Kolik překážek kterého druhu na místě je. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
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
  /** Z ceny založení práce navíc za překážky (kameny, stromy, keře…). */
  obstacleCost: number;
  /** Překážky na čtvercích pole podle druhu (i skalní výchozy, které pole obejde). */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Čtverce, kam pole nesmí (voda, les, obydlí, jiné pole, moc daleko) – scéna je zčervená. */
  blockedCells: TileCell[];
  check: PlacementCheck;
}

/** Nejvíc čtverců jednoho pole (≈ 34 ha) – ochrana serveru před obřím vstupem. */
export const MAX_FIELD_CELLS = 1500;
/** Krok vzorkování půdorysu obydlí (m) – výšky a povrch políček pod ním. */
const FOOTPRINT_SAMPLE_STEP_M = 0.5;
const M2_PER_HA = 10_000;

const OK: PlacementCheck = { ok: true, reason: null };
/** Skalní výchozy smí zabrat nejvýš tolik z čtverce pole – díl má vždy nějakou plochu. */
const MAX_OUTCROP_SHARE = 0.9;

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

/** Půdorys se nepřekrývá s obydlím, rozestavěným obydlím ani se čtvercem pole. */
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
  const occupied = occupiedCells(landscape, village);
  if (cellsUnderPolygon(landscape, footprint).some((i) => occupied.has(i))) {
    return fail('Překrývá se s polem.');
  }
  return OK;
}

/**
 * Smí obydlí stát na místě? Rozdíl výšek pod půdorysem nejvýš 0,5 m, všechna políčka pod ním
 * louka (ne voda, zatím ani les), žádný překryv s obydlími, rozestavěnými obydlími, poli ani
 * se skalním výchozem. Ostatní překážky na vyklízené ploše (`DWELLING_CLEARING_M`) osadníci
 * odstraní – cena po kusech podle tabulky ve fields.md. `obstacles` = vrstva překážek krajiny.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): DwellingPlacementCheck {
  const none = { obstacleCost: 0, obstacleIds: [], obstacleCounts: {} };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha obydlí.'), ...none };
  }
  const terrain = checkFootprintTerrain(landscape, footprintSamples(type, position));
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = dwellingFootprint(type, position);
  const free = checkFootprintFree(landscape, village, footprint);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  // překážky v políčkách polí odstraní založení dílu, obydlí je neplatí
  const tally = dwellingObstacles(
    obstacles,
    status,
    type,
    position,
    occupiedCells(landscape, village),
  );
  return {
    ...OK,
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    obstacleCounts: tally.counts,
  };
}

/** Ves pro kontrolu umístění na serveru – stav vsi se změnami překážek v den `day`. */
export function placementVillageOf(state: VillageState, day: number): PlacementVillage {
  return { ...state, obstacleChanges: obstacleChangesAt(state, day) };
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

/** Čtverce jako celá čísla uvnitř krajiny, bez opakování, seřazené po řádcích (y, pak x). */
function normalizeFieldCells(landscape: Landscape, cells: readonly TileCell[]): CellsShape {
  if (!cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))) {
    return { ok: false, reason: 'Neplatné čtverce pole.' };
  }
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= landscape.size || c.y >= landscape.size)) {
    return { ok: false, reason: 'Pole musí ležet uvnitř krajiny sídla.' };
  }
  const byIndex = new Map<number, TileCell>();
  for (const c of cells) byIndex.set(cellIndex(landscape, c), { x: c.x, y: c.y });
  if (byIndex.size === 0) return { ok: false, reason: 'Vyber aspoň jeden čtverec pole.' };
  if (byIndex.size > MAX_FIELD_CELLS) {
    return {
      ok: false,
      reason: `Pole může mít nejvýš ${formatInteger(MAX_FIELD_CELLS)} čtverců.`,
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

const EMPTY_PREVIEW = {
  cells: [],
  parts: [],
  areaM2: 0,
  averageFertility: 0,
  foundingCost: 0,
  obstacleCost: 0,
  obstacleCounts: {},
  blockedCells: [],
} as const;

/**
 * Pole ze čtverců – políček krajiny (15 × 15 m, díl = celé políčko). Díly jen na louce (les
 * zatím ne). Překážky na čtverci (pata v políčku, z vrstvy `obstacles` bez toho, co ves už
 * odstranila) zvednou cenu dílu podle tabulky ve fields.md a osadníci je odstraní, až díl
 * založí; skalní výchoz zůstane a plocha pod ním se do dílu nepočítá. Vzdálenost dílu = od
 * středu políčka k nejbližšímu z `dwellingPositions`. Kontrola
 * v tomto pořadí: platné čtverce v krajině, ne voda, ne les, nepřekrývá obydlí ani jiná pole,
 * žádný díl dál než 800 m, čtverce sousedí stranou v jednom celku, aspoň 0,1 ha. Náhled
 * (díly, výměra, zakázané čtverce…) se počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): FieldPreview {
  const shape = normalizeFieldCells(landscape, cells);
  if (!shape.ok) {
    return {
      ...EMPTY_PREVIEW,
      cells: [],
      parts: [],
      obstacleCounts: {},
      blockedCells: [],
      check: fail(shape.reason),
    };
  }
  const status = obstacleStatus(village?.obstacleChanges);
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};

  const occupied = occupiedCells(landscape, village);
  const underDwellings = dwellingCells(landscape, village, dwellingPositions);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const problems = { water: false, forest: false, dwelling: false, field: false, far: false };
  const parts: PartInput[] = [];
  const blockedCells: TileCell[] = [];
  for (const cell of shape.cells) {
    const index = cellIndex(landscape, cell);
    const surface = surfaceAt(landscape, cell.x, cell.y);
    const distanceM = distanceToNearest(landscape, cell, dwellingPositions);
    const cellProblems = {
      water: surface === 'water',
      forest: surface === 'forest',
      dwelling: underDwellings.has(index),
      field: occupied.has(index),
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
    const tally = cellObstacles(obstacles, status, cell);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    parts.push({
      areaM2: cellArea - Math.min(tally.outcropAreaM2, cellArea * MAX_OUTCROP_SHARE),
      distanceM,
      naturalFertility: landscape.fertility[index]!,
      surface: 'meadow',
      obstacleCost: tally.cost,
      ...(tally.ids.length > 0 ? { obstacleIds: tally.ids } : {}),
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
  const obstacleCost = parts.reduce((sum, p) => sum + p.obstacleCost, 0);
  const minCells = Math.ceil(FIELD_LIMITS.minAreaM2 / cellArea);
  const checks: [boolean, () => string][] = [
    [problems.water, () => 'Pole nesmí zasahovat do vody.'],
    [problems.forest, () => 'Pole jde zatím zakládat jen na louce – mýcení lesa přijde později.'],
    [problems.dwelling, () => 'Pole se překrývá s obydlím.'],
    [problems.field, () => 'Pole se překrývá s jiným polem.'],
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
    obstacleCost,
    obstacleCounts,
    blockedCells,
    check: failed ? fail(failed[1]()) : OK,
  };
}
