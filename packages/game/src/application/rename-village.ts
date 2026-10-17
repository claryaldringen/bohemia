import { checkVillageName, normalizeVillageName } from '../domain/village';
import { loadVillage } from './load-village';
import { NO_VILLAGE } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface RenameVillageInput {
  settlementId: string;
  /** Dnešní herní den (index dne) – ves se vrací dopočítaná do dneška. */
  today: number;
  name: string;
}

/** Hráč přejmenuje ves (stejná pravidla jména jako při založení). */
export async function renameVillage(
  deps: { villages: VillageRepository },
  input: RenameVillageInput,
): Promise<VillageResult> {
  const check = checkVillageName(input.name);
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Neplatné jméno vsi.' };
  const renamed = await deps.villages.rename(input.settlementId, normalizeVillageName(input.name));
  if (!renamed) return { ok: false, reason: NO_VILLAGE };
  const village = await loadVillage(deps, input);
  return village === null ? { ok: false, reason: NO_VILLAGE } : { ok: true, village };
}
