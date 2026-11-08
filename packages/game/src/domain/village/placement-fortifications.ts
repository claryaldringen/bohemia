import { type Landscape, type ObstacleLayer, surfaceAt } from '../landscape';
import { squareCorners } from './square-grid';
import {
  bandPieces,
  fortBandPolygons,
  fortificationOutline,
  fortOutlineOf,
  fortShapeError,
  outlineBend,
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
import { withWarning } from './placement-fields';
import { type PlacementCheck, type PlacementVillage, fail } from './placement-types';
import { type Point, polygonsOverlap } from './polygon';
import { FORTIFICATIONS } from './rules-fortifications';
import { sacredSitesOf } from './sacred';
import { tilesUnder } from './squares';
import type { FortKind } from './types';

/** Důvody u kurzoru (fortifications.md – Obvod). */
export const FORT_OVER_BUILDING = 'Opevnění nevede přes obydlí.';
export const FORT_OVER_WATER = 'Opevnění nevede přes vodu.';
export const FORT_TOUCHES = 'Opevnění se nesmí dotknout jiného.';
export const FORT_TOO_SMALL = 'Opevnění chce plochu aspoň 900 m².';
export const FORT_OUTSIDE = 'Opevnění musí ležet uvnitř krajiny sídla.';
export const FORT_BAD_POINTS = 'Neplatné body opevnění.';
export const FORT_TOO_FEW = 'Obvod chce aspoň 4 body.';
export const FORT_SHARP = 'Tady je ohyb moc ostrý.';
export const FORT_CROSSING = 'Obvod se nesmí křížit.';
/** Vylepšení úseku – ohyb úseku je na cílový druh ostřejší než jeho nejmenší ohyb. */
export const FORT_BEND_KIND = 'Ohyb je na tento druh příliš ostrý.';

/** Kontrola opevnění – tvar a co se v pásu stane (prošlá kontrola; neprošlá s prázdnými údaji). */
export interface FortPlacementCheck extends PlacementCheck {
  /** Obvod (u neplatných bodů null). */
  outline: FortOutline | null;
  /** Překážky v pásu – osadníci je odstraní hned, dospělé stromy dají klády (forest.md). */
  obstacleIds: number[];
  /** Dospělé stromy v pásu, které nevyhradila jiná stavba – klády na hromadu. */
  clearedTrees: number;
  /** Kusy polí a sadů pod valem – z nich zmizí (fields.md – Pole jako krajina); plot a palisáda nic. */
  takenLand: TakenLand[];
}

const NONE = {
  outline: null,
  obstacleIds: [],
  clearedTrees: 0,
  takenLand: [],
};

/** Do jaké vzdálenosti se obvody dotýkají (m) – dotyk se počítá. */
const TOUCH_MARGIN_M = 0.05;

/** Nejmenší vzdálenost dvou uzavřených lomených čar (m) – stačí vědět, jestli je pod `limit`. */
function closerThan(a: readonly Point[], b: readonly Point[], limit: number): boolean {
  const near = (p: Point, q0: Point, q1: Point): number => {
    const ex = q1[0] - q0[0];
    const ez = q1[1] - q0[1];
    const len2 = ex * ex + ez * ez;
    const t =
      len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - q0[0]) * ex + (p[1] - q0[1]) * ez) / len2)) : 0;
    const dx = q0[0] + ex * t - p[0];
    const dz = q0[1] + ez * t - p[1];
    return dx * dx + dz * dz;
  };
  const l2 = limit * limit;
  const test = (from: readonly Point[], to: readonly Point[]): boolean =>
    from.some((p) => to.some((q, k) => near(p, q, to[(k + 1) % to.length]!) <= l2));
  return test(a, b) || test(b, a);
}

/**
 * Obvody jiných opevnění vsi, kterých se obvod `outline` dotkne (nebo leží uvnitř, či kolem) –
 * prázdné, když se nedotkne ničeho.
 */
function touchedOther(
  landscape: Landscape,
  village: PlacementVillage | null,
  outline: FortOutline,
): Point[][] {
  const others = village?.fortifications ?? [];
  return others.flatMap((f) => {
    const other = fortOutlineOf(landscape, f);
    if (!other) return [];
    const touches =
      polygonsOverlap(outline.polyline, other.polyline) ||
      closerThan(outline.polyline, other.polyline, TOUCH_MARGIN_M);
    return touches ? [other.polyline] : [];
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

/** Body ze vstupu – konečná čísla, nejvýš `FORTIFICATIONS.outline.maxPoints`; jinak null. */
function validPoints(points: readonly Point[]): boolean {
  return (
    Array.isArray(points) &&
    points.length <= FORTIFICATIONS.outline.maxPoints &&
    points.every(
      (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
    )
  );
}

/**
 * Smí obvod přes body `points` nést opevnění druhu `kind`? Tvar (nejméně 4 body, ohyb ne ostřejší
 * než nejmenší poloměr druhu, nekříží se, plocha aspoň 900 m²), nedotýká se jiného opevnění; pás
 * uvnitř krajiny, ne přes vodu, stavby (`checkFootprintFree` – pole, sad a les vsi smí), skalní
 * výchoz ani posvátný dub a háj. Překážky v pásu osadníci odstraní (díly polí a sadu pod plotem
 * a palisádou nechají poli), val a široké hradby vezmou kusy polí a sadů pod pásem (`takenLand`,
 * varování „Pole se zmenší“). Stav nemění.
 */
export function checkFortificationPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  obstacles: ObstacleLayer,
  points: readonly Point[],
  kind: FortKind,
  only?: ReadonlyMap<number, number>,
): FortPlacementCheck {
  if (!validPoints(points)) return { ...fail(FORT_BAD_POINTS), ...NONE };
  const outline = fortificationOutline(points, kind);
  const shaped = { ...NONE, outline };
  if (outline && only) {
    // vylepšení úseku: obvod už stojí – ohyb cílového druhu jen v dílech úseku
    const minBend = FORTIFICATIONS.minBendM[kind];
    const bend = outlineBend(outline, minBend, new Set(only.keys()));
    if (bend.radiusM < minBend - 1e-6) {
      return { ...fail(FORT_BEND_KIND, { points: [{ x: bend.at[0], z: bend.at[1] }] }), ...shaped };
    }
  }
  const shape = only ? null : fortShapeError(outline);
  if (shape) {
    const where = shape.at ? { points: [{ x: shape.at[0], z: shape.at[1] }] } : undefined;
    const reason =
      shape.error === 'too-few'
        ? FORT_TOO_FEW
        : shape.error === 'sharp'
          ? FORT_SHARP
          : shape.error === 'crossing'
            ? FORT_CROSSING
            : FORT_TOO_SMALL;
    return { ...fail(reason, where), ...shaped };
  }
  if (!outline) return { ...fail(FORT_TOO_FEW), ...NONE };
  const band = only
    ? [...only].flatMap(([index, width]) => bandPieces(outline, width, index).map((p) => p.corners))
    : fortBandPolygons(outline);
  if (!bandInside(landscape, band)) return { ...fail(FORT_OUTSIDE), ...shaped };
  const touched = touchedOther(landscape, village, outline);
  if (touched.length > 0) {
    return { ...fail(FORT_TOUCHES, { footprints: touched }), ...shaped };
  }
  const waterTiles = new Set<number>();
  for (const polygon of band) {
    for (const t of tilesUnder(landscape, polygon)) {
      if (surfaceAt(landscape, t % landscape.size, Math.floor(t / landscape.size)) === 'water') {
        waterTiles.add(t);
      }
    }
  }
  if (waterTiles.size > 0) {
    const footprints = [...waterTiles]
      .sort((a, b) => a - b)
      .map((t) =>
        squareCorners(landscape, undefined, {
          x: t % landscape.size,
          y: Math.floor(t / landscape.size),
        }),
      );
    return { ...fail(FORT_OVER_WATER, { footprints }), ...shaped };
  }
  const shapes = band.map(freeShape);
  const free = checkFootprintFree(landscape, village, shapes, DWELLING_LAND);
  if (!free.ok) {
    const overDwelling =
      free.reason === OVERLAPS_DWELLING || free.reason === OVERLAPS_DWELLING_SITE;
    return {
      ...(overDwelling ? fail(FORT_OVER_BUILDING, free.where) : free),
      ...shaped,
    };
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
  // val a široké hradby (s ochozem, roštová, komorová – pás 5,5–8 m; návrh Clauda) vezmou kusy
  // polí a sadů pod pásem; plot a palisáda stojí na mezi – díl zůstane i se svými překážkami
  // (patří poli a sadu)
  const takes = kind !== 'fence' && kind !== 'palisade';
  const takenLand = takes ? takenLandUnder(landscape, village, band) : [];
  const onCrops = takes ? null : ownedAt(landscape, village, ['field', 'orchard']);
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
    outline,
    obstacleIds: [...ids].sort((a, b) => a - b),
    clearedTrees: unreservedTrees(village, [...treeIds]),
    takenLand,
  };
}
