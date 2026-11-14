import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { house } from './house';

/**
 * Jednání mezi dvěma rody (vassalage.md). Dvojice je uložená seřazená (`party_low` < `party_high`),
 * aby šlo unikátním částečným indexem zajistit nejvýš jedno otevřené jednání mezi rody bez ohledu
 * na směr. `opener` = rod, který jednání zahájil (jeden z dvojice). `version` roste při každé
 * změně stavu – na ní stojí podmíněné `setStatus`.
 */
export const negotiation = pgTable(
  'negotiation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partyLow: uuid('party_low')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    partyHigh: uuid('party_high')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    opener: uuid('opener')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    status: text('status')
      .$type<'open' | 'accepted' | 'rejected' | 'withdrawn' | 'ended' | 'expired'>()
      .notNull()
      .default('open'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // Žádost nováčka o pána (newcomers.md – Nabídka pánů): pán jen přijme / odmítne.
    newcomer: boolean('newcomer').notNull().default(false),
  },
  (table) => [
    uniqueIndex('negotiation_open_pair_uq')
      .on(table.partyLow, table.partyHigh)
      .where(sql`${table.status} = 'open'`),
    index('negotiation_low_idx').on(table.partyLow),
    index('negotiation_high_idx').on(table.partyHigh),
  ],
);

/**
 * Schránka účinků přijatého jednání (audit A2, `acceptance-outbox.ts`): co se po transakci přijetí
 * provede (pomoc, výkupné, mír, dialogy obchodu, kronika). Zapíše se v transakci přijetí, smaže se
 * po provedení; spadne-li web mezi tím, dokončí ji worker. Jedna na jednání. Kdo ji provádí, drží
 * **nájem** (`claim`, `next_at`) – převzetí je krátký `UPDATE`, během účinků se nedrží žádné
 * spojení; výjimka se započítá do `attempts` a odloží `next_at`.
 */
export const negotiationOutbox = pgTable('negotiation_outbox', {
  negotiationId: uuid('negotiation_id')
    .primaryKey()
    .references(() => negotiation.id, { onDelete: 'cascade' }),
  /** Uložený tvar `Accepted` s verzí `v`. */
  effects: jsonb('effects').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /**
   * Nejdřív kdy ji smí převzít jiný proces (hodiny databáze): konec nájmu toho, kdo ji provádí
   * (od zápisu ji drží web), nebo konec odkladu po výjimce.
   */
  nextAt: timestamp('next_at', { withTimezone: true }).notNull().defaultNow(),
  /** Nájem toho, kdo ji právě provádí (null – nikdo). */
  claim: uuid('claim'),
  /** Kolik pokusů skončilo výjimkou; od `ACCEPTANCE_OUTBOX_MAX_ATTEMPTS` čeká na ruční zásah. */
  attempts: integer('attempts').notNull().default(0),
  /** Poslední výjimka – pro ruční zásah. */
  lastError: text('last_error'),
});

/** Kolo jednání (podmínky jedné strany + vzkaz); `seq` = pořadí od 1. */
export const negotiationRound = pgTable(
  'negotiation_round',
  {
    negotiationId: uuid('negotiation_id')
      .notNull()
      .references(() => negotiation.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    authorHouseId: uuid('author_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    items: jsonb('items').$type<unknown[]>().notNull(),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.negotiationId, table.seq] })],
);

/** Blokování: rod `blocker` nepřijímá nabídky od rodu `blocked`. */
export const playerBlock = pgTable(
  'player_block',
  {
    blockerHouseId: uuid('blocker_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    blockedHouseId: uuid('blocked_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.blockerHouseId, table.blockedHouseId] })],
);

/**
 * Poslední odmítnutí: rod `rejecter` odmítl návrh rodu `proposer` v čase `at` (pauza po odmítnutí,
 * `canOpen.rejectedByTargetAt`). Jeden řádek na dvojici, nové odmítnutí přepíše čas.
 */
export const negotiationReject = pgTable(
  'negotiation_reject',
  {
    proposerHouseId: uuid('proposer_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    rejecterHouseId: uuid('rejecter_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.proposerHouseId, table.rejecterHouseId] })],
);
