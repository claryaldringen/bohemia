// Paseka v trasách jako les (forest.md – Klučení lesa pro pole – trasy; Martin 27. 10. 2026):
// kácení, schnutí a pálení na čtvercích rozestavěného pole v lese trasy chodců ani vozů nevidí,
// dokud nedohoří celé pole – pak se mapa tras přepočítá jednou. Scéna paseku ukazuje hned.
import type { ObstacleChange, VillageState } from '../types';

type ClearingLists = Pick<VillageState, 'constructions' | 'parts'>;
type ChangeLists = Pick<VillageState, 'clearedObstacles' | 'felledTrees'>;

/**
 * Překážky na čtvercích rozestavěného pole v lese, které trasy berou jako stojící: dohořelé díly
 * (`Construction.burntObstacles`) a díly, které se ještě kácí, schnou nebo pálí (`FieldPart.clearing`
 * – stromy k pokácení i ostatní překážky čtverce). Bez rozestavěného pole v lese null.
 */
export function clearingRouteObstacles(state: ClearingLists): ReadonlySet<number> | null {
  const fields = new Set<number>();
  const ids: number[] = [];
  for (const c of state.constructions) {
    if (c.kind !== 'field' || c.fieldId === null) continue;
    fields.add(c.fieldId);
    if (c.burntObstacles) ids.push(...c.burntObstacles);
  }
  if (fields.size === 0) return null;
  for (const p of state.parts) {
    if (!p.clearing || p.state !== 'founding' || !fields.has(p.fieldId)) continue;
    if (p.obstacles) ids.push(...p.obstacles);
    for (const t of p.clearing.fell) ids.push(t.id);
  }
  return ids.length > 0 ? new Set(ids) : null;
}

/** Seznamy odstraněných a pokácených překážek bez překážek `hidden` (týž objekt bez nich). */
export function withoutHiddenChanges<T extends ChangeLists>(
  state: T,
  hidden: ReadonlySet<number> | null,
): T {
  if (!hidden) return state;
  const keep = (list: ObstacleChange[] | undefined): ObstacleChange[] | undefined =>
    list?.filter((c) => !hidden.has(c.id));
  const cleared = keep(state.clearedObstacles);
  const felled = keep(state.felledTrees);
  return {
    ...state,
    ...(cleared ? { clearedObstacles: cleared } : {}),
    ...(felled ? { felledTrees: felled } : {}),
  };
}
