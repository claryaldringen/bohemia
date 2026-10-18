import type { Landscape } from '../domain/landscape';
import {
  buildAffordability,
  foundOrchard,
  orchardPartsFromCells,
  placementVillageOf,
  villageDwellingPositions,
  type TileCell,
} from '../domain/village';
import { CANNOT_AFFORD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceOrchardInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Čtverce sadu – políčka krajiny. */
  cells: TileCell[];
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
    (state) => {
      if (!buildAffordability(state, 'orchard').affordable) {
        return { ok: false, reason: CANNOT_AFFORD };
      }
      const positions = villageDwellingPositions(state);
      const village = placementVillageOf(state, state.lastDay);
      const orchard = orchardPartsFromCells(input.landscape, village, input.cells, positions);
      if (!orchard.check.ok)
        return { ok: false, reason: orchard.check.reason ?? 'Sem sad nepatří.' };
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      // čtverce polí pod sadem z pole zmizí (fields.md – Pole jako krajina)
      const squares = {
        squares: orchard.squares,
        sacred: orchard.spared,
        takenLand: orchard.takenLand,
      };
      return { ok: true, state: foundOrchard(state, state.lastDay, squares) };
    },
  );
}
