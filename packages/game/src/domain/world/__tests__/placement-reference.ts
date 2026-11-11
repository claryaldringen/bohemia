/** Stará (lineární) verze umístění – reference pro test rovnosti a měření; v produkci se nepoužívá. */
import type { GridCell } from '../../village/people/world-grid';
import { SEAT_CELL, sameCell } from '../../village/people/world-grid';
import type { OccupiedCell, PlacementRequest } from '../placement';
import { cellDistance, ringCells } from '../placement';
import { WORLD } from '../rules-world';

/** Cílová políčka, od nichž se hledá po prstencích (newcomers.md – Svobodný nováček). */
function placementTargets(request: PlacementRequest): readonly GridCell[] {
  if (request.kind === 'invited') return [request.lordSeat];
  return request.sameLanguage && request.sameLanguage.length > 0
    ? request.sameLanguage
    : [SEAT_CELL];
}

/**
 * Nejbližší posun shluku vsí (místní souřadnice, první = sídlo), kde mají všechny buňky shluku
 * odstup aspoň `gap` od cizích políček. Hledá po prstencích kolem cílů (víc cílů = nejblíž
 * kterémukoli) a zachovává vzájemnou polohu buněk (newcomers.md – Odříznutá krajina).
 */
export function placeClusterReference(
  occupied: readonly OccupiedCell[],
  cluster: readonly GridCell[],
  request: PlacementRequest,
): { offset: GridCell; cells: GridCell[] } {
  const first = cluster[0];
  if (!first) throw new Error('Prázdný shluk vsí');
  const targets = placementTargets(request);
  const gap: number = request.kind === 'invited' ? WORLD.invitedGap : WORLD.independentGap;
  const local = cluster.map((c) => ({ x: c.x - first.x, y: c.y - first.y }));
  // Strop hledání: dost velký, aby prstenec vždy přesáhl všechna obsazená políčka + odstup.
  let limit = gap;
  for (const t of targets)
    for (const o of occupied) limit = Math.max(limit, cellDistance(t, o.cell) + gap);
  const extent = local.reduce((m, l) => Math.max(m, cellDistance(l, { x: 0, y: 0 })), 0);
  limit += extent;
  for (let radius = 0; radius <= limit; radius++) {
    for (const target of targets) {
      for (const seat of ringCells(target, radius)) {
        const cells = local.map((l) => ({ x: seat.x + l.x, y: seat.y + l.y }));
        const fits = cells.every(
          (cell) =>
            !occupied.some((o) => sameCell(o.cell, cell) || cellDistance(o.cell, cell) < gap),
        );
        if (fits) return { offset: seat, cells };
      }
    }
  }
  // Nedosažitelné: na prstenci `limit` je vždy volno.
  throw new Error('Nenalezeno volné políčko mřížky světa');
}
