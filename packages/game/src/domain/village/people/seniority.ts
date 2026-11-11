import { isVillageAbandoned } from './departure';
import { isLineMan } from './dynasty';
import { isVillageExtinct } from '../core/extinction';
import type { VillageState } from '../types';

// Seniorát (seniorate.md – Seniorát): senior rodu = nejstarší žijící muž rodu v kterékoli živé
// vsi rodu. Čistá funkce stavů vsí ke dni – přepočítá se, kdykoli se rozhoduje.

/** Odkaz na osobu ve vsi: ves a číslo osoby ve stavu vsi (stejný tvar jako `PersonRef` rodu). */
export interface SeniorRef {
  villageId: string;
  personId: number;
}

/**
 * Senior rodu ke dni `day`: nejstarší (nejdřív narozený) žijící muž rodu ze všech živých vsí
 * (vymřelé a opuštěné se nepočítají); při shodě dne narození nižší id osoby, pak nižší id vsi.
 * Muž narozený po `day` se nepočítá. Bez muže rodu null.
 */
export function dynastySenior(
  villages: readonly { villageId: string; state: VillageState }[],
  day: number,
): SeniorRef | null {
  let best: { ref: SeniorRef; bornDay: number } | null = null;
  for (const { villageId, state } of villages) {
    if (isVillageExtinct(state) || isVillageAbandoned(state) || state.nobles) continue;
    for (const man of state.people) {
      if (!isLineMan(man) || man.bornDay > day) continue;
      const better =
        best === null ||
        man.bornDay < best.bornDay ||
        (man.bornDay === best.bornDay &&
          (man.id < best.ref.personId ||
            (man.id === best.ref.personId && villageId < best.ref.villageId)));
      if (better) best = { ref: { villageId, personId: man.id }, bornDay: man.bornDay };
    }
  }
  return best?.ref ?? null;
}
