import type { GridCell } from '../domain/village/people/world-grid';
import { reachableGoal, type JourneyOrder, type MarchGrid, type Pos } from '../domain/war';

// Ověření rozkazu výjezdu (lord-control.md – Rozkazy), společné pro první rozkaz (`musterExpedition`)
// a pozdější rozkazy hráče (`commandParty`): měří se vůči políčku a poloze, kde skupina je.

/** Rozkaz, který skupina nesplní: špatný vstup, nebo místo, kam nedojde. */
export type OrderFault = 'invalid' | 'unreachable';

/**
 * Políčko, kam rozkaz míří (pro dotaz na válku); null = rozkaz „domů“. `from` a `start` – políčko a poloha, kde skupina je (u prvního rozkazu domovská ves). Rozkaz, který skupina
 * nesplní (doména `go.pos` nekontroluje): `invalid` – bod mimo mapu, nekonečné číslo, nesousední
 * políčko; `unreachable` – místo, kam skupina vůbec nedojde.
 */
export function orderAim(
  order: JourneyOrder,
  from: GridCell,
  start: Pos,
  gridOf: () => MarchGrid,
): GridCell | null | OrderFault {
  switch (order.kind) {
    case 'home':
      return null;
    case 'cross': {
      const dx = order.cell.x - from.x;
      const dy = order.cell.y - from.y;
      const near = Number.isInteger(dx) && Number.isInteger(dy);
      if (!near || Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
        return 'invalid';
      }
      return { ...order.cell };
    }
    case 'go': {
      const { x, z } = order.pos;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return 'invalid';
      const grid = gridOf();
      const half = grid.cellM / 2;
      const inside =
        x >= grid.originX - half &&
        x <= grid.originX + (grid.width - 1) * grid.cellM + half &&
        z >= grid.originZ - half &&
        z <= grid.originZ + (grid.height - 1) * grid.cellM + half;
      if (!inside) return 'invalid';
      if (reachableGoal(grid, start, order.pos) === null) return 'unreachable';
      return { ...from };
    }
    default:
      // typy druh vyčerpaly, za běhu přijde cokoli od klienta
      order satisfies never;
      return 'invalid';
  }
}
