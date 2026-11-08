import { wildTreeAgeYears, type ObstacleChanges, type VillageState } from '@bohemia/game';
import type { SceneWildTree } from './village-view-scene-types';

/**
 * Náletové stromy opuštěných sadů pro scénu (orchard.md – Zdivočelý sad): místo, jabloň, nebo jiná
 * dřevina, a stáří v celých letech (strom se překreslí jen jednou za rok). Stromy, které odstranila
 * stavba nebo pokácení (pařez), chybí.
 */
export function sceneWildTrees(
  state: Pick<VillageState, 'wildTrees'>,
  day: number,
  obstacles: ObstacleChanges,
): SceneWildTree[] {
  const trees = state.wildTrees ?? [];
  if (trees.length === 0) return [];
  const standing = new Map(
    (obstacles.added ?? []).filter((o) => o.kind !== 'stump').map((o) => [o.id, o]),
  );
  return trees.flatMap((t): SceneWildTree[] =>
    standing.has(t.id)
      ? [{ id: t.id, x: t.x, z: t.z, apple: t.apple, age: Math.floor(wildTreeAgeYears(t, day)) }]
      : [],
  );
}
