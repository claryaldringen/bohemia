import type { Landscape } from '../domain/landscape';
import { cloneState } from '../domain/village/clone';
import type { DefenseStance } from '../domain/village/types';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Postoj vsi před cizím vojskem (war.md – Obránci – postoje a útěk; Martin 3. 11. 2026): hráč ho
// nastaví dopředu, ves se podle něj zachová, když spatří vojsko. Postoj platí do další změny.

export interface SetDefenseStanceInput {
  villageId: string;
  stance: DefenseStance;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  landscape: Landscape;
}

/** Nastaví postoj vsi (`state.defense`); stejný postoj nic nemění. */
export function setDefenseStanceInVillage(
  deps: { villages: VillageRepository },
  input: SetDefenseStanceInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const next = cloneState(state);
      next.defense = { stance: input.stance };
      return { ok: true, state: next };
    },
  );
}
