import type { Landscape } from '../domain/landscape';
import {
  buildAffordability,
  checkDwellingPlacement,
  placementVillageOf,
  startNewDwelling,
  type DwellingType,
  type Position,
} from '../domain/village';
import { updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceDwellingInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  type: DwellingType;
  position: Position;
}

/** Ves nemá suroviny, které stavba stojí předem (population.md – Odemčení). */
export const CANNOT_AFFORD = 'Na tuhle stavbu ves nemá suroviny.';

/**
 * Hráč zahájí stavbu nového obydlí – kdykoli, jen na ni ves musí mít suroviny předem (ves se
 * nejdřív dopočítá do dneška).
 */
export function placeDwelling(
  deps: { villages: VillageRepository },
  input: PlaceDwellingInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.settlementId, input.today, input.landscape, (state) => {
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    const day = state.lastDay;
    if (!buildAffordability(state, input.type).affordable) {
      return { ok: false, reason: CANNOT_AFFORD };
    }
    const check = checkDwellingPlacement(
      input.landscape,
      placementVillageOf(state, day),
      input.type,
      input.position,
    );
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem obydlí nepatří.' };
    const position = { ...input.position };
    // překážky na vyklízené ploše: práce navíc, osadníci je odstraní při zahájení stavby
    return {
      ok: true,
      state: startNewDwelling(
        state,
        day,
        input.type,
        position,
        check.obstacleCost,
        check.obstacleIds,
      ),
    };
  });
}
