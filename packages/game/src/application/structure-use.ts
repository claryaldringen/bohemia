import type { Landscape } from '../domain/landscape';
import {
  abandonStructure as abandonStructureRule,
  demolishStructure as demolishStructureRule,
  restoreStructure as restoreStructureRule,
  type BuildResult,
  type UsableRef,
  type UsableStructure,
  type VillageState,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Opustit, zbourat a vrátit stavbu (demolition.md – Opustit a zbourat, Rozhraní; Martin 8. 11. 2026:
// „Hráč/správce může nechat stavbu opustit nebo zbourat.“). Hráč smí kdykoli; důvod, proč nejde
// (obyvatelé nemají kam jít, dvorec, stavba se už bourá…), dává doména.

export interface StructureUseInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Druh stavby – obydlí (i dílna), ohrada, modla, svatyně. */
  structure: UsableStructure;
  /** Id stavby (`Dwelling.id`, `Pen.id`, `SacredBuilding.id`). */
  id: number;
}

type StructureRule = (state: VillageState, day: number, ref: UsableRef) => BuildResult;

/** Ves se nejdřív dopočítá do dneška (obyvatelé se mezitím mohli změnit), pak pravidlo. */
function useStructure(
  rule: StructureRule,
  deps: { villages: VillageRepository },
  input: StructureUseInput,
): Promise<VillageResult> {
  const ref: UsableRef = { structure: input.structure, id: input.id };
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => rule(state, state.lastDay, ref),
  );
}

/** Hráč stavbu opustí – přestane sloužit a chátrá; obyvatelé obydlí bydlí dočasně jinde. */
export function abandonVillageStructure(
  deps: { villages: VillageRepository },
  input: StructureUseInput,
): Promise<VillageResult> {
  return useStructure(abandonStructureRule, deps, input);
}

/**
 * Hráč stavbu zboří – stavba se opustí (pokud ještě není) a vesničané ji rozeberou ze společné
 * práce; druhý pokyn téže stavby odmítne `'Stavba se už bourá.'`.
 */
export function demolishVillageStructure(
  deps: { villages: VillageRepository },
  input: StructureUseInput,
): Promise<VillageResult> {
  return useStructure(demolishStructureRule, deps, input);
}

/** Hráč opuštěnou stavbu vrátí – zase se používá (bouranou nejdřív zruší bouráním). */
export function restoreVillageStructure(
  deps: { villages: VillageRepository },
  input: StructureUseInput,
): Promise<VillageResult> {
  return useStructure(restoreStructureRule, deps, input);
}
