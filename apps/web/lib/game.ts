import 'server-only';
import { randomInt } from 'node:crypto';
import { createSettlementRepository, createVillageRepository } from '@bohemia/db';
import { dynastyStatus, enterGame, restartGame, type EnterGameResult } from '@bohemia/game';
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

function dynastyDeps(): Parameters<typeof dynastyStatus>[0] {
  const db = getDatabase();
  return {
    settlements: createSettlementRepository(db),
    villages: createVillageRepository(db),
    landscapes,
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
  const today = gameDayIndex(Date.now(), currentWorld());
  if (!today.ok) return today;
  const result = await restartGame(
    { ...dynastyDeps(), seeds: seeds() },
    { playerId, today: today.day, abandon: options.abandon },
  );
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}
