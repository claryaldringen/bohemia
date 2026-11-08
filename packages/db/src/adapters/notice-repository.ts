import { and, asc, desc, eq, gt, isNull, lt, lte, sql } from 'drizzle-orm';
import {
  NOTICES_KEPT_PER_PLAYER,
  type NoticeRepository,
  type PlayerNotice,
  type PlayerNoticeKind,
} from '@bohemia/game';
import type { Executor } from '../client';
import { playerNotice } from '../schema';

type NoticeRow = typeof playerNotice.$inferSelect;

function toNotice(row: NoticeRow): PlayerNotice {
  return {
    id: row.id,
    playerId: row.playerId,
    kind: row.kind as PlayerNoticeKind,
    payload: row.payload,
    gameDay: row.gameDay,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

/** Drizzle adaptér portu NoticeRepository. */
export function createNoticeRepository(db: Executor): NoticeRepository {
  return {
    async post(notice): Promise<void> {
      await db.insert(playerNotice).values(notice);
      // Omezení historie (návrh Clauda, bez migrace): starší než posledních NOTICES_KEPT_PER_PLAYER
      // pryč; hranici dá index (player_id, id), takže dotaz sahá jen na konec řady hráče.
      await db.delete(playerNotice).where(
        and(
          eq(playerNotice.playerId, notice.playerId),
          lt(
            playerNotice.id,
            sql`(SELECT ${playerNotice.id} FROM ${playerNotice}
              WHERE ${playerNotice.playerId} = ${notice.playerId}
              ORDER BY ${playerNotice.id} DESC OFFSET ${NOTICES_KEPT_PER_PLAYER - 1} LIMIT 1)`,
          ),
        ),
      );
    },
    async page(playerId, beforeId, limit): Promise<PlayerNotice[]> {
      const rows = await db
        .select()
        .from(playerNotice)
        .where(
          and(
            eq(playerNotice.playerId, playerId),
            beforeId === null ? undefined : lt(playerNotice.id, beforeId),
          ),
        )
        .orderBy(desc(playerNotice.id))
        .limit(limit);
      return rows.map(toNotice);
    },
    async after(playerId, afterId, limit): Promise<PlayerNotice[]> {
      const rows = await db
        .select()
        .from(playerNotice)
        .where(and(eq(playerNotice.playerId, playerId), gt(playerNotice.id, afterId)))
        .orderBy(asc(playerNotice.id))
        .limit(limit);
      return rows.map(toNotice);
    },
    async takeUnread(playerId, limit): Promise<PlayerNotice[]> {
      // Výběr v CTE s FOR UPDATE SKIP LOCKED: Postgres ho spustí právě jednou (CTE se zámkem se
      // nevkládá do dotazu). Podvýběr s LIMIT ve `WHERE id IN (…)` by plánovač smel spustit
      // opakovaně a označit víc řádků, než je limit – upozornění by zmizela nedoručená.
      const picked = db.$with('picked').as(
        db
          .select({ id: playerNotice.id })
          .from(playerNotice)
          .where(and(eq(playerNotice.playerId, playerId), isNull(playerNotice.readAt)))
          .orderBy(asc(playerNotice.id))
          .limit(limit)
          .for('update', { skipLocked: true }),
      );
      const rows = await db
        .with(picked)
        .update(playerNotice)
        .set({ readAt: new Date() })
        .from(picked)
        .where(eq(playerNotice.id, picked.id))
        .returning();
      return rows.map(toNotice).sort((a, b) => a.id - b.id);
    },
    async markRead(playerId, upToId): Promise<void> {
      await db
        .update(playerNotice)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(playerNotice.playerId, playerId),
            lte(playerNotice.id, upToId),
            isNull(playerNotice.readAt),
          ),
        );
    },
  };
}
