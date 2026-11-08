import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startGateUpgrade, villageRoadWalk, type GateLevel } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface FortificationGateUpgradeInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl s branou (`FortGate.segment`). */
  segment: number;
  /** Klešťová brána, nebo věž nad branou. */
  level: GateLevel;
}

/**
 * Hráč vylepší bránu (fortifications.md – Hradby a obrana, Brány): klešťová brána od palisády
 * výš s místem za branou, věž nad klešťovou branou (`startGateUpgrade`).
 */
export function upgradeFortificationGate(
  deps: { villages: VillageRepository },
  input: FortificationGateUpgradeInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startGateUpgrade(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        { fortificationId: input.fortificationId, segment: input.segment, level: input.level },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
