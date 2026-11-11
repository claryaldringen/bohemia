import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
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

/** Bajty (PostgreSQL `bytea`) – node-postgres je čte i posílá jako `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * Vsi sídel – celý stav simulace (zstd komprimovaný JSON po částech, kodek
 * `adapters/village-state-codec.ts`), verze hlídá souběžné zápisy. Sídlo (mapa) má nejvýš
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
    // Starý tvar – celý stav jako jsonb; jen u vsí, které se od migrace 0043 neuložily (líný
    // převod: první zápis adaptéru ho vynuluje a zapíše `state_day` / `state_land`).
    state: jsonb('state').$type<VillageState>(),
    // Denní část stavu (zstd JSON) – zapisuje se při každém uložení; nese i pořadí klíčů.
    stateDay: bytea('state_day'),
    // Zemská část stavu (zstd JSON) – zapisuje se jen při změně `land_hash`.
    stateLand: bytea('state_land'),
    landHash: text('land_hash'),
    version: integer('version').notNull().default(1),
    // Odvozené ze stavu při každém zápisu adaptéru (zdroj pravdy je stav): den dopočtu a spánek
    // vsi (vymřelá / opuštěná – `isVillageExtinct` / `isVillageAbandoned`) jdou zjistit bez
    // rozbalení stavu (fronta workeru, dotazování na ves).
    lastDay: integer('last_day'),
    asleep: boolean('asleep').notNull(),
    // klíč založení vsi (`VillageState.origin`) – ves ze schránky správce vznikne právě jednou
    origin: text('origin'),
    // útěk vsi (`VillageState.refuge`) – úloha světa návratu (refuge-repository.ts)
    refugeRefId: text('refuge_ref_id'),
    refugeHostVillageId: text('refuge_host_village_id'),
    // Souhrn vsi (`villageDigest`) pro přepínač vsí a konec hry – zapisuje ho adaptér při každém
    // zápisu stavu (pravidla hladu, výmlatu a počasí jsou v jádru, SQL je spočítat neumí). Zdroj
    // pravdy je dál stav; null, jiná verze tvaru (`isCurrentDigest`) nebo souhrn starší verze
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
      .on(table.origin)
      .where(sql`${table.origin} IS NOT NULL`),
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
