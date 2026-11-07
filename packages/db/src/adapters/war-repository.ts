import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { NewWar, War, WarRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { war, warAttack, warProtectionNotice } from '../schema';

type Row = typeof war.$inferSelect;

function toWar(row: Row): War {
  return {
    id: row.id,
    houses: [row.houseLow, row.houseHigh],
    startedAt: row.startedAt,
    startedDay: row.startedDay,
    how: row.how,
    status: row.status,
    lastClashDay: row.lastClashDay,
    endedAt: row.endedAt,
  };
}

/** Seřazená dvojice rodů (základ unikátního indexu aktivní války). */
function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Drizzle adaptér portu WarRepository (war.md – Začátek války, Ochrana nového hráče). */
export function createWarRepository(db: Executor): WarRepository {
  async function activeBetween(a: string, b: string): Promise<War | null> {
    const [low, high] = ordered(a, b);
    const [row] = await db
      .select()
      .from(war)
      .where(and(eq(war.houseLow, low), eq(war.houseHigh, high), eq(war.status, 'active')))
      .limit(1);
    return row ? toWar(row) : null;
  }

  return {
    activeBetween,
    async start(input: NewWar): Promise<{ war: War; created: boolean }> {
      const [low, high] = ordered(input.houses[0], input.houses[1]);
      // jedna aktivní válka na dvojici – souběžné volání vrátí tu první
      const [row] = await db
        .insert(war)
        .values({
          houseLow: low,
          houseHigh: high,
          how: input.how,
          startedAt: input.startedAt,
          startedDay: input.startedDay,
          lastClashDay: input.startedDay,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return { war: toWar(row), created: true };
      const existing = await activeBetween(low, high);
      if (!existing) throw new Error('Válku se nepodařilo založit.');
      return { war: existing, created: false };
    },
    async activeOf(houseId): Promise<War[]> {
      const rows = await db
        .select()
        .from(war)
        .where(
          and(eq(war.status, 'active'), or(eq(war.houseLow, houseId), eq(war.houseHigh, houseId))),
        )
        .orderBy(asc(war.startedAt), asc(war.id));
      return rows.map(toWar);
    },
    async listActive(): Promise<War[]> {
      const rows = await db
        .select()
        .from(war)
        .where(eq(war.status, 'active'))
        .orderBy(asc(war.startedAt), asc(war.id));
      return rows.map(toWar);
    },
    async touchClash(id, day): Promise<void> {
      await db
        .update(war)
        .set({ lastClashDay: sql`greatest(${war.lastClashDay}, ${day})` })
        .where(and(eq(war.id, id), eq(war.status, 'active')));
    },
    async end(id, status, at): Promise<boolean> {
      const rows = await db
        .update(war)
        .set({ status, endedAt: at })
        .where(and(eq(war.id, id), eq(war.status, 'active')))
        .returning({ id: war.id });
      return rows.length > 0;
    },
    async extinctOf(houseId, at): Promise<number> {
      const rows = await db
        .update(war)
        .set({ status: 'extinct', endedAt: at })
        .where(
          and(eq(war.status, 'active'), or(eq(war.houseLow, houseId), eq(war.houseHigh, houseId))),
        )
        .returning({ id: war.id });
      return rows.length;
    },
    async ownAttackAt(houseId): Promise<Date | null> {
      const [row] = await db
        .select({ at: warAttack.at })
        .from(warAttack)
        .where(eq(warAttack.houseId, houseId));
      return row?.at ?? null;
    },
    async markAttack(houseId, at): Promise<void> {
      await db.insert(warAttack).values({ houseId, at }).onConflictDoNothing();
    },
    async claimProtectionNotice(houseId, at): Promise<boolean> {
      const rows = await db
        .insert(warProtectionNotice)
        .values({ houseId, at })
        .onConflictDoNothing()
        .returning({ id: warProtectionNotice.houseId });
      return rows.length > 0;
    },
  };
}
