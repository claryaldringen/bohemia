import { obstaclesOf, tileCenterWorld, type Landscape, type ObstacleLayer } from '../../landscape';
import { checkDwellingPlacement } from '../placement/placement';
import type { Position } from '../types';

// Místo první zemnice vsi, kterou si vesničané zakládají sami – příjezd vsi na cestě se správcem
// (steward.md – Kde správce běží). Jedna ves, jedna mapa (Martin 1. 11. 2026: „Jedna ves, jedna
// mapa“) – na mapě jiná ves nestojí, místo hlídá jen krajina.

/**
 * Místo pro první zemnici nové vsi – nejbližší střed políčka k místu vsi krajiny (`villageSite`),
 * kam zemnice smí (`checkDwellingPlacement` – jen na louku, les si vesničané sami nevyklučí). Hledá
 * po prstencích políček od místa vsi, deterministicky. Null, když takové místo na mapě není.
 */
export function freeVillageSite(
  landscape: Landscape,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): Position | null {
  const { size, villageSite } = landscape;
  for (let r = 0; r < size; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = villageSite.x + dx;
        const y = villageSite.y + dy;
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        const center = tileCenterWorld(landscape, x, y);
        const position: Position = { x: center.x, z: center.z, rotation: 0 };
        // vesničané si místo vybírají sami – les nevyklučí (placement.ts – ForestUse)
        const clearForest = false;
        if (
          checkDwellingPlacement(landscape, null, 'zemnice', position, obstacles, { clearForest })
            .ok
        ) {
          return position;
        }
      }
    }
  }
  return null;
}
