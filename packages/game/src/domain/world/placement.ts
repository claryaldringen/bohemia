import type { GridCell } from '../village/world-grid';
import { SEAT_CELL, sameCell } from '../village/world-grid';
import { WORLD } from './rules-world';

/** Obsazené políčko mřížky světa a hráč, jemuž patří. */
export interface OccupiedCell {
  cell: GridCell;
  ownerId: string;
}

/** Žádost o místo: nezávislý (od středu světa) nebo pozvaný (nejblíž sídlu pána). */
export type PlacementRequest = { kind: 'independent' } | { kind: 'invited'; lordSeat: GridCell };

/** Vzdálenost v krocích mřížkou v 8 směrech (Čebyševova). */
export function cellDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Políčka přesně `radius` kroků od středu; pevné pořadí od severu (+y) po směru hodinových
 * ručiček. Poloměr 0 = jen střed.
 */
export function ringCells(center: GridCell, radius: number): GridCell[] {
  if (radius <= 0) return [{ x: center.x, y: center.y }];
  const offsets: GridCell[] = [];
  for (let dx = 0; dx <= radius; dx++) offsets.push({ x: dx, y: radius }); // sever -> severovýchod
  for (let dy = radius - 1; dy >= -radius; dy--) offsets.push({ x: radius, y: dy }); // východ
  for (let dx = radius - 1; dx >= -radius; dx--) offsets.push({ x: dx, y: -radius }); // jih
  for (let dy = -radius + 1; dy <= radius; dy++) offsets.push({ x: -radius, y: dy }); // západ
  for (let dx = -radius + 1; dx < 0; dx++) offsets.push({ x: dx, y: radius }); // severozápad
  return offsets.map((o) => ({ x: center.x + o.x, y: center.y + o.y }));
}

/** Nejbližší volné políčko od cíle, které je od všech obsazených aspoň `gap` daleko. */
export function placeNewPlayer(
  occupied: readonly OccupiedCell[],
  request: PlacementRequest,
): GridCell {
  const target = request.kind === 'invited' ? request.lordSeat : SEAT_CELL;
  const gap: number = request.kind === 'invited' ? WORLD.invitedGap : WORLD.independentGap;
  // Strop hledání: dost velký, aby prstenec vždy přesáhl všechna obsazená políčka + odstup.
  let limit = gap;
  for (const o of occupied) limit = Math.max(limit, cellDistance(target, o.cell) + gap);
  for (let radius = 0; radius <= limit; radius++) {
    for (const cell of ringCells(target, radius)) {
      if (occupied.some((o) => sameCell(o.cell, cell) || cellDistance(o.cell, cell) < gap))
        continue;
      return cell;
    }
  }
  // Nedosažitelné: na prstenci `limit` je vždy volno.
  throw new Error('Nenalezeno volné políčko mřížky světa');
}
