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
import type { DisputeStatus, Verdict } from '@bohemia/game';
import { house } from './house';

/**
 * Spory mezi vazaly téhož pána (vassalage.md – Mír a spory): žaloba `plaintiff` na `defendant`
 * před pánem `lord`, vyjádření a rozsudek. Mezi týmiž rody smí běžet jediný nerozsouzený spor
 * (jedinečný částečný index na seřazené dvojici rodů). `peace_until_day` platí u rozsudku „mír“,
 * `broken_by` jsou rody, kterým už byl zapsán porušený mír.
 */
export const dispute = pgTable(
  'dispute',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lordHouseId: uuid('lord_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    plaintiffHouseId: uuid('plaintiff_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    defendantHouseId: uuid('defendant_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    /** Seřazená dvojice rodů (`menší|větší`) – klíč pro jedinečnost běžícího sporu. */
    pairKey: text('pair_key').notNull(),
    message: text('message').notNull(),
    statement: text('statement'),
    filedAt: timestamp('filed_at', { withTimezone: true }).notNull(),
    filedDay: integer('filed_day').notNull(),
    status: text('status').$type<DisputeStatus>().notNull().default('filed'),
    verdict: jsonb('verdict').$type<Verdict>(),
    judgedDay: integer('judged_day'),
    peaceUntilDay: integer('peace_until_day'),
    brokenBy: jsonb('broken_by').$type<string[]>().notNull().default([]),
  },
  (table) => [
    index('dispute_lord_idx').on(table.lordHouseId),
    index('dispute_plaintiff_idx').on(table.plaintiffHouseId),
    index('dispute_defendant_idx').on(table.defendantHouseId),
    index('dispute_pair_idx').on(table.pairKey),
    uniqueIndex('dispute_running_uq')
      .on(table.pairKey)
      .where(sql`${table.status} = 'filed'`),
  ],
);
