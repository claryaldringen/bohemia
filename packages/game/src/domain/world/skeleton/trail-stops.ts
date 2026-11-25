import { deriveSeed } from '../../landscape/random';
import type { GridCell } from '../../village/people/world-grid';
import type { MerchantStop } from '../../village/types';
import { SKELETON } from './rules-skeleton';
import { trailEdgeExists, trailNode } from './trails';

// Zastávky na dálkových stezkách (markets.md – Rozhodnutí plánu 4, bod 5): která spojení políčkem
// vedou a kolikáté na jejich cestě je. Graf kostry se jen čte (`trails.ts`) – bez stavu, bez
// databáze a bez nové soli.

/** Spojení uzlu bloku `block` se sousedním uzlem na východě (`E`) či severu (`N`). */
export interface TrailConnection {
  readonly block: GridCell;
  readonly dir: 'E' | 'N';
}

/**
 * Kudy cesta spojení zahne a kde končí – tvar jako `edgeSegments` v `trails.ts` (world-skeleton.md –
 * Stezky – síť uzlů): z uzlu `from` rovně k hranici bloků, po ní do řádku (u spojení na sever do
 * sloupce) druhého uzlu a rovně do něj.
 */
function pathCorners(
  worldSeed: number,
  from: GridCell,
  { block, dir }: TrailConnection,
): GridCell[] {
  const { block: size } = SKELETON.trail;
  if (dir === 'E') {
    const to = trailNode(worldSeed, { x: block.x + 1, y: block.y });
    const border = (block.x + 1) * size;
    return [{ x: border, y: from.y }, { x: border, y: to.y }, to];
  }
  const to = trailNode(worldSeed, { x: block.x, y: block.y + 1 });
  const border = (block.y + 1) * size;
  return [{ x: from.x, y: border }, { x: to.x, y: border }, to];
}

/** Políčka spojení od uzlu bloku k druhému uzlu v pořadí cesty, každé jednou; null = spojení není. */
export function trailPath(worldSeed: number, connection: TrailConnection): GridCell[] | null {
  if (!trailEdgeExists(worldSeed, connection.block, connection.dir)) return null;
  const from = trailNode(worldSeed, connection.block);
  const path = [from];
  let { x, y } = from;
  for (const corner of pathCorners(worldSeed, from, connection)) {
    while (x !== corner.x || y !== corner.y) {
      x += Math.sign(corner.x - x);
      y += Math.sign(corner.y - y);
      path.push({ x, y });
    }
  }
  return path;
}

/** Zastávky políčka – jedna na každé spojení, které jím vede, seřazené podle `key`; bez stezky []. */
export function trailStops(worldSeed: number, cell: GridCell): MerchantStop[] {
  const bx = Math.floor(cell.x / SKELETON.trail.block);
  const by = Math.floor(cell.y / SKELETON.trail.block);
  const stops: MerchantStop[] = [];
  for (let x = bx - 1; x <= bx + 1; x++) {
    for (let y = by - 1; y <= by + 1; y++) {
      for (const dir of ['E', 'N'] as const) {
        const path = trailPath(worldSeed, { block: { x, y }, dir });
        if (path === null) continue;
        const index = path.findIndex((c) => c.x === cell.x && c.y === cell.y);
        if (index < 0) continue;
        const key = `${x},${y},${dir}`;
        const seed = deriveSeed(worldSeed, 'merchants:' + key);
        stops.push({ key, seed, index, length: path.length });
      }
    }
  }
  return stops.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
