// Kontroly umístění ohrad.

import {
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
  obstaclesOf,
  surfaceAt,
  tileCenterWorld,
} from '../landscape';
import { MAX_PEN_SQUARES, connectedCells, penCells, touchingPens } from './pens';
import { type PenSpecies, type SquareGrid, type TileCell } from './types';
import { type PenSquareInput } from './oxen';
import { type Shape } from './plot-cells';
import { type TakenLand } from './land-taken';
import { cellObstacles, obstacleStatus, outcropUnder, squareObstacles } from './obstacles';
import { normalizeGrid } from './square-grid';
import { sacredOaksInTile } from './sacred';
import { sacredSitesFor } from './desecration';
import {
  FIELD_LAND,
  checkFootprintFree,
  squareFreeArea,
  squareInForest,
  squareObstacleCost,
  takenLandWarning,
  takenSquareLand,
} from './placement-land';
import { OK, type PlacementCheck, type PlacementVillage, fail } from './placement-types';
import { cellCorners, cellIndex, ownedAt } from './placement-geometry';
import { gridSquare, squareGround } from './placement-squares';
import { sacredInShape, unreservedTrees } from './placement-dwellings';
import { withWarning } from './placement-fields';

/** Kontrola ohrady (oxen.md) – cena překážek a střed čtverce (prošlá kontrola). */
export interface PenPlacementCheck extends PlacementCheck {
  obstacleCost: number;
  obstacleIds: number[];
  clearedTrees: number;
  obstacleCounts: Partial<Record<ObstacleKind, number>>;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Čtverec pole pod ohradou – z pole zmizí (fields.md – Pole jako krajina). */
  takenLand: TakenLand[];
}

/**
 * Smí na políčku `cell` stát ohrada s přístřeškem (oxen.md – stavba po čtvercích jako pozemek
 * polozemnice)? Celé políčko louky nebo lesa (ne voda), bez skalního výchozu, posvátného dubu
 * a háje, nezabrané hřbitovem, sadem, obydlím, pozemkem, jinou ohradou ani modlou. Překážky
 * platí jako u čtverce pole – všechny kusy na políčku (dospělé stromy nevyhrazené jinou stavbou
 * dají klády), les (i les vsi) osadníci vyklučí za sazbu lesa jako díl pole (`ForestUse`). Na
 * čtverec pole smí (fields.md – Pole jako krajina): díl z pole zmizí (`takenLand`, varování „Pole
 * se zmenší“) a překážky dílu ohrada neplatí – patří poli (stromy u cesty ano).
 */
export function checkPenPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  grid?: SquareGrid,
): PenPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    x: 0,
    z: 0,
    takenLand: [],
  };
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    return { ...fail('Neplatné políčko ohrady.'), ...none };
  }
  if (grid) return checkTurnedPen(landscape, village, cell, obstacles, grid, none);
  if (cell.x < 0 || cell.y < 0 || cell.x >= landscape.size || cell.y >= landscape.size) {
    return { ...fail('Ohrada musí ležet uvnitř krajiny sídla.'), ...none };
  }
  const surface = surfaceAt(landscape, cell.x, cell.y);
  if (surface === 'water') return { ...fail('Ohrada nemůže stát ve vodě.'), ...none };
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  const square = cellCorners(landscape, cell);
  const shape: Shape = { corners: square, tile: cellIndex(landscape, cell) };
  const free = checkFootprintFree(landscape, village, [shape], FIELD_LAND);
  if (!free.ok) return { ...free, ...none, x: center.x, z: center.z };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, square)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const index = cellIndex(landscape, cell);
  if (sites.groveByTile.has(index)) {
    return { ...fail('Roste tu posvátný dubový háj – ten vesničané nevykácejí.'), ...none };
  }
  if (sacredOaksInTile(sites, index).length > 0) {
    return { ...fail('Stojí tu posvátný dub – ten vesničané nepokácí.'), ...none };
  }
  // čtverce polí pod ohradou (i natočené – průnik) z pole zmizí, překážky vrstvy na nich patří
  // poli (stromy u cesty ne)
  const takenLand = takenSquareLand(landscape, village, shape, ['field']);
  const onField = takenLand.length > 0 ? ownedAt(landscape, village, ['field']) : null;
  const tally = cellObstacles(obstacles, status, cell, sites.protectedTrees, {
    ...(onField ? { layerOwned: onField } : {}),
  });
  const forest = squareInForest(landscape, village, shape, { forest: surface === 'forest' });
  return {
    ...withWarning(takenLandWarning(landscape, village, takenLand)),
    obstacleCost: squareObstacleCost(village, tally, forest, squareFreeArea(landscape, takenLand)),
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    x: center.x,
    z: center.z,
    takenLand,
  };
}

/**
 * Natočená ohrada (fields.md – Natočené stavby, oxen.md): čtverec `cell` natočené mřížky `grid`
 * se stejnými pravidly jako na políčku – krajina pod čtvercem podle bodů vzorkování, překryvy,
 * výchozy, posvátná místa a překážky podle natočeného čtverce.
 */
function checkTurnedPen(
  landscape: Landscape,
  village: PlacementVillage | null,
  cell: TileCell,
  obstacles: ObstacleLayer,
  gridInput: SquareGrid,
  none: Omit<PenPlacementCheck, keyof PlacementCheck>,
): PenPlacementCheck {
  const grid = normalizeGrid(gridInput);
  if (!grid) return { ...fail('Neplatné natočení ohrady.'), ...none };
  const square = gridSquare(landscape, grid, cell);
  const ground = squareGround(landscape, square);
  if (ground.outside) return { ...fail('Ohrada musí ležet uvnitř krajiny sídla.'), ...none };
  if (ground.water) return { ...fail('Ohrada nemůže stát ve vodě.'), ...none };
  const { x, z } = square.center;
  const free = checkFootprintFree(landscape, village, [square], FIELD_LAND);
  if (!free.ok) return { ...free, ...none, x, z };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, square.corners)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacred = sacredInShape(landscape, obstacles, sites, square);
  if (sacred.groveTiles.length > 0) {
    return { ...fail('Roste tu posvátný dubový háj – ten vesničané nevykácejí.'), ...none };
  }
  if (sacred.oaks.length > 0) {
    return { ...fail('Stojí tu posvátný dub – ten vesničané nepokácí.'), ...none };
  }
  // kusy polí pod ohradou (průnik) z pole zmizí, překážky vrstvy na nich patří poli
  const takenLand = takenSquareLand(landscape, village, square, ['field']);
  const onField = takenLand.length > 0 ? ownedAt(landscape, village, ['field']) : null;
  const tally = squareObstacles(obstacles, status, square.corners, sites.protectedTrees, {
    ...(onField ? { layerOwned: onField } : {}),
  });
  const forest = squareInForest(landscape, village, square, ground);
  return {
    ...withWarning(takenLandWarning(landscape, village, takenLand)),
    obstacleCost: squareObstacleCost(village, tally, forest, squareFreeArea(landscape, takenLand)),
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    x,
    z,
    takenLand,
  };
}

/** Kontrola ohrady po čtvercích (oxen.md – Ohrady podle druhu) – náhled i vstup `foundPen`. */
export interface PenSquaresCheck {
  check: PlacementCheck;
  /** Čtverce, kam ohrada nesmí (červeně). */
  blockedCells: TileCell[];
  /** Prošlé čtverce v pořadí výběru – vstup `foundPen` (`PenInput.squares`). */
  squares: PenSquareInput[];
  /** Ohrada téhož druhu, kterou čtverce rozšíří; nová ohrada null. */
  extendsPen: number | null;
  /** Kolik čtverců bude ohrada mít (i s rozšířenou). */
  totalSquares: number;
  /** Práce za překážky (člověkodny). */
  obstacleCost: number;
  /** Kusy polí pod ohradou – z pole zmizí (fields.md – Pole jako krajina). */
  takenLand: TakenLand[];
  /** Mřížka ohrady (natočená), bez ní krajina. */
  grid?: SquareGrid;
}

/**
 * Ohrada po čtvercích (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Velikost ohrady by mělo
 * jít určovat podobně, jako když se staví hřbitov.“): každý čtverec projde `checkPenPlacement`;
 * čtverce navazující stranou na ohradu téhož druhu (ve stejné mřížce) ji rozšíří, na dvě ohrady
 * navázat nejde, ohrada má nejvýš MAX_PEN_SQUARES čtverců souvislých stranou („ohrada, ne výběh“).
 * Ohrady jiného druhu se nemíchají – ohrada vedle nich je nová ohrada.
 */
export function penSquaresFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: readonly TileCell[],
  species: PenSpecies,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
  gridInput?: SquareGrid,
): PenSquaresCheck {
  const grid = gridInput ? (normalizeGrid(gridInput) ?? undefined) : undefined;
  const result = (check: PlacementCheck, rest: Partial<PenSquaresCheck> = {}): PenSquaresCheck => ({
    check,
    blockedCells: [],
    squares: [],
    extendsPen: null,
    totalSquares: 0,
    obstacleCost: 0,
    takenLand: [],
    ...(grid ? { grid } : {}),
    ...rest,
  });
  if (gridInput && !grid) return result(fail('Neplatné natočení ohrady.'));
  const unique = new Map<string, TileCell>();
  for (const c of cells) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) {
      return result(fail('Neplatné čtverce ohrady.'));
    }
    unique.set(`${c.x},${c.y}`, { x: c.x, y: c.y });
  }
  const chosen = [...unique.values()];
  if (chosen.length === 0) return result({ ok: false, reason: null });
  const touching = touchingPens(village?.pens ?? [], chosen, species, grid);
  if (touching.length > 1) {
    return result(fail('Ohrada smí navazovat jen na jednu ohradu.'), { blockedCells: chosen });
  }
  const extended = touching[0];
  const total = chosen.length + (extended ? penCells(extended).length : 0);
  if (total > MAX_PEN_SQUARES) {
    return result(
      fail(`Ohrada může mít nejvýš ${MAX_PEN_SQUARES} čtverce – je to ohrada, ne výběh.`),
      {
        blockedCells: chosen,
        totalSquares: total,
      },
    );
  }
  if (!connectedCells([...(extended ? penCells(extended) : []), ...chosen])) {
    return result(fail('Čtverce ohrady musí navazovat stranou.'), {
      blockedCells: chosen,
      totalSquares: total,
    });
  }
  const squares: PenSquareInput[] = [];
  const blockedCells: TileCell[] = [];
  const takenLand: TakenLand[] = [];
  let reason: string | null = null;
  let warning: string | undefined;
  for (const cell of chosen) {
    const check = checkPenPlacement(landscape, village, cell, obstacles, grid);
    if (!check.ok) {
      blockedCells.push(cell);
      reason ??= check.reason;
      continue;
    }
    if (check.warning) warning ??= check.warning;
    takenLand.push(...check.takenLand);
    squares.push({
      cell,
      x: check.x,
      z: check.z,
      obstacleCost: check.obstacleCost,
      obstacleIds: check.obstacleIds,
      clearedTrees: check.clearedTrees,
    });
  }
  const extendsPen = extended?.id ?? null;
  const obstacleCost = squares.reduce((sum, q) => sum + q.obstacleCost, 0);
  if (blockedCells.length > 0) {
    return result(fail(reason ?? 'Sem ohrada nepatří.'), {
      blockedCells,
      extendsPen,
      totalSquares: total,
    });
  }
  return result(warning ? { ...OK, warning } : OK, {
    squares,
    extendsPen,
    totalSquares: total,
    obstacleCost,
    takenLand,
  });
}
