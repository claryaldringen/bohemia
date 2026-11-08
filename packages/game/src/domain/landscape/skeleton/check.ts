import { length2 } from '../det-math';
import { lineKeepsAway } from '../premium/route';
import type { Landscape } from '../types';
import { tileCenterWorld } from '../world';
import { skeletonFeaturesOf } from './features';
import { portTile } from './ports-map';
import { riversOf } from './rivers';

/** Řeka ani stezka kostry nevede blíž než tolik metrů od místa pro vesnici (návrh Clauda). */
export const SKELETON_VILLAGE_CLEARANCE_M = 120;
/** Konec trasy leží nejvýš tolik metrů od středu políčka bodu stezky. */
const END_TOLERANCE_M = 15;
/** Konec osy řeky leží nejvýš tolik políček od políčka bodu řeky. */
const RIVER_END_CELLS = 2;

/** Proč mapa neprošla kontrolou kostry. */
export type SkeletonFailure = 'river' | 'route' | 'village';

/**
 * Kontrola kostry (část pásma srovnatelnosti – `checkBand`, world-skeleton.md – Mapa z kostry):
 * řeky spojují body výřezu (každý bod řeky je u začátku nebo konce některé osy), stezka má trasu
 * ke všem bodům a přes řeku vede brodem, a nic z toho nevede do 120 m od vsi. Mapa bez výřezu
 * projde vždy.
 */
export function checkSkeleton(l: Landscape): SkeletonFailure | null {
  const slice = l.skeleton;
  if (slice === undefined) return null;
  const { size } = l;
  const rivers = riversOf(l);

  for (const port of slice.rivers) {
    const tile = portTile(port.side, port.at, size);
    const joined = rivers.some((course) =>
      [course[0], course.at(-1)].some(
        (p) => p !== undefined && length2(p.x - tile.x, p.y - tile.y) <= RIVER_END_CELLS,
      ),
    );
    if (!joined) return 'river';
  }

  const features = skeletonFeaturesOf(l);
  if (slice.trails.length > 0) {
    const route = features?.route ?? null;
    if (route === null || route.legs.length !== slice.trails.length) return 'route';
    const half = (size * l.cellSizeM) / 2;
    for (const [k, trail] of slice.trails.entries()) {
      const tile = portTile(trail.side, trail.at, size);
      const centre = tileCenterWorld(l, tile.x, tile.y);
      const end = route.ends[k]!.point;
      const onEdge =
        Math.abs(Math.abs(end[0]) - half) < 0.01 || Math.abs(Math.abs(end[1]) - half) < 0.01;
      if (!onEdge || length2(end[0] - centre.x, end[1] - centre.z) > END_TOLERANCE_M)
        return 'route';
    }
  }

  const village = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  for (const course of rivers) {
    for (const p of course) {
      const c = tileCenterWorld(l, p.x, p.y);
      if (length2(c.x - village.x, c.z - village.z) < SKELETON_VILLAGE_CLEARANCE_M)
        return 'village';
    }
  }
  for (const leg of features?.route?.legs ?? []) {
    if (!lineKeepsAway(leg, village, SKELETON_VILLAGE_CLEARANCE_M)) return 'village';
  }
  return null;
}
