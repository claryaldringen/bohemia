import { nearestForestOf } from './ladders';
import { marchCellAt, type MarchGrid, type Pos } from './march-grid';
import { reachableCells } from './march-search';

// Dveře hustého lesa (war.md – Obránci – postoje a útěk; plán 2026-11-16-dense-forest – Rozhodnutí
// 10; Martin 16. 11. 2026: vesničané utečou do hustého lesa a zmizí jako do budovy, vojsko je
// nenajde ani nepronásleduje). Hustý les je neprůchodný, lidé tedy mizí u jeho okraje.

/**
 * Dveře lesa: střed nejbližší průchodné buňky, která v 8 směrech sousedí s buňkou hustého lesa
 * (`MARCH_FOREST` bez průseku, `pace` 0); při shodě nižší index. Index po přihrádkách je jeden na
 * mřížku (`nearestForestOf`). Bez lesa null.
 */
export function nearestForestDoor(grid: MarchGrid, from: Pos): Pos | null {
  return nearestForestOf(grid, from);
}

/**
 * Totéž jen mezi buňkami dosažitelnými z buňky pod `from` (`reachableCells`) – les jen za řekou
 * bez brodu se nepočítá. Bez dosažitelných dveří null.
 */
export function nearestReachableForest(grid: MarchGrid, from: Pos): Pos | null {
  const reach = reachableCells(grid, marchCellAt(grid, from));
  return nearestForestOf(grid, from, (c) => reach[c] === 1);
}
