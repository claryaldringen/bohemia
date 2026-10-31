import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  applyBuildIntent,
  type PenSpecies,
  type SquareGrid,
  type TileCell,
} from '../domain/village';
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
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'pen',
        species: input.species,
        cells: input.cells,
        grid: input.grid,
      }),
  );
}
