import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ShipmentBody } from '@bohemia/game';
import { village } from './village';

/**
 * Zásilka mezi vsemi různých hráčů (vassalage.md – Doprava a cílová ves). Řádek vznikne při
 * odeslání (rezervace), `posted_at` značí, že událost `shipment` je zapsaná ve schránce cílové vsi
 * (`ship:<id>`); chybí-li po pádu, dopíše ji `reconcileShipments`. `settled_at` = doručená nebo
 * vrácená odesílateli. Řádky bez `settled_at` jsou seznam „na cestě“. `ref_id` je jedinečný
 * klíč odeslání (opakované odeslání nic nezdvojí).
 */
export const shipment = pgTable(
  'shipment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromVillageId: uuid('from_village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    toVillageId: uuid('to_village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    bundle: jsonb('bundle').$type<ShipmentBody>().notNull(),
    purpose: text('purpose').notNull(),
    refId: text('ref_id').notNull().unique(),
    sentDay: integer('sent_day').notNull(),
    arrivesDay: integer('arrives_day').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    index('shipment_to_idx').on(table.toVillageId),
    index('shipment_from_idx').on(table.fromVillageId),
  ],
);
