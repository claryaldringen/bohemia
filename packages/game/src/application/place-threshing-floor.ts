import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  villageRoadWalk,
  buildAffordability,
  checkThreshingFloorPlacement,
  placementVillageOf,
  startThreshingFloor,
  type Position,
} from '../domain/village';
import { CANNOT_AFFORD, NO_WOOD } from './place-dwelling';
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
    (state) => {
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const { affordable, missing } = buildAffordability(state, 'threshing-floor', obstacles);
      if (!affordable) return { ok: false, reason: missing.wood ? NO_WOOD : CANNOT_AFFORD };
      const position = { ...input.position };
      const check = checkThreshingFloorPlacement(
        input.landscape,
        placementVillageOf(state, day),
        position,
        obstacles,
      );
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem humno nepatří.' };
      try {
        return {
          ok: true,
          state: startThreshingFloor(state, day, position, obstacles, {
            obstacleCost: check.obstacleCost,
            obstacleIds: check.obstacleIds,
            clearedTrees: check.clearedTrees,
            takenLand: check.takenLand,
            walk: villageRoadWalk(state, input.landscape),
          }),
        };
      } catch (error) {
        // stromy nestačí ke kácení (vyhradila je mezitím jiná stavba)
        if (error instanceof RangeError) return { ok: false, reason: NO_WOOD };
        throw error;
      }
    },
  );
}
