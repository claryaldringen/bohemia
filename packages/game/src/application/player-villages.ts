import { obstaclesOf, tileCenterWorld } from '../domain/landscape';
import { freeVillageSite, suggestVillageName, villagePoints } from '../domain/village';
import { settlementLandscape } from './enter-game';
import { foundAnotherVillage } from './found-village';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository, VillageResult } from './villages';

// Víc vsí jednoho hráče (migration.md – Víc vsí jednoho hráče): hráč má aktivní sídla (mapy)
// a na každém může mít víc vsí. Akce nad vsí jdou podle id vsi – vstupní bod nejdřív ověří, že
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
 * První ves hráče – v pořadí aktivních sídel (sídelní první) a vsí sídla (podle založení); null,
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

/** Druhou ves jde založit z vývojového režimu jen s příznakem účtu. */
export const DEV_VILLAGE_ONLY = 'Druhou ves jde takhle založit jen ve vývojovém režimu.';
/** Na mapě není místo, které by leželo dost daleko od ostatních vsí. */
export const NO_ROOM_FOR_VILLAGE = 'Na mapě už není místo pro další ves.';

export interface FoundDevVillageInput {
  playerId: string;
  /** Hráč má vývojový režim (příznak účtu) – jinak akce nejde. */
  devMode: boolean;
  /** Ves, na jejíž mapě (sídle) nová ves vznikne. */
  villageId: string;
  /** Dnešní herní den hráče (index dne). */
  today: number;
}

/**
 * Vývojový režim: založí na mapě vsi `villageId` další ves – jen pro vyzkoušení přepínače vsí,
 * dokud odchod do nové vsi (fáze 3 a 4 migration.md) není. Nová ves začíná jako každá (4 lidé
 * a zásoby, stavba první zemnice) – lidé ze staré vsi neodcházejí. Zemnici postaví na nejbližším
 * volném místě k místu vsi krajiny, nejméně 300 m od ostatních vsí (`freeVillageSite`), jméno
 * navrhne hra.
 */
export async function foundDevVillage(
  deps: PlayerVillagesDeps & { seeds: SeedSource; landscapes?: LandscapeSource },
  input: FoundDevVillageInput,
): Promise<VillageResult> {
  if (!input.devMode) return { ok: false, reason: DEV_VILLAGE_ONLY };
  const found = await findPlayerVillage(deps, input);
  if (!found) return { ok: false, reason: NOT_PLAYER_VILLAGE };
  const landscape = settlementLandscape(found.settlement, deps.landscapes);
  const others = await deps.villages.listBySettlement(found.settlement.id);
  const points = others.flatMap((v) =>
    villagePoints(v.state, (x, y) => tileCenterWorld(landscape, x, y)),
  );
  const site = freeVillageSite(landscape, points, obstaclesOf(landscape));
  if (!site) return { ok: false, reason: NO_ROOM_FOR_VILLAGE };
  return foundAnotherVillage(deps, {
    settlementId: found.settlement.id,
    landscape,
    today: input.today,
    name: suggestVillageName(deps.seeds.nextSeed()),
    dwelling: site,
  });
}
