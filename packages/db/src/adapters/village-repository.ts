import { and, eq, sql } from 'drizzle-orm';
import type { VillageRecord, VillageRepository } from '@bohemia/game';
import type { Database } from '../client';
import { village } from '../schema';

type VillageRow = typeof village.$inferSelect;

function toRecord(row: VillageRow): VillageRecord {
  return {
    settlementId: row.settlementId,
    name: row.name,
    state: row.state,
    version: row.version,
  };
}

/** Drizzle adaptér portu VillageRepository – optimistické zamykání přes sloupec version. */
export function createVillageRepository(db: Database): VillageRepository {
  return {
    async find(settlementId): Promise<VillageRecord | null> {
      const [row] = await db
        .select()
        .from(village)
        .where(eq(village.settlementId, settlementId))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async create(settlementId, name, state): Promise<VillageRecord | null> {
      // Atomicky: při souběhu vyhraje jeden INSERT, ostatní narazí na primární klíč.
      const [row] = await db
        .insert(village)
        .values({ settlementId, name, state, version: 1 })
        .onConflictDoNothing({ target: village.settlementId })
        .returning();
      return row ? toRecord(row) : null;
    },

    async save(settlementId, state, expectedVersion): Promise<VillageRecord | null> {
      // Zpět jen jméno a verzi – stav (u velké vsi přes 1 MB JSON) má volající v ruce, databáze
      // by ho jinak celý serializovala a posílala zpátky.
      const [row] = await db
        .update(village)
        .set({ state, version: sql`${village.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(village.settlementId, settlementId), eq(village.version, expectedVersion)))
        .returning({ name: village.name, version: village.version });
      return row ? { settlementId, name: row.name, state, version: row.version } : null;
    },

    async rename(settlementId, name): Promise<boolean> {
      // Jméno je mimo stav simulace – verze (zámek stavu) se nemění.
      const rows = await db
        .update(village)
        .set({ name, updatedAt: sql`now()` })
        .where(eq(village.settlementId, settlementId))
        .returning({ settlementId: village.settlementId });
      return rows.length > 0;
    },
  };
}
