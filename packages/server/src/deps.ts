import { randomInt } from 'node:crypto';
import { createSettlementRepository, createVillageRepository, type Database } from '@bohemia/db';
import type {
  LandscapeSource,
  Pause,
  SettlementRepository,
  VillageRepository,
} from '@bohemia/game';
import { cachedVillages } from './village-cache';

/**
 * Kolik krajin sídel držet v paměti serveru. Krajina sama má ≈ 0,1 MB, s vrstvou překážek
 * (generuje se až pro stavby) ještě 1,8–2,0 MB – změřeno na 20 krajinách; plná mezipaměť
 * tak drží nejvýš ≈ 65 MB.
 */
export const LANDSCAPE_CACHE_SIZE = 32;

/** Kryptografické seedy pro nová sídla a vsi. */
export function seeds(): { nextSeed: () => number } {
  return { nextSeed: () => randomInt(0, 2 ** 31) };
}

/** Závislosti use-casů nad vsemi hráče: sídla, vsi, mezipaměť krajin, přestávky a seedy. */
export interface GameDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  landscapes: LandscapeSource;
  pause: Pause;
  seeds: { nextSeed: () => number };
}

/**
 * Skládání závislostí pro oba vstupní body (web, worker): Drizzle repozitáře, paměť vsí na
 * jeden požadavek (`cachedVillages`), sdílená mezipaměť krajin a přestávky dlouhého dopočtu
 * (`pause` – každý vstupní bod má své).
 */
export function createGameDeps(
  db: Database,
  options: { landscapes: LandscapeSource; pause: Pause },
): GameDeps {
  return {
    settlements: createSettlementRepository(db),
    villages: cachedVillages(createVillageRepository(db)),
    landscapes: options.landscapes,
    pause: options.pause,
    seeds: seeds(),
  };
}
