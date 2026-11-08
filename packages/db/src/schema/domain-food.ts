import { index, integer, jsonb, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { DomainDelivery } from '@bohemia/game';
import { village } from './village';

/**
 * Kolo jídla domény (hillfort.md – Jídlo domény; `docs/code/vassalage.md`): rozhodnutí vsi-dárce
 * na herní rok. Plán (`deliveries`, i prázdný = ves letos nedá nic) se zapíše NAPŘED a teprve pak
 * se provede zásilkami – po pádu se pošle uložený plán, nový se nepočítá. Jeden řádek na ves a rok
 * (PK), druhý zápis vrátí první. `finished_at` je null, dokud plán není proveden.
 */
export const domainFoodRound = pgTable(
  'domain_food_round',
  {
    villageId: uuid('village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    day: integer('day').notNull(),
    deliveries: jsonb('deliveries').$type<DomainDelivery[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.villageId, table.year] }),
    // neprovedené plány (po pádu), nejstarší napřed
    index('domain_food_round_created_idx').on(table.createdAt),
  ],
);
