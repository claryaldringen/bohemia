import { obstaclesOf, type Landscape } from '../domain/landscape';
import { addGateOrRebuild, villageRoadWalk, type RoadPoint } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface AddFortificationGateInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Klik na obvod ve světě (m). */
  position: RoadPoint;
}

/**
 * Hráč přidá bránu kliknutím na obvod (fortifications.md – Brány): nejvýš jedna na úsek, nic
 * navíc nestojí; do dílu se zbořenou branou se brána postaví znovu do otvoru za cenu hradby šířky
 * brány (`addGateOrRebuild`, D45).
 */
export function addFortificationGate(
  deps: { villages: VillageRepository },
  input: AddFortificationGateInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      addGateOrRebuild(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        { fortificationId: input.fortificationId, position: input.position },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
