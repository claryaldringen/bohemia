import type { Landscape } from '../domain/landscape';
import { cancelBlock, cancelConstruction } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Zrušení rozestavěné stavby (Martin 23. 10. 2026): hráč zruší stavbu, kterou začal a která se
// ještě nedostavěla – vytýčení zmizí a nespotřebované dřevo se vrátí na hromadu.

export interface CancelConstructionInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Rozestavěná stavba (`Construction.id`). */
  constructionId: number;
}

/** Stavba už není rozestavěná (mezitím se dostavěla, nebo už byla zrušená). */
export const NO_CONSTRUCTION = 'Tahle stavba už není rozestavěná.';

/**
 * Hráč zruší rozestavěnou stavbu (ves se nejdřív dopočítá do dneška – mezitím se mohla dostavět).
 * Důvod odmítnutí se vrací jako `reason`.
 */
export function cancelUnfinishedConstruction(
  deps: { villages: VillageRepository },
  input: CancelConstructionInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const c = state.constructions.find((x) => x.id === input.constructionId);
      if (!c) return { ok: false, reason: NO_CONSTRUCTION };
      const block = cancelBlock(c);
      if (block !== null) return { ok: false, reason: block };
      return { ok: true, state: cancelConstruction(state, state.lastDay, input.constructionId) };
    },
  );
}
