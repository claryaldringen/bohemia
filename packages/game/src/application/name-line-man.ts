import type { Landscape } from '../domain/landscape';
import { nameLineMan } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Jméno muže rodu (lord.md – Jména; Martin 24. 10. 2026: „Hráči se vypíše upozornění a bude se
// čekat na jeho reakci.“ – syn vojvody bez jména čeká na hráče, vnuci mají jméno od narození).

export interface NameLineManInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
  /** Muž rodu bez jména (`Person.id`) – vojvoda nebo jeho syn. */
  personId: number;
  /** Jméno – jen písmena (`checkPersonName`), trvalé. */
  name: string;
}

/**
 * Hráč pojmenuje vojvodu nebo jeho syna (ves se nejdřív dopočítá do dneška – syn mezitím mohl
 * zemřít). Důvod odmítnutí se vrací jako `reason`. (Jméno se liší od doménového `nameLineMan` –
 * balíček exportuje doménu i use-casy.)
 */
export function nameLineManInVillage(
  deps: { villages: VillageRepository },
  input: NameLineManInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => nameLineMan(state, input.personId, input.name, state.lastDay),
  );
}
