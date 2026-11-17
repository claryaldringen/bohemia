// Psi dvorce (wildlife.md – Psi – smečka dvorce): chov 1. 5. (existující dvorec bez smečky ji založí hned); psi nic nespotřebovávají (Martin 17. 11. 2026).
import { dogsWanted, huntPool } from './hunt-party';
import { isWildlifeYearDay } from './wildlife';
import { lordFamily } from '../people/lord';
import { MANOR_DOGS } from '../rules/rules-wildlife';
import type { VillageState } from '../types';

const EPSILON = 1e-6;

/**
 * Roční přepočet smečky 1. 5. (mutuje stav; volá `wildlifeYearDay`): ubude 10 % a smečka dostane nejvýš 2
 * štěňata do počtu, který dvorec chce (psi nejí obilí, štěňata přibývají vždy; starší `dogs.fed` se
 * nečte a při přepočtu zmizí).
 */
export function dogsYear(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  // smečka vznikne hned, ne až 1. 5. (návrh Clauda): ves bez smečky má první zimu se psy; po vzniku
  // `dogs` existuje, takže převod proběhne jednou
  if (!w.dogs && !isWildlifeYearDay(day)) {
    const wantedNow = dogsWanted(huntPool(state, day, lordFamily(state, day)));
    if (wantedNow > 0) w.dogs = { count: wantedNow };
    return;
  }
  if (!isWildlifeYearDay(day)) return;
  const family = lordFamily(state, day);
  const wanted = dogsWanted(huntPool(state, day, family));
  let count = (w.dogs?.count ?? 0) * (1 - MANOR_DOGS.lossPerYear);
  count += Math.min(MANOR_DOGS.puppiesPerYear, Math.max(0, wanted - count));
  if (count > EPSILON || w.dogs) w.dogs = { count };
}
