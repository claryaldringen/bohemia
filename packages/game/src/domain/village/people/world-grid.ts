import type { Direction8 } from '../types';

// Mřížka map (war.md – Svět, migration.md – fáze 4): každé sídlo (mapa) leží na políčku mřížky
// – sloupec x roste na východ, řádek y na sever (jako osa +z krajiny). Sousední mapa ve směru
// leží o jedno políčko vedle; sídelní sídlo hráče je v (0, 0).

/** Políčko mřížky map – sloupec a řádek. */
export interface GridCell {
  x: number;
  y: number;
}

/** Poloha sídelního sídla v mřížce – první mapa hráče (návrh Clauda). */
export const SEAT_CELL: GridCell = { x: 0, y: 0 };

/** O kolik políček mřížky se posune mapa ve směru (sever +y, východ +x). */
export const GRID_STEPS: Readonly<Record<Direction8, GridCell>> = {
  N: { x: 0, y: 1 },
  NE: { x: 1, y: 1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: -1 },
  S: { x: 0, y: -1 },
  SW: { x: -1, y: -1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: 1 },
};

/** Opačný směr – odkud přišli lidé z mapy ve směru `direction`. */
export const OPPOSITE: Readonly<Record<Direction8, Direction8>> = {
  N: 'S',
  NE: 'SW',
  E: 'W',
  SE: 'NW',
  S: 'N',
  SW: 'NE',
  W: 'E',
  NW: 'SE',
};

/** Sousední políčko mřížky ve směru `direction`. */
export function neighbourCell(cell: GridCell, direction: Direction8): GridCell {
  const step = GRID_STEPS[direction];
  return { x: cell.x + step.x, y: cell.y + step.y };
}

/** Směr ze sousedního políčka `from` na `to`, nebo null, když spolu nesousedí. */
export function directionBetween(from: GridCell, to: GridCell): Direction8 | null {
  for (const [direction, step] of Object.entries(GRID_STEPS) as [Direction8, GridCell][]) {
    if (from.x + step.x === to.x && from.y + step.y === to.y) return direction;
  }
  return null;
}

/** Jsou dvě políčka mřížky stejná? */
export function sameCell(a: GridCell, b: GridCell): boolean {
  return a.x === b.x && a.y === b.y;
}
