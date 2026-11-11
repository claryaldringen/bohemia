// Kontroly umístění modly, svatyně a humna.

import { FOREST_CROWN_MARGIN_M, HUMNO, SACRED_BUILDINGS } from '../rules';
import {
  type Landscape,
  type ObstacleLayer,
  heightAtWorld,
  obstaclesOf,
  surfaceAt,
  tileOfWorldPoint,
} from '../../landscape';
import { type Point, rectangleCorners } from './polygon';
import { type Position, type SacredBuildingKind } from '../types';
import { type SparedSacred, mergeSpared, sacredFootprint } from '../people/sacred';
import { sacredSitesFor } from '../people/desecration';
import { obstacleStatus, outcropUnder, polygonsObstacles } from '../core/obstacles';
import { threshingFloorFootprint } from '../fields/threshing-floors';
import {
  FIELD_LAND,
  checkFootprintFree,
  freeForestClearing,
  groveTilesUnder,
  sacredCrowned,
  takenLandUnder,
  takenLandWarning,
} from './placement-land';
import {
  OK,
  type PlacementCheck,
  type PlacementVillage,
  type SacredPlacementCheck,
  fail,
  formatNumber,
} from './placement-types';
import { freeShape, ownedLand, rectangleSamples } from './placement-geometry';
import { sacredUnder, unreservedTrees } from './placement-dwellings';
import { withWarning } from './placement-fields';

/** Názvy posvátných staveb (důvody kontroly umístění). */
const SACRED_NAMES: Record<SacredBuildingKind, string> = { idol: 'Modla', shrine: 'Svatyně' };

/**
 * Půdorys volně stojící stavby `name` (modla, svatyně, humno) v krajině, ne ve vodě (louka i les)
 * a s rozdílem výšek nejvýš `limit` m (null = bez meze).
 */
function checkStructureTerrain(
  landscape: Landscape,
  name: string,
  limit: number | null,
  samples: readonly Point[],
): PlacementCheck {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const [x, z] of samples) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile) return fail(`${name} musí stát uvnitř krajiny sídla.`);
    const surface = surfaceAt(landscape, tile.x, tile.y);
    if (surface === 'water') return fail(`${name} nemůže stát ve vodě.`);
    if (limit === null) continue;
    const height = heightAtWorld(landscape, x, z);
    lowest = Math.min(lowest, height);
    highest = Math.max(highest, height);
  }
  if (limit !== null && highest - lowest > limit) {
    return fail(
      `Země je tu příliš nerovná – rozdíl ${formatNumber(highest - lowest, 1)} m, ` +
        `nejvýš ${formatNumber(limit, 1)} m.`,
    );
  }
  return OK;
}

/**
 * Smí modla nebo svatyně stát na místě (happiness.md)? Půdorys (modla 4 × 4 m, svatyně 30 × 30 m)
 * na louce nebo v lese (ne ve vodě), u svatyně převýšení nejvýš 1 m; nepřekrývá obydlí, hřbitovy,
 * sady, jiné modly ani svatyni; žádný skalní výchoz, čtverec háje ani posvátný dub (pod korunou);
 * svatyně jedna na ves. Ostatní překážky na půdorysu osadníci odstraní – cena po kusech podle
 * tabulky ve fields.md, les (i les vsi) vyklučí za sazbu lesa (`ForestUse`), dospělé stromy dají
 * klády. Na pole smí (fields.md – Pole jako krajina): díly pod půdorysem se o průnik zmenší
 * (`takenLand`, varování „Pole se zmenší“), překážky na nich stavba neplatí – patří poli.
 * `obstacles` = vrstva překážek krajiny.
 */
export function checkSacredBuildingPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  kind: SacredBuildingKind,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): SacredPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail(`Neplatná poloha – ${SACRED_NAMES[kind].toLowerCase()}.`), ...none };
  }
  if (kind === 'shrine' && (village?.sacredBuildings ?? []).some((b) => b.kind === 'shrine')) {
    return { ...fail('Ves už svatyni má – svatyně je jedna na ves.'), ...none };
  }
  const size = SACRED_BUILDINGS[kind].footprintM;
  const terrain = checkStructureTerrain(
    landscape,
    SACRED_NAMES[kind],
    SACRED_BUILDINGS[kind].maxHeightDiffM,
    rectangleSamples(size, size, position),
  );
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = sacredFootprint(kind, position);
  const free = checkFootprintFree(landscape, village, [freeShape(footprint)], FIELD_LAND);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  // překážky vrstvy na čtvercích polí patří poli (založený díl je už nemá)
  const crowned = sacredCrowned(kind, position);
  const fields = ownedLand(
    landscape,
    village,
    ['field'],
    groveTilesUnder(landscape, sites, [crowned]),
  );
  const forest = freeForestClearing(landscape, village, [footprint], [crowned], fields);
  const tally = polygonsObstacles(
    obstacles,
    status,
    forest.polygons,
    fields,
    sites.protectedTrees,
    forest.options,
  );
  const takenLand = takenLandUnder(landscape, village, [footprint]);
  return {
    ...withWarning(takenLandWarning(landscape, village, takenLand)),
    obstacleCost: tally.cost + forest.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    takenLand,
  };
}

/**
 * Kontrola umístění humna s cenou překážek a lesa na půdorysu – stejné údaje jako u modly
 * a svatyně (`startThreshingFloor` je dostane v `site`).
 */
export type ThreshingFloorPlacementCheck = SacredPlacementCheck;

/** Půdorys humna rozšířený o pruh pod korunami (FOREST_CROWN_MARGIN_M) – paseka v lese. */
function threshingFloorCrowned(position: Position): Point[] {
  const margin = 2 * FOREST_CROWN_MARGIN_M;
  const { x, z } = HUMNO.sizeM;
  return rectangleCorners(position.x, position.z, x + margin, z + margin, position.rotation);
}

/**
 * Smí humno stát na místě (production-chains.md – Humno)? Volně jako řemeslná dílna: půdorys
 * HUMNO.sizeM natočený jako obydlí na louce nebo v lese (Stavba v lese – les i les vsi osadníci
 * vyklučí za sazbu lesa i s pruhem pod korunami), ne ve vodě, s rozdílem výšek nejvýš
 * HUMNO.maxHeightDiffM; nepřekrývá obydlí (i rozestavěná a jejich pozemky), jiné humno, modlu,
 * svatyni, hřbitov, ohradu, sad, milíř, nezatarasí branku a nestojí na
 * skalním výchozu, čtverci háje ani pod korunou posvátného dubu. Na pole smí (fields.md – Pole
 * jako krajina): díly pod půdorysem se o průnik zmenší (`takenLand`, varování „Pole se zmenší“),
 * překážky na nich stavba neplatí – patří poli. Ostatní překážky na půdorysu osadníci odstraní za
 * práci po kusech (fields.md), dospělé stromy dají klády. `obstacles` = vrstva překážek krajiny.
 */
export function checkThreshingFloorPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): ThreshingFloorPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha – humno.'), ...none };
  }
  const terrain = checkStructureTerrain(
    landscape,
    'Humno',
    HUMNO.maxHeightDiffM,
    rectangleSamples(HUMNO.sizeM.x, HUMNO.sizeM.z, position),
  );
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = threshingFloorFootprint(position);
  const free = checkFootprintFree(landscape, village, [freeShape(footprint)], FIELD_LAND);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  // překážky vrstvy na čtvercích polí patří poli (založený díl je už nemá)
  const crowned = threshingFloorCrowned(position);
  const fields = ownedLand(
    landscape,
    village,
    ['field'],
    groveTilesUnder(landscape, sites, [crowned]),
  );
  const forest = freeForestClearing(landscape, village, [footprint], [crowned], fields);
  const tally = polygonsObstacles(
    obstacles,
    status,
    forest.polygons,
    fields,
    sites.protectedTrees,
    forest.options,
  );
  const takenLand = takenLandUnder(landscape, village, [footprint]);
  return {
    ...withWarning(takenLandWarning(landscape, village, takenLand)),
    obstacleCost: tally.cost + forest.cost,
    obstacleIds: tally.ids,
    clearedTrees: unreservedTrees(village, tally.treeIds),
    obstacleCounts: tally.counts,
    takenLand,
  };
}

/** Ušetřená místa obou kontrol (obydlí a první pole při založení vsi). */
export function sparedOf(...checks: readonly { spared: SparedSacred }[]): SparedSacred {
  return mergeSpared(...checks.map((c) => c.spared));
}
