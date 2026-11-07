import type { Settlement, SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Víc vsí jednoho hráče (migration.md – Víc vsí jednoho hráče): hráč má aktivní sídla (mapy)
// a na každém nejvýš jednu ves (Martin 1. 11. 2026: „Jedna ves, jedna mapa“). Akce nad vsí jdou podle id vsi – vstupní bod nejdřív ověří, že
// ves patří hráči (její sídlo je mezi jeho aktivními sídly).

export interface PlayerVillagesDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
}

/** Ves hráče s jejím sídlem (mapou) – uložený stav, nedopočítaný. */
export interface PlayerVillage {
  settlement: Settlement;
  village: VillageRecord;
}

/** Ves nepatří hráči, neexistuje, nebo leží v archivovaném sídle. */
export const NOT_PLAYER_VILLAGE = 'Tahle ves ti nepatří.';

/**
 * Ves `villageId` hráče s jejím sídlem; null, když ves neexistuje, patří jinému hráči nebo leží
 * v sídle archivovaném restartem hry.
 */
export async function findPlayerVillage(
  deps: PlayerVillagesDeps,
  input: { playerId: string; villageId: string },
): Promise<PlayerVillage | null> {
  const village = await deps.villages.find(input.villageId);
  if (!village) return null;
  const settlements = await deps.settlements.listActive(input.playerId);
  const settlement = settlements.find((s) => s.id === village.settlementId);
  return settlement ? { settlement, village } : null;
}

/**
 * První ves hráče – v pořadí aktivních sídel (sídelní první); null,
 * když hráč ještě žádnou ves nemá (zakládá ves první zemnicí).
 */
export async function firstPlayerVillage(
  deps: PlayerVillagesDeps,
  playerId: string,
): Promise<PlayerVillage | null> {
  for (const settlement of await deps.settlements.listActive(playerId)) {
    const [village] = await deps.villages.listBySettlement(settlement.id);
    if (village) return { settlement, village };
  }
  return null;
}
