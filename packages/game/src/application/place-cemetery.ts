import type { Landscape } from '../domain/landscape';
import {
  cemeteryPartsFromCells,
  foundCemetery,
  villageDwellingPositions,
  type TileCell,
} from '../domain/village';
import { updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceCemeteryInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce pohřebiště – políčka krajiny. */
  cells: TileCell[];
}

/**
 * Hráč založí pohřebiště ze čtverců (ves se nejdřív dopočítá do dneška). Blízkost obydlí
 * a vody stavbu neblokuje – varuje jen náhled při umisťování.
 */
export function placeCemetery(
  deps: { villages: VillageRepository },
  input: PlaceCemeteryInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.settlementId, input.today, (state) => {
    const positions = villageDwellingPositions(state);
    const preview = cemeteryPartsFromCells(input.landscape, state, input.cells, positions);
    if (!preview.check.ok) {
      return { ok: false, reason: preview.check.reason ?? 'Sem hřbitov nepatří.' };
    }
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    const cemetery = { squares: preview.squares, squareSizeM: input.landscape.cellSizeM };
    return { ok: true, state: foundCemetery(state, state.lastDay, cemetery) };
  });
}
