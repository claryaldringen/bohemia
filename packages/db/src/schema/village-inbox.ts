import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { VillageEventBody } from '@bohemia/game';
import { village } from './village';

/**
 * Schránka vsi (docs/code/world.md – Schránka vsi): události od cizích (jiný hráč, svět), které
 * dopočet vsi použije na začátku jejich herního dne. `seq` dává pořadí zápisu, `ref` je jedinečný
 * klíč (opakovaný zápis téže věci se zahodí), `day` je herní den použití.
 */
export const villageInbox = pgTable(
  'village_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    villageId: uuid('village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    day: integer('day').notNull(),
    ref: text('ref').notNull().unique(),
    body: jsonb('body').$type<VillageEventBody>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('village_inbox_village_day_idx').on(table.villageId, table.day)],
);
