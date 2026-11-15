import type { Landscape } from '../domain/landscape';
import { setGateAbandoned, startGateDemolition } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface FortificationGateInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl (`FortSegment.index`) s branou. */
  segment: number;
}

/**
 * Hráč zboří bránu opevnění (demolition.md – Rozhodnutí, Martin 14. 11. 2026): zbyde mezera šířky
 * brány, hradba kolem stojí, klády zpět na hromadu.
 */
export function demolishFortificationGate(
  deps: { villages: VillageRepository },
  input: FortificationGateInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startGateDemolition(state, state.lastDay, {
        fortificationId: input.fortificationId,
        segment: input.segment,
      }),
  );
}

/**
 * Hráč bránu opustí (`abandoned` true) nebo vrátí (demolition.md – Rozhodnutí): opuštěná se
 * přestane udržovat a po shnití zbyde mezera.
 */
export function abandonFortificationGate(
  deps: { villages: VillageRepository },
  input: FortificationGateInput & { abandoned: boolean },
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      setGateAbandoned(
        state,
        state.lastDay,
        { fortificationId: input.fortificationId, segment: input.segment },
        input.abandoned,
      ),
  );
}
