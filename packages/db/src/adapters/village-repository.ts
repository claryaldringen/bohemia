import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { VillageRecord, VillageRepository, VillageStamp } from '@bohemia/game';
import type { Database } from '../client';
import { settlement, village } from '../schema';

type VillageRow = typeof village.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: VillageRow): VillageRecord {
  return {
    id: row.id,
    settlementId: row.settlementId,
    name: row.name,
    state: row.state,
    version: row.version,
  };
}

/**
 * Drizzle adaptér portu VillageRepository – optimistické zamykání přes sloupec version. Sídlo
 * může mít víc vsí; první ves sídla zakládá `create` atomicky (zámek řádku sídla).
 */
export function createVillageRepository(db: Database): VillageRepository {
  return {
    async find(villageId): Promise<VillageRecord | null> {
      // id vsi přichází i zvenku (cookie, vstup akce) – jiný řetězec než UUID by dotaz shodil
      if (!UUID.test(villageId)) return null;
      const [row] = await db.select().from(village).where(eq(village.id, villageId)).limit(1);
      return row ? toRecord(row) : null;
    },

    async weatherSeedOf(settlementId): Promise<number | null> {
      if (!UUID.test(settlementId)) return null;
      const [row] = await db
        .select({ weatherSeed: settlement.weatherSeed })
        .from(settlement)
        .where(eq(settlement.id, settlementId))
        .limit(1);
      return row?.weatherSeed ?? null;
    },

    async listBySettlement(settlementId): Promise<VillageRecord[]> {
      const rows = await db
        .select()
        .from(village)
        .where(eq(village.settlementId, settlementId))
        .orderBy(asc(village.createdAt), asc(village.id));
      return rows.map(toRecord);
    },

    async create(settlementId, name, state): Promise<VillageRecord | null> {
      // Atomicky: souběžná založení první vsi se seřadí na zámku řádku sídla – projde jen první,
      // ostatní už ves uvidí. Neznámé sídlo nemá co zamknout – nic se nezaloží.
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: settlement.id })
          .from(settlement)
          .where(eq(settlement.id, settlementId))
          .for('update');
        if (!owner) return null;
        const [existing] = await tx
          .select({ id: village.id })
          .from(village)
          .where(eq(village.settlementId, settlementId))
          .limit(1);
        if (existing) return null;
        const [row] = await tx
          .insert(village)
          .values({ settlementId, name, state, version: 1 })
          .returning();
        return row ? toRecord(row) : null;
      });
    },

    async add(settlementId, name, state): Promise<VillageRecord> {
      const [row] = await db
        .insert(village)
        .values({ settlementId, name, state, version: 1 })
        .returning();
      if (!row) throw new Error(`Ves sídla ${settlementId} nešlo založit.`);
      return toRecord(row);
    },

    async save(villageId, state, expectedVersion): Promise<VillageRecord | null> {
      // Zpět jen identitu, jméno a verzi – stav (u velké vsi přes 1 MB JSON) má volající v ruce,
      // databáze by ho jinak celý serializovala a posílala zpátky.
      const [row] = await db
        .update(village)
        .set({ state, version: sql`${village.version} + 1`, updatedAt: sql`now()` })
        .where(and(eq(village.id, villageId), eq(village.version, expectedVersion)))
        .returning({
          id: village.id,
          settlementId: village.settlementId,
          name: village.name,
          version: village.version,
        });
      return row ? { ...row, state } : null;
    },

    async rename(villageId, name): Promise<boolean> {
      // Jméno je mimo stav simulace – verze (zámek stavu) se nemění.
      const rows = await db
        .update(village)
        .set({ name, updatedAt: sql`now()` })
        .where(eq(village.id, villageId))
        .returning({ id: village.id });
      return rows.length > 0;
    },

    async stampsOf(settlementIds): Promise<VillageStamp[]> {
      if (settlementIds.length === 0) return [];
      // Den dopočtu čte Postgres ze stavu sám – stav se nepřenáší ani neparsuje v Node.
      return db
        .select({
          id: village.id,
          settlementId: village.settlementId,
          name: village.name,
          version: village.version,
          lastDay: sql<number>`(${village.state}->>'lastDay')::int`,
        })
        .from(village)
        .where(inArray(village.settlementId, [...settlementIds]));
    },
  };
}
