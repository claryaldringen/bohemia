import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startGateGapFill, villageRoadWalk, type FortKind } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface FillFortificationGateGapInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl zbořené brány (`FortGate.segment`). */
  segment: number;
  /** Druh z rozcestníku opevnění – musí být hradba kolem otvoru. */
  target: FortKind;
}

/**
 * Hráč zastaví otvor po zbořené bráně mezi stojící hradbou běžnou stavbou opevnění
 * (demolition.md – Rozhodnutí, D45): hradba dílu šířky brány, klády a kámen předem
 * (`startGateGapFill`).
 */
export function fillFortificationGateGap(
  deps: { villages: VillageRepository },
  input: FillFortificationGateGapInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startGateGapFill(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        { fortificationId: input.fortificationId, segment: input.segment, target: input.target },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
