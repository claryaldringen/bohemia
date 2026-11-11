// Kontrola umístění kostela s hřbitůvkem (churches.md – Stavba).

import { type Landscape, type ObstacleLayer, obstaclesOf } from '../../landscape';
import { detCos, detSin } from '../../landscape/det-math';
import { churchyardRect } from '../buildings/church-geometry';
import { obstacleStatus, outcropUnder, polygonsObstacles } from '../core/obstacles';
import { sacredSitesFor } from '../people/desecration';
import { CHURCH, FOREST_CROWN_MARGIN_M } from '../rules';
import type { ChurchDims, ChurchType, Position } from '../types';
import { unreservedTrees, sacredUnder } from './placement-dwellings';
import { withWarning } from './placement-fields';
import { checkFootprintTerrain, freeShape, ownedLand } from './placement-geometry';
import {
  FIELD_LAND,
  checkFootprintFree,
  freeForestClearing,
  groveTilesUnder,
  takenLandUnder,
  takenLandWarning,
} from './placement-land';
import { type Point } from './polygon';
import { churchLocalRect, churchyardWorld } from './church-plot';

export { churchyardWorld } from './church-plot';
import { type PlacementVillage, type SacredPlacementCheck, fail } from './placement-types';

/** Kontrola umístění kostela – stejné údaje jako u humna (`startChurch` je dostane v `site`). */
export type ChurchPlacementCheck = SacredPlacementCheck;

/** Krok vzorkování terénu pod kostelem (m). */
const SAMPLE_STEP_M = 2;

/** Body terénu pod kostelem (obdélník vnějšího obrysu bez pásu hřbitůvku, po `SAMPLE_STEP_M`). */
function churchSamples(type: ChurchType, dims: ChurchDims, position: Position): Point[] {
  const rect = churchyardRect(type, dims);
  const belt = 2 * CHURCH.churchyardBeltM;
  const length = Math.max(0, rect.length - belt);
  const width = Math.max(0, rect.width - belt);
  const nx = Math.max(1, Math.ceil(length / SAMPLE_STEP_M));
  const nz = Math.max(1, Math.ceil(width / SAMPLE_STEP_M));
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  const out: Point[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const x = rect.offsetX - length / 2 + (length * i) / nx;
      const z = -width / 2 + (width * j) / nz;
      out.push([position.x + x * c - z * s, position.z + x * s + z * c]);
    }
  }
  return out;
}

/**
 * Smí kostel stát na místě (churches.md – Stavba)? Celý obdélník hřbitůvku (`churchyardRect`,
 * natočený) volný jako u humna – nepřekrývá obydlí, jiný kostel, humno, modlu, svatyni, hřbitov,
 * ohradu, sad, milíř ani branku; na pole smí (díly se zmenší, `takenLand`); terén pod kostelem
 * v krajině, ne ve vodě a dost rovný (`checkFootprintTerrain`); les a překážky v obdélníku
 * osadníci odstraní (`obstacleCost`), dospělé stromy dají klády. Posvátná místa ve vsi
 * pokřtěného rodu nebrání (`playerPlacementVillage`) – vykácený háj zapíše `applyBuildIntent`.
 */
export function checkChurchPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  type: ChurchType,
  dims: ChurchDims,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): ChurchPlacementCheck {
  const none = {
    obstacleCost: 0,
    obstacleIds: [],
    clearedTrees: 0,
    obstacleCounts: {},
    takenLand: [],
  };
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return { ...fail('Neplatná poloha – kostel.'), ...none };
  }
  const terrain = checkFootprintTerrain(landscape, churchSamples(type, dims, position), 'Kostel');
  if (!terrain.ok) return { ...terrain, ...none };
  const footprint = churchyardWorld(type, dims, position);
  const free = checkFootprintFree(landscape, village, [freeShape(footprint)], FIELD_LAND);
  if (!free.ok) return { ...free, ...none };
  const status = obstacleStatus(village?.obstacleChanges);
  if (outcropUnder(obstacles, status, footprint)) {
    return { ...fail('Stojí tu skalní výchoz – ten osadníci neodstraní.'), ...none };
  }
  const sites = sacredSitesFor(village, obstacles);
  const sacredProblem = sacredUnder(landscape, obstacles, sites, [footprint]);
  if (sacredProblem) return { ...fail(sacredProblem), ...none };
  const rect = churchyardRect(type, dims);
  const margin = 2 * FOREST_CROWN_MARGIN_M;
  const crowned = churchLocalRect(
    position,
    rect.offsetX,
    rect.length + margin,
    rect.width + margin,
  );
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
