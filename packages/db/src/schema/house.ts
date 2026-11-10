import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { LanguageGroup, PendingDeparture } from '@bohemia/game';
import { user } from './auth';

/**
 * Rody – hráčův (`kind = 'player'`), nebo NPC. Hráč má nejvýš jeden živý rod (`ended_at` je null);
 * začít znovu = rod skončí (`ended_at`, `ended_day` = herní den konce) a vznikne nový. `lord_*` =
 * osoba (ves + id osoby ve stavu vsi), která je hlavou rodu; obě kolonky se plní a mažou spolu.
 * `senior_*` = naposledy zapsaný senior rodu (kronika hlásí jeho změnu), stejně spojené kolonky.
 * `succession_day` = den smrti hráčova muže, pro který už bylo rozhodnuto, za koho hráč hraje dál
 * (nástupnictví hráče – idempotence); `pending_departure` = odchod vylosovaného mladšího syna po
 * pohřbu, na jehož volbu hráč čeká (ves, syn, den smrti a lhůta; po lhůtě vyrazí výprava sama).
 * `last_ennoble_year` = herní rok posledního povýšení vesničana (nejvýš jedno za rok).
 */
export const house = pgTable(
  'house',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: text('player_id').references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'player' | 'npc'>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedDay: integer('ended_day'),
    lordVillageId: uuid('lord_village_id'),
    lordPersonId: integer('lord_person_id'),
    seniorVillageId: uuid('senior_village_id'),
    seniorPersonId: integer('senior_person_id'),
    successionDay: integer('succession_day'),
    lastEnnobleYear: integer('last_ennoble_year'),
    pendingDeparture: jsonb('pending_departure').$type<PendingDeparture>(),
    // Jazyková skupina rodu – kopie z účtu při založení (newcomers.md – Jazyková skupina).
    language: text('language').$type<LanguageGroup>().default('cs').notNull(),
    // Kdy rod dostal místo na mapě světa (newcomers.md); null – odříznutý nováček čeká na pána.
    // Dosavadní rody migrace umístí k `created_at`; výchozí now() – rod vložený mimo adaptér je na mapě.
    placedAt: timestamp('placed_at', { withTimezone: true }).defaultNow(),
    // Kdy odříznutý nováček poprvé požádal o pána – od té chvíle běží týden (newcomers.md).
    newcomerSince: timestamp('newcomer_since', { withTimezone: true }),
    // Křesťanství (christianity.md): herní rok objevu a herní den křtu rodu; null – dosud ne.
    christianityKnownYear: integer('christianity_known_year'),
    baptizedDay: integer('baptized_day'),
  },
  (table) => [
    // Hráč má nejvýš jeden živý rod – hlídá databáze, i při souběžných požadavcích.
    uniqueIndex('house_player_alive_idx')
      .on(table.playerId)
      .where(sql`${table.endedAt} IS NULL AND ${table.kind} = 'player'`),
  ],
);
