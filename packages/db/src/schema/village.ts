import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
    // Odvozené ze stavu při každém zápisu (zdroj pravdy je dál JSON `state`): den dopočtu a spánek
    // vsi (vymřelá / opuštěná – pravidlo jako `isVillageExtinct` / `isVillageAbandoned`) jdou
    // zjistit bez rozbalení JSON (fronta workeru, dotazování na ves).
    lastDay: integer('last_day').generatedAlwaysAs(sql`(state->>'lastDay')::int`),
    asleep: boolean('asleep')
      .notNull()
      .generatedAlwaysAs(sql`(state ? 'extinctDay') OR (state ? 'abandonedDay')`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('village_settlement_idx').on(table.settlementId, table.createdAt),
    // fronta workeru: nespící vsi sídla podle dne dopočtu
    index('village_awake_day_idx')
      .on(table.settlementId, table.lastDay)
      .where(sql`NOT ${table.asleep}`),
    // klíč založení vsi (`VillageState.origin`) – ves ze schránky správce vznikne právě jednou
    uniqueIndex('village_origin_uq')
      .using('btree', sql`(${table.state}->>'origin')`)
      .where(sql`${table.state}->>'origin' IS NOT NULL`),
  ],
);
