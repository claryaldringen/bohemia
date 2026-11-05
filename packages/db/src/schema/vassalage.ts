import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { house } from './house';

/**
 * Vazalství (vassalage.md) – dvoustranná dohoda mezi pánovým a vazalovým rodem. `terms` = podmínky
 * (zatím prázdné), `origin` = jak vzniklo, `since_day` = herní den vzniku, `ended_at`/`end_reason`
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
    terms: jsonb('terms').$type<Record<string, never>>().notNull().default({}),
    origin: text('origin')
      .$type<'invite' | 'negotiation' | 'escheat' | 'ennoble' | 'peace'>()
      .notNull(),
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
  ],
);
