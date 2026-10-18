import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Posun času hráče ve dnech – vývojový režim (accounts.md): dnešní den hráče = den světa + posun.
 * Hráč bez řádku má posun 0; posun jen roste.
 */
export const playerTimeOffset = pgTable(
  'player_time_offset',
  {
    playerId: text('player_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    offsetDays: integer('offset_days').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('player_time_offset_days_check', sql`${table.offsetDays} >= 0`)],
);
