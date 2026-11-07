import { integer, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Nástupnictví bez losu za pozvaného (vassalage.md): jeden kredit pozvateli za každý pozvaný účet,
 * který začal hrát. `invitee_id` je unikátní – kredit se připíše jednou za pozvaného. `used_day`
 * = herní den, kdy ho pozvatel použil při nástupnictví (null = nevyužitý).
 */
export const successionCredit = pgTable(
  'succession_credit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inviteeId: text('invitee_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    usedDay: integer('used_day'),
  },
  (table) => [index('succession_credit_player_idx').on(table.playerId)],
);
