import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { StewardKind } from '@bohemia/game';
import { house } from './house';
import { vassalage } from './vassalage';

/**
 * Správa cizí vsi (vassalage.md – Hráč jako správce cizí vsi): ves `village_id` drží rod
 * `holder_house_id`, formálně ji spravuje rod `steward_house_id`. Živá správa má `ended_at IS NULL`
 * – jedinečný částečný index zaručí nejvýš jednu živou správu na ves (souběžné přijetí dvou
 * nabídek). `vassalage_id` = dohoda, na které správa stojí (její konec správu ukončí); NPC správce
 * (povýšený vesničan) je `kind = 'npc'`.
 */
export const stewardship = pgTable(
  'stewardship',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    villageId: uuid('village_id').notNull(),
    stewardHouseId: uuid('steward_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    holderHouseId: uuid('holder_house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<StewardKind>().notNull().default('player'),
    vassalageId: uuid('vassalage_id').references(() => vassalage.id, { onDelete: 'set null' }),
    sinceAt: timestamp('since_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason'),
  },
  (table) => [
    uniqueIndex('stewardship_village_alive_idx')
      .on(table.villageId)
      .where(sql`${table.endedAt} IS NULL`),
    index('stewardship_steward_alive_idx')
      .on(table.stewardHouseId)
      .where(sql`${table.endedAt} IS NULL`),
    index('stewardship_vassalage_idx').on(table.vassalageId),
  ],
);
