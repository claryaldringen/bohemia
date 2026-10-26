import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  villageRoadWalk,
  buildAffordability,
  foundPen,
  HORSE_PEN_NO_SURPLUS,
  penSquaresFromCells,
  placementVillageOf,
  type PenSpecies,
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
  /** Druh zvířat ohrady (oxen.md – Ohrady podle druhu). */
  species: PenSpecies;
  /** Čtverce ohrady – políčka krajiny, nebo čtverce natočené mřížky `grid` (nejvýš 4). */
  cells: TileCell[];
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/**
 * Hráč zahájí stavbu ohrady s přístřeškem, nebo její rozšíření (oxen.md – Ohrady podle druhu; ves
 * se nejdřív dopočítá do dneška). Server umístění ověří znovu (`penSquaresFromCells`); dřevo
 * (6 stromů na čtverec) vezme stavba z hromady, zbytek vyhradí ke kácení, překážky na čtvercích
 * osadníci odstraní hned.
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
      const check = penSquaresFromCells(
        input.landscape,
        placementVillageOf(state, day),
        input.cells,
        input.species,
        obstacles,
        input.grid,
      );
      if (!check.check.ok) {
        return { ok: false, reason: check.check.reason ?? 'Sem ohrada nepatří.' };
      }
      try {
        return {
          ok: true,
          state: foundPen(
            state,
            day,
            {
              species: input.species,
              squares: check.squares,
              ...(check.grid ? { grid: check.grid } : {}),
              takenLand: check.takenLand,
            },
            obstacles,
            villageRoadWalk(state, input.landscape),
          ),
        };
      } catch (error) {
        // chybí obilí na koně, nebo dřevo mezitím vyhradila jiná stavba
        if (error instanceof RangeError) {
          return {
            ok: false,
            reason: error.message === HORSE_PEN_NO_SURPLUS ? HORSE_PEN_NO_SURPLUS : NO_WOOD,
          };
        }
        throw error;
      }
    },
  );
}
