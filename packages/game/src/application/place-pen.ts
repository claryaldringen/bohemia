import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  villageRoadWalk,
  buildAffordability,
  checkPenPlacement,
  foundPen,
  placementVillageOf,
  type SquareGrid,
  type TileCell,
} from '../domain/village';
import { NO_WOOD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlacePenInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverec ohrady – políčko krajiny, nebo čtverec natočené mřížky `grid`. */
  cell: TileCell;
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/**
 * Hráč zahájí stavbu ohrady s přístřeškem (oxen.md; ves se nejdřív dopočítá do dneška). Server
 * umístění ověří znovu (`checkPenPlacement`); dřevo (6 stromů) vezme stavba z hromady, zbytek
 * vyhradí ke kácení, překážky na čtverci osadníci odstraní hned.
 */
export function placePen(
  deps: { villages: VillageRepository },
  input: PlacePenInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      if (!buildAffordability(state, 'pen', obstacles).affordable) {
        return { ok: false, reason: NO_WOOD };
      }
      const check = checkPenPlacement(
        input.landscape,
        placementVillageOf(state, day),
        input.cell,
        obstacles,
        input.grid,
      );
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem ohrada nepatří.' };
      try {
        return {
          ok: true,
          state: foundPen(
            state,
            day,
            {
              cell: { x: input.cell.x, y: input.cell.y },
              ...(input.grid ? { grid: input.grid } : {}),
              x: check.x,
              z: check.z,
              obstacleCost: check.obstacleCost,
              obstacleIds: check.obstacleIds,
              clearedTrees: check.clearedTrees,
              takenLand: check.takenLand,
            },
            obstacles,
            villageRoadWalk(state, input.landscape),
          ),
        };
      } catch (error) {
        // dřevo mezitím vyhradila jiná stavba
        if (error instanceof RangeError) return { ok: false, reason: NO_WOOD };
        throw error;
      }
    },
  );
}
