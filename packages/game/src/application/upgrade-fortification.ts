import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startFortificationUpgrade, villageRoadWalk, type FortTop } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface UpgradeFortificationInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Plot na palisádu (`upgrade`), nebo plot či palisáda na val (`top`). */
  work: 'upgrade' | 'top';
  /** Nástavba na val (jen `top`). */
  top?: FortTop;
}

/**
 * Hráč vylepší opevnění (fortifications.md – Druhy): plot na palisádu po úsecích (plot úseku
 * stojí, dokud jeho palisáda není hotová), nebo plot či palisáda na hotový val.
 */
export function upgradeFortification(
  deps: { villages: VillageRepository },
  input: UpgradeFortificationInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startFortificationUpgrade(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        {
          fortificationId: input.fortificationId,
          work: input.work,
          ...(input.top ? { top: input.top } : {}),
        },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
