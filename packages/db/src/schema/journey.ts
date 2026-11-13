import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CampaignOutbox, JourneyOrder, JourneyState } from '@bohemia/game';
import { user } from './auth';

/**
 * Výjezd vojvody (lord-control.md; plán 2026-11-13 – Úloha 3). `status` = `active`, dokud výjezd
 * neskončí (`done`); celý stav je v kontrolním bodu. Hráč má nejvýš jeden běžící výjezd – hlídá
 * částečný unikátní index, i při souběžných požadavcích.
 */
export const journey = pgTable(
  'journey',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<'active' | 'done'>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('journey_status_idx').on(table.status),
    uniqueIndex('journey_player_active_idx')
      .on(table.playerId)
      .where(sql`${table.status} = 'active'`),
  ],
);

/** Kontrolní bod výjezdu – stejný význam jako `campaign_checkpoint` (včetně `outbox`). */
export const journeyCheckpoint = pgTable(
  'journey_checkpoint',
  {
    journeyId: uuid('journey_id')
      .primaryKey()
      .references(() => journey.id, { onDelete: 'cascade' }),
    tick: bigint('tick', { mode: 'number' }).notNull(),
    state: jsonb('state').$type<JourneyState>().notNull(),
    outbox: jsonb('outbox').$type<CampaignOutbox>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Body s nedoručenými událostmi (bariéra ves × výjezd – `village-holds.ts`).
    index('journey_checkpoint_outbox_idx')
      .on(table.journeyId)
      .where(sql`${table.outbox} IS NOT NULL`),
  ],
);

/** Rozkaz hráče s taktem, ve kterém platí – jako `campaign_intent`. */
export const journeyIntent = pgTable(
  'journey_intent',
  {
    seq: serial('seq').primaryKey(),
    journeyId: uuid('journey_id')
      .notNull()
      .references(() => journey.id, { onDelete: 'cascade' }),
    tick: bigint('tick', { mode: 'number' }).notNull(),
    byPlayer: text('by_player').notNull(),
    body: jsonb('body').$type<JourneyOrder>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('journey_intent_tick_idx').on(table.journeyId, table.tick, table.seq)],
);
