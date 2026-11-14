import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  applyBuildIntent,
  playerChurchStartProblem,
  type ChurchDims,
  type ChurchType,
  type Position,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Stavba kostela (churches.md – Stavba). Právo (`build`) ověřuje vstupní bod (`ACTION_RIGHTS`).

export interface PlaceChurchInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Typ kostela – musí patřit okruhu huti vsi. */
  type: ChurchType;
  /** Rozměry lodi (ořežou se na meze `CHURCH.limits`). */
  dims: ChurchDims;
  /** Střed hlavní lodi; natočení = osa vstup → kněžiště (0 = na východ, po 15°). */
  position: Position;
}

/**
 * Hráč zahájí stavbu kostela (ves se nejdřív dopočítá do dneška) – bez ceny předem; server ověří
 * křest, huť, typ, lom i místo znovu (`applyBuildIntent` → `checkChurchPlacement`, `startChurch`).
 */
export function placeChurchForVillage(
  deps: { villages: VillageRepository },
  input: PlaceChurchInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      // křest rodu vyžadujeme jen od hráče – NPC správce staví přes `applyBuildIntent` přímo
      const problem = playerChurchStartProblem(state, input.type);
      if (problem) return { ok: false, reason: problem };
      return applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'church',
        type: input.type,
        dims: input.dims,
        position: input.position,
      });
    },
  );
}
