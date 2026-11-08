import { and, asc, desc, eq, isNotNull, isNull, not, sql } from 'drizzle-orm';
import type { OccupiedCell, PlacementTx, PremiumType, WorldCell } from '@bohemia/game';
import type { Executor } from '../client';
import { house, settlement } from '../schema';
import { hasVillage, lastPremiumTypeOf, premiumTypeCountsOf } from './settlement-repository';
import { isUniqueViolation } from './village-repository';

/**
 * Klíč zámku umisťování nováčků (`pg_advisory_xact_lock(int4, int4)`) – jmenný prostor „Newc“
 * v ASCII, jiný než zámek hráče a tažení; drží se do konce transakce jednání.
 */
export const NEWCOMER_PLACEMENT_LOCK = 0x4e657763;

/**
 * Drizzle adaptér umístění odříznutého nováčka (newcomers.md) – běží nad transakcí jednání.
 * Podmíněný UPDATE `placed_at IS NULL` zamkne řádek rodu: souběžné přijetí druhým pánem počká
 * a nezapíše nic.
 */
export function createPlacementTx(db: Executor): PlacementTx {
  return {
    async lockPlacement(): Promise<void> {
      await db.execute(sql`SELECT pg_advisory_xact_lock(${NEWCOMER_PLACEMENT_LOCK}, 0)`);
    },
    async lockIsolated(houseId): Promise<boolean> {
      const rows = await db
        .select({ id: house.id })
        .from(house)
        .where(and(eq(house.id, houseId), isNull(house.placedAt), isNull(house.endedAt)))
        .for('update');
      return rows.length > 0;
    },
    async claim(houseId, at): Promise<boolean> {
      const rows = await db
        .update(house)
        .set({ placedAt: at })
        .where(and(eq(house.id, houseId), isNull(house.placedAt), isNull(house.endedAt)))
        .returning({ id: house.id });
      return rows.length > 0;
    },
    async isolatedCells(ownerId): Promise<WorldCell[]> {
      const rows = await db
        .select({ x: settlement.localX, y: settlement.localY })
        .from(settlement)
        .where(
          and(
            eq(settlement.ownerId, ownerId),
            isNull(settlement.archivedAt),
            isNull(settlement.pendingOwnerId),
            isNotNull(settlement.localX),
          ),
        )
        .orderBy(desc(settlement.isSeat), asc(settlement.createdAt), asc(settlement.id));
      return rows.flatMap((r) => (r.x === null || r.y === null ? [] : [{ x: r.x, y: r.y }]));
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
    async languageCells(language): Promise<WorldCell[]> {
      const rows = await db
        .select({ x: settlement.gridX, y: settlement.gridY })
        .from(settlement)
        .innerJoin(
          house,
          and(
            eq(house.playerId, settlement.ownerId),
            eq(house.kind, 'player'),
            isNull(house.endedAt),
            isNotNull(house.placedAt),
          ),
        )
        .where(
          and(
            isNull(settlement.archivedAt),
            isNotNull(settlement.gridX),
            eq(house.language, language),
          ),
        );
      return rows.flatMap((r) => (r.x === null || r.y === null ? [] : [{ x: r.x, y: r.y }]));
    },
    async seatCell(ownerId): Promise<WorldCell | null> {
      const [row] = await db
        .select({ x: settlement.gridX, y: settlement.gridY })
        .from(settlement)
        .where(and(eq(settlement.ownerId, ownerId), eq(settlement.isSeat, true)))
        .limit(1);
      return row && row.x !== null && row.y !== null ? { x: row.x, y: row.y } : null;
    },
    async moveIsolated(ownerId, shift): Promise<boolean> {
      // jedním příkazem v úložném bodě (savepoint) – obsazené políčko (unikátní index; pozvaný
      // nebo odchod ve světě zapisují do mřížky bez zámku umisťování) zruší jen přesun, transakce
      // jednání žije dál a umístění se zkusí znovu
      try {
        await db.transaction(async (sp) => {
          await sp
            .update(settlement)
            .set({
              gridX: sql`${settlement.localX} + ${shift.x}`,
              gridY: sql`${settlement.localY} + ${shift.y}`,
              localX: null,
              localY: null,
            })
            .where(
              and(
                eq(settlement.ownerId, ownerId),
                isNull(settlement.archivedAt),
                // stejný výběr jako `isolatedCells` – přesouvá se jen to, s čím počítal `placeCluster`
                isNull(settlement.pendingOwnerId),
                isNotNull(settlement.localX),
              ),
            );
        });
        return true;
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },
    premiumTypeCounts(): Promise<Partial<Record<PremiumType, number>>> {
      return premiumTypeCountsOf(db);
    },
    lastPremiumType(playerId): Promise<PremiumType | null> {
      return lastPremiumTypeOf(db, playerId);
    },
    async seatWithoutVillage(ownerId): Promise<boolean> {
      const rows = await db
        .select({ id: settlement.id })
        .from(settlement)
        .where(and(isolatedSeatOf(ownerId), not(hasVillage(db))))
        .limit(1);
      return rows.length > 0;
    },
    async reseatIsolated(playerId, seat): Promise<boolean> {
      // v úložném bodě jako přesun – obsazené políčko (unikátní index) zruší jen přesídlení
      try {
        return await db.transaction(async (sp) => {
          // zámek řádku sídla: zakládání vsi (cizí klíč `village` → FOR KEY SHARE) se dokončí dřív,
          // nebo počká – podmínka „bez vsi“ níž vidí jeho výsledek
          const [row] = await sp
            .select({ id: settlement.id })
            .from(settlement)
            .where(isolatedSeatOf(playerId))
            .for('update');
          if (!row) return false;
          const updated = await sp
            .update(settlement)
            .set({
              gridX: seat.worldCell.x,
              gridY: seat.worldCell.y,
              localX: null,
              localY: null,
              landscapeSeed: seat.landscapeSeed,
              layerVersions: seat.layerVersions,
              premiumType: seat.premiumType,
              premiumOwnerId: playerId,
              skeleton: seat.skeleton,
            })
            .where(and(eq(settlement.id, row.id), not(hasVillage(sp))))
            .returning({ id: settlement.id });
          return updated.length > 0;
        });
      } catch (error) {
        if (isUniqueViolation(error)) return false;
        throw error;
      }
    },
  };
}

/** Odříznuté aktivní sídelní sídlo hráče (bez čekajícího převodu). */
function isolatedSeatOf(ownerId: string): ReturnType<typeof and> {
  return and(
    eq(settlement.ownerId, ownerId),
    eq(settlement.isSeat, true),
    isNull(settlement.archivedAt),
    isNull(settlement.pendingOwnerId),
    isNotNull(settlement.localX),
  );
}
