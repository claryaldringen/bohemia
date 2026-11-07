import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { village } from './village';

/**
 * Rozhodnutí o zajatci (war.md – Vzdaní, zajetí a výkupné). Zajetí samo žije ve stavu vsí
 * (`VillageState.prisoners`, `Person.away`); řádek vzniká až rozhodnutím věznitele (propustit,
 * popravit) nebo výkupným a **primární klíč = klíč zajetí** (`<tažení>:<osoba>`) zaručuje, že
 * projde jediné rozhodnutí (souběh web × web × jednání).
 */
export const prisoner = pgTable(
  'prisoner',
  {
    id: text('id').primaryKey(),
    captorVillageId: uuid('captor_village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    homeVillageId: uuid('home_village_id')
      .notNull()
      .references(() => village.id, { onDelete: 'cascade' }),
    personId: integer('person_id').notNull(),
    decision: text('decision').notNull(),
    decidedDay: integer('decided_day').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('prisoner_captor_idx').on(t.captorVillageId),
    index('prisoner_home_idx').on(t.homeVillageId),
  ],
);
