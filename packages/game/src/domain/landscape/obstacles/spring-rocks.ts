import { length2 } from '../det-math';
import { sacredSpringSpot, SPRINGS } from '../premium/water';
import { hashFor, type ScatterContext } from './context';
import { obstacleId, type DecorObstacleLook, type ObstaclePlacement } from './types';

/**
 * Skalka posvátného pramene (prémiová krajina „Posvátný pramen“, návrh Clauda): nad pramenem
 * do svahu skalní výchoz, kolem pramene mechem porostlé balvany – místo z `sacredSpringSpot`
 * (stejné místo vrací prvek typu). Krajina bez typu (i jiný typ) skalku nemá.
 */
export function springRockPlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const spot = sacredSpringSpot(ctx.landscape);
  if (!spot) return [];
  const hash = hashFor(ctx, 'spring-rocks');
  const across = { x: -spot.uphillZ, z: spot.uphillX };
  const rocks: ObstaclePlacement[] = [
    {
      id: obstacleId('springRock', spot.cell, 0),
      kind: 'outcrop',
      look: hash(spot.cell, 0, 1) < 0.5 ? 'rock-ridge' : 'rock-boulder',
      x: spot.x + spot.uphillX * 3.2,
      z: spot.z + spot.uphillZ * 3.2,
      rotation: hash(spot.cell, 0, 2) * Math.PI * 2,
      scale: 1.1 + hash(spot.cell, 0, 3) * 0.3,
    },
  ];
  // Balvany po stranách pramene a za ním – v kruhu `SPRINGS.rockRadiusM`.
  const offsets: readonly [number, number][] = [
    [1.5, 3.2],
    [1.5, -3.2],
    [-1, 3.6],
  ];
  offsets.forEach(([up, side], k) => {
    const look: DecorObstacleLook = hash(spot.cell, k + 1, 4) < 0.5 ? 'rock-moss-1' : 'rock-moss-2';
    rocks.push({
      id: obstacleId('springRock', spot.cell, k + 1),
      kind: 'boulder',
      look,
      x: spot.x + spot.uphillX * up + across.x * side,
      z: spot.z + spot.uphillZ * up + across.z * side,
      rotation: hash(spot.cell, k + 1, 5) * Math.PI * 2,
      scale: 0.8 + hash(spot.cell, k + 1, 6) * 0.4,
    });
  });
  return rocks;
}

/** Překážky dál než `SPRINGS.clearingM` od pramene a 2,5 m od kamenů skalky. */
export function clearAroundSpring(
  placements: ObstaclePlacement[],
  rocks: readonly ObstaclePlacement[],
  ctx: ScatterContext,
): ObstaclePlacement[] {
  const spot = sacredSpringSpot(ctx.landscape);
  if (!spot) return placements;
  return placements.filter(
    (p) =>
      length2(p.x - spot.x, p.z - spot.z) >= SPRINGS.clearingM &&
      rocks.every((r) => length2(p.x - r.x, p.z - r.z) >= 2.5),
  );
}
