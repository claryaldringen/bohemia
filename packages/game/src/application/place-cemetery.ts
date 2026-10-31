import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type SquareGrid, type TileCell } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceCemeteryInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce pohřebiště – políčka krajiny, nebo čtverce natočené mřížky `grid`. */
  cells: TileCell[];
  /** Natočená mřížka hřbitova (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/**
 * Hráč založí pohřebiště ze čtverců (ves se nejdřív dopočítá do dneška). Blízkost obydlí
 * a vody stavbu neblokuje – varuje jen náhled při umisťování. Překážky na čtvercích zaplatí
 * prací navíc a osadníci je odstraní, až hřbitov dostaví.
 */
export function placeCemetery(
  deps: { villages: VillageRepository },
  input: PlaceCemeteryInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'cemetery',
        cells: input.cells,
        grid: input.grid,
      }),
  );
}
