import type { Landscape } from '../domain/landscape';
import { updateVillage } from './update-village';
import type { VillageRecord, VillageRepository } from './villages';

export interface LoadVillageInput {
  settlementId: string;
  /** Dnešní herní den (index dne). */
  today: number;
  /**
   * Krajina sídla – ves se dopočítává s její vrstvou překážek (přestavby kácí stromy) a starým
   * vsím se s ní doplní odstraněné překážky a vzdálenost obydlí k lesu.
   */
  landscape: Landscape;
}

/** Načte ves sídla dopočítanou do dneška (dopočítaný stav uloží); bez vsi null. */
export async function loadVillage(
  deps: { villages: VillageRepository },
  input: LoadVillageInput,
): Promise<VillageRecord | null> {
  const result = await updateVillage(
    deps.villages,
    input.settlementId,
    input.today,
    input.landscape,
    (state) => ({
      ok: true,
      state,
    }),
  );
  return result.ok ? result.village : null;
}
