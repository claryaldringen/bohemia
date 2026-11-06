import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { WarHow, WarStatus } from '@bohemia/game';
import { house } from './house';

/**
 * Válka mezi dvěma rody (war.md – Začátek války): seřazená dvojice (`house_low` < `house_high`),
 * mezi dvojicí smí běžet jediná aktivní válka (částečný unikátní index). `how` = opověď, nebo
 * přepadení; `last_clash_day` = herní den posledního střetu (podle něj válka utichne po 3 letech).
 */
export const war = pgTable(
  'war',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    houseLow: uuid('house_low')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    houseHigh: uuid('house_high')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    how: text('how').$type<WarHow>().notNull(),
    status: text('status').$type<WarStatus>().notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    startedDay: integer('started_day').notNull(),
    lastClashDay: integer('last_clash_day').notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('war_active_pair_uq')
      .on(table.houseLow, table.houseHigh)
      .where(sql`${table.status} = 'active'`),
    index('war_house_high_idx').on(table.houseHigh),
  ],
);

/**
 * Kdy rod poprvé sám napadl (opověděl válku nebo zaútočil) – ukončí ochranu nováčka
 * (war.md – Ochrana nového hráče). Jeden řádek na rod, platí první útok.
 */
export const warAttack = pgTable('war_attack', {
  houseId: uuid('house_id')
    .primaryKey()
    .references(() => house.id, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
});

/** Rod, kterému už přišlo upozornění „Ochrana končí“ (jednou na rod). */
export const warProtectionNotice = pgTable('war_protection_notice', {
  houseId: uuid('house_id')
    .primaryKey()
    .references(() => house.id, { onDelete: 'cascade' }),
  at: timestamp('at', { withTimezone: true }).notNull(),
});
