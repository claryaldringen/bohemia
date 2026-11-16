import { nearestForestOf } from './ladders';
import { marchCellAt, type MarchGrid, type Pos } from './march-grid';
import { marchAreaOf, marchAreas } from './march-search';

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
 * Totéž jen mezi dveřmi dosažitelnými z buňky pod `from` – les jen za řekou bez brodu se
 * nepočítá. Bez dosažitelných dveří null. Dosažitelnost je číslo souvislé oblasti (`marchAreas`,
 * jednou na mřížku, dotaz O(1)) – žádné zaplavení mřížky na volání. Start v neprůchodné buňce
 * (útěk z hradby, muž ve vodě) se bere jako průchodný, jako ve `reachableCells`: dosažitelné jsou
 * oblasti jeho průchodných sousedů (úhlopříčně jen kolem průchodných rohů).
 */
export function nearestReachableForest(grid: MarchGrid, from: Pos): Pos | null {
  const start = marchCellAt(grid, from);
  const areas = marchAreas(grid);
  const own = marchAreaOf(areas, grid.width, start);
  if (own !== 0)
    return nearestForestOf(grid, from, (c) => marchAreaOf(areas, grid.width, c) === own);
  const w = grid.width;
  const i = start % w;
  const j = (start - i) / w;
  const passable = (ii: number, jj: number): boolean =>
    ii >= 0 && jj >= 0 && ii < w && jj < grid.height && grid.pace[jj * w + ii]! > 0;
  const open = new Set<number>();
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if ((di === 0 && dj === 0) || !passable(i + di, j + dj)) continue;
      if (di !== 0 && dj !== 0 && (!passable(i + di, j) || !passable(i, j + dj))) continue;
      open.add(marchAreaOf(areas, w, (j + dj) * w + i + di));
    }
  }
  if (open.size === 0) return null;
  return nearestForestOf(grid, from, (c) => open.has(marchAreaOf(areas, w, c)));
}
