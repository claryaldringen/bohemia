import type { Landscape } from '../domain/landscape';
import {
  fieldPartsFromOutline,
  foundField,
  normalizeOutline,
  villageDwellingPositions,
} from '../domain/village';
import { updateVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceFieldInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  outline: [number, number][];
}

/** Hráč založí nové pole z obrysu (ves se nejdřív dopočítá do dneška). */
export function placeField(
  deps: { villages: VillageRepository },
  input: PlaceFieldInput,
): Promise<VillageResult> {
  const outline = normalizeOutline(input.outline);
  return updateVillage(deps.villages, input.settlementId, input.today, (state) => {
    const positions = villageDwellingPositions(state);
    const field = fieldPartsFromOutline(input.landscape, state, outline, positions);
    if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
    return { ok: true, state: foundField(state, input.today, { outline, parts: field.parts }) };
  });
}
