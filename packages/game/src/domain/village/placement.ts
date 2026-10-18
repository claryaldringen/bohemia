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
import type { CemeterySquareInput, OrchardSquareInput, PartInput } from './actions';
import { cemeteryFoundingCost, distanceToSquare, touchingCemeteries } from './cemetery';
import { fieldSquareSurface, partFoundingCost } from './fields';
import { orchardPlantingCost } from './orchard';
import {
  cellObstacles,
  dwellingObstacles,
  obstacleChangesAt,
  obstacleStatus,
  outcropUnder,
  tallyCost,
  type ObstacleChanges,
  type ObstacleTally,
} from './obstacles';
import { NO_CRAFTS } from './productivity';
import { polygonsOverlap, rectangleCorners, type Point } from './polygon';
import {
  CEMETERY,
  CEMETERY_DISTANCE_M,
  DWELLING_FOOTPRINT_M,
  DWELLING_MAX_HEIGHT_DIFF_M,
  FIELD_LIMITS,
  SURFACE_INCLUDED_OBSTACLES,
} from './rules';
import type { DwellingType, FieldSurface, Position, TileCell, VillageState } from './types';
import { reservedTrees } from './wood';

// Umisťování obydlí, polí, sadů a pohřebišť (population.md – Umístění obydlí, fields.md –
// Založení pole, orchard.md – Stavba, cemetery.md – Stavba). Čisté funkce pro server i klienta
// (náhled při umisťování). Obydlí stojí kdekoli (souřadnice světa scény v metrech), pole, sady
// a pohřebiště se skládají z celých čtverců – políček krajiny (15 × 15 m).

/** Výsledek kontroly umístění; důvod je česky pro hráče. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
  /**
   * Varování u prošlého umístění – stavbu neblokuje, hráč ho uvidí u kurzoru (hřbitov blízko
   * obydlí nebo vody, obydlí blízko hřbitova). Bez varování chybí.
   */
  warning?: string;
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
  /** Jabloňové sady – zabírají políčka svých čtverců (bez údaje žádné). */
  readonly orchards?: readonly { readonly squares: readonly { readonly cell: TileCell }[] }[];
  /** Překážky, které ves už odstranila nebo pokácela (`obstacleChangesAt`); bez nich žádné. */
  readonly obstacleChanges?: ObstacleChanges;
  /**
   * Stromy vyhrazené rozestavěnými stavbami (`reservedTrees`) – patří své stavbě, mýcení za ně
   * kládu nedá (forest.md). Bez údaje žádné.
   */
  readonly reservedTrees?: readonly number[];
}

/** Kontrola umístění obydlí s cenou překážek na vyklízené ploše. */
export interface DwellingPlacementCheck extends PlacementCheck {
  /** Práce navíc za překážky (člověkodny, tabulka ve fields.md). */
  obstacleCost: number;
  /** Překážky, které osadníci při zahájení stavby odstraní. */
  obstacleIds: number[];
  /** Dospělé stromy mezi nimi, které nevyhradila jiná stavba – dají klády na hromadu. */
  clearedTrees: number;
  /** Kolik překážek kterého druhu na místě je. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
}

/** Náhled pole ze čtverců – díly pro `foundField` / `foundVillage` a souhrn pro hráče. */
export interface FieldPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Díly – jeden na každý čtverec mimo vodu (louka, křoviny i les). */
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  /**
   * Z ceny založení práce navíc za překážky, které nejsou v sazbě povrchu (na louce všechny,
   * v křovinách bez keřů, v lese jen kameny a balvany).
   */
  obstacleCost: number;
  /** Překážky na čtvercích pole podle druhu (i skalní výchozy, které pole obejde). */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Díly podle povrchu – louka, křoviny, les (jen nenulové). */
  surfaceCounts: Partial<Record<FieldSurface, number>>;
  /** Dospělé stromy na dílech, které nevyhradila stavba – po založení klády na hromadu. */
  clearedTrees: number;
  /** Čtverce, kam pole nesmí (voda, obydlí, jiné pole, moc daleko) – scéna je zčervená. */
  blockedCells: TileCell[];
  check: PlacementCheck;
}

/** Náhled sadu ze čtverců – čtverce pro `foundOrchard`, výměra a cena výsadby. */
export interface OrchardPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Čtverce sadu – jeden na každý čtverec louky. */
  squares: OrchardSquareInput[];
  areaM2: number;
  /** Výsadba (80 člověkodní/ha) i s překážkami. */
  plantingCost: number;
  /** Z ceny výsadby práce navíc za překážky (kameny, stromy, keře…). */
  obstacleCost: number;
  /** Překážky na čtvercích sadu podle druhu (i skalní výchozy, které sad obejde). */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Čtverce, kam sad nesmí (voda, les, obydlí, pole, hřbitov, jiný sad, moc daleko). */
  blockedCells: TileCell[];
  check: PlacementCheck;
}

/**
 * Náhled hřbitova ze čtverců – čtverce pro `foundCemetery`, cena, místo a varování
 * (`check.warning`), když je moc blízko obydlí nebo vody (hygienu samotnou hráč nevidí).
 */
export interface CemeteryPreview {
  /** Vybrané čtverce bez opakování, po řádcích (y, pak x). */
  cells: TileCell[];
  /** Čtverce hřbitova – jeden na každý čtverec louky. */
  squares: CemeterySquareInput[];
  /** Kolik hrobů se do nových čtverců vejde. */
  capacity: number;
  foundingCost: number;
  /** Z ceny založení práce navíc za překážky (kameny, stromy, keře…). */
  obstacleCost: number;
  /** Překážky na čtvercích hřbitova podle druhu. */
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Čtverce navazují na hřbitov a rozšíří ho (jinak vznikne nový). */
  extendsCemetery: boolean;
  /**
   * Čtverce, kam hřbitov nesmí (voda, les, obydlí, pole, jiný hřbitov, skalní výchoz) – scéna
   * je zčervená.
   */
  blockedCells: TileCell[];
  /** Čtverce blíž obydlí než 150 m nebo vodě než 100 m – scéna je zbarví oranžově. */
  warningCells: TileCell[];
  check: PlacementCheck;
}

/** Nejvíc čtverců jednoho pole (≈ 34 ha) – ochrana serveru před obřím vstupem. */
export const MAX_FIELD_CELLS = 1500;
/** Nejvíc čtverců jednoho sadu (≈ 34 ha jako pole) – ochrana serveru před obřím vstupem. */
export const MAX_ORCHARD_CELLS = MAX_FIELD_CELLS;
/** Nejvíc čtverců jednoho hřbitova (5 600 hrobů) – ochrana serveru před obřím vstupem. */
export const MAX_CEMETERY_CELLS = 100;
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

/** Celé metry dolů – „149 m“ je opravdu méně než 150 m. */
function wholeMeters(value: number): string {
  return `${formatInteger(Math.floor(value))} m`;
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

/** Políčka, která už zabírají sady vsi. */
function orchardCells(landscape: Landscape, village: PlacementVillage | null): Set<number> {
  const occupied = new Set<number>();
  for (const orchard of village?.orchards ?? []) {
    for (const square of orchard.squares) occupied.add(cellIndex(landscape, square.cell));
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

/**
 * Půdorys se nepřekrývá s obydlím, rozestavěným obydlím ani se čtvercem pole, pohřebiště či
 * sadu.
 */
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
  if (under.some((i) => cemeteries.has(i))) return fail('Překrývá se s hřbitovem.');
  const orchards = orchardCells(landscape, village);
  if (under.some((i) => orchards.has(i))) return fail('Překrývá se se sadem.');
  return OK;
}

/** Varování, když obydlí stojí blíž hřbitovu, než je pro hygienu v pořádku (neblokuje). */
function nearCemeteryWarning(
  landscape: Landscape,
  village: PlacementVillage | null,
  position: Position,
): PlacementCheck {
  let nearest = Infinity;
  for (const cemetery of village?.cemeteries ?? []) {
    for (const { cell } of cemetery.squares) {
      const center = tileCenterWorld(landscape, cell.x, cell.y);
      nearest = Math.min(
        nearest,
        distanceToSquare(position.x, position.z, center, landscape.cellSizeM),
      );
    }
  }
  if (nearest >= CEMETERY_DISTANCE_M.dwelling.ok) return OK;
  return { ok: true, reason: null, warning: `Blízko hřbitova (${wholeMeters(nearest)})` };
}

/**
 * Smí obydlí stát na místě? Rozdíl výšek pod půdorysem nejvýš 0,5 m, všechna políčka pod ním
 * louka (ne voda, zatím ani les), žádný překryv s obydlími, rozestavěnými obydlími, poli,
 * hřbitovy ani se skalním výchozem. Ostatní překážky na vyklízené ploše (`DWELLING_CLEARING_M`)
 * osadníci odstraní – cena po kusech podle tabulky ve fields.md. Blíž hřbitovu než 150 m jen
 * varuje (`warning`). `obstacles` = vrstva překážek krajiny.
 */
export function checkDwellingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: DwellingType,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): DwellingPlacementCheck {
  const none = { obstacleCost: 0, obstacleIds: [], clearedTrees: 0, obstacleCounts: {} };
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
  // překážky v políčkách polí, hřbitovů a sadů odstraní jejich stavba, obydlí je neplatí
  const tally = dwellingObstacles(
    obstacles,
    status,
    type,
    position,
    new Set([
      ...occupiedCells(landscape, village),
      ...cemeteryCells(landscape, village),
      ...orchardCells(landscape, village),
    ]),
  );
  return {
    ...nearCemeteryWarning(landscape, village, position),
    obstacleCost: tally.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
  };
}

/** Kolik z dospělých stromů `treeIds` nevyhradila žádná stavba (ty dají klády z mýcení). */
function unreservedTrees(village: PlacementVillage | null, treeIds: readonly number[]): number {
  const reserved = new Set(village?.reservedTrees ?? []);
  return treeIds.filter((id) => !reserved.has(id)).length;
}

/**
 * Ves pro kontrolu umístění na serveru – stav vsi se změnami překážek v den `day` a stromy
 * vyhrazenými stavbami.
 */
export function placementVillageOf(state: VillageState, day: number): PlacementVillage {
  return {
    ...state,
    obstacleChanges: obstacleChangesAt(state, day),
    reservedTrees: [...reservedTrees(state)],
  };
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

/** Co se staví po čtvercích – název v 1. a 2. pádě a nejvíc čtverců. */
interface SquaresKind {
  nominative: string;
  genitive: string;
  maxCells: number;
}
const FIELD_KIND: SquaresKind = { nominative: 'Pole', genitive: 'pole', maxCells: MAX_FIELD_CELLS };
const ORCHARD_KIND: SquaresKind = {
  nominative: 'Sad',
  genitive: 'sadu',
  maxCells: MAX_ORCHARD_CELLS,
};
const CEMETERY_KIND: SquaresKind = {
  nominative: 'Hřbitov',
  genitive: 'hřbitova',
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

/** Co brání čtverci stavby: voda, les, obydlí, pole, pohřebiště, sad. */
interface SquareFlags {
  water: boolean;
  forest: boolean;
  dwelling: boolean;
  field: boolean;
  cemetery: boolean;
  orchard: boolean;
}

/** Kontrola jednotlivých čtverců proti krajině a vsi (zabraná políčka se spočítají jednou). */
function squareFlags(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): (cell: TileCell) => SquareFlags {
  const fields = occupiedCells(landscape, village);
  const cemeteries = cemeteryCells(landscape, village);
  const orchards = orchardCells(landscape, village);
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
      orchard: orchards.has(index),
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

/** Čtverec stavby po čtvercích (pole, sad) – povrch, plocha bez skalních výchozů a překážky. */
interface BuildSquare {
  cell: TileCell;
  /** Index políčka v krajině (y × size + x). */
  index: number;
  /** Povrch při založení – sad jen louka, pole i křoviny a les (`fieldSquareSurface`). */
  surface: FieldSurface;
  areaM2: number;
  /** Od středu políčka k nejbližšímu obydlí. */
  distanceM: number;
  tally: ObstacleTally;
  /** Práce navíc za překážky, které nejsou v sazbě povrchu (`tallyCost`). */
  obstacleCost: number;
}

/**
 * Společná kontrola čtverců pole a sadu (staví se stejně – orchard.md): u každého čtverce, co mu
 * brání (voda, obydlí, pole, hřbitov, sad, dál než 800 m; sadu i les – zakázané čtverce do
 * náhledu), a čtverce, kde stavba smí stát – sad jen louka, pole i křoviny a les
 * (`fieldSurfaces`) – s povrchem, plochou bez skalních výchozů (nejvýš MAX_OUTCROP_SHARE
 * čtverce), vzdáleností k nejbližšímu z `dwellingPositions` a překážkami z vrstvy bez toho, co
 * ves už odstranila.
 */
function buildSquares(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer,
  fieldSurfaces: boolean,
): {
  squares: BuildSquare[];
  problems: SquareFlags & { far: boolean };
  blockedCells: TileCell[];
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
} {
  const status = obstacleStatus(village?.obstacleChanges);
  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const problems: SquareFlags & { far: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    far: false,
  };
  const squares: BuildSquare[] = [];
  const blockedCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  for (const cell of cells) {
    const distanceM = distanceToNearest(landscape, cell, dwellingPositions);
    const flags = { ...flagsOf(cell), far: distanceM > FIELD_LIMITS.maxDistanceM };
    // pole smí i do lesa (fields.md – Založení pole), sad jen na louku
    if (fieldSurfaces) flags.forest = false;
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    const land = surfaceAt(landscape, cell.x, cell.y);
    if (land === 'water' || (!fieldSurfaces && land !== 'meadow')) continue;
    const tally = cellObstacles(obstacles, status, cell);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    const surface: FieldSurface = fieldSurfaces
      ? (fieldSquareSurface(land, tally.counts.shrub ?? 0, cellArea, NO_CRAFTS.tools) ?? 'meadow')
      : 'meadow';
    squares.push({
      cell,
      index: cellIndex(landscape, cell),
      surface,
      areaM2: cellArea - Math.min(tally.outcropAreaM2, cellArea * MAX_OUTCROP_SHARE),
      distanceM,
      tally,
      obstacleCost: tallyCost(tally, SURFACE_INCLUDED_OBSTACLES[surface]),
    });
  }
  return { squares, problems, blockedCells, obstacleCounts };
}

/** Políčka lesa krajiny (indexy) – spočítají se jednou pro každou krajinu. */
const forestTilesCache = new WeakMap<Landscape, Int32Array>();

function forestTiles(landscape: Landscape): Int32Array {
  let tiles = forestTilesCache.get(landscape);
  if (!tiles) {
    const list: number[] = [];
    for (let y = 0; y < landscape.size; y++) {
      for (let x = 0; x < landscape.size; x++) {
        if (surfaceAt(landscape, x, y) === 'forest') list.push(y * landscape.size + x);
      }
    }
    tiles = Int32Array.from(list);
    forestTilesCache.set(landscape, tiles);
  }
  return tiles;
}

/**
 * Vzdálenost bodu světa k nejbližšímu okraji lesa v m – k nejbližšímu políčku lesa, v lese 0
 * (forest.md – Palivo). Krajina bez lesa: dvojnásobek strany krajiny (konečné číslo – ukládá se
 * do JSON).
 */
export function forestEdgeDistanceM(landscape: Landscape, x: number, z: number): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const size = landscape.cellSizeM;
  let best = Infinity;
  for (const index of forestTiles(landscape)) {
    const minX = (index % landscape.size) * size - half;
    const minZ = Math.floor(index / landscape.size) * size - half;
    const dx = Math.max(0, minX - x, x - (minX + size));
    const dz = Math.max(0, minZ - z, z - (minZ + size));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return Number.isFinite(best) ? best : 2 * landscape.size * landscape.cellSizeM;
}

/**
 * Ves z doby před palivem (obydlí a stavby obydlí bez `forestDistanceM`): doplní vzdálenost
 * k okraji lesa z krajiny. Ves, které nic nechybí, vrací beze změny.
 */
export function withForestDistances(state: VillageState, landscape: Landscape): VillageState {
  const missing =
    state.dwellings.some((d) => d.forestDistanceM === undefined) ||
    state.constructions.some(
      (c) => c.kind === 'dwelling' && c.position !== null && c.forestDistanceM === undefined,
    );
  if (!missing) return state;
  const next = structuredClone(state);
  for (const d of next.dwellings) {
    d.forestDistanceM ??= forestEdgeDistanceM(landscape, d.position.x, d.position.z);
  }
  for (const c of next.constructions) {
    if (c.kind !== 'dwelling' || c.position === null) continue;
    c.forestDistanceM ??= forestEdgeDistanceM(landscape, c.position.x, c.position.z);
  }
  return next;
}

/** Stromy dílu nebo čtverce pro klády z mýcení – bez stromů se údaj vynechá. */
function withTrees(trees: number): { trees?: number } {
  return trees > 0 ? { trees } : {};
}

/**
 * Pole ze čtverců – políček krajiny (15 × 15 m, díl = celé políčko). Díly na louce, v křovinách
 * i v lese (fields.md – Založení pole, Martin); povrch dílu určí `fieldSquareSurface` a cenu
 * založení sazba povrchu za hektar. Překážky na čtverci (pata v políčku, z vrstvy `obstacles`
 * bez toho, co ves už odstranila) osadníci odstraní, až díl založí; po kusech zvednou cenu jen
 * ty, které nejsou v sazbě povrchu (v lese jsou stromy a podrost v ceně, v křovinách keře).
 * Dospělé stromy, které nevyhradila stavba, dají po založení klády (forest.md). Skalní výchoz
 * zůstane a plocha pod ním se do dílu nepočítá. Vzdálenost dílu = od středu políčka
 * k nejbližšímu z `dwellingPositions`. Kontrola v tomto pořadí: platné čtverce v krajině, ne
 * voda, nepřekrývá obydlí, jiná pole, pohřebiště ani sady, žádný díl dál než 800 m, čtverce
 * sousedí stranou v jednom celku, aspoň 0,1 ha. Náhled (díly, výměra, zakázané čtverce…) se
 * počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): FieldPreview {
  const shape = normalizeCells(landscape, cells, FIELD_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      parts: [],
      areaM2: 0,
      averageFertility: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      surfaceCounts: {},
      clearedTrees: 0,
      blockedCells: [],
      check: fail(shape.reason),
    };
  }
  const { squares, problems, blockedCells, obstacleCounts } = buildSquares(
    landscape,
    village,
    shape.cells,
    dwellingPositions,
    obstacles,
    true,
  );
  const surfaceCounts: Partial<Record<FieldSurface, number>> = {};
  const parts: PartInput[] = squares.map((square) => {
    surfaceCounts[square.surface] = (surfaceCounts[square.surface] ?? 0) + 1;
    return {
      areaM2: square.areaM2,
      distanceM: square.distanceM,
      naturalFertility: landscape.fertility[square.index]!,
      surface: square.surface,
      obstacleCost: square.obstacleCost,
      ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
      ...withTrees(unreservedTrees(village, square.tally.treeIds)),
      cell: square.cell,
    };
  });

  const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const averageFertility =
    areaM2 > 0 ? parts.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2 : 0;
  const foundingCost = parts.reduce(
    (sum, p) => sum + partFoundingCost(p.surface, p.areaM2, p.obstacleCost, NO_CRAFTS.tools),
    0,
  );
  const obstacleCost = parts.reduce((sum, p) => sum + p.obstacleCost, 0);
  const minCells = Math.ceil(FIELD_LIMITS.minAreaM2 / (landscape.cellSizeM * landscape.cellSizeM));
  const checks: [boolean, () => string][] = [
    [problems.water, () => 'Pole nesmí zasahovat do vody.'],
    [problems.dwelling, () => 'Pole se překrývá s obydlím.'],
    [problems.field, () => 'Pole se překrývá s jiným polem.'],
    [problems.cemetery, () => 'Pole se překrývá s hřbitovem.'],
    [problems.orchard, () => 'Pole se překrývá se sadem.'],
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
    surfaceCounts,
    clearedTrees: parts.reduce((sum, p) => sum + (p.trees ?? 0), 0),
    blockedCells,
    check: failed ? fail(failed[1]()) : OK,
  };
}

/**
 * Sad ze čtverců – políček krajiny (orchard.md – Stavba): staví se stejně jako pole (Martin) –
 * čtverce jen na louce, do 800 m od nejbližšího obydlí, souvislé, ne na obydlí, poli, hřbitově
 * ani jiném sadu. Překážky na čtverci zvednou cenu výsadby podle tabulky ve fields.md
 * a osadníci je odstraní, až čtverec vysadí; skalní výchoz zůstane a stromy ho obejdou (plocha
 * pod ním se nepočítá). Na rozdíl od pole nemá nejmenší výměru – sadem může být i jeden čtverec.
 * Náhled se počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function orchardPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): OrchardPreview {
  const shape = normalizeCells(landscape, cells, ORCHARD_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      areaM2: 0,
      plantingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      blockedCells: [],
      check: fail(shape.reason),
    };
  }
  const meadow = buildSquares(landscape, village, shape.cells, dwellingPositions, obstacles, false);
  const { problems, blockedCells, obstacleCounts } = meadow;
  const squares: OrchardSquareInput[] = meadow.squares.map((square) => ({
    cell: square.cell,
    areaM2: square.areaM2,
    distanceM: square.distanceM,
    obstacleCost: square.obstacleCost,
    ...(square.tally.ids.length > 0 ? { obstacleIds: square.tally.ids } : {}),
    ...withTrees(unreservedTrees(village, square.tally.treeIds)),
  }));
  const checks: [boolean, string][] = [
    [problems.water, 'Sad nesmí zasahovat do vody.'],
    [problems.forest, 'Sad jde zakládat jen na louce.'],
    [problems.dwelling, 'Sad se překrývá s obydlím.'],
    [problems.field, 'Sad se překrývá s polem.'],
    [problems.cemetery, 'Sad se překrývá s hřbitovem.'],
    [problems.orchard, 'Sad se překrývá s jiným sadem.'],
    [problems.far, `Sad je dál než ${FIELD_LIMITS.maxDistanceM} m od nejbližšího obydlí.`],
    [
      !isConnected(landscape, shape.cells),
      'Čtverce sadu musí tvořit jeden celek – sousedit stranou.',
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  return {
    cells: shape.cells,
    squares,
    areaM2: squares.reduce((sum, s) => sum + s.areaM2, 0),
    plantingCost: squares.reduce(
      (sum, s) => sum + orchardPlantingCost(s.areaM2, s.obstacleCost),
      0,
    ),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    blockedCells,
    check: failed ? fail(failed[1]) : OK,
  };
}

/** Varování u kurzoru, když je hřbitov blíž obydlí nebo vodě, než je v pořádku (řádek na každé). */
function cemeteryWarning(dwellingM: number, waterM: number): string | undefined {
  const lines = [
    dwellingM < CEMETERY_DISTANCE_M.dwelling.ok
      ? `Blízko obydlí (${wholeMeters(dwellingM)})`
      : null,
    waterM < CEMETERY_DISTANCE_M.water.ok ? `Blízko vody (${wholeMeters(waterM)})` : null,
  ].filter((line) => line !== null);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Hřbitov ze čtverců – políček krajiny (cemetery.md – Stavba). Čtverce jen na louce (les
 * zatím ne – pole už ano). Čtverce, které stranou navazují na hřbitov, ho rozšíří
 * (`extendsCemetery`). Překážky na čtverci (pata v políčku, z vrstvy `obstacles` bez toho, co
 * ves už odstranila) zvednou cenu čtverce podle tabulky ve fields.md a osadníci je odstraní, až
 * hřbitov (rozšíření) dostaví – jako u dílu pole. Skalní výchoz se neodstraní a hroby jdou na
 * čtverec v pevné mřížce (`CEMETERY.gravesPerSquare`), proto čtverec, do kterého výchoz
 * zasahuje, hřbitov mít nesmí. Kontrola v tomto pořadí: platné čtverce v krajině, ne voda, ne
 * les, nepřekrývá obydlí (i plánovaná z `dwellingPositions`), pole, hřbitov ani sad, žádný skalní
 * výchoz, navazuje nejvýš na jeden hřbitov, čtverce (i s rozšiřovaným hřbitovem) sousedí
 * stranou v jednom celku, celý hřbitov nejvýš MAX_CEMETERY_CELLS čtverců. Blízkost obydlí (pod
 * 150 m) a vody (pod 100 m) stavbu neblokuje – jen `check.warning` a `warningCells`. Náhled se
 * počítá i při neúspěchu – kromě neplatných čtverců.
 */
export function cemeteryPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): CemeteryPreview {
  const shape = normalizeCells(landscape, cells, CEMETERY_KIND);
  if (!shape.ok) {
    return {
      cells: [],
      squares: [],
      capacity: 0,
      foundingCost: 0,
      obstacleCost: 0,
      obstacleCounts: {},
      extendsCemetery: false,
      blockedCells: [],
      warningCells: [],
      check: fail(shape.reason),
    };
  }

  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const status = obstacleStatus(village?.obstacleChanges);
  const size = landscape.cellSizeM;
  const problems: SquareFlags & { outcrop: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    outcrop: false,
  };
  const squares: CemeterySquareInput[] = [];
  const blockedCells: TileCell[] = [];
  const warningCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  let nearestDwellingM = Infinity;
  let nearestWaterM = Infinity;
  for (const cell of shape.cells) {
    const flags = {
      ...flagsOf(cell),
      outcrop: outcropUnder(obstacles, status, cellCorners(landscape, cell)),
    };
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(cell);
    if (flags.water || flags.forest) continue;
    const tally = cellObstacles(obstacles, status, cell);
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
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
    squares.push({
      ...square,
      waterDistanceM: water,
      obstacleCost: tally.cost,
      ...(tally.ids.length > 0 ? { obstacleIds: tally.ids } : {}),
      ...withTrees(unreservedTrees(village, tally.treeIds)),
    });
  }

  const touching = touchingCemeteries(village?.cemeteries ?? [], shape.cells);
  const extended = touching.length === 1 ? touching[0]!.squares.map((s) => s.cell) : [];
  const checks: [boolean, string][] = [
    [problems.water, 'Hřbitov nesmí zasahovat do vody.'],
    [problems.forest, 'Hřbitov jde zatím zakládat jen na louce – mýcení lesa přijde později.'],
    [problems.dwelling, 'Hřbitov se překrývá s obydlím.'],
    [problems.field, 'Hřbitov se překrývá s polem.'],
    [problems.cemetery, 'Hřbitov se překrývá s jiným hřbitovem.'],
    [problems.orchard, 'Hřbitov se překrývá se sadem.'],
    [problems.outcrop, 'Stojí tu skalní výchoz – ten osadníci neodstraní.'],
    [touching.length > 1, 'Hřbitov smí navazovat jen na jeden hřbitov.'],
    [
      !isConnected(landscape, [...shape.cells, ...extended]),
      'Čtverce hřbitova musí tvořit jeden celek – sousedit stranou.',
    ],
    [
      shape.cells.length + extended.length > MAX_CEMETERY_CELLS,
      `Hřbitov může mít nejvýš ${formatInteger(MAX_CEMETERY_CELLS)} čtverců.`,
    ],
  ];
  const failed = checks.find(([broken]) => broken);
  const warning = squares.length > 0 ? cemeteryWarning(nearestDwellingM, nearestWaterM) : undefined;
  return {
    cells: shape.cells,
    squares,
    capacity: squares.length * CEMETERY.gravesPerSquare,
    foundingCost: cemeteryFoundingCost(squares),
    obstacleCost: squares.reduce((sum, s) => sum + s.obstacleCost, 0),
    obstacleCounts,
    extendsCemetery: touching.length === 1,
    blockedCells,
    warningCells,
    check: failed ? fail(failed[1]) : warning ? { ok: true, reason: null, warning } : OK,
  };
}
