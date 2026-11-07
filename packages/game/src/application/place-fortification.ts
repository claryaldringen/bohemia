import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startFortification, villageRoadWalk, type FortKind } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceFortificationInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Body obvodu ve světě (m) – návrh hry upravený hráčem; tvar a kontroly přepočítá server. */
  points: (readonly [number, number])[];
  kind: FortKind;
}

/**
 * Hráč zahájí stavbu opevnění (fortifications.md – Obvod, Cena a stavba; ves se nejdřív dopočítá
 * do dneška). Server umístění ověří znovu (`checkFortificationPlacement`); cena předem je jen
 * dřevo celé stavby (klády na hromadě + stromy k mání), práce se nečeká.
 */
export function placeFortification(
  deps: { villages: VillageRepository },
  input: PlaceFortificationInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      startFortification(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        { points: input.points, kind: input.kind },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
