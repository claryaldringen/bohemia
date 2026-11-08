import type { MapSide } from './types';

// Body kostry na mapě (world-skeleton.md – Body na okraji): políčko mapy, kde bod řeky nebo
// stezky leží. Sever = +y mřížky světa = +z mapy = poslední řádek políček (`tileCenterWorld`:
// z roste s y); východ = +x = poslední sloupec. `at` se počítá od západu (strany N, S) a od jihu
// (strany E, W) – na mapě tedy x, resp. y políčka.

/** Políčko mapy (`size` × `size`) na okraji, kde leží bod `at` strany `side`. */
export function portTile(side: MapSide, at: number, size: number): { x: number; y: number } {
  if (!Number.isInteger(at) || at < 0 || at >= size) {
    throw new RangeError(`Bod okraje ${side}${at} leží mimo mapu ${size} × ${size}.`);
  }
  switch (side) {
    case 'N':
      return { x: at, y: size - 1 };
    case 'S':
      return { x: at, y: 0 };
    case 'E':
      return { x: size - 1, y: at };
    case 'W':
      return { x: 0, y: at };
  }
}

/** Jednotkový směr od strany `side` dovnitř mapy (po políčkách). */
export function inwardOf(side: MapSide): { x: number; y: number } {
  switch (side) {
    case 'N':
      return { x: 0, y: -1 };
    case 'S':
      return { x: 0, y: 1 };
    case 'E':
      return { x: -1, y: 0 };
    case 'W':
      return { x: 1, y: 0 };
  }
}
