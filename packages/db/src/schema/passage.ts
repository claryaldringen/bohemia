import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { house } from './house';

/**
 * Ohlášený průchod vojska územím cizího rodu (war.md – Pohyb: Průchod územím neutrálního rodu).
 * Odpověď je podmíněný zápis (`answered_at IS NULL`) – ze dvou souběžných odpovědí projde jedna;
 * válka mezi rody ohlášení zruší (`voided_at`).
 */
export const passage = pgTable(
  'passage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromHouseId: uuid('from_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    toHouseId: uuid('to_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    cells: jsonb('cells').$type<{ x: number; y: number }[]>().notNull(),
    etaDay: integer('eta_day').notNull(),
    message: text('message').notNull(),
    announcedAt: timestamp('announced_at', { withTimezone: true }).notNull(),
    announcedDay: integer('announced_day').notNull(),
    // tažení, pro které ohlášení platí; null – čeká na vyslání tažení rodu
    campaignId: uuid('campaign_id'),
    trust: boolean('trust'),
    reply: text('reply'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
  },
  (t) => [
    index('passage_pair_idx').on(t.fromHouseId, t.toHouseId),
    index('passage_to_idx').on(t.toHouseId),
    index('passage_campaign_idx').on(t.campaignId),
  ],
);
