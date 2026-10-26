import { length2 } from '../../../landscape';
import { ROAD_WALK } from '../../rules';
import type { PathPoint } from '../../paths/network';
import { PATH_WATER, PATH_WETLAND } from '../../paths/terrain';
import { pathCostFactor } from '../../paths/walk-speed';
import { pathWalkLength, type WalkGround } from '../../paths/walking';

/**
 * Původní `groundWalkLength` (před C1 – půda po buňkách a kusy po stejné půdě) – reference pro
 * test `ground-walk-fast`: každý krok úsečky čte příznaky terénu a pole zvlášť.
 */
export function referenceGroundWalkLength(
  ground: WalkGround | null | undefined,
  a: PathPoint,
  b: PathPoint,
  strength = 0,
): number {
  const length = length2(b.x - a.x, b.z - a.z);
  if (!ground || length === 0) return pathWalkLength(length, strength);
  const t = ground.terrain;
  const fields = ground.fields;
  const tread = pathCostFactor(strength);
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const piece = length / n;
  let cost = 0;
  let inWater = false;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const i = Math.round((a.x + (b.x - a.x) * u - t.originX) / t.cellM);
    const j = Math.round((a.z + (b.z - a.z) * u - t.originZ) / t.cellM);
    let speed = 1;
    let water = false;
    let factor = tread;
    if (i >= 0 && j >= 0 && i < t.width && j < t.height) {
      const c = j * t.width + i;
      const flags = t.flags[c]!;
      water = (flags & PATH_WATER) !== 0;
      if (flags & PATH_WETLAND) speed = ROAD_WALK.wetSpeed;
      if (fields) {
        speed = Math.min(speed, fields.speed[c]!);
        if (fields.crop[c]) factor = 1;
      }
    }
    if (water && !inWater) cost += ROAD_WALK.fordExtraM;
    inWater = water;
    cost += (piece / speed) * factor;
  }
  return cost;
}
