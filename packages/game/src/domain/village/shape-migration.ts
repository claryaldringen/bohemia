// Převod vsí uložených před variantami rozměrů (population.md – Varianty rozměrů; Martin,
// GitHub #1): hotová i rozestavěná obydlí a dílny dostanou variantu ze své polohy. Kdyby větší
// varianta zasáhla jinou stavbu, výchoz nebo posvátné místo, zůstane stavba v dnešním tvaru
// (`plainShape`). Překážky, které větší vyklízená plocha volného domu nově zabere, se odstraní
// (dům v nich nesmí stát – práci převod nestojí, dospělé stromy dají klády jako u pozemků
// `withPlots`); už vyklizené překážky menšího domu se nevracejí.
import { obstaclesOf, type Landscape, type ObstacleLayer } from '../landscape';
import { recordClearedObstacles } from './obstacles';
import {
  dwellingShapeFits,
  placementVillageOf,
  type PlacedDwelling,
  type PlacementVillage,
} from './placement';
import type { VillageState } from './types';
import { addLogs, logsFromClearedTrees } from './wood';

/** Ves uložená dřív – stavby dostanou variantu rozměrů, nebo příznak dnešního tvaru (jednou). */
export function withDwellingShapes(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): VillageState {
  if (state.shapesChecked) return state;
  const next = structuredClone(state);
  next.shapesChecked = true;
  const day = Math.max(0, next.lastDay);
  const base = placementVillageOf(next, day);
  const cleared = new Set<number>();
  // ostatní stavby s tvarem, jaký už mají (stavby před touto jsou rozhodnuté)
  const without = (except: { dwellingId?: number; constructionId?: number }): PlacementVillage => ({
    ...base,
    dwellings: next.dwellings.filter((d) => d.id !== except.dwellingId),
    constructions: next.constructions.filter((c) => c.id !== except.constructionId),
  });
  const settle = (placed: PlacedDwelling, village: PlacementVillage): boolean => {
    const fit = dwellingShapeFits(landscape, village, placed, obstacles);
    if (!fit.ok) return false;
    const trees = fit.treeIds.filter((id) => !cleared.has(id)).length;
    const ids = fit.obstacleIds.filter((id) => !cleared.has(id));
    for (const id of ids) cleared.add(id);
    if (ids.length > 0) recordClearedObstacles(next, ids, day);
    const logs = logsFromClearedTrees(trees);
    if (logs > 0) addLogs(next, logs);
    return true;
  };
  for (const d of [...next.dwellings].sort((a, b) => a.id - b.id)) {
    const placed: PlacedDwelling = {
      type: d.type,
      position: d.position,
      ...(d.plot ? { plot: d.plot } : {}),
      ...(d.workshop ? { craft: d.workshop.craft } : {}),
    };
    if (!settle(placed, without({ dwellingId: d.id }))) d.plainShape = true;
  }
  for (const c of [...next.constructions].sort((a, b) => a.id - b.id)) {
    if (c.kind !== 'dwelling' || c.dwellingType === null || c.position === null) continue;
    const placed: PlacedDwelling = {
      type: c.dwellingType,
      position: c.position,
      ...(c.plot ? { plot: c.plot } : {}),
      ...(c.craft ? { craft: c.craft } : {}),
    };
    if (!settle(placed, without({ constructionId: c.id }))) c.plainShape = true;
  }
  return next;
}
