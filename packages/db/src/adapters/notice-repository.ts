import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { NoticeRepository, PlayerNotice, PlayerNoticeKind } from '@bohemia/game';
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
      // Jedno UPDATE s podvýběrem; FOR UPDATE SKIP LOCKED, aby souběžné volání nevzalo totéž.
      const pick = db
        .select({ id: playerNotice.id })
        .from(playerNotice)
        .where(and(eq(playerNotice.playerId, playerId), isNull(playerNotice.readAt)))
        .orderBy(asc(playerNotice.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      const rows = await db
        .update(playerNotice)
        .set({ readAt: new Date() })
        .where(and(inArray(playerNotice.id, pick), isNull(playerNotice.readAt)))
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
