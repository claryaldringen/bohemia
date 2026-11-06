import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { ShipmentRecord, ShipmentRepository } from '@bohemia/game';
import type { Database } from '../client';
import { shipment } from '../schema';

type Row = typeof shipment.$inferSelect;

function toRecord(row: Row): ShipmentRecord {
  return {
    id: row.id,
    fromVillageId: row.fromVillageId,
    toVillageId: row.toVillageId,
    body: row.bundle,
    purpose: row.purpose,
    refId: row.refId,
    sentDay: row.sentDay,
    arrivesDay: row.arrivesDay,
    postedAt: row.postedAt,
    settledAt: row.settledAt,
  };
}

/** Drizzle adaptér portu ShipmentRepository (vassalage.md – Doprava; `docs/code/vassalage.md`). */
export function createShipmentRepository(db: Database): ShipmentRepository {
  return {
    async reserve(input) {
      const [inserted] = await db
        .insert(shipment)
        .values({
          fromVillageId: input.fromVillageId,
          toVillageId: input.toVillageId,
          bundle: input.body,
          purpose: input.purpose,
          refId: input.refId,
          sentDay: input.sentDay,
          arrivesDay: input.arrivesDay,
        })
        .onConflictDoNothing({ target: shipment.refId })
        .returning();
      if (inserted) return { record: toRecord(inserted), created: true };
      const [row] = await db.select().from(shipment).where(eq(shipment.refId, input.refId));
      if (!row) throw new Error(`Zásilka ${input.refId} zmizela.`);
      return { record: toRecord(row), created: false };
    },
    async findByRef(refId) {
      const [row] = await db.select().from(shipment).where(eq(shipment.refId, refId)).limit(1);
      return row ? toRecord(row) : null;
    },
    async unposted() {
      const rows = await db
        .select()
        .from(shipment)
        .where(isNull(shipment.postedAt))
        .orderBy(asc(shipment.sentDay), asc(shipment.id));
      return rows.map(toRecord);
    },
    async open() {
      const rows = await db
        .select()
        .from(shipment)
        .where(and(isNotNull(shipment.postedAt), isNull(shipment.settledAt)))
        .orderBy(asc(shipment.arrivesDay), asc(shipment.id));
      return rows.map(toRecord);
    },
    async onTheWay(toVillageId) {
      const rows = await db
        .select()
        .from(shipment)
        .where(
          and(
            eq(shipment.toVillageId, toVillageId),
            isNotNull(shipment.postedAt),
            isNull(shipment.settledAt),
          ),
        )
        .orderBy(asc(shipment.arrivesDay), asc(shipment.id));
      return rows.map(toRecord);
    },
    async markPosted(id, at) {
      await db
        .update(shipment)
        .set({ postedAt: at })
        .where(and(eq(shipment.id, id), isNull(shipment.postedAt)));
    },
    async settle(id, at) {
      await db
        .update(shipment)
        .set({ settledAt: at })
        .where(and(eq(shipment.id, id), isNull(shipment.settledAt)));
    },
    async remove(id) {
      await db.delete(shipment).where(and(eq(shipment.id, id), isNull(shipment.postedAt)));
    },
  };
}
