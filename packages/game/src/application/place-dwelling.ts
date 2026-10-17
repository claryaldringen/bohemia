import type { Landscape } from '../domain/landscape';
import {
  canStartNewDwelling,
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

export const CANNOT_BUILD_DWELLING =
  'Nové obydlí teď stavět nejde – žádná plná domácnost se 4 dospělými na něj nečeká.';

/** Hráč zahájí stavbu nového obydlí (ves se nejdřív dopočítá do dneška). */
export function placeDwelling(
  deps: { villages: VillageRepository },
  input: PlaceDwellingInput,
): Promise<VillageResult> {
  return updateVillage(deps.villages, input.settlementId, input.today, (state) => {
    if (!canStartNewDwelling(state, input.today)) {
      return { ok: false, reason: CANNOT_BUILD_DWELLING };
    }
    const check = checkDwellingPlacement(input.landscape, state, input.type, input.position);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem obydlí nepatří.' };
    const position = { ...input.position };
    return { ok: true, state: startNewDwelling(state, input.today, input.type, position, 0) };
  });
}
