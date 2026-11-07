import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type Position } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceThreshingFloorInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Střed a natočení humna (volně u kurzoru jako dílna). */
  position: Position;
}

/**
 * Hráč zahájí stavbu humna (production-chains.md – Humno; ves se nejdřív dopočítá do dneška).
 * Ves musí mít dřevo předem; server umístění ověří znovu (`checkThreshingFloorPlacement`), stavba
 * vyhradí nejbližší dospělé stromy a překážky na půdorysu osadníci odstraní hned. Díly polí pod
 * humnem se zmenší (fields.md – Pole jako krajina).
 */
export function placeThreshingFloor(
  deps: { villages: VillageRepository },
  input: PlaceThreshingFloorInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'threshing-floor',
        position: input.position,
      }),
  );
}
