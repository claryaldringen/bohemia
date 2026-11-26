import type { Landscape } from '../domain/landscape';
import { setSlavesForSale } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Nabídka otroků na trhu vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8; návrh Clauda: platí
// i při zapnutém správci jako objednávka zbroje – správce ji nemění, hráč ji mění s právem `trade`).

export interface OfferSlavesInput {
  villageId: string;
  /** Kolik otroků má ves nabízet; 0 = nic. */
  count: number;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  landscape: Landscape;
}

/**
 * Nastaví počet nabízených otroků (`state.slavesForSale`). Necelý nebo záporný počet odmítne
 * (`SLAVES_BAD_COUNT`); neživá ves má důvody `updateLivingVillage`.
 */
export function offerSlaves(
  deps: { villages: VillageRepository },
  input: OfferSlavesInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const next = cloneState(state);
      const set = setSlavesForSale(next, input.count);
      return set.ok ? { ok: true, state: next } : set;
    },
  );
}
