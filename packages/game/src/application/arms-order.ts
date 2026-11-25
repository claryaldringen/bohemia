import type { Landscape } from '../domain/landscape';
import { setArmsOrder } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import type { ArmsGood } from '../domain/village/types';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Objednávka zbroje u cizích kupců ve vlastní vsi (markets.md – Rozhodnutí plánu 4, bod 15; Martin
// 25. 11. 2026: „Hráč zadá počet“): hráč zadá, kolik kusů má ves koupit, a ves je koupí za své mince
// v den kupců (trade/arms-order.ts). Objednávka platí do splnění nebo do další změny.

export interface OrderArmsInput {
  villageId: string;
  good: ArmsGood;
  /** Kolik kusů má ves od kupců koupit; 0 = nic. */
  amount: number;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  landscape: Landscape;
}

/**
 * Nastaví objednaný počet zbroje (`state.armsOrder`). Ves, kam kupci nejezdí, odmítne
 * (`ARMS_NO_MERCHANTS`), stejně jako necelý nebo záporný počet (`ARMS_BAD_ORDER`); neživá ves má
 * důvody `updateLivingVillage`.
 */
export function orderArms(
  deps: { villages: VillageRepository },
  input: OrderArmsInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const next = cloneState(state);
      const set = setArmsOrder(next, input.good, input.amount);
      return set.ok ? { ok: true, state: next } : set;
    },
  );
}
