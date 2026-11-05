// Kontrola umístění opevnění (fortifications.md – Obvod): plocha po čtvercích jako pole, pás
// uvnitř podél okraje. Pás smí přes louku, křoviny a les (stromy a keře se pokácí), plot
// a palisáda po okraji polí a sadu (díl zůstane), val díl pole a sadu vezme. Nesmí přes obydlí
// s pozemkem, dvorec, dílnu, hřbitov, ohradu, humno, modlu, svatyni, posvátný dub a háj ani vodu.

import { type Landscape, type ObstacleLayer, surfaceAt } from '../landscape';
import {
  fortBandPolygons,
  fortificationArea,
  fortificationOutline,
  type FortArea,
  type FortOutline,
} from './fortification';
import { type TakenLand } from './land-taken';
import { obstacleStatus, outcropUnder, squareObstacles } from './obstacles';
import { ownedAt, freeShape } from './placement-geometry';
import { sacredInShape, unreservedTrees } from './placement-dwellings';
import {
  checkFootprintFree,
  DWELLING_LAND,
  OVERLAPS_DWELLING,
  OVERLAPS_DWELLING_SITE,
  takenLandUnder,
  takenLandWarning,
} from './placement-land';
import { gridSquare } from './placement-squares';
import { withWarning } from './placement-fields';
import { type PlacementCheck, type PlacementVillage, fail } from './placement-types';
import { type Point, polygonsOverlap } from './polygon';
import { sacredSitesOf } from './sacred';
import { normalizeGrid } from './square-grid';
import { tilesUnder } from './squares';
import type { FortKind, SquareGrid, TileCell } from './types';

/** Důvody u kurzoru (fortifications.md – Obvod). */
export const FORT_OVER_BUILDING = 'Opevnění nevede přes obydlí.';
export const FORT_OVER_WATER = 'Opevnění nevede přes vodu.';
export const FORT_NOT_CONNECTED = 'Plocha musí být souvislá.';
export const FORT_TOUCHES = 'Opevnění se nesmí dotknout jiného.';
export const FORT_TOO_SMALL = 'Opevnění chce plochu aspoň 2 × 2 čtverce.';
export const FORT_OUTSIDE = 'Opevnění musí ležet uvnitř krajiny sídla.';
export const FORT_BAD_GRID = 'Neplatné natočení opevnění.';

/** Kontrola opevnění – tvar a co se v pásu stane (prošlá kontrola; neprošlá s prázdnými údaji). */
export interface FortPlacementCheck extends PlacementCheck {
  /** Plocha a obvod (u neprošlé plochy null). */
  area: FortArea | null;
  outline: FortOutline | null;
  /** Překážky v pásu – osadníci je odstraní hned, dospělé stromy dají klády (forest.md). */
  obstacleIds: number[];
  /** Dospělé stromy v pásu, které nevyhradila jiná stavba – klády na hromadu. */
  clearedTrees: number;
  /** Kusy polí a sadů pod valem – z nich zmizí (fields.md – Pole jako krajina); plot a palisáda nic. */
  takenLand: TakenLand[];
}

const NONE = {
  area: null,
  outline: null,
  obstacleIds: [],
  clearedTrees: 0,
  takenLand: [],
};

/** O kolik se čtverec plochy při kontrole dotyku zvětší (m) – dotyk hranou i rohem se počítá. */
const TOUCH_MARGIN_M = 0.05;

/** Čtverce plochy ve světě, o `margin` zvětšené od středu. */
function areaPolygons(landscape: Landscape, area: FortArea, margin = 0): Point[][] {
  const grid = area.grid ?? undefined;
  return area.cells.map((cell) => {
    const square = gridSquare(landscape, grid, cell);
    const half = landscape.cellSizeM / 2;
    const k = (half + margin) / half;
    const { x, z } = square.center;
    return square.corners.map(([px, pz]) => [x + (px - x) * k, z + (pz - z) * k] as const);
  });
}

/** Dotkne se plocha `area` (nebo leží uvnitř, či kolem) jiného opevnění vsi? */
function touchesOther(
  landscape: Landscape,
  village: PlacementVillage | null,
  area: FortArea,
): boolean {
  const others = village?.fortifications ?? [];
  if (others.length === 0) return false;
  const mine = areaPolygons(landscape, area, TOUCH_MARGIN_M);
  return others.some((f) => {
    const other = fortificationArea(f.cells, f.grid, landscape);
    if ('error' in other) return false;
    const theirs = areaPolygons(landscape, other);
    return mine.some((a) => theirs.some((b) => polygonsOverlap(a, b)));
  });
}

/** Leží pás uvnitř krajiny sídla? */
function bandInside(landscape: Landscape, band: readonly Point[][]): boolean {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const eps = 1e-6;
  return band.every((polygon) =>
    polygon.every(([x, z]) => Math.abs(x) <= half + eps && Math.abs(z) <= half + eps),
  );
}

/**
 * Smí na čtvercích `cells` (mřížka `grid`, bez ní krajina) stát opevnění druhu `kind`? Plocha
 * souvislá, nejméně 2 × 2, nedotýká se jiného opevnění; pás uvnitř krajiny, ne přes vodu, stavby
 * (`checkFootprintFree` – pole, sad a les vsi smí), skalní výchoz ani posvátný dub a háj. Překážky
 * v pásu osadníci odstraní (díly polí a sadu pod plotem a palisádou nechají poli), val vezme kusy
 * polí a sadů pod pásem (`takenLand`, varování „Pole se zmenší“). Stav nemění.
 */
export function checkFortificationPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  obstacles: ObstacleLayer,
  cells: readonly TileCell[],
  gridInput: SquareGrid | null,
  kind: FortKind,
): FortPlacementCheck {
  if (cells.some((c) => !Number.isInteger(c.x) || !Number.isInteger(c.y))) {
    return { ...fail('Neplatné čtverce opevnění.'), ...NONE };
  }
  const grid = gridInput === null ? null : normalizeGrid(gridInput);
  if (gridInput !== null && !grid) return { ...fail(FORT_BAD_GRID), ...NONE };
  const area = fortificationArea(cells, grid, landscape);
  if ('error' in area) {
    return {
      ...fail(area.error === 'disconnected' ? FORT_NOT_CONNECTED : FORT_TOO_SMALL),
      ...NONE,
    };
  }
  const outline = fortificationOutline(area, kind);
  const band = fortBandPolygons(outline);
  const shaped = { ...NONE, area, outline };
  if (!bandInside(landscape, band)) return { ...fail(FORT_OUTSIDE), ...shaped };
  if (touchesOther(landscape, village, area)) return { ...fail(FORT_TOUCHES), ...shaped };
  for (const polygon of band) {
    const water = tilesUnder(landscape, polygon).some(
      (t) => surfaceAt(landscape, t % landscape.size, Math.floor(t / landscape.size)) === 'water',
    );
    if (water) {
      return { ...fail(FORT_OVER_WATER), ...shaped };
    }
  }
  const shapes = band.map(freeShape);
  const free = checkFootprintFree(landscape, village, shapes, DWELLING_LAND);
  if (!free.ok) {
    const overDwelling =
      free.reason === OVERLAPS_DWELLING || free.reason === OVERLAPS_DWELLING_SITE;
    return { ...(overDwelling ? fail(FORT_OVER_BUILDING) : free), ...shaped };
  }
  const status = obstacleStatus(village?.obstacleChanges);
  if (band.some((polygon) => outcropUnder(obstacles, status, polygon))) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...shaped };
  }
  const sites = sacredSitesOf(obstacles);
  for (const shape of shapes) {
    const sacred = sacredInShape(landscape, obstacles, sites, shape);
    if (sacred.groveTiles.length > 0) {
      return { ...fail('Roste tu posvátný dubový háj – ten vesničané nevykácejí.'), ...shaped };
    }
    if (sacred.oaks.length > 0) {
      return { ...fail('Stojí tu posvátný dub – ten vesničané nepokácí.'), ...shaped };
    }
  }
  // val vezme kusy polí a sadů pod pásem; plot a palisáda stojí na mezi – díl zůstane i se svými
  // překážkami (patří poli a sadu)
  const takenLand = kind === 'rampart' ? takenLandUnder(landscape, village, band) : [];
  const onCrops = kind === 'rampart' ? null : ownedAt(landscape, village, ['field', 'orchard']);
  const ids = new Set<number>();
  const treeIds = new Set<number>();
  // obdélníky pásu se v rozích překrývají – překážka se počítá jednou
  for (const polygon of band) {
    const tally = squareObstacles(obstacles, status, polygon, sites.protectedTrees, {
      ...(onCrops ? { layerOwned: onCrops } : {}),
    });
    for (const id of tally.ids) ids.add(id);
    for (const id of tally.treeIds) treeIds.add(id);
  }
  return {
    ...withWarning(takenLandWarning(landscape, village, takenLand)),
    area,
    outline,
    obstacleIds: [...ids].sort((a, b) => a - b),
    clearedTrees: unreservedTrees(village, [...treeIds]),
    takenLand,
  };
}
