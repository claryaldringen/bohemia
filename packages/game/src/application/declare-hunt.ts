import type { Landscape } from '../domain/landscape';
import { canDeclareHunt, declareHunt, HUNT_DENIED_TEXT } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Lov navíc na pokyn hráče (wildlife.md – Lov rodu: Kdy; Martin 24. 10. 2026: „Obojí“ – rod loví
// sám podle kalendáře a hráč může vyhlásit lov navíc; omezení navrhl Claude).

export interface DeclareHuntInput {
  /** Ves (id), ve které hráč jedná. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška, lov je zítra. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
}

/**
 * Hráč vyhlásí lov navíc na zítřek. Ves se nejdřív dopočítá do dneška; důvod odepření (hájení,
 * 3 dny od minulého, není kdo, už vyhlášen) se vrací jako `reason` česky a nic se neuloží.
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
      const denied = canDeclareHunt(state, state.lastDay);
      if (denied) return { ok: false, reason: HUNT_DENIED_TEXT[denied] };
      const next = cloneState(state);
      const late = declareHunt(next, next.lastDay);
      return late ? { ok: false, reason: HUNT_DENIED_TEXT[late] } : { ok: true, state: next };
    },
  );
}
