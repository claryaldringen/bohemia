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
 * Sídla hráčů – krajina (mapa) se generuje ze seedu podle uložených verzí vrstev; na jedné mapě
 * může stát víc vsí hráče (tabulka `village`). Restart hry (vymřely všechny vsi) sídla archivuje:
 * `archived_at` a sídelní už nejsou – data i vsi zůstanou. `grid_x` (sloupec) a `grid_y` (řádek)
 * = poloha mapy v mřížce světa (war.md – Svět, migration.md – odchod na novou mapu); sídelní
 * sídlo z doby před mřížkou ji nemá (null).
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
    gridX: integer('grid_x'),
    gridY: integer('grid_y'),
  },
  (table) => [
    // Každý hráč má nejvýš jedno sídelní sídlo – hlídá databáze, i při souběžných požadavcích.
    uniqueIndex('settlement_owner_seat_idx')
      .on(table.ownerId)
      .where(sql`${table.isSeat}`),
    // Na políčku mřížky světa leží nejvýš jedna aktivní mapa (svět je jeden pro všechny hráče).
    uniqueIndex('settlement_grid_idx')
      .on(table.gridX, table.gridY)
      .where(sql`${table.archivedAt} IS NULL`),
  ],
);
