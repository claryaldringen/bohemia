import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type {
  LayerVersions,
  OccupiedCell,
  Settlement,
  SettlementPlace,
  SettlementRepository,
} from '@bohemia/game';
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
    localCell: row.localX === null || row.localY === null ? null : { x: row.localX, y: row.localY },
    createdAt: row.createdAt,
  };
}

/** Sloupce nového sídla – poloha na mapě světa, nebo v místní mřížce odříznutého rodu. */
function placeValues(
  input: { ownerId: string; landscapeSeed: number; layerVersions: LayerVersions } & SettlementPlace,
): typeof settlement.$inferInsert {
  const base = {
    ownerId: input.ownerId,
    landscapeSeed: input.landscapeSeed,
    layerVersions: input.layerVersions,
  };
  return 'worldCell' in input
    ? { ...base, gridX: input.worldCell.x, gridY: input.worldCell.y }
    : { ...base, localX: input.localCell.x, localY: input.localCell.y };
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
        .where(
          and(
            eq(settlement.ownerId, ownerId),
            isNull(settlement.archivedAt),
            // čekající převod (odúmrť) – sídlo nepočítá starý ani nový držitel
            isNull(settlement.pendingOwnerId),
          ),
        )
        .orderBy(desc(settlement.isSeat), asc(settlement.createdAt), asc(settlement.id));
      return rows.map(toSettlement);
    },
    async transferHolder(settlementId, fromOwnerId, toOwnerId): Promise<boolean> {
      // 1. krok převodu – podmíněný UPDATE: z více souběžných volání uspěje jedno; sídlo přestane
      // být sídelní (vymřelý hráč dostane při novém začátku nové)
      const rows = await db
        .update(settlement)
        .set({ pendingOwnerId: toOwnerId, isSeat: false })
        .where(
          and(
            eq(settlement.id, settlementId),
            eq(settlement.ownerId, fromOwnerId),
            isNull(settlement.pendingOwnerId),
            isNull(settlement.archivedAt),
          ),
        )
        .returning({ id: settlement.id });
      return rows.length > 0;
    },
    async acceptTransfers(ownerId): Promise<Settlement[]> {
      const rows = await db
        .update(settlement)
        .set({ ownerId, pendingOwnerId: null, isSeat: false })
        .where(and(eq(settlement.pendingOwnerId, ownerId), isNull(settlement.archivedAt)))
        .returning();
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
    async createSeat(input): Promise<Settlement | null> {
      const existing = await findSeat(input.ownerId);
      if (existing) return existing;
      // Atomicky: při souběhu vyhraje jeden INSERT, ostatní narazí na unikátní index (sídelní
      // sídlo hráče, nebo obsazené políčko světa) a nic nezmění.
      const [created] = await db
        .insert(settlement)
        .values({ ...placeValues(input), isSeat: true })
        .onConflictDoNothing()
        .returning();
      if (created) return toSettlement(created);
      // souběžný požadavek téhož hráče mezitím sídlo založil; jinak je políčko cizí
      return findSeat(input.ownerId);
    },
    async create(input): Promise<Settlement | null> {
      // Atomicky: obsazené políčko světa (nebo místní mřížky rodu) hlídá unikátní index – druhý
      // INSERT nic nezmění.
      const [created] = await db
        .insert(settlement)
        .values({ ...placeValues(input), isSeat: false })
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
    async find(settlementId): Promise<Settlement | null> {
      const [row] = await db
        .select()
        .from(settlement)
        .where(and(eq(settlement.id, settlementId), isNull(settlement.archivedAt)))
        .limit(1);
      return row ? toSettlement(row) : null;
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
