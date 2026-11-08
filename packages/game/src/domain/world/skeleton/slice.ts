import {
  comparePorts,
  type MapSide,
  type SkeletonRiverPort,
  type SkeletonSlice,
  type SkeletonTrailPort,
} from '../../landscape/skeleton/types';
import type { GridCell } from '../../village/world-grid';
import {
  Drain,
  drainOf,
  drainTargetOf,
  riverWidthM,
  type SkeletonCache,
  skeletonContext,
  upstreamOf,
} from './drainage';
import { riverPortAtBase, sideTowards, trailPortAt } from './ports';
import { SKELETON } from './rules-skeleton';
import { trailSides } from './trails';

// Výřez kostry políčka (world-skeleton.md – Kostra jako čistá funkce světa): body řek (a od
// Úlohy 2 stezek) na okraji mapy. Spočítá se z okolí políčka, bez ohledu na to, co už ve světě je.

/** Sousedé, kteří do políčka mohou odtékat: sever (odtéká na jih), východ (na západ), západ (na východ). */
const UPSTREAM_NEIGHBOURS: readonly (readonly [dx: number, dy: number, into: Drain])[] = [
  [0, 1, Drain.S],
  [1, 0, Drain.W],
  [-1, 0, Drain.E],
];

/**
 * Body řek na okraji mapy políčka: vtok od každého souseda s řekou, který sem odtéká, a výtok,
 * když políčkem teče řeka. Šířka bodu je šířka horního políčka hrany.
 */
export function riverPorts(ctx: SkeletonCache, cell: GridCell): SkeletonRiverPort[] {
  const ports: SkeletonRiverPort[] = [];
  for (const [dx, dy, into] of UPSTREAM_NEIGHBOURS) {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    if (drainOf(ctx, nx, ny) !== into) continue;
    const widthM = riverWidthM(upstreamOf(ctx, nx, ny));
    if (widthM === null) continue;
    const neighbour = { x: nx, y: ny };
    ports.push({
      side: sideTowards(cell, neighbour),
      at: riverPortAtBase(ctx.base, cell, neighbour),
      widthM,
      flow: 'in',
    });
  }
  const widthM = riverWidthM(upstreamOf(ctx, cell.x, cell.y));
  if (widthM !== null) {
    const target = drainTargetOf(ctx, cell.x, cell.y);
    ports.push({
      side: sideTowards(cell, target),
      at: riverPortAtBase(ctx.base, cell, target),
      widthM,
      flow: 'out',
    });
  }
  return ports.sort(comparePorts);
}

const SIDE_STEP: Readonly<Record<MapSide, readonly [number, number]>> = {
  N: [0, 1],
  E: [1, 0],
  S: [0, -1],
  W: [-1, 0],
};

/** Body stezky na okraji mapy – na hraně s řekou aspoň `trailGap` od bodu řeky. */
function trailPorts(
  worldSeed: number,
  cell: GridCell,
  rivers: readonly SkeletonRiverPort[],
): SkeletonTrailPort[] {
  const ports: SkeletonTrailPort[] = [];
  for (const side of trailSides(worldSeed, cell)) {
    const [dx, dy] = SIDE_STEP[side];
    const riverAt = rivers.find((p) => p.side === side)?.at ?? null;
    ports.push({
      side,
      at: trailPortAt(worldSeed, cell, { x: cell.x + dx, y: cell.y + dy }, riverAt),
    });
  }
  return ports.sort(comparePorts);
}

/**
 * Výřez kostry mapy na políčku `cell` – null, když mapou nevede řeka ani stezka (suchá mapa).
 * Mezipaměť smí patřit jen stejnému seedu světa (jinak `RangeError`).
 */
export function skeletonSlice(
  worldSeed: number,
  cell: GridCell,
  cache?: SkeletonCache,
): SkeletonSlice | null {
  const ctx = skeletonContext(worldSeed, cache);
  const rivers = riverPorts(ctx, cell);
  const trails = trailPorts(worldSeed, cell, rivers);
  if (rivers.length === 0 && trails.length === 0) return null;
  return { world: SKELETON.world, rivers, trails };
}
