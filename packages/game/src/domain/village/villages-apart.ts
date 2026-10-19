import { obstaclesOf, tileCenterWorld, type Landscape, type ObstacleLayer } from '../landscape';
import { checkDwellingPlacement } from './placement';
import { NEW_VILLAGE_MIN_DISTANCE_M } from './rules';
import { fieldGrids } from './squares';
import type { Position, SquareGrid, VillageState } from './types';

// Víc vsí na téže mapě (migration.md – Odchod do nové vsi, Víc vsí jednoho hráče): nová ves stojí
// nejméně NEW_VILLAGE_MIN_DISTANCE_M od staveb jiných vsí. Vsi na jedné mapě o sobě jinak zatím
// nevědí (scéna kreslí jen vybranou ves) – vzdálenost je drží od sebe.

/** Bod stavby vsi ve světě (m). */
export interface VillagePoint {
  x: number;
  z: number;
}

/**
 * Stavby vsi jako body ve světě: obydlí, staveniště, posvátné stavby, čtverce polí, hřbitovů,
 * sadů a ohrad (střed čtverce – `cellCenter` převede čtverec na bod; natočené pole a sad předají
 * i svou mřížku – fields.md, Natočené stavby).
 */
export function villagePoints(
  state: VillageState,
  cellCenter: (x: number, y: number, grid?: SquareGrid) => VillagePoint,
): VillagePoint[] {
  const grids = fieldGrids(state);
  const points: VillagePoint[] = [];
  for (const d of state.dwellings) points.push({ x: d.position.x, z: d.position.z });
  for (const c of state.constructions) {
    if (c.position) points.push({ x: c.position.x, z: c.position.z });
  }
  for (const b of state.sacredBuildings ?? []) points.push({ x: b.position.x, z: b.position.z });
  for (const p of state.parts) {
    if (p.cell) points.push(cellCenter(p.cell.x, p.cell.y, grids.get(p.fieldId)));
  }
  for (const c of state.cemeteries ?? [])
    for (const s of c.squares) points.push({ x: s.x, z: s.z });
  for (const o of state.orchards ?? []) {
    for (const s of o.squares) points.push(cellCenter(s.cell.x, s.cell.y, o.grid));
  }
  for (const pen of state.pens ?? []) points.push({ x: pen.x, z: pen.z });
  return points;
}

/** Vzdálenost bodu k nejbližší stavbě z `points` (m); bez staveb nekonečno. */
export function distanceToVillages(point: VillagePoint, points: readonly VillagePoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) best = Math.min(best, Math.hypot(point.x - p.x, point.z - p.z));
  return best;
}

/**
 * Místo pro první zemnici další vsi na téže mapě – nejbližší střed políčka k místu vsi krajiny
 * (`villageSite`), kam zemnice smí (`checkDwellingPlacement` – jen na louku, les si vesničané sami
 * nevyklučí) a který leží aspoň
 * NEW_VILLAGE_MIN_DISTANCE_M od staveb jiných vsí (`others`). Hledá po prstencích políček od místa
 * vsi, deterministicky. Null, když takové místo na mapě není.
 */
export function freeVillageSite(
  landscape: Landscape,
  others: readonly VillagePoint[],
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
        if (distanceToVillages(center, others) < NEW_VILLAGE_MIN_DISTANCE_M) continue;
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
