import type { Landscape } from '../domain/landscape';
import { checkVillageName, isVillageExtinct, normalizeVillageName } from '../domain/village';
import { loadVillage } from './load-village';
import { NO_VILLAGE, VILLAGE_EXTINCT } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface RenameVillageInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se vrací dopočítaná do dneška. */
  today: number;
  name: string;
  /** Krajina sídla – ves se s ní dopočítává (přestavby kácí stromy, forest.md). */
  landscape: Landscape;
}

/**
 * Hráč přejmenuje ves (stejná pravidla jména jako při založení). Vymřelou ves přejmenovat nejde –
 * pamatuje se, jak se jmenovala.
 */
export async function renameVillage(
  deps: { villages: VillageRepository },
  input: RenameVillageInput,
): Promise<VillageResult> {
  const check = checkVillageName(input.name);
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Neplatné jméno vsi.' };
  const current = await loadVillage(deps, input);
  if (current === null) return { ok: false, reason: NO_VILLAGE };
  if (isVillageExtinct(current.state)) return { ok: false, reason: VILLAGE_EXTINCT };
  const name = normalizeVillageName(input.name);
  const renamed = await deps.villages.rename(input.villageId, name);
  if (!renamed) return { ok: false, reason: NO_VILLAGE };
  return { ok: true, village: { ...current, name } };
}
