import 'server-only';
import { randomInt } from 'node:crypto';
import { createSettlementRepository } from '@bohemia/db';
import { enterGame, type EnterGameResult } from '@bohemia/game';
import { getDatabase } from './db';
import { cachedLandscapes } from './landscape-cache';

/** Kolik krajin sídel držet v paměti serveru (jedna má stovky kB). */
const LANDSCAPE_CACHE_SIZE = 32;
const landscapes = cachedLandscapes(LANDSCAPE_CACHE_SIZE);

/**
 * Composition root: use-case vstupu do hry s Drizzle repozitářem, kryptografickými seedy
 * a mezipamětí krajin (každá akce vsi i dotaz každých 5 s potřebuje krajinu sídla).
 */
export function enterGameForPlayer(playerId: string): Promise<EnterGameResult> {
  return enterGame(
    {
      settlements: createSettlementRepository(getDatabase()),
      seeds: { nextSeed: () => randomInt(0, 2 ** 31) },
      landscapes,
    },
    playerId,
  );
}
