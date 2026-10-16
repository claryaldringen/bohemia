import { and, eq, sql } from 'drizzle-orm';
import type { Settlement, SettlementRepository } from '@bohemia/game';
import type { Database } from '../client';
import { settlement } from '../schema';

/** Drizzle adaptér portu SettlementRepository. */
export function createSettlementRepository(db: Database): SettlementRepository {
  async function findSeat(ownerId: string): Promise<Settlement | null> {
    const [row] = await db
      .select()
      .from(settlement)
      .where(and(eq(settlement.ownerId, ownerId), eq(settlement.isSeat, true)))
      .limit(1);
    return row ?? null;
  }

  return {
    findSeat,
    async createSeat(input): Promise<Settlement> {
      // Atomicky: při souběhu vyhraje jeden INSERT, ostatní narazí na unikátní index
      // a vrátí sídlo, které mezitím vzniklo.
      const [created] = await db
        .insert(settlement)
        .values({ ...input, isSeat: true })
        .onConflictDoNothing({ target: settlement.ownerId, where: sql`${settlement.isSeat}` })
        .returning();
      if (created) return created;
      const existing = await findSeat(input.ownerId);
      if (!existing)
        throw new Error(`Sídelní sídlo hráče ${input.ownerId} nešlo založit ani najít.`);
      return existing;
    },
  };
}
