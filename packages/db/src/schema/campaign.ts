import { bigint, index, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CampaignOutbox, CampaignState, IntentBody } from '@bohemia/game';
import { user } from './auth';
import { war } from './war';

/**
 * Tažení (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.5). `status` = `active`,
 * dokud tažení neskončí (`done`); celý stav je v kontrolním bodu.
 */
export const campaign = pgTable(
  'campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    warId: uuid('war_id')
      .notNull()
      .references(() => war.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<'active' | 'done'>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('campaign_status_idx').on(table.status)],
);

/**
 * Kontrolní bod tažení – stav spočtený do taktu `tick` (nejvýš po 40 taktech, dřív s událostmi).
 * `outbox` = události do vsí a upozornění spočtené do bodu, které ještě nejsou doručené (uloží se
 * spolu se stavem, doručí po uložení a smažou) – pád mezi uložením a doručením je nezdvojí ani
 * neztratí.
 */
export const campaignCheckpoint = pgTable('campaign_checkpoint', {
  campaignId: uuid('campaign_id')
    .primaryKey()
    .references(() => campaign.id, { onDelete: 'cascade' }),
  tick: bigint('tick', { mode: 'number' }).notNull(),
  state: jsonb('state').$type<CampaignState>().notNull(),
  outbox: jsonb('outbox').$type<CampaignOutbox>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Záměr hráče s taktem, ve kterém platí (teď + 2). `seq` roste se zápisem – v taktu se záměry
 * použijí podle něj. Záměr s taktem nejvýš kontrolním bodem se nezapíše.
 */
export const campaignIntent = pgTable(
  'campaign_intent',
  {
    seq: serial('seq').primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'cascade' }),
    tick: bigint('tick', { mode: 'number' }).notNull(),
    byPlayer: text('by_player').notNull(),
    body: jsonb('body').$type<IntentBody>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('campaign_intent_tick_idx').on(table.campaignId, table.tick, table.seq)],
);
