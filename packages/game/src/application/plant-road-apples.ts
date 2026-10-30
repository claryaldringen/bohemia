import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvod odmítnutí žije v doméně (build-intent.ts) – use-case ho dál exportuje pro web a testy
export { NO_ROAD } from '../domain/village';

export interface PlantRoadApplesInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  roadId: number;
}

/**
 * Hráč u vybraného úseku zadá „Vysadit jabloně“ (roads.md – Vysazení jabloní; ves se nejdřív
 * dopočítá do dneška): jabloně na volných místech podél úseku vysadí vesničané v oknech jara
 * a podzimu. Server výsadbu ověří znovu (`roadApplesOption`) a vrátí důvod česky, když nejde.
 */
export function plantApplesAlongRoad(
  deps: { villages: VillageRepository },
  input: PlantRoadApplesInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'road-apples',
        roadId: input.roadId,
      }),
  );
}
