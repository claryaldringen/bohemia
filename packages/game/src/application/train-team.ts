import { obstaclesOf, type Landscape } from '../domain/landscape';
import { trainTeam, trainingBlock } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface TrainTeamInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  penId: number;
}

/**
 * Hráč v ohradě zadá výcvik spřežení (oxen.md – „Vycvičit spřežení“; ves se nejdřív dopočítá do
 * dneška): dvě telata ze stáda jdou do výcviku a vesničané vyrobí rádlo. Když výcvik nejde,
 * vrátí důvod česky (`trainingBlock`).
 */
export function trainTeamInPen(
  deps: { villages: VillageRepository },
  input: TrainTeamInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.settlementId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const block = trainingBlock(state, input.penId, day, obstacles);
      if (block) return { ok: false, reason: block };
      return { ok: true, state: trainTeam(state, day, input.penId, obstacles) };
    },
  );
}
