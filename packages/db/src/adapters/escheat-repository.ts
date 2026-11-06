import { and, asc, eq, sql } from 'drizzle-orm';
import type { Escheat, EscheatRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { escheat } from '../schema';

type Row = typeof escheat.$inferSelect;

function toEscheat(row: Row): Escheat {
  return {
    id: row.id,
    deadHouseId: row.deadHouseId,
    lordHouseIds: row.lordHouseIds,
    villageIds: row.villageIds,
    vassalIds: row.vassalIds,
    status: row.status,
    plan: row.plan ?? null,
    consents: row.consents,
    version: row.version,
    createdAt: row.createdAt,
  };
}

/** Drizzle adaptér portu EscheatRepository (vassalage.md – Vymření rodu – odúmrť). */
export function createEscheatRepository(db: Executor): EscheatRepository {
  async function byDead(deadHouseId: string): Promise<Escheat | null> {
    const [row] = await db
      .select()
      .from(escheat)
      .where(eq(escheat.deadHouseId, deadHouseId))
      .limit(1);
    return row ? toEscheat(row) : null;
  }

  return {
    async create(input): Promise<Escheat> {
      // jedna odúmrť na rod – souběžné nebo opakované volání vrátí tu první
      const [row] = await db
        .insert(escheat)
        .values({ ...input, consents: [] })
        .onConflictDoNothing({ target: escheat.deadHouseId })
        .returning();
      if (row) return toEscheat(row);
      const existing = await byDead(input.deadHouseId);
      if (!existing) throw new Error('Odúmrť se nepodařilo založit.');
      return existing;
    },
    async byId(id): Promise<Escheat | null> {
      const [row] = await db.select().from(escheat).where(eq(escheat.id, id)).limit(1);
      return row ? toEscheat(row) : null;
    },
    async openOfLord(lordHouseId): Promise<Escheat[]> {
      const rows = await db
        .select()
        .from(escheat)
        .where(
          and(
            eq(escheat.status, 'open'),
            sql`${escheat.lordHouseIds} @> ${JSON.stringify([lordHouseId])}::jsonb`,
          ),
        )
        .orderBy(asc(escheat.createdAt), asc(escheat.id));
      return rows.map(toEscheat);
    },
    async update(id, patch, expectedVersion): Promise<Escheat | null> {
      const [row] = await db
        .update(escheat)
        .set({ ...patch, version: sql`${escheat.version} + 1` })
        .where(and(eq(escheat.id, id), eq(escheat.version, expectedVersion)))
        .returning();
      return row ? toEscheat(row) : null;
    },
  };
}
