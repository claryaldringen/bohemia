import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { VassalTerms, VassalageOrigin } from '@bohemia/game';
import { house } from './house';

/**
 * Vazalství (vassalage.md) – dvoustranná dohoda mezi pánovým a vazalovým rodem. `terms` = podmínky
 * (dávka, služba, cílová ves, odměna – `VassalTerms`), `origin` = jak vzniklo, `since_day` = herní den vzniku, `ended_at`/`end_reason`
 * = konec (vypovězení, vymření…). Živé je vazalství s `ended_at IS NULL`.
 */
export const vassalage = pgTable(
  'vassalage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lordHouseId: uuid('lord_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    vassalHouseId: uuid('vassal_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    terms: jsonb('terms').$type<VassalTerms>().notNull().default({}),
    origin: text('origin').$type<VassalageOrigin>().notNull(),
    sinceAt: timestamp('since_at', { withTimezone: true }).notNull(),
    sinceDay: integer('since_day').notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason'),
    breaches: integer('breaches').notNull().default(0),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    index('vassalage_lord_alive_idx')
      .on(table.lordHouseId)
      .where(sql`${table.endedAt} IS NULL`),
    index('vassalage_vassal_alive_idx')
      .on(table.vassalHouseId)
      .where(sql`${table.endedAt} IS NULL`),
    // dvojice (pán, vazal) má nejvýš jednu živou dohodu (audit A2, M3) – kontrakt portu `create`
    uniqueIndex('vassalage_pair_alive_uq')
      .on(table.lordHouseId, table.vassalHouseId)
      .where(sql`${table.endedAt} IS NULL`),
  ],
);
