import 'server-only';
import { randomInt } from 'node:crypto';
import {
  createSettlementRepository,
  createTimeOffsetRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  dynastyStatus,
  enterGame,
  playerTime,
  restartGame,
  skipTime,
  type EnterGameResult,
  type TimeOffsetRepository,
  type TimeSkip,
} from '@bohemia/game';
import { computePause } from './compute-pause';
import { getDatabase } from './db';
import { cachedLandscapes } from './landscape-cache';
import { currentWorld, gameDayIndex } from './world';

/**
 * Kolik krajin sídel držet v paměti serveru. Krajina sama má ≈ 0,1 MB, s vrstvou překážek
 * (generuje se až pro stavby) ještě 1,8–2,0 MB – změřeno na 20 krajinách; plná mezipaměť
 * tak drží nejvýš ≈ 65 MB.
 */
const LANDSCAPE_CACHE_SIZE = 32;
const landscapes = cachedLandscapes(LANDSCAPE_CACHE_SIZE);

function seeds(): { nextSeed: () => number } {
  return { nextSeed: () => randomInt(0, 2 ** 31) };
}

/**
 * Composition root: use-case vstupu do hry s Drizzle repozitářem, kryptografickými seedy
 * a mezipamětí krajin (každá akce vsi i dotaz každých 5 s potřebuje krajinu sídla).
 */
export function enterGameForPlayer(playerId: string): Promise<EnterGameResult> {
  return enterGame(
    { settlements: createSettlementRepository(getDatabase()), seeds: seeds(), landscapes },
    playerId,
  );
}

function timeOffsets(): TimeOffsetRepository {
  return createTimeOffsetRepository(getDatabase());
}

/** Dnešní herní den hráče s jeho posunem času, nebo chyba pro hráče (svět neběží). */
export type PlayerToday =
  { ok: true; day: number; offsetDays: number } | { ok: false; error: string };

/**
 * Dnešní herní den hráče – den světa + posun času hráče (vývojový režim, jinak 0). Podle něj se
 * dopočítávají vsi hráče a provádějí jeho akce.
 */
export async function playerToday(playerId: string): Promise<PlayerToday> {
  const world = gameDayIndex(Date.now(), currentWorld());
  if (!world.ok) return world;
  const time = await playerTime({ offsets: timeOffsets() }, { playerId, worldDay: world.day });
  return { ok: true, day: time.today, offsetDays: time.offsetDays };
}

function dynastyDeps(): Parameters<typeof dynastyStatus>[0] {
  const db = getDatabase();
  return {
    settlements: createSettlementRepository(db),
    villages: createVillageRepository(db),
    landscapes,
    // dlouhý dopočet vsí (přeskok času, restart po dlouhé době) neblokuje ostatní požadavky
    pause: computePause(),
  };
}

/** Hráči vymřely všechny vsi (dopočítané do dneška `today`) – konec hry. */
export async function isGameOverForPlayer(playerId: string, today: number): Promise<boolean> {
  return (await dynastyStatus(dynastyDeps(), { playerId, today })).gameOver;
}

/**
 * Začít znovu (use-case `restartGame`): staré sídlo jde do archivu, hráč dostane nové s novou
 * krajinou a zakládá ves od první zemnice. Bez `abandon` jen po konci hry (obrazovka porážky),
 * s `abandon` i se živou vsí (potvrzení v nabídce hry). Chyba česky pro hráče.
 */
export async function restartGameForPlayer(
  playerId: string,
  options: { abandon: boolean } = { abandon: false },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return today;
  const result = await restartGame(
    { ...dynastyDeps(), seeds: seeds() },
    { playerId, today: today.day, abandon: options.abandon },
  );
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, nebo rok (use-case `skipTime` – bez `devMode`
 * odmítne) a dopočítá jeho vsi do nového dneška. Vrátí nový posun času, nebo chybu česky.
 */
export async function skipTimeForPlayer(
  playerId: string,
  devMode: boolean,
  skip: TimeSkip,
): Promise<{ ok: true; offsetDays: number } | { ok: false; error: string }> {
  const world = gameDayIndex(Date.now(), currentWorld());
  if (!world.ok) return world;
  const result = await skipTime(
    { ...dynastyDeps(), offsets: timeOffsets() },
    { playerId, devMode, worldDay: world.day, skip },
  );
  return result.ok
    ? { ok: true, offsetDays: result.offsetDays }
    : { ok: false, error: result.reason };
}
