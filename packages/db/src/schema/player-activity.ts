import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Aktivní dny hráče – dny (podle data v Europe/Prague, text `YYYY-MM-DD`), kdy byl ve hře.
 * Podle počtu různých dnů se pozvaný hráč počítá jako „začal hrát“ (vassalage.md).
 */
export const playerActivity = pgTable(
  'player_activity',
  {
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    pragueDate: text('prague_date').notNull(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.pragueDate] })],
);

/**
 * Poslední přítomnost hráče u hry – okamžik, kdy měl naposled otevřenou kteroukoli svou ves
 * nebo dal jakýkoli pokyn (war.md – Hráč ve vsi a mimo ni). Jeden řádek na hráče.
 */
export const playerPresence = pgTable('player_presence', {
  playerId: text('player_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
});
