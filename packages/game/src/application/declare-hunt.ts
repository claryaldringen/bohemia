import type { Landscape } from '../domain/landscape';
import { countDeclaredHunt, HUNT_DENIED_TEXT, huntDenied, reserveBeaters } from '../domain/village';
import { cloneState } from '../domain/village/core/clone';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Lov na tlačítko dvorce (hunting.md – Pravidla 2; Martin 22. 11. 2026): kalendářní lov a lov
// navíc nahradil lov, který hráč vyhlásí, kdykoli to dovolí důvody `huntDenied` (hájení, běžící
// lov, zvěř v lese vsi, honci na zítřek).

export interface DeclareHuntInput {
  /** Ves (id), ve které hráč jedná. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška, honci chybí zítra. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
}

/**
 * Hráč vyhlásí lov. Ves se nejdřív dopočítá do dneška; důvody se posuzují na den honců (zítřek –
 * `huntDenied`: hájení, lov běží, v lese vsi není zvěř, ves neuvolní honce) a důvod odepření se
 * vrací jako `reason` česky – nic se neuloží. Jinak ves zítra uvolní honce (`reserveBeaters`),
 * zapíše pořadí vyhlášení (`countDeclaredHunt` – štítek losu zvířete) a uloží se.
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
      const denied = huntDenied(state, state.lastDay + 1, false);
      if (denied) return { ok: false, reason: HUNT_DENIED_TEXT[denied] };
      const next = cloneState(state);
      reserveBeaters(next, next.lastDay);
      countDeclaredHunt(next);
      return { ok: true, state: next };
    },
  );
}
