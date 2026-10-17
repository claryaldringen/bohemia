import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { VillageState } from '@bohemia/game';
import { settlement } from './settlement';

/** Ves sídla – celý stav simulace jako JSON, verze hlídá souběžné zápisy. */
export const village = pgTable('village', {
  settlementId: uuid('settlement_id')
    .primaryKey()
    .references(() => settlement.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  state: jsonb('state').$type<VillageState>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
