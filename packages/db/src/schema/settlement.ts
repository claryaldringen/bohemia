import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { LayerVersions } from '@bohemia/game';
import { user } from './auth';

/**
 * Sídla hráčů – krajina se generuje ze seedu podle uložených verzí vrstev. Restart hry (vymřely
 * všechny vsi) sídla archivuje: `archived_at` a sídelní už nejsou – data i ves zůstanou.
 */
export const settlement = pgTable(
  'settlement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    isSeat: boolean('is_seat').notNull().default(false),
    landscapeSeed: integer('landscape_seed').notNull(),
    layerVersions: jsonb('layer_versions').$type<LayerVersions>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  // Každý hráč má nejvýš jedno sídelní sídlo – hlídá databáze, i při souběžných požadavcích.
  (table) => [
    uniqueIndex('settlement_owner_seat_idx')
      .on(table.ownerId)
      .where(sql`${table.isSeat}`),
  ],
);
