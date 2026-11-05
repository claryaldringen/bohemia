import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Vassalage, VassalageRepository, VassalEdge } from '@bohemia/game';
import type { Executor } from '../client';
import { vassalage } from '../schema';

type Row = typeof vassalage.$inferSelect;

function toVassalage(row: Row): Vassalage {
  return {
    id: row.id,
    lordHouseId: row.lordHouseId,
    vassalHouseId: row.vassalHouseId,
    terms: row.terms,
    origin: row.origin,
    sinceAt: row.sinceAt,
    sinceDay: row.sinceDay,
    endedAt: row.endedAt,
    breaches: row.breaches,
    version: row.version,
  };
}

/** Drizzle adaptér portu VassalageRepository. */
export function createVassalageRepository(db: Executor): VassalageRepository {
  const alive = isNull(vassalage.endedAt);
  return {
    async activeOf(houseId): Promise<Vassalage[]> {
      const rows = await db
        .select()
        .from(vassalage)
        .where(
          and(alive, or(eq(vassalage.lordHouseId, houseId), eq(vassalage.vassalHouseId, houseId))),
        );
      return rows.map(toVassalage);
    },
    async create(input): Promise<Vassalage> {
      const [row] = await db.insert(vassalage).values(input).returning();
      if (!row) throw new Error('Vazalství se nepodařilo založit.');
      return toVassalage(row);
    },
    async end(id, reason, at): Promise<boolean> {
      const rows = await db
        .update(vassalage)
        .set({ endedAt: at, endReason: reason })
        .where(and(eq(vassalage.id, id), alive))
        .returning({ id: vassalage.id });
      return rows.length > 0;
    },
    async edgesNear(houseId, depth): Promise<VassalEdge[]> {
      // Rekurzivní průchod živými hranami v obou směrech; UNION zabrání cyklení.
      const result = await db.execute<{ lord_house_id: string; vassal_house_id: string }>(sql`
        WITH RECURSIVE reach(house_id, depth) AS (
          SELECT ${houseId}::uuid, 0
          UNION
          SELECT CASE WHEN v.lord_house_id = r.house_id THEN v.vassal_house_id ELSE v.lord_house_id END,
                 r.depth + 1
          FROM reach r
          JOIN vassalage v ON v.ended_at IS NULL
            AND (v.lord_house_id = r.house_id OR v.vassal_house_id = r.house_id)
          WHERE r.depth < ${depth}
        )
        SELECT DISTINCT v.lord_house_id, v.vassal_house_id
        FROM vassalage v
        JOIN reach r ON r.depth < ${depth}
          AND (v.lord_house_id = r.house_id OR v.vassal_house_id = r.house_id)
        WHERE v.ended_at IS NULL
      `);
      return result.rows.map((r) => ({
        lordHouseId: r.lord_house_id,
        vassalHouseId: r.vassal_house_id,
      }));
    },
  };
}
