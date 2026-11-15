// Společné kontroly staveb po čtvercích (pole, sad, hřbitov): čtverce, voda, les, hospodářství.

import { FIELD_LIMITS, SACRED_OAK, SURFACE_INCLUDED_OBSTACLES } from '../rules';
import {
  type FieldSurface,
  type Position,
  type SquareGrid,
  type TileCell,
  type VillageState,
} from '../types';
import { LIVESTOCK, withLivestock } from '../livestock/livestock';
import { type LandSquare, PolygonIndex } from './squares';
import {
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
  surfaceAt,
  tileCenterWorld,
} from '../../landscape';
import {
  type ObstacleTally,
  cellObstacles,
  obstacleStatus,
  squareObstacles,
  tallyCost,
} from '../core/obstacles';
import { type Point, convexDistance, rectangleCorners } from './polygon';
import {
  type SacredOakSite,
  type SacredSites,
  type SparedSacred,
  grovesOfTiles,
  sacredFootprint,
  sparedSacred,
} from '../people/sacred';
import { sacredSitesFor } from '../people/desecration';
import { type Shape, plotShapes } from './plot-cells';
import { TAKEN_LAND_EPSILON_M2 } from '../buildings/land-taken';
import { dwellingShape } from '../buildings/dwelling-shape';
import { fieldSquareSurface } from '../fields/fields';
import {
  pointsBounds,
  squareCenter,
  squareCorners,
  squareKey,
  squareSamples,
  squareTile,
} from './square-grid';
import { threshingFloorFootprint } from '../fields/threshing-floors';
import { churchyardWorld } from './church-plot';
import { workshopFootprints } from '../crafts/crafts';
import {
  M2_PER_HA,
  MAX_CEMETERY_CELLS,
  MAX_FIELD_CELLS,
  MAX_ORCHARD_CELLS,
  MAX_OUTCROP_SHARE,
  type PlacementVillage,
  formatInteger,
} from './placement-types';
import {
  type PlacedDwelling,
  type SampledGround,
  dwellingFootprint,
  freeShape,
  landIndex,
  ownedAt,
  placedDwelling,
} from './placement-geometry';
import { SQUARE_SAMPLES, sacredInShape, sampledGround } from './placement-dwellings';
import { squareObstacleCost, takenSquareLand } from './placement-land';
import { premiumSpringShapes } from '../core/premium-effects';

type CellsShape = { ok: true; cells: TileCell[] } | { ok: false; reason: string };

/** Co se staví po čtvercích – název v 1. a 2. pádě a nejvíc čtverců. */
interface SquaresKind {
  nominative: string;
  genitive: string;
  maxCells: number;
}
export const FIELD_KIND: SquaresKind = {
  nominative: 'Pole',
  genitive: 'pole',
  maxCells: MAX_FIELD_CELLS,
};
export const ORCHARD_KIND: SquaresKind = {
  nominative: 'Sad',
  genitive: 'sadu',
  maxCells: MAX_ORCHARD_CELLS,
};
export const CEMETERY_KIND: SquaresKind = {
  nominative: 'Hřbitov',
  genitive: 'hřbitova',
  maxCells: MAX_CEMETERY_CELLS,
};

/**
 * Čtverce jako celá čísla uvnitř krajiny, bez opakování, seřazené po řádcích (y, pak x). Čtverec
 * natočené mřížky (`grid` – fields.md, Natočené stavby) musí v krajině ležet celý (všemi rohy).
 */
export function normalizeCells(
  landscape: Landscape,
  cells: readonly TileCell[],
  kind: SquaresKind,
  grid?: SquareGrid,
): CellsShape {
  if (!cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))) {
    return { ok: false, reason: `Neplatné čtverce ${kind.genitive}.` };
  }
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const outside = grid
    ? (c: TileCell): boolean =>
        squareCorners(landscape, grid, c).some(
          ([x, z]) => x < -half || x > half || z < -half || z > half,
        )
    : (c: TileCell): boolean =>
        c.x < 0 || c.y < 0 || c.x >= landscape.size || c.y >= landscape.size;
  if (cells.some(outside)) {
    return { ok: false, reason: `${kind.nominative} musí ležet uvnitř krajiny sídla.` };
  }
  const byKey = new Map<string, TileCell>();
  for (const c of cells) byKey.set(`${c.x},${c.y}`, { x: c.x, y: c.y });
  if (byKey.size === 0) {
    return { ok: false, reason: `Vyber aspoň jeden čtverec ${kind.genitive}.` };
  }
  if (byKey.size > kind.maxCells) {
    return {
      ok: false,
      reason: `${kind.nominative} může mít nejvýš ${formatInteger(kind.maxCells)} čtverců.`,
    };
  }
  return { ok: true, cells: [...byKey.values()].sort((a, b) => a.y - b.y || a.x - b.x) };
}

/** Čtverce tvoří jednu skupinu, ve které sousedí stranou (4-souvislost) – v jejich mřížce. */
export function isConnected(cells: readonly TileCell[]): boolean {
  const first = cells[0];
  if (!first) return true;
  const key = (x: number, y: number): string => `${x},${y}`;
  const remaining = new Set(cells.map((c) => key(c.x, c.y)));
  const stack = [first];
  remaining.delete(key(first.x, first.y));
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = key(x + dx, y + dy);
      if (!remaining.has(next)) continue;
      remaining.delete(next);
      stack.push({ x: x + dx, y: y + dy });
    }
  }
  return remaining.size === 0;
}

/** Vzdálenost středu čtverce k nejbližšímu obydlí (bez obydlí nekonečno). */
function distanceToNearest(center: { x: number; z: number }, positions: Position[]): number {
  return positions.reduce(
    (best, p) => Math.min(best, Math.hypot(p.x - center.x, p.z - center.z)),
    Infinity,
  );
}

/** Čtverec stavby po čtvercích v její mřížce – rohy, střed a políčko, které přesně zabírá. */
interface GridSquare extends Shape {
  readonly cell: TileCell;
  readonly center: { x: number; z: number };
  readonly grid?: SquareGrid;
  readonly corners: Point[];
}

/** Čtverec `cell` mřížky `grid` (bez ní políčko krajiny) ve světě. */
export function gridSquare(
  landscape: Landscape,
  grid: SquareGrid | undefined,
  cell: TileCell,
): GridSquare {
  return {
    cell,
    ...(grid ? { grid } : {}),
    corners: squareCorners(landscape, grid, cell),
    center: squareCenter(landscape, grid, cell),
    tile: squareTile(landscape, grid, cell),
  };
}

/** Krajina pod čtvercem: políčko podle políčka, natočený čtverec vzorkováním (`sampledGround`). */
export function squareGround(landscape: Landscape, square: GridSquare): SampledGround {
  if (square.tile !== null) {
    const x = square.tile % landscape.size;
    const y = Math.floor(square.tile / landscape.size);
    const surface = surfaceAt(landscape, x, y);
    return {
      outside: false,
      water: surface === 'water',
      forest: surface === 'forest',
      fertility: landscape.fertility[square.tile]!,
    };
  }
  return sampledGround(
    landscape,
    squareSamples(landscape, square.grid, square.cell, SQUARE_SAMPLES),
    square.corners,
  );
}

/**
 * Obydlí vsi i plánovaná (plánované obydlí bez typu – první – je zemnice) jako tvary: pozemky
 * (políčko přesně, natočený čtverec), půdorysy domů, dílny s přístřeškem a milířem.
 */
function dwellingShapes(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): Shape[] {
  const shapesOf = (d: PlacedDwelling): Shape[] => {
    const shape = dwellingShape(d);
    if (d.craft) return workshopFootprints(d.craft, d.position, shape, d.type).map(freeShape);
    const footprint = freeShape(dwellingFootprint(d.type, d.position, shape));
    return d.plot ? [...plotShapes(landscape, d.plot), footprint] : [footprint];
  };
  return [
    ...(village?.dwellings.flatMap((d) => shapesOf(placedDwelling(d))) ?? []),
    ...(village?.constructions.flatMap((c) =>
      c.dwellingType !== null && c.position !== null
        ? shapesOf({
            type: c.dwellingType,
            position: c.position,
            ...(c.plot ? { plot: c.plot } : {}),
            ...(c.craft ? { craft: c.craft } : {}),
            ...(c.plainShape ? { plainShape: true } : {}),
          })
        : [],
    ) ?? []),
    ...dwellingPositions.map((p) =>
      freeShape(dwellingFootprint('zemnice', p, dwellingShape({ type: 'zemnice', position: p }))),
    ),
  ];
}

/**
 * Co je pod čtvercem stavby: voda, les (krajiny i les vsi – nebrání, osadníci ho vyklučí –
 * `ForestUse`), obydlí, pole, pohřebiště, sad, ohrada, modla, svatyně, humno; `woodEdge` –
 * čtverec zasahuje do lesa vsi jinak než přesně jeho čtvercem (natočené stavby – pole les vsi
 * vymýtí jen po jeho čtvercích, ostatním stavbám to nevadí).
 */
export interface SquareFlags {
  water: boolean;
  forest: boolean;
  dwelling: boolean;
  field: boolean;
  cemetery: boolean;
  orchard: boolean;
  pen: boolean;
  sacred: boolean;
  /** Humno i rozestavěné (production-chains.md – Humno). */
  threshing: boolean;
  /** Kostel s hřbitůvkem i rozestavěný (churches.md – Stavba). */
  church: boolean;
  woodEdge: boolean;
}

/** Shoduje se čtverec stavby vsi přesně se čtvercem (tatáž mřížka a souřadnice)? */
function sameSquare(a: LandSquare, b: GridSquare): boolean {
  if (a.tile !== null || b.tile !== null) return a.tile === b.tile;
  return squareKey(a.grid, a.cell) === squareKey(b.grid, b.cell);
}

/**
 * Kontrola jednotlivých čtverců proti krajině a vsi (rejstříky staveb se postaví jednou). Vrací
 * i krajinu pod čtvercem a čtverce staveb pod ním.
 */
export function squareFlags(
  landscape: Landscape,
  village: PlacementVillage | null,
  dwellingPositions: Position[],
): (square: GridSquare) => SquareFlags & { ground: SampledGround; woodExact: boolean } {
  const index = landIndex(landscape, village);
  const dwellings = new PolygonIndex(
    landscape,
    dwellingShapes(landscape, village, dwellingPositions),
  );
  const sacred = new PolygonIndex(
    landscape,
    (village?.sacredBuildings ?? []).map((b) => freeShape(sacredFootprint(b.kind, b.position))),
  );
  const floors = new PolygonIndex(
    landscape,
    (village?.threshingFloors ?? []).map((f) => freeShape(threshingFloorFootprint(f.position))),
  );
  const churches = new PolygonIndex(
    landscape,
    (village?.churches ?? []).map((c) => freeShape(churchyardWorld(c.type, c.dims, c.position))),
  );
  // pramen a slanisko prémiové krajiny jsou voda – pole, sad ani hřbitov na ně nesmí
  const springShapes = premiumSpringShapes(landscape);
  const springs =
    springShapes.length > 0 ? new PolygonIndex(landscape, springShapes.map(freeShape)) : null;
  return (square) => {
    const ground = squareGround(landscape, square);
    const under = index.overlapping(square.corners, square.tile);
    const kinds = new Set(under.map((u) => u.kind));
    const woods = under.filter((u) => u.kind === 'wood');
    const woodExact = woods.some((w) => sameSquare(w, square));
    return {
      water:
        ground.water ||
        (springs !== null && springs.overlapping(square.corners, square.tile).length > 0),
      // les krajiny i les vsi (fields.md – Les vsi)
      forest: ground.forest || woods.length > 0,
      dwelling: dwellings.overlapping(square.corners, square.tile).length > 0,
      field: kinds.has('field'),
      cemetery: kinds.has('cemetery'),
      orchard: kinds.has('orchard'),
      pen: kinds.has('pen'),
      sacred: sacred.overlapping(square.corners, square.tile).length > 0,
      threshing: floors.overlapping(square.corners, square.tile).length > 0,
      church: churches.overlapping(square.corners, square.tile).length > 0,
      woodEdge: woods.some((w) => !sameSquare(w, square)),
      ground,
      woodExact,
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

/**
 * Vzdálenost natočeného čtverce (rohy `corners` – fields.md, Natočené stavby) od nejbližší vody
 * (m): nejkratší vzdálenost čtverce od políčka vody (u políčka krajiny `waterDistanceM`). Bez
 * vody jako `waterDistanceM`.
 */
export function squareWaterDistanceM(landscape: Landscape, corners: readonly Point[]): number {
  const [minX, minZ, maxX, maxZ] = pointsBounds(corners);
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const side = landscape.cellSizeM;
  let best = Infinity;
  for (const index of waterTiles(landscape)) {
    const x0 = -half + (index % landscape.size) * side;
    const z0 = -half + Math.floor(index / landscape.size) * side;
    // obdélníky čtverce a políčka od sebe – dolní mez, dál se nepočítá
    const gx = Math.max(0, x0 - maxX, minX - (x0 + side));
    const gz = Math.max(0, z0 - maxZ, minZ - (z0 + side));
    if (gx * gx + gz * gz >= best * best) continue;
    const tile = rectangleCorners(x0 + side / 2, z0 + side / 2, side, side, 0);
    best = Math.min(best, convexDistance(corners, tile));
  }
  return Number.isFinite(best) ? best : 2 * landscape.size * landscape.cellSizeM;
}

/** Čtverec stavby po čtvercích (pole, sad) – povrch, plocha bez skalních výchozů a překážky. */
interface BuildSquare {
  square: GridSquare;
  /**
   * Čtverec leží (aspoň zčásti) na dílu pole – pole mu ten kus odevzdá (fields.md – Pole jako
   * krajina).
   */
  onField: boolean;
  /**
   * Povrch při založení – pole louka, křoviny a les (`fieldSquareSurface`), sad vždy louka (les
   * pod sadem je v `obstacleCost`).
   */
  surface: FieldSurface;
  /** Úrodnost krajiny pod čtvercem (políčko, natočený čtverec průměr vzorků). */
  fertility: number;
  areaM2: number;
  /** Od středu čtverce k nejbližšímu obydlí. */
  distanceM: number;
  tally: ObstacleTally;
  /**
   * Práce navíc za překážky, které nejsou v sazbě povrchu (`tallyCost`); u sadu v lese i sazba
   * lesa za plochu mimo pole (`ForestUse`).
   */
  obstacleCost: number;
}

/** Posvátná místa ve výběru čtverců: čtverce hájů se vyjmou, posvátné duby zůstanou stát. */
interface SacredSelection {
  /** Výběr bez čtverců hájů. */
  squares: GridSquare[];
  /** Čtverce hájů a čtverce s posvátným dubem (oranžově v náhledu). */
  sacredCells: TileCell[];
  /** Háje, kterých se výběr dotkl, a posvátné duby na zbylých čtvercích. */
  spared: SparedSacred;
}

/**
 * Rozdělí výběr čtverců podle posvátných míst vrstvy (happiness.md): čtverec, pod kterým je
 * políčko háje, se vyjme; posvátné duby na zbylých čtvercích zůstanou stát.
 */
export function sacredSelection(
  landscape: Landscape,
  obstacles: ObstacleLayer,
  sites: SacredSites,
  squares: readonly GridSquare[],
): SacredSelection {
  const kept: GridSquare[] = [];
  const sacredCells: TileCell[] = [];
  const groveTiles: number[] = [];
  const oaks = new Map<number, SacredOakSite>();
  for (const square of squares) {
    const here = sacredInShape(landscape, obstacles, sites, square);
    if (here.groveTiles.length > 0) {
      groveTiles.push(...here.groveTiles);
      sacredCells.push(square.cell);
      continue;
    }
    kept.push(square);
    if (here.oaks.length > 0) sacredCells.push(square.cell);
    for (const oak of here.oaks) oaks.set(oak.id, oak);
  }
  return {
    squares: kept,
    sacredCells,
    spared: sparedSacred(
      [...oaks.values()].sort((a, b) => a.id - b.id),
      grovesOfTiles(sites, groveTiles),
    ),
  };
}

/**
 * Společná kontrola čtverců pole a sadu (staví se stejně – orchard.md): u každého čtverce, co mu
 * brání (voda, obydlí, pole, hřbitov, sad, modla, svatyně, dál než 800 m – zakázané čtverce do
 * náhledu), a čtverce, kde stavba smí stát – louka, křoviny i les – s povrchem (pole
 * `fieldSurfaces`), plochou bez skalních výchozů (nejvýš MAX_OUTCROP_SHARE čtverce) a bez plochy
 * pod korunou posvátných dubů, vzdáleností k nejbližšímu z `dwellingPositions` a překážkami
 * z vrstvy bez toho, co ves už odstranila. Posvátný dub zůstane stát (nepočítá se mezi
 * překážky), čtverce hájů se z výběru vyjmou (happiness.md). Sad (`fieldSurfaces` false) smí na
 * čtverce pole (fields.md – Pole jako krajina) – překážky vrstvy na nich patří poli (`onField`),
 * pole na pole nesmí; les (i les vsi, i jen zčásti) pod sadem osadníci vyklučí za sazbu lesa
 * (`ForestUse`). Čtverce natočené mřížky `grid` (fields.md – Natočené stavby) berou krajinu pod
 * sebou vzorkováním a překážky s patou uvnitř.
 */
export function buildSquares(
  landscape: Landscape,
  village: PlacementVillage | null,
  selected: readonly TileCell[],
  dwellingPositions: Position[],
  obstacles: ObstacleLayer,
  fieldSurfaces: boolean,
  grid?: SquareGrid,
): {
  squares: BuildSquare[];
  problems: SquareFlags & { far: boolean };
  blockedCells: TileCell[];
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  sacred: SacredSelection;
} {
  const status = obstacleStatus(village?.obstacleChanges);
  const flagsOf = squareFlags(landscape, village, dwellingPositions);
  const sites = sacredSitesFor(village, obstacles);
  const sacred = sacredSelection(
    landscape,
    obstacles,
    sites,
    selected.map((cell) => gridSquare(landscape, grid, cell)),
  );
  const onFieldAt = fieldSurfaces ? null : ownedAt(landscape, village, ['field']);
  const cellArea = landscape.cellSizeM * landscape.cellSizeM;
  const problems: SquareFlags & { far: boolean } = {
    water: false,
    forest: false,
    dwelling: false,
    field: false,
    cemetery: false,
    orchard: false,
    pen: false,
    sacred: false,
    threshing: false,
    church: false,
    woodEdge: false,
    far: false,
  };
  const squares: BuildSquare[] = [];
  const blockedCells: TileCell[] = [];
  const obstacleCounts: Partial<Record<ObstacleKind, number>> = {};
  for (const square of sacred.squares) {
    const distanceM = distanceToNearest(square.center, dwellingPositions);
    const { ground, woodExact, ...raw } = flagsOf(square);
    const flags = { ...raw, far: distanceM > FIELD_LIMITS.maxDistanceM };
    // pole i sad smí do lesa (fields.md – Založení pole, ForestUse), sad i na pole a přes les vsi
    // i zčásti (vyklučí ho), pole les vsi vymýtí jen po jeho čtvercích
    flags.forest = false;
    if (!fieldSurfaces) {
      flags.field = false;
      flags.woodEdge = false;
    }
    let blocked = false;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) {
      if (!flags[key]) continue;
      problems[key] = true;
      blocked = true;
    }
    if (blocked) blockedCells.push(square.cell);
    // les vsi se mýtí jako les krajiny – stromy lesa jsou mezi překážkami (fields.md – Les vsi)
    const land = ground.water
      ? 'water'
      : woodExact || raw.woodEdge || ground.forest
        ? 'forest'
        : 'meadow';
    if (land === 'water') continue;
    // posvátný dub zůstane stát – není mezi překážkami a plocha pod korunou se nepočítá;
    // na čtverci pole patří překážky vrstvy poli
    const onField = !fieldSurfaces && raw.field;
    const layerOwned = onField && onFieldAt ? onFieldAt : undefined;
    const tally =
      square.tile !== null
        ? cellObstacles(obstacles, status, square.cell, sites.protectedTrees, {
            ...(layerOwned ? { layerOwned } : {}),
          })
        : squareObstacles(obstacles, status, square.corners, sites.protectedTrees, {
            ...(layerOwned ? { layerOwned } : {}),
          });
    for (const [kind, count] of Object.entries(tally.counts) as [ObstacleKind, number][]) {
      obstacleCounts[kind] = (obstacleCounts[kind] ?? 0) + count;
    }
    const surface: FieldSurface = fieldSurfaces
      ? (fieldSquareSurface(land, tally.counts.shrub ?? 0, cellArea, village?.toolCoverage ?? 0) ??
        'meadow')
      : 'meadow';
    const oaks = sacredInShape(landscape, obstacles, sites, square).oaks.length;
    const unusable = tally.outcropAreaM2 + oaks * SACRED_OAK.crownM2;
    const areaM2 = cellArea - Math.min(unusable, cellArea * MAX_OUTCROP_SHARE);
    // sad v lese: sazba lesa za plochu čtverce mimo pole (fields.md – Krajina sídla a scéna)
    const fieldM2 = onField
      ? takenSquareLand(landscape, village, square, ['field']).reduce((sum, t) => sum + t.areaM2, 0)
      : 0;
    squares.push({
      square,
      onField,
      surface,
      fertility: ground.fertility,
      areaM2,
      distanceM,
      tally,
      obstacleCost: fieldSurfaces
        ? tallyCost(tally, SURFACE_INCLUDED_OBSTACLES[surface])
        : squareObstacleCost(
            village,
            tally,
            land === 'forest',
            areaM2 - fieldM2 > TAKEN_LAND_EPSILON_M2 ? areaM2 - fieldM2 : 0,
          ),
    });
  }
  return { squares, problems, blockedCells, obstacleCounts, sacred };
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

/**
 * Louka a les (ha) do LIVESTOCK.reachM od bodu (x, z) – pastva a žaludy dobytka (diet.md).
 * Políčka se počítají celá podle středu.
 */
export function livestockLandAt(
  landscape: Landscape,
  x: number,
  z: number,
): { meadowHa: number; forestHa: number } {
  const cellHa = (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
  const reach2 = LIVESTOCK.reachM * LIVESTOCK.reachM;
  let meadow = 0;
  let forest = 0;
  for (let y = 0; y < landscape.size; y++) {
    for (let cx = 0; cx < landscape.size; cx++) {
      const center = tileCenterWorld(landscape, cx, y);
      const dx = center.x - x;
      const dz = center.z - z;
      if (dx * dx + dz * dz > reach2) continue;
      const surface = surfaceAt(landscape, cx, y);
      if (surface === 'meadow') meadow++;
      else if (surface === 'forest') forest++;
    }
  }
  return { meadowHa: meadow * cellHa, forestHa: forest * cellHa };
}

/**
 * Počátek vsi pro krajinu kolem ní – první zemnice nebo její staveniště (pastva dobytka, zvěř);
 * ves bez obydlí nemá nic (null).
 */
export function villageOrigin(
  state: Pick<VillageState, 'dwellings' | 'constructions'>,
): { x: number; z: number } | null {
  return (
    state.dwellings[0]?.position ??
    state.constructions.find((c) => c.kind === 'dwelling' && c.position !== null)?.position ??
    null
  );
}

/**
 * Doplní vsi uložené před dobytkem výchozí stádo a krajinu pro pastvu (louka a les do 600 m od
 * první zemnice nebo jejího staveniště – `livestockLandAt`). Nic nechybí – vrátí týž stav.
 */
export function withLivestockLand(state: VillageState, landscape: Landscape): VillageState {
  if (state.livestock?.land) return state;
  const origin = villageOrigin(state);
  if (!origin) return state;
  return withLivestock(state, livestockLandAt(landscape, origin.x, origin.z));
}
