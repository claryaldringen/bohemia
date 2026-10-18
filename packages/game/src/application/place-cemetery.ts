import type { Landscape } from '../domain/landscape';
import {
  cemeteryPartsFromCells,
  foundCemetery,
  placementVillageOf,
  villageDwellingPositions,
  type TileCell,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceCemeteryInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce pohřebiště – políčka krajiny. */
  cells: TileCell[];
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
    (state) => {
      const positions = villageDwellingPositions(state);
      const village = placementVillageOf(state, state.lastDay);
      const preview = cemeteryPartsFromCells(input.landscape, village, input.cells, positions);
      if (!preview.check.ok) {
        return { ok: false, reason: preview.check.reason ?? 'Sem hřbitov nepatří.' };
      }
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      const cemetery = {
        squares: preview.squares,
        squareSizeM: input.landscape.cellSizeM,
        sacred: preview.spared,
      };
      return { ok: true, state: foundCemetery(state, state.lastDay, cemetery) };
    },
  );
}
