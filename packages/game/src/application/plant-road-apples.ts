import { obstaclesOf, type Landscape } from '../domain/landscape';
import { roadApplesOption, startRoadApples } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlantRoadApplesInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  roadId: number;
}

/** Úsek neexistuje (mezitím zarostl). */
export const NO_ROAD = 'Cesta neexistuje.';

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
    input.settlementId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const option = roadApplesOption(state, input.roadId, day, input.landscape, obstacles);
      if (!option) return { ok: false, reason: NO_ROAD };
      if (option.blocked) return { ok: false, reason: option.blocked };
      return {
        ok: true,
        state: startRoadApples(state, day, input.roadId, input.landscape, obstacles),
      };
    },
  );
}
