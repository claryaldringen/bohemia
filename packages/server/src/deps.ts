import { randomInt } from 'node:crypto';
import {
  createLockPool,
  createPlayerLock,
  createSettlementRepository,
  createVillageRepository,
  type Database,
} from '@bohemia/db';
import type {
  LandscapeSource,
  Pause,
  PlayerLock,
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

/**
 * Spojení v poolu zámků hráčů (plán workeru – Souběh web × worker): web drží zámek po dobu dotazu
 * nebo akce hráče (jeden na hráče – fronta v procesu), worker jednu dávku jedné vsi.
 */
export const WEB_LOCK_POOL_SIZE = 20;
export const WORKER_LOCK_POOL_SIZE = 2;

/** Zámek hráče v Postgresu s vlastním malým poolem spojení; `close` pool zavře (konec procesu). */
export function createPlayerLocks(
  url: string,
  max: number,
): { locks: PlayerLock; close: () => Promise<void> } {
  const pool = createLockPool(url, max);
  return { locks: createPlayerLock(pool), close: () => pool.end() };
}

/** Závislosti use-casů nad vsemi hráče: sídla, vsi, mezipaměť krajin, přestávky, seedy a zámek. */
export interface GameDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  landscapes: LandscapeSource;
  pause: Pause;
  seeds: { nextSeed: () => number };
  locks: PlayerLock;
}

/**
 * Skládání závislostí pro oba vstupní body (web, worker): Drizzle repozitáře, paměť vsí na
 * jeden požadavek (`cachedVillages`), sdílená mezipaměť krajin, přestávky dlouhého dopočtu
 * (`pause` – každý vstupní bod má své) a zámek hráče (`createPlayerLocks` – jeden na proces).
 */
export function createGameDeps(
  db: Database,
  options: { landscapes: LandscapeSource; pause: Pause; locks: PlayerLock },
): GameDeps {
  return {
    settlements: createSettlementRepository(db),
    villages: cachedVillages(createVillageRepository(db)),
    landscapes: options.landscapes,
    pause: options.pause,
    seeds: seeds(),
    locks: options.locks,
  };
}
