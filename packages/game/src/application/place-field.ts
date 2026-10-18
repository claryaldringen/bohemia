import type { Landscape } from '../domain/landscape';
import {
  buildAffordability,
  fieldPartsFromCells,
  foundField,
  placementVillageOf,
  villageDwellingPositions,
  type TileCell,
} from '../domain/village';
import { CANNOT_AFFORD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
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
  return updateLivingVillage(
    deps.villages,
    input.settlementId,
    input.today,
    input.landscape,
    (state) => {
      if (!buildAffordability(state, 'field').affordable)
        return { ok: false, reason: CANNOT_AFFORD };
      const positions = villageDwellingPositions(state);
      const village = placementVillageOf(state, state.lastDay);
      const field = fieldPartsFromCells(input.landscape, village, input.cells, positions);
      if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      return { ok: true, state: foundField(state, state.lastDay, { parts: field.parts }) };
    },
  );
}
