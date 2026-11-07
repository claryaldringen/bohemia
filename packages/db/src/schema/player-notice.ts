import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Upozornění mezi hráči (pán se dozví o pozvaném, nástupnictví, jednání…). `id` roste – klient si
 * pamatuje poslední viděné a ptá se na novější (`NoticeRepository.after`). `kind` je druh
 * (`PlayerNoticeKind`), `payload` data podle druhu, `game_day` herní den vzniku.
 */
export const playerNotice = pgTable(
  'player_notice',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    gameDay: integer('game_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [index('player_notice_player_idx').on(table.playerId, table.id)],
);
