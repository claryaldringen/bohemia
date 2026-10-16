import 'server-only';
import { randomInt } from 'node:crypto';
import { createSettlementRepository } from '@bohemia/db';
import { enterGame, type EnterGameResult } from '@bohemia/game';
import { getDatabase } from './db';

/** Composition root: use-case vstupu do hry s Drizzle repozitářem a kryptografickými seedy. */
export function enterGameForPlayer(playerId: string): Promise<EnterGameResult> {
  return enterGame(
    {
      settlements: createSettlementRepository(getDatabase()),
      seeds: { nextSeed: () => randomInt(0, 2 ** 31) },
    },
    playerId,
  );
}
