import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { LayerVersions, PremiumType, SkeletonSlice } from '@bohemia/game';
import { user } from './auth';

/**
 * Sídla hráčů – krajina (mapa) se generuje ze seedu podle uložených verzí vrstev; na jedné mapě
 * může stát víc vsí hráče (tabulka `village`). Restart hry (vymřely všechny vsi) sídla archivuje:
 * `archived_at` a sídelní už nejsou – data i vsi zůstanou. `grid_x` (sloupec) a `grid_y` (řádek)
 * = poloha mapy ve společné mřížce světa (war.md – Svět, migration.md – odchod na novou mapu);
 * nové sídelní sídlo ji dostane při založení, null mají jen sídla z doby před mřížkou. `weather_seed` = seed
 * počasí kraje (disasters.md – Kraj a ochrana nové vsi): náhodný z databáze, jiný než seed krajiny
 * (ten zná prohlížeč) – klientovi se nikdy neposílá.
 */
export const settlement = pgTable(
  'settlement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    isSeat: boolean('is_seat').notNull().default(false),
    landscapeSeed: integer('landscape_seed').notNull(),
    // nová i stávající sídla (migrace) dostanou náhodný seed – volatilní výchozí se počítá po řádcích
    weatherSeed: integer('weather_seed')
      .notNull()
      .default(sql`floor(random() * 2147483647)::integer`),
    layerVersions: jsonb('layer_versions').$type<LayerVersions>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    gridX: integer('grid_x'),
    gridY: integer('grid_y'),
    // Místní poloha sídla odříznutého rodu (newcomers.md – Odříznutá krajina): rod čeká na pána
    // mimo mapu světa (`grid_*` null) a jeho vsi tvoří vlastní malou mřížku; umístění ji smaže.
    localX: integer('local_x'),
    localY: integer('local_y'),
    // Prémiový typ krajiny (premium-landscapes.md – Kdo dostane jakou krajinu): jen sídelní sídlo
    // lidského hráče založené při vstupu do hry; null = průměrná krajina (i sídla před prémiemi).
    premiumType: text('premium_type').$type<PremiumType>(),
    // Hráč, kterému typ patří (Typ patří hráči – Začít znovu ho nepřelosuje): převod sídla na
    // jiného držitele (odúmrť, postoupení) ho nemění; smazaný účet → null.
    premiumOwnerId: text('premium_owner_id').references(() => user.id, { onDelete: 'set null' }),
    // Výřez kostry světa, ze kterého mapa vznikla (world-skeleton.md – Uložení): body řek a stezek
    // na okraji; krajina se generuje z něj, ne z políčka. Null = suchá mapa (i sídla před kostrou).
    skeleton: jsonb('skeleton').$type<SkeletonSlice>(),
    // čekající držitel (odúmrť – 1. krok převodu `transferHolder`): sídlo nepočítá starý ani nový,
    // dokud ho nový pod svým zámkem nepřevezme (`acceptTransfers`)
    pendingOwnerId: text('pending_owner_id').references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // Každý hráč má nejvýš jedno sídelní sídlo – hlídá databáze, i při souběžných požadavcích.
    uniqueIndex('settlement_owner_seat_idx')
      .on(table.ownerId)
      .where(sql`${table.isSeat}`),
    // Na políčku mřížky světa leží nejvýš jedna aktivní mapa – mřížka je společná všem hráčům
    // (war.md – Svět); nového hráče rozmístí `placeNewPlayer`, souběh rozhodne tento index.
    uniqueIndex('settlement_grid_idx')
      .on(table.gridX, table.gridY)
      .where(sql`${table.archivedAt} IS NULL`),
    // V místní mřížce odříznutého rodu leží na políčku nejvýš jedna aktivní mapa hráče.
    uniqueIndex('settlement_local_idx')
      .on(table.ownerId, table.localX, table.localY)
      .where(sql`${table.archivedAt} IS NULL`),
    // Typ hráče (`lastPremiumType`) a počty typů (`premiumTypeCounts`) – jen prémiová sídla.
    index('settlement_premium_owner_idx')
      .on(table.premiumOwnerId)
      .where(sql`${table.premiumType} IS NOT NULL`),
    // Sídla čekající na nového držitele (`acceptTransfers` – ptá se každá dávka workeru): jen
    // řádky s čekajícím držitelem, takže dotaz nečte celou tabulku a index zůstává malý.
    index('settlement_pending_owner_idx')
      .on(table.pendingOwnerId)
      .where(sql`${table.pendingOwnerId} IS NOT NULL`),
  ],
);
