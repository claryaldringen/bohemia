import { and, eq, isNull, sql } from 'drizzle-orm';
import type { House, HouseRepository } from '@bohemia/game';
import type { Database } from '../client';
import { house } from '../schema';

type HouseRow = typeof house.$inferSelect;

function toHouse(row: HouseRow): House {
  return {
    id: row.id,
    playerId: row.playerId,
    kind: row.kind,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    endedDay: row.endedDay,
    lord:
      row.lordVillageId === null || row.lordPersonId === null
        ? null
        : { villageId: row.lordVillageId, personId: row.lordPersonId },
  };
}

/** Drizzle adaptér portu HouseRepository. */
export function createHouseRepository(db: Database): HouseRepository {
  async function activeOf(playerId: string): Promise<House | null> {
    const [row] = await db
      .select()
      .from(house)
      .where(and(eq(house.playerId, playerId), eq(house.kind, 'player'), isNull(house.endedAt)))
      .limit(1);
    return row ? toHouse(row) : null;
  }

  return {
    activeOf,
    async byId(id): Promise<House | null> {
      const [row] = await db.select().from(house).where(eq(house.id, id)).limit(1);
      return row ? toHouse(row) : null;
    },
    async create(input): Promise<House> {
      // Unikátní index (živý rod hráče) rozhodne souběh: poražený načte existující rod.
      const [row] = await db
        .insert(house)
        .values({ playerId: input.playerId, kind: input.kind, createdAt: input.createdAt })
        .onConflictDoNothing()
        .returning();
      if (row) return toHouse(row);
      const existing = input.playerId === null ? null : await activeOf(input.playerId);
      if (!existing) throw new Error('Rod se nepodařilo založit.');
      return existing;
    },
    async end(houseId, at, day): Promise<boolean> {
      // Atomicky: z více souběžných volání rod ukončí jen jedno.
      const rows = await db
        .update(house)
        .set({ endedAt: at, endedDay: day })
        .where(and(eq(house.id, houseId), isNull(house.endedAt)))
        .returning({ id: house.id });
      return rows.length > 0;
    },
    async setLord(houseId, lord): Promise<void> {
      await db
        .update(house)
        .set({
          lordVillageId: lord?.villageId ?? sql`NULL`,
          lordPersonId: lord?.personId ?? sql`NULL`,
        })
        .where(eq(house.id, houseId));
    },
  };
}
