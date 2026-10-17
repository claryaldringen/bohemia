import { obstaclesOf, type Landscape } from '../domain/landscape';
import { advanceVillage, withObstacleClearing, type VillageState } from '../domain/village';
import type { VillageRecord, VillageRepository, VillageResult } from './villages';

/** Kolikrát se akce zkusí znovu, když ves mezitím uložil jiný požadavek. */
const MAX_ATTEMPTS = 5;

export const NO_VILLAGE = 'Ves ještě není založená.';

/** Změna stavu vsi – nový stav, nebo důvod odmítnutí. */
export type VillageChange = { ok: true; state: VillageState } | { ok: false; reason: string };

/** Ves dopočítaná do dneška (už dopočítanou ani „budoucí“ nevrací zpět). */
export function advancedToToday(state: VillageState, today: number): VillageState {
  return state.lastDay >= today ? state : advanceVillage(state, today);
}

/**
 * Načte ves, dopočítá ji do dneška, provede změnu a uloží s kontrolou verze. Při souběhu
 * (verze nesouhlasí) to zkusí znovu nad čerstvým stavem. Nezměněný stav se neukládá.
 * S krajinou sídla doplní vsi z doby před vrstvou překážek odstraněné překážky
 * (`withObstacleClearing` – jednou, pak se uloží).
 */
export async function updateVillage(
  villages: VillageRepository,
  settlementId: string,
  today: number,
  landscape: Landscape | null,
  change: (state: VillageState) => VillageChange,
): Promise<VillageResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const record = await villages.find(settlementId);
    if (record === null) return { ok: false, reason: NO_VILLAGE };
    const current = advancedToToday(record.state, today);
    const cleared =
      landscape !== null && current.clearedObstacles === undefined
        ? withObstacleClearing(current, obstaclesOf(landscape))
        : current;
    const changed = change(cleared);
    if (!changed.ok) return changed;
    if (changed.state === record.state) return { ok: true, village: record };
    const saved: VillageRecord | null = await villages.save(
      settlementId,
      changed.state,
      record.version,
    );
    if (saved !== null) return { ok: true, village: saved };
  }
  throw new Error(`Ves sídla ${settlementId} se nepodařilo uložit – příliš mnoho souběžných změn.`);
}
