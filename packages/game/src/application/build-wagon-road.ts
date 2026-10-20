import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startWagonRoad } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface BuildWagonRoadInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Kterýkoli úsek cesty hráče – jádro si dopočítá řetěz. */
  roadId: number;
}

/**
 * Hráč zadá vozovou cestu (roads.md – Vozová cesta; ves se nejdřív dopočítá do dneška): server
 * najde trasu znovu ze stavu (`planWagonRoad` – stejně jako náhled v prohlížeči), ověří ji
 * a zahájí stavbu po úsecích od vsi ven; když nejde, vrátí důvod česky.
 */
export function buildWagonRoad(
  deps: { villages: VillageRepository },
  input: BuildWagonRoadInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      try {
        return {
          ok: true,
          state: startWagonRoad(state, day, input.roadId, input.landscape, obstacles),
        };
      } catch (error) {
        if (error instanceof RangeError) return { ok: false, reason: error.message };
        throw error;
      }
    },
  );
}
