import type { Landscape } from '../domain/landscape';
import {
  fieldPartsFromCells,
  foundField,
  villageDwellingPositions,
  type TileCell,
} from '../domain/village';
import { updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceFieldInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce pole – políčka krajiny. */
  cells: TileCell[];
}

/** Hráč založí nové pole ze čtverců (ves se nejdřív dopočítá do dneška). */
export function placeField(
  deps: { villages: VillageRepository },
  input: PlaceFieldInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.settlementId, input.today, (state) => {
    const positions = villageDwellingPositions(state);
    const field = fieldPartsFromCells(input.landscape, state, input.cells, positions);
    if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
    return { ok: true, state: foundField(state, input.today, { parts: field.parts }) };
  });
}
