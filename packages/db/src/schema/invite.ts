import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Pozvánkové kódy (vassalage.md – Čísla, Pro implementaci). Kód je primární klíč (8 znaků
 * bez O, I, L, 0, 1). `reserved_*` = nový hráč kód zadal při registraci, `used_*` = kód se
 * využil při vstupu do hry.
 */
export const inviteCode = pgTable(
  'invite_code',
  {
    code: text('code').primaryKey(),
    issuerId: text('issuer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    reservedBy: text('reserved_by').references(() => user.id, { onDelete: 'set null' }),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('invite_code_issuer_idx').on(table.issuerId),
    index('invite_code_reserved_idx').on(table.reservedBy),
  ],
);
