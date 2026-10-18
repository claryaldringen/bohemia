import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { VillageState } from '@bohemia/game';
import { settlement } from './settlement';

/**
 * Vsi sídel – celý stav simulace jako JSON, verze hlídá souběžné zápisy. Sídlo (mapa) může mít
 * víc vsí (migration.md – Víc vsí jednoho hráče); pořadí vsí sídla dává `created_at`.
 */
export const village = pgTable(
  'village',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    settlementId: uuid('settlement_id')
      .notNull()
      .references(() => settlement.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    state: jsonb('state').$type<VillageState>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('village_settlement_idx').on(table.settlementId, table.createdAt)],
);
