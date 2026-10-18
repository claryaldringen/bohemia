import type { Landscape } from '../domain/landscape';
import {
  buildAffordability,
  fieldPartsFromCells,
  foundField,
  placementVillageOf,
  villageDwellingPositions,
  type SquareGrid,
  type TileCell,
} from '../domain/village';
import { CANNOT_AFFORD } from './place-dwelling';
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
    (state) => {
      if (!buildAffordability(state, 'field').affordable)
        return { ok: false, reason: CANNOT_AFFORD };
      const positions = villageDwellingPositions(state);
      const village = placementVillageOf(state, state.lastDay);
      const field = fieldPartsFromCells(
        input.landscape,
        village,
        input.cells,
        positions,
        undefined,
        input.grid,
      );
      if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      // posvátné duby a háje vesničané při mýcení nechají stát (happiness.md)
      const fieldInput = {
        parts: field.parts,
        sacred: field.spared,
        ...(field.grid ? { grid: field.grid } : {}),
      };
      return { ok: true, state: foundField(state, state.lastDay, fieldInput) };
    },
  );
}
