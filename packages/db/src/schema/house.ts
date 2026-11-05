import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Rody – hráčův (`kind = 'player'`), nebo NPC. Hráč má nejvýš jeden živý rod (`ended_at` je null);
 * začít znovu = rod skončí (`ended_at`, `ended_day` = herní den konce) a vznikne nový. `lord_*` =
 * osoba (ves + id osoby ve stavu vsi), která je hlavou rodu; obě kolonky se plní a mažou spolu.
 */
export const house = pgTable(
  'house',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: text('player_id').references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'player' | 'npc'>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedDay: integer('ended_day'),
    lordVillageId: uuid('lord_village_id'),
    lordPersonId: integer('lord_person_id'),
  },
  (table) => [
    // Hráč má nejvýš jeden živý rod – hlídá databáze, i při souběžných požadavcích.
    uniqueIndex('house_player_alive_idx')
      .on(table.playerId)
      .where(sql`${table.endedAt} IS NULL AND ${table.kind} = 'player'`),
  ],
);
