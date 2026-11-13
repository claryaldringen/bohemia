import { and, eq, sql } from 'drizzle-orm';
import { mergeKnowledge, type GridCell, type KnowledgeRepository } from '@bohemia/game';
import type { Database } from '../client';
import { houseKnowledge } from '../schema';

/**
 * Drizzle adaptér portu KnowledgeRepository (plán 2026-11-13 – Úloha 10). Sloučení je doménová
 * funkce (`mergeKnowledge`), adaptér jen čte a zapisuje: v jedné transakci řádek založí (`ON
 * CONFLICT DO NOTHING` – souběžný zápis počká na potvrzení druhého), pak ho přečte se zámkem
 * (`FOR UPDATE`) a zapíše sloučené – výjezd i tažení smí psát do téhož rodu a políčka současně.
 */
export function createKnowledgeRepository(db: Database): KnowledgeRepository {
  return {
    async of(houseId, cell) {
      const [row] = await db
        .select({ state: houseKnowledge.state })
        .from(houseKnowledge)
        .where(
          and(
            eq(houseKnowledge.houseId, houseId),
            eq(houseKnowledge.gridX, cell.x),
            eq(houseKnowledge.gridY, cell.y),
          ),
        );
      return row?.state ?? null;
    },

    async cellsOf(houseId): Promise<GridCell[]> {
      const rows = await db
        .select({ x: houseKnowledge.gridX, y: houseKnowledge.gridY })
        .from(houseKnowledge)
        .where(eq(houseKnowledge.houseId, houseId))
        .orderBy(houseKnowledge.gridX, houseKnowledge.gridY);
      return rows;
    },

    async merge(houseId, cell, seen): Promise<void> {
      await db.transaction(async (tx) => {
        const where = and(
          eq(houseKnowledge.houseId, houseId),
          eq(houseKnowledge.gridX, cell.x),
          eq(houseKnowledge.gridY, cell.y),
        );
        // řádek existuje (prázdný = nic nevíme) – souběžná transakce počká na potvrzení první
        await tx
          .insert(houseKnowledge)
          .values({
            houseId,
            gridX: cell.x,
            gridY: cell.y,
            state: mergeKnowledge(null, seen),
          })
          .onConflictDoNothing();
        const [row] = await tx
          .select({ state: houseKnowledge.state })
          .from(houseKnowledge)
          .where(where)
          .for('update');
        if (!row) return;
        await tx
          .update(houseKnowledge)
          .set({ state: mergeKnowledge(row.state, seen), updatedAt: sql`now()` })
          .where(where);
      });
    },
  };
}
