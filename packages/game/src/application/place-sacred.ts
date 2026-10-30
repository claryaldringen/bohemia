import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type Position, type SacredBuildingKind } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvody odmítnutí žijí v doméně (build-intent.ts) – use-case je dál exportuje pro web a testy
export { NO_OAKS, SHRINE_EXISTS } from '../domain/village';

export interface PlaceSacredBuildingInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  kind: SacredBuildingKind;
  position: Position;
}

/**
 * Hráč zahájí stavbu dřevěné modly nebo svatyně (happiness.md; ves se nejdřív dopočítá do
 * dneška). Server umístění ověří znovu; stavba vyhradí nejbližší dospělé duby a skácí je jako
 * první část práce, překážky na půdorysu osadníci odstraní hned.
 */
export function placeSacredBuilding(
  deps: { villages: VillageRepository },
  input: PlaceSacredBuildingInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'sacred',
        building: input.kind,
        position: input.position,
      }),
  );
}
