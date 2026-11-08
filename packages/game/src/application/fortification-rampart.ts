import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startMoatFill, startRampartAddition, villageRoadWalk } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface FortificationRampartInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl (`FortSegment.index`) v úseku; null – celé opevnění (jen doplnění valu). */
  segment: number | null;
}

/**
 * Hráč doplní val s příkopem pod stojící hradbu úseku s dílem `segment` (null – celé opevnění;
 * fortifications.md – Hradby a obrana, Druhy): val vně hradby, hradba stojí a brání dál
 * (`startRampartAddition`).
 */
export function addFortificationRampart(
  deps: { villages: VillageRepository },
  input: FortificationRampartInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startRampartAddition(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        { fortificationId: input.fortificationId, segment: input.segment },
        villageRoadWalk(state, input.landscape),
      ),
  );
}

/**
 * Hráč napustí příkop úseku s dílem `segment` (fortifications.md – Hradby a obrana, Druhy):
 * strouha od vody do 30 m, voda do souvislých dílů s dnem pod hladinou (`startMoatFill`).
 */
export function fillFortificationMoat(
  deps: { villages: VillageRepository },
  input: Omit<FortificationRampartInput, 'segment'> & { segment: number },
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startMoatFill(state, state.lastDay, input.landscape, {
        fortificationId: input.fortificationId,
        segment: input.segment,
      }),
  );
}
