import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import type { NoticeRepository, PlayerNotice, PlayerNoticeKind } from '@bohemia/game';
import type { Database } from '../client';
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
export function createNoticeRepository(db: Database): NoticeRepository {
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
