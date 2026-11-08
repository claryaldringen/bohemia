import { obstaclesOf, type Landscape } from '../domain/landscape';
import { startSectionReroute, villageRoadWalk, type WallKind } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface RerouteFortificationSectionInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl (`FortSegment.index`) ve zbořeném úseku – úsek mezi branami dohledá server. */
  segment: number;
  /** Body nové trasy od brány na začátku úseku po bránu na jeho konci (bez konců). */
  points: readonly (readonly [number, number])[];
  /** Hradba nového úseku. */
  target: WallKind;
}

/**
 * Hráč postaví zbořený úsek opevnění mezi branami jinudy (demolition.md – Rozhodnutí): nová trasa
 * z bodů, konce drží brány; stavba za cenu nové hradby podle délky nového úseku.
 */
export function rerouteFortificationSection(
  deps: { villages: VillageRepository },
  input: RerouteFortificationSectionInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startSectionReroute(
        state,
        state.lastDay,
        input.landscape,
        obstaclesOf(input.landscape),
        {
          fortificationId: input.fortificationId,
          segment: input.segment,
          points: input.points,
          target: input.target,
        },
        villageRoadWalk(state, input.landscape),
      ),
  );
}
