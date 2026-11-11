import type { Landscape } from '../domain/landscape';
import { setStewardOn } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { isVillageAbandoned, isVillageExtinct } from '../domain/village';
import { VILLAGE_ABANDONED, VILLAGE_EXTINCT, updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Přepínač správce vsi (steward.md – Soužití s hráčem: přepnutí za běhu je akce hráče).

export interface SetStewardInput {
  /** Hráč, kterému ves patří. */
  playerId: string;
  /** Ves (id), kterou správce řídí. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
  /** Zapnout (true), nebo vypnout (false). */
  on: boolean;
}

/**
 * Hráč zapne nebo vypne správce vsi: ves se dopočítá do dneška, pak se přepne (den změny
 * `sinceDay`). Stavby správce se po vypnutí dostaví jako každé jiné, plán a značky zůstanou.
 */
export function setSteward(
  deps: { villages: VillageRepository },
  input: SetStewardInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.villageId, input.today, input.landscape, (state) => {
    // i ves na cestě: zapnutí svěří příjezd správci, vypnutí ho vrací hráči
    if (isVillageExtinct(state)) return { ok: false, reason: VILLAGE_EXTINCT };
    if (isVillageAbandoned(state)) return { ok: false, reason: VILLAGE_ABANDONED };
    const next = cloneState(state);
    setStewardOn(next, next.lastDay, input.on);
    return { ok: true, state: next };
  });
}
