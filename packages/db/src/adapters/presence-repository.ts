import { inArray, sql } from 'drizzle-orm';
import type { PresenceRepository } from '@bohemia/game';
import type { Database } from '../client';
import { playerPresence } from '../schema';

/** Drizzle adaptér portu PresenceRepository. */
export function createPresenceRepository(db: Database): PresenceRepository {
  return {
    async note(playerId, at): Promise<void> {
      await db
        .insert(playerPresence)
        .values({ playerId, seenAt: at })
        .onConflictDoUpdate({
          target: playerPresence.playerId,
          set: { seenAt: sql`GREATEST(${playerPresence.seenAt}, excluded.seen_at)` },
        });
    },
    async lastSeen(playerIds): Promise<Map<string, number>> {
      if (playerIds.length === 0) return new Map();
      const rows = await db
        .select({ playerId: playerPresence.playerId, seenAt: playerPresence.seenAt })
        .from(playerPresence)
        .where(inArray(playerPresence.playerId, [...playerIds]));
      return new Map(rows.map((r) => [r.playerId, r.seenAt.getTime()]));
    },
  };
}
