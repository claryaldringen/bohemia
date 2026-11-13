import { and, eq, sql } from 'drizzle-orm';
import {
  mergeKnowledge,
  type GridCell,
  type KnowledgeRepository,
  type KnownCell,
} from '@bohemia/game';
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

    async knownCellsOf(houseId): Promise<KnownCell[]> {
      // jeden dotaz (Important 5 závěrečné recenze): ze znalosti jen id vsi a počet staveb, sídlo
      // na políčku bez archivu (částečný unikátní index `settlement_grid_idx`), jeho vsi a živý rod
      // držitele – pravidlo, co se z toho ukáže, je v `knownVillagesOf`
      const result = await db.execute<{
        x: number;
        y: number;
        seenVillageId: string | null;
        seenParts: number;
        villageIds: string[];
        holderHouseId: string | null;
      }>(sql`
        SELECT k.grid_x AS x, k.grid_y AS y,
               k.state->>'villageId' AS "seenVillageId",
               coalesce(jsonb_array_length(k.state->'parts'), 0) AS "seenParts",
               coalesce((
                 SELECT array_agg(v.id::text ORDER BY v.id) FROM village v
                 WHERE v.settlement_id = s.id
               ), '{}') AS "villageIds",
               h.id AS "holderHouseId"
          FROM house_knowledge k
          LEFT JOIN settlement s
            ON s.grid_x = k.grid_x AND s.grid_y = k.grid_y AND s.archived_at IS NULL
          LEFT JOIN house h
            ON h.player_id = s.owner_id AND h.kind = 'player' AND h.ended_at IS NULL
         WHERE k.house_id = ${houseId}
         ORDER BY k.grid_x, k.grid_y`);
      return result.rows.map((row) => ({
        cell: { x: Number(row.x), y: Number(row.y) },
        seenVillageId: row.seenVillageId,
        seenParts: Number(row.seenParts),
        villageIds: row.villageIds,
        holderHouseId: row.holderHouseId,
      }));
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
