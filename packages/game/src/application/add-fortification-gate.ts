import type { Landscape } from '../domain/landscape';
import { addGateToFortification, type RoadPoint } from '../domain/village';
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
 * navíc nestojí.
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
      addGateToFortification(state, input.landscape, input.fortificationId, input.position),
  );
}
