import type { Landscape } from '../domain/landscape';
import { HUNT_DENIED_TEXT, huntDenied, reserveBeaters } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Lov na tlačítko dvorce (hunting.md – Pravidla 2; Martin 22. 11. 2026): kalendářní lov a lov
// navíc nahradil lov, který hráč vyhlásí, kdykoli není hájení a lov vsi neběží.

export interface DeclareHuntInput {
  /** Ves (id), ve které hráč jedná. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška, honci chybí zítra. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
}

/**
 * Hráč vyhlásí lov. Ves se nejdřív dopočítá do dneška; důvod odepření (`huntDenied` – hájení,
 * lov běží) se vrací jako `reason` česky a nic se neuloží. Jinak ves zítra uvolní honce
 * (`reserveBeaters`) a uloží se.
 */
export function declareHuntInVillage(
  deps: { villages: VillageRepository },
  input: DeclareHuntInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const denied = huntDenied(state, state.lastDay, false);
      if (denied) return { ok: false, reason: HUNT_DENIED_TEXT[denied] };
      const next = cloneState(state);
      reserveBeaters(next, next.lastDay);
      return { ok: true, state: next };
    },
  );
}
