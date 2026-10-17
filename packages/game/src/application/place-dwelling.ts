import type { Landscape } from '../domain/landscape';
import {
  buildAffordability,
  checkDwellingPlacement,
  startNewDwelling,
  type DwellingType,
  type Position,
} from '../domain/village';
import { updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceDwellingInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  type: DwellingType;
  position: Position;
}

/** Ves nemá suroviny, které stavba stojí předem (population.md – Odemčení). */
export const CANNOT_AFFORD = 'Na tuhle stavbu ves nemá suroviny.';
/** Nové obydlí nemá kdo osídlit – žádná domácnost nemá mladý pár navíc (population.md – Odemčení). */
export const NO_SETTLERS = 'Nové obydlí nemá kdo osídlit.';

/**
 * Hráč zahájí stavbu nového obydlí – kdykoli, když je kým ho osadit a ves má suroviny předem
 * (ves se nejdřív dopočítá do dneška).
 */
export function placeDwelling(
  deps: { villages: VillageRepository },
  input: PlaceDwellingInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.settlementId, input.today, (state) => {
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    const day = state.lastDay;
    const { affordable, missing } = buildAffordability(state, input.type);
    if (!affordable) {
      return { ok: false, reason: missing.settlers ? NO_SETTLERS : CANNOT_AFFORD };
    }
    const check = checkDwellingPlacement(input.landscape, state, input.type, input.position);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem obydlí nepatří.' };
    const position = { ...input.position };
    return { ok: true, state: startNewDwelling(state, day, input.type, position, 0) };
  });
}
