import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { LoanInstallment, LoanStatus, MacroGoods } from '@bohemia/game';
import { house } from './house';
import { negotiation } from './negotiation';

/**
 * Půjčka mezi rody (vassalage.md – Pomoc na žádost): samostatná dohoda věřitele a dlužníka, která
 * trvá i po vypovězení vazalství. `negotiation_id` je jedinečný – z jednání vznikne nejvýš jedna
 * půjčka (souběžné přijetí). `schedule` = splátkový kalendář, `paid_kg` = zaplacená hodnota
 * v kg obilí, `status` = `active` / `repaid` / `cancelled`.
 */
export const loan = pgTable(
  'loan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    negotiationId: uuid('negotiation_id')
      .notNull()
      .unique()
      .references(() => negotiation.id, { onDelete: 'cascade' }),
    creditorHouseId: uuid('creditor_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    debtorHouseId: uuid('debtor_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    creditorVillageId: uuid('creditor_village_id').notNull(),
    debtorVillageId: uuid('debtor_village_id'),
    principal: jsonb('principal').$type<MacroGoods>().notNull(),
    schedule: jsonb('schedule').$type<LoanInstallment[]>().notNull(),
    paidKg: doublePrecision('paid_kg').notNull().default(0),
    breaches: integer('breaches').notNull().default(0),
    status: text('status').$type<LoanStatus>().notNull().default('active'),
    sinceAt: timestamp('since_at', { withTimezone: true }).notNull(),
    sinceDay: integer('since_day').notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    index('loan_debtor_active_idx')
      .on(table.debtorHouseId)
      .where(sql`${table.status} = 'active'`),
    index('loan_creditor_idx').on(table.creditorHouseId),
  ],
);
