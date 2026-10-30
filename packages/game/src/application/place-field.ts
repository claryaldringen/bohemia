import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type SquareGrid, type TileCell } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceFieldInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce pole – políčka krajiny, u natočeného pole čtverce v jeho mřížce `grid`. */
  cells: TileCell[];
  /** Natočená mřížka pole (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/** Hráč založí nové pole ze čtverců (ves se nejdřív dopočítá do dneška). */
export function placeField(
  deps: { villages: VillageRepository },
  input: PlaceFieldInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'field',
        cells: input.cells,
        grid: input.grid,
      }),
  );
}
