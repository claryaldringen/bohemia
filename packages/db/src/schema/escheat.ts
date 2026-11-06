import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { EscheatPart, EscheatStatus } from '@bohemia/game';
import { house } from './house';

/**
 * Odúmrť (vassalage.md – Vymření rodu – odúmrť): vsi a vazalové vymřelého rodu `dead_house_id`
 * (jedna odúmrť na rod – jedinečný sloupec) připadnou pánům `lord_house_ids` (pořadí dohod, první =
 * technický držitel do rozhodnutí). `plan` = poslední návrh dělení, `consents` = páni, kteří s ním
 * souhlasí; `version` hlídá souběžné návrhy a souhlasy, `status = 'decided'` se zapíše jednou.
 */
export const escheat = pgTable(
  'escheat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deadHouseId: uuid('dead_house_id')
      .notNull()
      .unique()
      .references(() => house.id, { onDelete: 'cascade' }),
    lordHouseIds: jsonb('lord_house_ids').$type<string[]>().notNull(),
    villageIds: jsonb('village_ids').$type<string[]>().notNull(),
    vassalIds: jsonb('vassal_ids').$type<string[]>().notNull(),
    status: text('status').$type<EscheatStatus>().notNull().default('open'),
    plan: jsonb('plan').$type<EscheatPart[]>(),
    consents: jsonb('consents').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('escheat_status_idx').on(table.status)],
);
