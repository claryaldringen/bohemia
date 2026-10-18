import { eq, sql } from 'drizzle-orm';
import type { TimeOffsetRepository } from '@bohemia/game';
import type { Database } from '../client';
import { playerTimeOffset } from '../schema';

/** Drizzle adaptér portu TimeOffsetRepository – hráč bez řádku má posun 0. */
export function createTimeOffsetRepository(db: Database): TimeOffsetRepository {
  return {
    async offsetOf(playerId): Promise<number> {
      const [row] = await db
        .select({ offsetDays: playerTimeOffset.offsetDays })
        .from(playerTimeOffset)
        .where(eq(playerTimeOffset.playerId, playerId))
        .limit(1);
      return row?.offsetDays ?? 0;
    },

    async extend(playerId, days, maxOffset): Promise<number> {
      // Atomicky jedním UPSERTem: souběžná přeskočení se sečtou a posun se nikdy nezmenší.
      const current = sql.raw(`"player_time_offset"."offset_days"`);
      const [row] = await db
        .insert(playerTimeOffset)
        .values({ playerId, offsetDays: Math.min(days, maxOffset) })
        .onConflictDoUpdate({
          target: playerTimeOffset.playerId,
          set: {
            offsetDays: sql`GREATEST(${current}, LEAST(${current} + ${days}, ${maxOffset}))`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ offsetDays: playerTimeOffset.offsetDays });
      if (!row) throw new Error(`Posun času hráče ${playerId} se nepodařilo uložit.`);
      return row.offsetDays;
    },
  };
}
