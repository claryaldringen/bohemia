import { and, eq, isNull } from 'drizzle-orm';
import type { Stewardship, StewardshipRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { stewardship } from '../schema';

type Row = typeof stewardship.$inferSelect;

function toStewardship(row: Row): Stewardship {
  return {
    id: row.id,
    villageId: row.villageId,
    stewardHouseId: row.stewardHouseId,
    holderHouseId: row.holderHouseId,
    kind: row.kind,
    vassalageId: row.vassalageId,
    since: row.sinceAt,
  };
}

/** Drizzle adaptér portu StewardshipRepository (vassalage.md – Hráč jako správce cizí vsi). */
export function createStewardshipRepository(db: Executor): StewardshipRepository {
  const alive = isNull(stewardship.endedAt);
  return {
    async of(villageId): Promise<Stewardship | null> {
      const [row] = await db
        .select()
        .from(stewardship)
        .where(and(eq(stewardship.villageId, villageId), alive))
        .limit(1);
      return row ? toStewardship(row) : null;
    },
    async start(input): Promise<Stewardship | null> {
      // jedinečný částečný index: druhá živá správa téže vsi se nezapíše
      const [row] = await db
        .insert(stewardship)
        .values({
          villageId: input.villageId,
          stewardHouseId: input.stewardHouseId,
          holderHouseId: input.holderHouseId,
          kind: input.kind,
          vassalageId: input.vassalageId,
          sinceAt: input.since,
        })
        .onConflictDoNothing()
        .returning();
      return row ? toStewardship(row) : null;
    },
    async listByStewardHouse(houseId): Promise<Stewardship[]> {
      const rows = await db
        .select()
        .from(stewardship)
        .where(and(eq(stewardship.stewardHouseId, houseId), alive));
      return rows.map(toStewardship);
    },
    async listByHolderHouse(houseId): Promise<Stewardship[]> {
      const rows = await db
        .select()
        .from(stewardship)
        .where(and(eq(stewardship.holderHouseId, houseId), alive));
      return rows.map(toStewardship);
    },
    async end(villageId, reason, at = new Date()): Promise<boolean> {
      const rows = await db
        .update(stewardship)
        .set({ endedAt: at, endReason: reason })
        .where(and(eq(stewardship.villageId, villageId), alive))
        .returning({ id: stewardship.id });
      return rows.length > 0;
    },
    async endByVassalage(vassalageId, reason, at = new Date()): Promise<string[]> {
      const rows = await db
        .update(stewardship)
        .set({ endedAt: at, endReason: reason })
        .where(and(eq(stewardship.vassalageId, vassalageId), alive))
        .returning({ villageId: stewardship.villageId });
      return rows.map((r) => r.villageId);
    },
  };
}
