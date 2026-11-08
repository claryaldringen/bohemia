import type { Landscape } from '../domain/landscape';
import { startSectionDemolition } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface DemolishFortificationSectionInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Díl (`FortSegment.index`), na který hráč klikl – úsek mezi branami dohledá server. */
  segment: number;
}

/**
 * Hráč zboří úsek opevnění mezi branami (demolition.md – Opevnění): plot a palisáda se rozeberou,
 * na valu napřed nástavba, pak val srovnat; brány zůstávají, klády zpět na hromadu.
 */
export function demolishFortificationSection(
  deps: { villages: VillageRepository },
  input: DemolishFortificationSectionInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      startSectionDemolition(state, state.lastDay, input.landscape, {
        fortificationId: input.fortificationId,
        segment: input.segment,
      }),
  );
}
