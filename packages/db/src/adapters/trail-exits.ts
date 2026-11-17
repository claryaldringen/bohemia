import { and, asc, between, eq, isNull, ne, or, sql } from 'drizzle-orm';
import {
  isCurrentDigest,
  type NeighbourTrailExits,
  type TrailExit,
  type TrailExitSource,
} from '@bohemia/game';
import type { Database } from '../client';
import { settlement, village } from '../schema';

/**
 * Drizzle adaptér portu TrailExitSource (trade.md – Zemská stezka, Pokračování na sousední mapě;
 * plán 2026-11-16-dense-forest – Rozhodnutí 13): jeden dotaz `settlement` ⋈ `village` na vsi
 * aktivních sídel ve čtverci 3 × 3 kolem políčka bez středu. Ze souhrnu jen jeho verze tvaru
 * a pole `trailExits` (celý souhrn ani stav se nepřenáší); souhrn jiné verze tvaru, starší verze
 * stavu (`digest_version` ≠ `version`) nebo bez pole → `exits` null (ves se načte celá).
 */
export function createTrailExitSource(db: Database): TrailExitSource {
  return {
    async trailExitsAround(cell): Promise<NeighbourTrailExits[]> {
      const rows = await db
        .select({
          villageId: village.id,
          version: village.version,
          digestVersion: village.digestVersion,
          shape: sql<number | null>`(${village.digest}->>'v')::int`,
          exits: sql<TrailExit[] | null>`${village.digest}->'trailExits'`,
          gridX: settlement.gridX,
          gridY: settlement.gridY,
        })
        .from(village)
        .innerJoin(settlement, eq(settlement.id, village.settlementId))
        .where(
          and(
            // podmínka `archived_at IS NULL` = predikát částečného indexu `settlement_grid_idx`
            isNull(settlement.archivedAt),
            between(settlement.gridX, cell.x - 1, cell.x + 1),
            between(settlement.gridY, cell.y - 1, cell.y + 1),
            or(ne(settlement.gridX, cell.x), ne(settlement.gridY, cell.y)),
          ),
        )
        .orderBy(asc(settlement.gridY), asc(settlement.gridX), asc(village.id));
      return rows.flatMap(({ villageId, version, digestVersion, shape, exits, gridX, gridY }) => {
        if (gridX === null || gridY === null) return [];
        const current =
          digestVersion === version && isCurrentDigest({ v: shape }) && Array.isArray(exits);
        return [
          { villageId, version, cell: { x: gridX, y: gridY }, exits: current ? exits : null },
        ];
      });
    },
  };
}
