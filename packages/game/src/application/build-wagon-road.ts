import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent } from '../domain/village';
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
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'wagon-road',
        roadId: input.roadId,
      }),
  );
}
