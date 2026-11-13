import { index, integer, jsonb, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { SeenCell } from '@bohemia/game';
import { house } from './house';

/**
 * Znalost rodu o mapách (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 10): co muži
 * při výjezdech viděli – stopa a naposled viděné stavby (`SeenCell`) – po políčkách světa. Soukromé
 * rodu; řádek smaže zánik rodu. Zápis jen sloučením (`KnowledgeRepository.merge`).
 */
export const houseKnowledge = pgTable(
  'house_knowledge',
  {
    houseId: uuid('house_id')
      .notNull()
      .references(() => house.id, { onDelete: 'cascade' }),
    gridX: integer('grid_x').notNull(),
    gridY: integer('grid_y').notNull(),
    state: jsonb('state').$type<SeenCell>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.houseId, t.gridX, t.gridY] }),
    index('house_knowledge_house_idx').on(t.houseId),
  ],
);
