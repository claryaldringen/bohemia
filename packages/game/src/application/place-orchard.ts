import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type SquareGrid, type TileCell } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceOrchardInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce sadu – políčka krajiny, u natočeného sadu čtverce v jeho mřížce `grid`. */
  cells: TileCell[];
  /** Natočená mřížka sadu (fields.md – Natočené stavby); bez ní mřížka krajiny. */
  grid?: SquareGrid;
}

/**
 * Hráč založí jabloňový sad ze čtverců (orchard.md – staví se jako pole; ves se nejdřív
 * dopočítá do dneška). Server umístění ověří znovu; osadníci sad vysadí v nejbližším okně
 * výsadby (jaro, podzim) a překážky na čtvercích odstraní.
 */
export function placeOrchard(
  deps: { villages: VillageRepository },
  input: PlaceOrchardInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'orchard',
        cells: input.cells,
        grid: input.grid,
      }),
  );
}
