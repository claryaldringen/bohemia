import { eq } from 'drizzle-orm';
import type { PrisonerDecision, PrisonerRecord, PrisonerRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { prisoner } from '../schema';

type Row = typeof prisoner.$inferSelect;

function toRecord(row: Row): PrisonerRecord {
  return {
    id: row.id,
    captorVillageId: row.captorVillageId,
    homeVillageId: row.homeVillageId,
    personId: row.personId,
    decision: row.decision as PrisonerDecision,
    decidedDay: row.decidedDay,
    decidedAt: row.decidedAt,
  };
}

/** Drizzle adaptér portu PrisonerRepository (war.md – Vzdaní, zajetí a výkupné). */
export function createPrisonerRepository(db: Executor): PrisonerRepository {
  return {
    async claim(record): Promise<boolean> {
      // primární klíč = klíč zajetí: druhé rozhodnutí o témž zajatci nic nezapíše
      const inserted = await db
        .insert(prisoner)
        .values(record)
        .onConflictDoNothing()
        .returning({ id: prisoner.id });
      return inserted.length > 0;
    },
    async find(id): Promise<PrisonerRecord | null> {
      const [row] = await db.select().from(prisoner).where(eq(prisoner.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },
  };
}
