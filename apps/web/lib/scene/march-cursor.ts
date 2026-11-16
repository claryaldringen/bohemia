import {
  GRID_STEPS,
  MARCH_FOREST,
  forestInterior,
  marchAreaOf,
  marchAreas,
  marchCellAt,
  marchGrid,
  marchReachable,
  nearestPassable,
  withoutClearings,
  type ClearedForest,
  type Direction8,
  type Landscape,
  type MarchGrid,
  type ObstacleLayer,
  type Pos,
} from '@bohemia/game';
import { edgeDirection } from './journey-orders';

// Kurzor nad místem, kam vybraná skupina nedojde (plán 2026-11-16-dense-forest – Otázka na Martina,
// Martin 16. 11. 2026: „Ideální by bylo, kdyby kurzor na místech, kam se nedá dojít, podle toho
// vypadal“): hustý les, voda bez brodu, místo bez spojení s polohou skupiny, okraj mapy bez
// průchodu. Prohlížeč pozná dosažitelnost z téže jemné mřížky a jejích souvislých oblastí
// (`marchAreas`, jen deterministická matematika) – jen vizuální nápověda, rozkaz ověří server.
// Prohlížeč nemá stav vsi, proto mřížka nese krajinu, vrstvu překážek, vymýcený les vsi
// a průseky cest; stavby a opevnění v ní nejsou (server cíl ve stavbě přesouvá k nejbližší
// volné buňce, takže stavba nápovědu nemění). Čistý modul bez Babylonu.

/** Tvar kurzoru nad místem, kam se nedá dojít (CSS) – ikona zákazu jako v 0 A.D. */
export const FORBIDDEN_CURSOR = 'not-allowed';

/**
 * Mřížka pochodu mapy pro kurzor: `marchGrid` bez vsi s `roads` (pevné cesty vsi a pokračování
 * stezek – průseky) a hustý les bez vymýceného lesa vsi `clearing` (paseky, pole, pás opevnění).
 */
export function browserMarchGrid(
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  clearing: ClearedForest | null,
  roads: readonly (readonly Pos[])[],
): MarchGrid {
  const grid = marchGrid(landscape, obstacles, null, { trailContinuations: roads });
  if (!obstacles || !clearing) return grid;
  const dense = withoutClearings(forestInterior(landscape, grid), grid, clearing);
  for (let c = 0; c < grid.flags.length; c++) {
    // jen čistý hustý les (voda, sráz a skála zůstávají) a ne průsek – paseka ho otevře
    if (grid.flags[c] === MARCH_FOREST && dense[c] === 0) {
      grid.pace[c] = 1;
      grid.flags[c] = 0;
    }
  }
  return grid;
}

/**
 * Dojde skupina z `from` k okraji mapy ve směru `direction`? Stejné jako `marchPathToEdge` bez
 * hledání: stojí na okraji, nebo je kus okraje ve směru v téže souvislé oblasti jako buňka, odkud
 * vyrazí. Sousední mapu prohlížeč nezná – chybí-li průchod až na druhé straně, ověří to server.
 */
export function edgeReachable(grid: MarchGrid, from: Pos, direction: Direction8): boolean {
  const step = GRID_STEPS[direction];
  const w = grid.width;
  const h = grid.height;
  const gi = step.x > 0 ? w - 1 : 0;
  const gj = step.y > 0 ? h - 1 : 0;
  const at = marchCellAt(grid, from);
  const i = at % w;
  const j = (at - i) / w;
  if ((step.x === 0 || i === gi) && (step.y === 0 || j === gj)) return true;
  const start = nearestPassable(grid, at, Infinity);
  if (start < 0) return false;
  const areas = marchAreas(grid);
  const area = marchAreaOf(areas, w, start);
  const corner = step.x !== 0 && step.y !== 0;
  const along = corner ? 1 : step.x !== 0 ? h : w;
  for (let k = 0; k < along; k++) {
    const c = corner ? gj * w + gi : step.x !== 0 ? k * w + gi : gj * w + k;
    if (marchAreaOf(areas, w, c) === area) return true;
  }
  return false;
}

/**
 * Nedojde skupina z `from` na místo pod kurzorem `point`? V okrajovém pásu jde o přechod na
 * sousední mapu (`edgeReachable`), jinde o bod mapy (`marchReachable`).
 */
export function cursorBlocked(grid: MarchGrid, from: Pos, point: Pos, mapSizeM: number): boolean {
  const direction = edgeDirection(point, mapSizeM);
  return direction === null
    ? !marchReachable(grid, from, point)
    : !edgeReachable(grid, from, direction);
}
