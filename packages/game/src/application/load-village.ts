import type { Landscape } from '../domain/landscape';
import { updateVillage } from './update-village';
import type { Pause, VillageRecord, VillageRepository } from './villages';

export interface LoadVillageInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  /** Dnešní herní den (index dne). */
  today: number;
  /**
   * Krajina sídla – ves se dopočítává s její vrstvou překážek (přestavby kácí stromy) a starým
   * vsím se s ní doplní odstraněné překážky a vzdálenost obydlí k lesu.
   */
  landscape: Landscape;
}

/**
 * Načte ves (podle id) dopočítanou do dneška (dopočítaný stav uloží); bez vsi null. S `pause`
 * dělá dlouhý dopočet mezi dny přestávky (server mezi tím obslouží jiné požadavky).
 */
export async function loadVillage(
  deps: { villages: VillageRepository; pause?: Pause },
  input: LoadVillageInput,
): Promise<VillageRecord | null> {
  const result = await updateVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => ({
      ok: true,
      state,
    }),
    deps.pause,
  );
  return result.ok ? result.village : null;
}
