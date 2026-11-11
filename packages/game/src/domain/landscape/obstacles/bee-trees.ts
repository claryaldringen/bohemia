import { length2 } from '../det-math';
import { beeTreeSpots } from '../premium/trees';
import { hashFor, type ScatterContext } from './context';
import { obstacleId, type ObstaclePlacement, type TreeLook } from './types';

/**
 * Kolem brtě (m) nestojí jiná překážka – starý dub má širokou korunu a v hustém lese by zapadl
 * mezi okolní stromy (návrh Clauda).
 */
const BEE_TREE_CLEARING_M = 6.5;

/**
 * Brtě prémiové krajiny „Brtě a lesní včely“ – staré mohutné duby na místech z `beeTreeSpots`
 * (stejná místa vrací prvky typu). Krajina bez typu (i jiný typ) je nemá.
 */
export function beeTreePlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const spots = beeTreeSpots(ctx.landscape);
  if (spots.length === 0) return [];
  const hash = hashFor(ctx, 'bee-trees');
  return spots.map((spot) => ({
    id: obstacleId('beeTree', spot.cell),
    kind: 'tree',
    look: `oak-large-${1 + Math.min(2, Math.floor(hash(spot.cell, 0, 1) * 3))}` as TreeLook,
    x: spot.x,
    z: spot.z,
    rotation: hash(spot.cell, 0, 2) * Math.PI * 2,
    scale: 1.25 + hash(spot.cell, 0, 3) * 0.2,
  }));
}

/** Překážky dál než BEE_TREE_CLEARING_M od všech brtí. */
export function clearAroundBeeTrees(
  placements: ObstaclePlacement[],
  bees: readonly ObstaclePlacement[],
): ObstaclePlacement[] {
  return placements.filter((p) =>
    bees.every((b) => length2(p.x - b.x, p.z - b.z) >= BEE_TREE_CLEARING_M),
  );
}
