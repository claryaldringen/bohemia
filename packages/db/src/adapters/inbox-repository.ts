import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { VillageEvent, VillageInbox } from '@bohemia/game';
import type { Database } from '../client';
import { village, villageInbox } from '../schema';

type InboxRow = typeof villageInbox.$inferSelect;

function toEvent(row: InboxRow): VillageEvent {
  return { id: row.id, villageId: row.villageId, day: row.day, seq: row.seq, body: row.body };
}

/**
 * Drizzle adaptér portu VillageInbox. `post` je jedna transakce: zamkne řádek vsi (`FOR UPDATE`),
 * vloží událost ve dni `max(day, last_day + 1)` a zvedne `version` i `digest_version` – rozběhnutý
 * dopočet té vsi narazí při uložení na konflikt verze a zopakuje se i s událostí. Stav vsi se
 * zápisem nemění, souhrn proto zůstává platný (`digest_version` jde s `version`).
 */
export function createInboxRepository(db: Database): VillageInbox {
  return {
    async post(event): Promise<VillageEvent | null> {
      return db.transaction(async (tx) => {
        const locked = await tx.execute<{ last_day: number | null }>(
          sql`SELECT last_day FROM village WHERE id = ${event.villageId} FOR UPDATE`,
        );
        const row = locked.rows[0];
        // stejný kontrakt jako schránka v paměti: neznámá ves je chyba volajícího
        if (!row) throw new Error(`Ves ${event.villageId} neexistuje.`);
        const lastDay = row.last_day ?? 0;
        const [inserted] = await tx
          .insert(villageInbox)
          .values({
            villageId: event.villageId,
            day: Math.max(event.day, lastDay + 1),
            ref: event.ref,
            body: event.body,
          })
          .onConflictDoNothing({ target: villageInbox.ref })
          .returning();
        // duplicitní `ref` – nic se nezapsalo, verze se nezvedá
        if (!inserted) return null;
        await tx
          .update(village)
          .set({
            version: sql`${village.version} + 1`,
            digestVersion: sql`${village.digestVersion} + 1`,
          })
          .where(eq(village.id, event.villageId));
        return toEvent(inserted);
      });
    },
    async pending(villageId, afterDay, toDay): Promise<VillageEvent[]> {
      const rows = await db
        .select()
        .from(villageInbox)
        .where(
          and(
            eq(villageInbox.villageId, villageId),
            gt(villageInbox.day, afterDay),
            lte(villageInbox.day, toDay),
          ),
        )
        .orderBy(asc(villageInbox.day), asc(villageInbox.seq));
      return rows.map(toEvent);
    },
  };
}
