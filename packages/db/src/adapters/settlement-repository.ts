import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { OccupiedCell, Settlement, SettlementRepository } from '@bohemia/game';
import type { Database } from '../client';
import { settlement } from '../schema';

type SettlementRow = typeof settlement.$inferSelect;

function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    ownerId: row.ownerId,
    isSeat: row.isSeat,
    landscapeSeed: row.landscapeSeed,
    layerVersions: row.layerVersions,
    worldCell: row.gridX === null || row.gridY === null ? null : { x: row.gridX, y: row.gridY },
    createdAt: row.createdAt,
  };
}

/** Drizzle adaptér portu SettlementRepository – archivovaná sídla (`archived_at`) nevrací. */
export function createSettlementRepository(db: Database): SettlementRepository {
  async function findSeat(ownerId: string): Promise<Settlement | null> {
    const [row] = await db
      .select()
      .from(settlement)
      .where(and(eq(settlement.ownerId, ownerId), eq(settlement.isSeat, true)))
      .limit(1);
    return row ? toSettlement(row) : null;
  }

  return {
    findSeat,
    async listActive(ownerId): Promise<Settlement[]> {
      const rows = await db
        .select()
        .from(settlement)
        .where(and(eq(settlement.ownerId, ownerId), isNull(settlement.archivedAt)))
        .orderBy(desc(settlement.isSeat), asc(settlement.createdAt), asc(settlement.id));
      return rows.map(toSettlement);
    },
    async archive(settlementId): Promise<boolean> {
      // Atomicky: z více souběžných volání archivuje jen jedno. Sídlo přestane být sídelní –
      // unikátní index pak pustí nové sídelní sídlo hráče.
      const rows = await db
        .update(settlement)
        .set({ isSeat: false, archivedAt: sql`now()` })
        .where(and(eq(settlement.id, settlementId), isNull(settlement.archivedAt)))
        .returning({ id: settlement.id });
      return rows.length > 0;
    },
    async createSeat({ worldCell, ...input }): Promise<Settlement | null> {
      const existing = await findSeat(input.ownerId);
      if (existing) return existing;
      // Atomicky: při souběhu vyhraje jeden INSERT, ostatní narazí na unikátní index (sídelní
      // sídlo hráče, nebo obsazené políčko světa) a nic nezmění.
      const [created] = await db
        .insert(settlement)
        .values({ ...input, isSeat: true, gridX: worldCell.x, gridY: worldCell.y })
        .onConflictDoNothing()
        .returning();
      if (created) return toSettlement(created);
      // souběžný požadavek téhož hráče mezitím sídlo založil; jinak je políčko cizí
      return findSeat(input.ownerId);
    },
    async create({ worldCell, ...input }): Promise<Settlement | null> {
      // Atomicky: obsazené políčko světa hlídá unikátní index – druhý INSERT nic nezmění.
      const [created] = await db
        .insert(settlement)
        .values({ ...input, isSeat: false, gridX: worldCell.x, gridY: worldCell.y })
        .onConflictDoNothing()
        .returning();
      return created ? toSettlement(created) : null;
    },
    async occupiedCells(): Promise<OccupiedCell[]> {
      const rows = await db
        .select({ ownerId: settlement.ownerId, x: settlement.gridX, y: settlement.gridY })
        .from(settlement)
        .where(and(isNull(settlement.archivedAt), isNotNull(settlement.gridX)));
      return rows.flatMap((r) =>
        r.x === null || r.y === null ? [] : [{ ownerId: r.ownerId, cell: { x: r.x, y: r.y } }],
      );
    },
    async assignWorldCell(settlementId, cell): Promise<Settlement | null> {
      // Jen sídlu bez polohy (podmíněný UPDATE) – souběžná volání ho neposunou dvakrát.
      await db
        .update(settlement)
        .set({ gridX: cell.x, gridY: cell.y })
        .where(
          and(
            eq(settlement.id, settlementId),
            isNull(settlement.archivedAt),
            isNull(settlement.gridX),
          ),
        );
      const [row] = await db
        .select()
        .from(settlement)
        .where(and(eq(settlement.id, settlementId), isNull(settlement.archivedAt)))
        .limit(1);
      return row ? toSettlement(row) : null;
    },
  };
}
