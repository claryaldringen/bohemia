import type { Landscape } from '../domain/landscape';
import {
  advanceVillage,
  checkDwellingPlacement,
  checkVillageName,
  fieldPartsFromOutline,
  foundVillage,
  normalizeOutline,
  normalizeVillageName,
  type Position,
} from '../domain/village';
import type { SeedSource } from './settlements';
import type { VillageRepository, VillageResult } from './villages';

export interface FoundVillageInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  name: string;
  /** Poloha první zemnice. */
  dwelling: Position;
  fieldOutline: [number, number][];
}

const ALREADY_FOUNDED = 'Ves už je založená.';

/**
 * Založí ves sídla: jméno, první zemnice a první pole (ověřené podle krajiny). Ves se hned
 * dopočítá do dneška – den založení už proběhl, jako po každé akci.
 */
export async function foundVillageForSettlement(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  if ((await deps.villages.find(input.settlementId)) !== null) {
    return { ok: false, reason: ALREADY_FOUNDED };
  }
  const name = checkVillageName(input.name);
  if (!name.ok) return { ok: false, reason: name.reason ?? 'Neplatné jméno vsi.' };
  const dwelling = checkDwellingPlacement(input.landscape, null, 'zemnice', input.dwelling);
  if (!dwelling.ok) return { ok: false, reason: dwelling.reason ?? 'Sem zemnice nepatří.' };
  const outline = normalizeOutline(input.fieldOutline);
  const field = fieldPartsFromOutline(input.landscape, null, outline, [input.dwelling]);
  if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };

  const founded = foundVillage({
    seed: deps.seeds.nextSeed(),
    day: input.today,
    dwellingPosition: { ...input.dwelling },
    firstField: { outline, parts: field.parts },
  });
  const state = advanceVillage(founded, input.today);
  const created = await deps.villages.create(
    input.settlementId,
    normalizeVillageName(input.name),
    state,
  );
  return created === null ? { ok: false, reason: ALREADY_FOUNDED } : { ok: true, village: created };
}
