import {
  demolitionCost,
  demolitionOf,
  disuseBlock,
  isDisused,
  isManorTarget,
  lodgersIn,
  targetOf,
  type UsableRef,
  type VillageState,
  type VillageSummary,
} from '@bohemia/game';
import type { StructureUseView } from './village-view-types';

// Opustit, zbourat a vrátit stavbu v panelu výběru (demolition.md – Rozhraní): server spočítá stav
// stavby, důvod, proč nejde, cenu bourání a průběh bourání – klient jen ukáže ikony.

/**
 * Údaje pro tlačítka stavby `ref` v den `day`; dvorec, rozestavěná ohrada a chybějící stavba null
 * (návrh Clauda: dvorec tlačítka nemá vůbec – opustit ani zbourat ho nejde nikdy).
 * `progressOf` dává průběh rozestavěné stavby 0–1 (souhrn vsi).
 */
export function structureUseView(
  state: VillageState,
  ref: UsableRef,
  day: number,
  progressOf: (constructionId: number) => number,
): StructureUseView | null {
  const target = targetOf(state, ref);
  if (!target || isManorTarget(state, target)) return null;
  if (target.structure === 'pen' && target.item.builtDay === null) return null;
  const lodgers = ref.structure === 'dwelling' ? lodgersIn(state, ref.id) : 0;
  const base = { structure: ref.structure, id: ref.id, ...(lodgers > 0 ? { lodgers } : {}) };
  const demolition = demolitionOf(state, ref);
  if (demolition) {
    return {
      ...base,
      state: 'demolishing',
      block: null,
      demolition: null,
      demolishing: { constructionId: demolition.id, progress: progressOf(demolition.id) },
    };
  }
  const abandoned = isDisused(target.item);
  return {
    ...base,
    state: abandoned ? 'abandoned' : 'in-use',
    block: abandoned ? null : disuseBlock(state, ref, day),
    demolition: demolitionCost(state, ref, day),
    demolishing: null,
  };
}

/** Opustit, zbourat, vrátit jako volitelná část pohledu na stavbu (`{ use }`, nebo nic). */
export function structureUseOf(
  state: VillageState,
  summary: Pick<VillageSummary, 'constructions'>,
  ref: UsableRef,
  day: number,
): { use?: StructureUseView } {
  const use = structureUseView(
    state,
    ref,
    day,
    (id) => summary.constructions.find((c) => c.id === id)?.progress ?? 0,
  );
  return use ? { use } : {};
}
