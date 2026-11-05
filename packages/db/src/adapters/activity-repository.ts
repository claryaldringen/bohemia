import { count, eq } from 'drizzle-orm';
import type { ActivityRepository } from '@bohemia/game';
import type { Database } from '../client';
import { playerActivity } from '../schema';

/** Drizzle adaptér portu ActivityRepository. */
export function createActivityRepository(db: Database): ActivityRepository {
  return {
    async record(playerId, pragueDate): Promise<void> {
      await db.insert(playerActivity).values({ playerId, pragueDate }).onConflictDoNothing();
    },
    async distinctDays(playerId): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(playerActivity)
        .where(eq(playerActivity.playerId, playerId));
      return row?.n ?? 0;
    },
  };
}
