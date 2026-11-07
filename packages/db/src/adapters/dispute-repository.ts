import { and, desc, eq, gt, or, sql } from 'drizzle-orm';
import type { Dispute, DisputeRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { dispute } from '../schema';

type Row = typeof dispute.$inferSelect;

function toDispute(row: Row): Dispute {
  return {
    id: row.id,
    lordHouseId: row.lordHouseId,
    plaintiffHouseId: row.plaintiffHouseId,
    defendantHouseId: row.defendantHouseId,
    message: row.message,
    statement: row.statement,
    filedAt: row.filedAt,
    filedDay: row.filedDay,
    status: row.status,
    verdict: row.verdict,
    judgedDay: row.judgedDay,
    peaceUntilDay: row.peaceUntilDay,
    brokenBy: row.brokenBy,
  };
}

const pairKeyOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Drizzle adaptér portu DisputeRepository (vassalage.md – Mír a spory). */
export function createDisputeRepository(db: Executor): DisputeRepository {
  return {
    async file(input): Promise<Dispute | null> {
      const pairKey = pairKeyOf(input.plaintiffHouseId, input.defendantHouseId);
      // jediný nerozsouzený spor na dvojici hlídá jedinečný částečný index (`dispute_running_uq`)
      const [row] = await db
        .insert(dispute)
        .values({ ...input, pairKey })
        .onConflictDoNothing()
        .returning();
      return row ? toDispute(row) : null;
    },
    async byId(id): Promise<Dispute | null> {
      const [row] = await db.select().from(dispute).where(eq(dispute.id, id)).limit(1);
      return row ? toDispute(row) : null;
    },
    async answer(id, statement): Promise<boolean> {
      const updated = await db
        .update(dispute)
        .set({ statement })
        .where(
          and(eq(dispute.id, id), eq(dispute.status, 'filed'), sql`${dispute.statement} is null`),
        )
        .returning({ id: dispute.id });
      return updated.length > 0;
    },
    async judge(id, verdict, day, peaceUntilDay): Promise<boolean> {
      const updated = await db
        .update(dispute)
        .set({ status: 'judged', verdict, judgedDay: day, peaceUntilDay })
        .where(and(eq(dispute.id, id), eq(dispute.status, 'filed')))
        .returning({ id: dispute.id });
      return updated.length > 0;
    },
    async listOf(houseId, limit): Promise<Dispute[]> {
      const rows = await db
        .select()
        .from(dispute)
        .where(
          or(
            eq(dispute.lordHouseId, houseId),
            eq(dispute.plaintiffHouseId, houseId),
            eq(dispute.defendantHouseId, houseId),
          ),
        )
        .orderBy(desc(dispute.filedAt))
        .limit(limit);
      return rows.map(toDispute);
    },
    async peaceBetween(a, b, day): Promise<Dispute | null> {
      const [row] = await db
        .select()
        .from(dispute)
        .where(
          and(
            eq(dispute.pairKey, pairKeyOf(a, b)),
            eq(dispute.status, 'judged'),
            gt(dispute.peaceUntilDay, day),
          ),
        )
        .orderBy(desc(dispute.filedAt))
        .limit(1);
      return row ? toDispute(row) : null;
    },
    async markBroken(id, houseId): Promise<boolean> {
      const updated = await db
        .update(dispute)
        .set({ brokenBy: sql`${dispute.brokenBy} || ${JSON.stringify([houseId])}::jsonb` })
        .where(
          and(
            eq(dispute.id, id),
            sql`not (${dispute.brokenBy} @> ${JSON.stringify([houseId])}::jsonb)`,
          ),
        )
        .returning({ id: dispute.id });
      return updated.length > 0;
    },
  };
}
