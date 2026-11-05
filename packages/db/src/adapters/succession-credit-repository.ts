import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { SuccessionCreditRepository } from '@bohemia/game';
import type { Database } from '../client';
import { successionCredit } from '../schema';

/** Drizzle adaptér portu SuccessionCreditRepository. */
export function createSuccessionCreditRepository(db: Database): SuccessionCreditRepository {
  return {
    async grantOnce(playerId, inviteeId, at): Promise<boolean> {
      const rows = await db
        .insert(successionCredit)
        .values({ playerId, inviteeId, grantedAt: at })
        .onConflictDoNothing({ target: successionCredit.inviteeId })
        .returning({ id: successionCredit.id });
      return rows.length > 0;
    },
    async unused(playerId): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(successionCredit)
        .where(and(eq(successionCredit.playerId, playerId), isNull(successionCredit.usedDay)));
      return row?.n ?? 0;
    },
    async consumeOne(playerId, deathDay): Promise<boolean> {
      // Jediný příkaz: ze souběžných volání si každé vezme jiný řádek (SKIP LOCKED).
      const result = await db.execute(sql`
        UPDATE succession_credit SET used_day = ${deathDay}
        WHERE id = (
          SELECT id FROM succession_credit
          WHERE player_id = ${playerId} AND used_day IS NULL
          ORDER BY granted_at LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `);
      return result.rows.length > 0;
    },
  };
}
