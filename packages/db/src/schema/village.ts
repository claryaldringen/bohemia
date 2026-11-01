import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  primaryKey,
  uniqueIndex,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { VillageDigest, VillageState, VillageYearRow } from '@bohemia/game';
import { settlement } from './settlement';

/**
 * Vsi sídel – celý stav simulace jako JSON, verze hlídá souběžné zápisy. Sídlo (mapa) má nejvýš
 * jednu ves (Martin 1. 11. 2026: „Jedna ves, jedna mapa“ – migration.md, Víc vsí jednoho hráče) –
 * hlídá unikátní index `village_settlement_uq`.
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
    // Souhrn vsi (`villageDigest`) pro přepínač vsí a konec hry – zapisuje ho adaptér při každém
    // zápisu stavu (pravidla hladu, výmlatu a počasí jsou v jádru, SQL je spočítat neumí). Zdroj
    // pravdy je dál `state`; null, jiná verze tvaru (`isCurrentDigest`) nebo souhrn starší verze
    // stavu = načíst ves celou.
    digest: jsonb('digest').$type<VillageDigest>(),
    // Verze stavu, ze které je souhrn: platí jen při shodě s `version` – zápis stavu mimo adaptér
    // (e2e, ruční SQL) verzi zvýší a souhrn tím zneplatní.
    digestVersion: integer('digest_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // jedna ves, jedna mapa – i archivované sídlo si svou ves nechá, nové sídlo má nové id
    uniqueIndex('village_settlement_uq').on(table.settlementId),
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

/**
 * Deník vsí – jeden řádek za ves a dokončený herní rok (`villageYearRow`), zapisuje ho adaptér
 * při uložení vsi, která přešla přes přelom roku; opakovaný zápis řádek přepíše. Čísla, která se
 * čtou přímo (příkaz `village-log`), jsou sloupce, zbytek v `data`.
 */
export const villageYear = pgTable(
  'village_year',
  {
    villageId: uuid('village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    day: integer('day').notNull(),
    adults: integer('adults').notNull(),
    children: integer('children').notNull(),
    births: integer('births').notNull(),
    deaths: integer('deaths').notNull(),
    deathsHunger: integer('deaths_hunger').notNull(),
    harvestKg: integer('harvest_kg').notNull(),
    storesKg: integer('stores_kg').notNull(),
    hungryDays: integer('hungry_days').notNull(),
    fieldM2: integer('field_m2').notNull(),
    sownM2: integer('sown_m2').notNull(),
    // stáda, správce, stavby, odchody synů, pohromy
    data: jsonb('data').$type<VillageYearData>().notNull(),
    writtenAt: timestamp('written_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.villageId, table.year] })],
);

/** Část řádku deníku, která nemá vlastní sloupec. */
export type VillageYearData = Pick<
  VillageYearRow,
  'herds' | 'stewardOn' | 'built' | 'sonsLeft' | 'disasters' | 'chronicleFull'
>;
