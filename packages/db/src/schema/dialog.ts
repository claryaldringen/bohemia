import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Dialogy hráče (vassalage.md – Roční dialog 1. 11.): roční Odvody a další otázky, na které hráč
 * odpovídá sám. `key` je jedinečný (dialog se nikdy neotevře dvakrát), `ref_id` odkazuje na to,
 * k čemu se vztahuje (u Odvodů id vazalství); `status` je `open` / `answered` / `dropped`.
 */
export const dialog = pgTable(
  'dialog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    key: text('key').notNull().unique(),
    refId: text('ref_id').notNull(),
    year: integer('year').notNull(),
    years: integer('years').notNull().default(1),
    body: jsonb('body').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (table) => [
    index('dialog_player_status_idx').on(table.playerId, table.status),
    index('dialog_ref_idx').on(table.refId),
  ],
);
