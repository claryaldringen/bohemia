import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { PRUNED_INBOX_KINDS, type VillageEvent, type VillageInbox } from '@bohemia/game';
import type { Database } from '../client';
import { settlement, village, villageInbox } from '../schema';

type InboxRow = typeof villageInbox.$inferSelect;

function toEvent(row: InboxRow): VillageEvent {
  return { id: row.id, villageId: row.villageId, day: row.day, seq: row.seq, body: row.body };
}

/** Rozsah sloupce `day` (integer) – mez dotazu mimo něj by Postgres odmítl. */
const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;

/** Tvar UUID – jiné id (testy v paměti, ruční vstup) by Postgres u sloupce `uuid` odmítl. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Událost patří zaniklé vsi: ves spí (sloupec `asleep` – vymřelá, opuštěná), nebo má sídlo
 * v archivu (Začít znovu).
 */
const deadVillage = sql`EXISTS (
  SELECT 1 FROM ${village}
  JOIN ${settlement} ON ${settlement.id} = ${village.settlementId}
  WHERE ${village.id} = ${villageInbox.villageId}
    AND (${village.asleep} OR ${settlement.archivedAt} IS NOT NULL)
)`;

/** Výsledek trhu v těle události. */
const resultJson = sql`${villageInbox.body}->'result'`;

/**
 * Má pole JSON aspoň jeden prvek? Chybějící nebo poškozená hodnota (není pole) = ne – bez `CASE` by
 * jediný takový řádek shodil celý dotaz (SQL nezaručuje pořadí podmínek `AND`).
 */
function nonEmpty(array: SQL): SQL {
  return sql`CASE jsonb_typeof(${array}) WHEN 'array' THEN jsonb_array_length(${array}) > 0 ELSE false END`;
}

/** Je hodnota JSON kladné číslo (i zlomkové a mimo rozsah integer)? Jiná hodnota = ne – jako `nonEmpty`. */
function positive(value: SQL): SQL {
  return sql`CASE jsonb_typeof(${value}) WHEN 'number' THEN (${value})::numeric > 0 ELSE false END`;
}

/** Mez dne v dotazu oříznutá do rozsahu sloupce (volající smí poslat „od počátku“ / „navždy“). */
function dayBound(day: number): number {
  return Math.min(INT_MAX, Math.max(INT_MIN, Math.trunc(day)));
}

/**
 * Drizzle adaptér portu VillageInbox. `post` je jedna transakce: zamkne řádek vsi (`FOR UPDATE`),
 * vloží událost ve dni `max(day, last_day + 1)` a zvedne `version` i `digest_version` – rozběhnutý
 * dopočet té vsi narazí při uložení na konflikt verze a zopakuje se i s událostí. Stav vsi se
 * zápisem nemění, souhrn proto zůstává platný (`digest_version` jde s `version`). `pruneUsed`
 * smaže použité snímky okolí a zprávy bez nákladu (`body ->> 'kind'` v `PRUNED_INBOX_KINDS`) po
 * indexu vsi a dne, verzi nezvedá.
 * `strandedResults` / `dropStranded` čtou a mažou výsledky trhu s lidmi nebo mincemi ve schránkách
 * zaniklých vsí (`asleep` nebo sídlo v archivu) – verzi také nezvedají.
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
            gt(villageInbox.day, dayBound(afterDay)),
            lte(villageInbox.day, dayBound(toDay)),
          ),
        )
        .orderBy(asc(villageInbox.day), asc(villageInbox.seq));
      return rows.map(toEvent);
    },
    async pruneUsed(villageId, upToDay): Promise<number> {
      // jen snímky okolí a zprávy bez nákladu – verze vsi se nemění (stav vsi se nemění, souhrn
      // zůstává platný)
      const deleted = await db
        .delete(villageInbox)
        .where(
          and(
            eq(villageInbox.villageId, villageId),
            lte(villageInbox.day, dayBound(upToDay)),
            inArray(sql`${villageInbox.body}->>'kind'`, [...PRUNED_INBOX_KINDS]),
          ),
        )
        .returning({ id: villageInbox.id });
      return deleted.length;
    },
    async strandedResults(): Promise<VillageEvent[]> {
      // napřed zaniklé vsi (malá tabulka vsí) – bez nich se schránky nečtou vůbec, jinak jen jejich
      // řádky po indexu vsi a dne (úloha běží každou minutu, sken všech schránek by rostl se světem)
      const dead = await db
        .select({ id: village.id })
        .from(village)
        .innerJoin(settlement, eq(settlement.id, village.settlementId))
        .where(or(eq(village.asleep, true), isNotNull(settlement.archivedAt)));
      if (dead.length === 0) return [];
      // levný filtr na `ref` výsledku (`…:out`) – tělo se rozbalí jen u výsledků
      const rows = await db
        .select()
        .from(villageInbox)
        .where(
          and(
            inArray(
              villageInbox.villageId,
              dead.map((v) => v.id),
            ),
            sql`${villageInbox.ref} LIKE '%:out'`,
            sql`${villageInbox.body}->>'kind' = 'market-result'`,
            // poškozený řádek (hodnota jiného typu) nesmí zastavit vracení lidí a mincí celého světa
            or(
              nonEmpty(sql`${resultJson}->'people'`),
              nonEmpty(sql`${resultJson}->'newcomers'`),
              positive(sql`${resultJson}->'unsold'->'coins'`),
            ),
            deadVillage,
          ),
        )
        .orderBy(asc(villageInbox.day), asc(villageInbox.seq));
      return rows.map(toEvent);
    },
    async dropStranded(eventIds): Promise<number> {
      const ids = eventIds.filter((id) => UUID.test(id));
      if (ids.length === 0) return 0;
      // jen výsledky zaniklých vsí – verze vsi se nemění (stav vsi se nemění)
      const deleted = await db
        .delete(villageInbox)
        .where(
          and(
            inArray(villageInbox.id, ids),
            sql`${villageInbox.body}->>'kind' = 'market-result'`,
            deadVillage,
          ),
        )
        .returning({ id: villageInbox.id });
      return deleted.length;
    },
  };
}
