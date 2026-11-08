import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DomainFoodRepository, DomainFoodRound } from '@bohemia/game';
import type { Database } from '../client';
import { domainFoodRound } from '../schema';

type Row = typeof domainFoodRound.$inferSelect;

function toRound(row: Row): DomainFoodRound {
  return {
    villageId: row.villageId,
    year: row.year,
    day: row.day,
    deliveries: row.deliveries,
    finishedAt: row.finishedAt,
  };
}

/** Drizzle adaptér portu DomainFoodRepository (hillfort.md – Jídlo domény; tabulka `domain_food_round`). */
export function createDomainFoodRepository(db: Database): DomainFoodRepository {
  return {
    async decided(villageIds, year) {
      if (villageIds.length === 0) return new Set();
      const rows = await db
        .select({ villageId: domainFoodRound.villageId })
        .from(domainFoodRound)
        .where(
          and(inArray(domainFoodRound.villageId, [...villageIds]), eq(domainFoodRound.year, year)),
        );
      return new Set(rows.map((r) => r.villageId));
    },
    async reserve(round) {
      const [inserted] = await db
        .insert(domainFoodRound)
        .values({
          villageId: round.villageId,
          year: round.year,
          day: round.day,
          deliveries: round.deliveries,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return toRound(inserted);
      // souběh nebo pád: platí plán, který se zapsal první
      const [existing] = await db
        .select()
        .from(domainFoodRound)
        .where(
          and(eq(domainFoodRound.villageId, round.villageId), eq(domainFoodRound.year, round.year)),
        );
      if (!existing) throw new Error('Kolo jídla domény zmizelo mezi zápisem a čtením');
      return toRound(existing);
    },
    async unfinished() {
      const rows = await db
        .select()
        .from(domainFoodRound)
        .where(isNull(domainFoodRound.finishedAt))
        .orderBy(
          asc(domainFoodRound.createdAt),
          asc(domainFoodRound.villageId),
          asc(domainFoodRound.year),
        );
      return rows.map(toRound);
    },
    async finish(villageId, year) {
      await db
        .update(domainFoodRound)
        .set({ finishedAt: new Date() })
        .where(
          and(
            eq(domainFoodRound.villageId, villageId),
            eq(domainFoodRound.year, year),
            isNull(domainFoodRound.finishedAt),
          ),
        );
    },
  };
}
