import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { Passage, PassageRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { passage } from '../schema';

type Row = typeof passage.$inferSelect;

function toPassage(row: Row): Passage {
  return {
    id: row.id,
    fromHouseId: row.fromHouseId,
    toHouseId: row.toHouseId,
    cells: row.cells,
    etaDay: row.etaDay,
    message: row.message,
    announcedAt: row.announcedAt,
    announcedDay: row.announcedDay,
    campaignId: row.campaignId,
    trust: row.trust,
    reply: row.reply,
    answeredAt: row.answeredAt,
    voidedAt: row.voidedAt,
  };
}

/** Drizzle adaptér portu PassageRepository (war.md – Pohyb: Průchod územím neutrálního rodu). */
export function createPassageRepository(db: Executor): PassageRepository {
  return {
    async announce(input): Promise<Passage> {
      const [row] = await db.insert(passage).values(input).returning();
      return toPassage(row!);
    },
    async byId(id): Promise<Passage | null> {
      const [row] = await db.select().from(passage).where(eq(passage.id, id)).limit(1);
      return row ? toPassage(row) : null;
    },
    async answer(id, trust, reply, at): Promise<boolean> {
      // podmíněně: jen platné ohlášení bez odpovědi – ze dvou souběžných odpovědí projde jedna
      const updated = await db
        .update(passage)
        .set({ trust, reply, answeredAt: at })
        .where(and(eq(passage.id, id), isNull(passage.answeredAt), isNull(passage.voidedAt)))
        .returning({ id: passage.id });
      return updated.length > 0;
    },
    async validBetween(fromHouseId, toHouseId): Promise<Passage[]> {
      const rows = await db
        .select()
        .from(passage)
        .where(
          and(
            eq(passage.fromHouseId, fromHouseId),
            eq(passage.toHouseId, toHouseId),
            isNull(passage.voidedAt),
          ),
        )
        .orderBy(asc(passage.announcedAt), asc(passage.id));
      return rows.map(toPassage);
    },
    async openTo(toHouseId): Promise<Passage[]> {
      const rows = await db
        .select()
        .from(passage)
        .where(
          and(
            eq(passage.toHouseId, toHouseId),
            isNull(passage.voidedAt),
            isNull(passage.answeredAt),
          ),
        )
        .orderBy(asc(passage.announcedAt), asc(passage.id));
      return rows.map(toPassage);
    },
    async bindToCampaign(fromHouseId, campaignId): Promise<number> {
      const updated = await db
        .update(passage)
        .set({ campaignId })
        .where(
          and(
            eq(passage.fromHouseId, fromHouseId),
            isNull(passage.campaignId),
            isNull(passage.voidedAt),
          ),
        )
        .returning({ id: passage.id });
      return updated.length;
    },
    async voidOfCampaign(campaignId, at): Promise<number> {
      const updated = await db
        .update(passage)
        .set({ voidedAt: at })
        .where(and(eq(passage.campaignId, campaignId), isNull(passage.voidedAt)))
        .returning({ id: passage.id });
      return updated.length;
    },
    async voidBetween(a, b, at): Promise<number> {
      const updated = await db
        .update(passage)
        .set({ voidedAt: at })
        .where(
          and(
            isNull(passage.voidedAt),
            or(
              and(eq(passage.fromHouseId, a), eq(passage.toHouseId, b)),
              and(eq(passage.fromHouseId, b), eq(passage.toHouseId, a)),
            ),
          ),
        )
        .returning({ id: passage.id });
      return updated.length;
    },
  };
}
