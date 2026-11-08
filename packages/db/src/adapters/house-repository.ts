import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { House, HouseRepository } from '@bohemia/game';
import type { Database } from '../client';
import { house } from '../schema';

type HouseRow = typeof house.$inferSelect;

/** Řádek tabulky rodů jako rod. */
export function toHouse(row: HouseRow): House {
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
    senior:
      row.seniorVillageId === null || row.seniorPersonId === null
        ? null
        : { villageId: row.seniorVillageId, personId: row.seniorPersonId },
    successionDay: row.successionDay,
    pendingDeparture: row.pendingDeparture,
    lastEnnobleYear: row.lastEnnobleYear,
    language: row.language,
    placedAt: row.placedAt,
    newcomerSince: row.newcomerSince,
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
        .values({
          playerId: input.playerId,
          kind: input.kind,
          createdAt: input.createdAt,
          language: input.language ?? 'cs',
          placedAt: input.placedAt === undefined ? input.createdAt : input.placedAt,
        })
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
    async setLanguage(houseId, language): Promise<void> {
      await db.update(house).set({ language }).where(eq(house.id, houseId));
    },
    async setSenior(houseId, senior): Promise<void> {
      await db
        .update(house)
        .set({
          seniorVillageId: senior?.villageId ?? sql`NULL`,
          seniorPersonId: senior?.personId ?? sql`NULL`,
        })
        .where(eq(house.id, houseId));
    },
    async commitSuccession(houseId, input): Promise<boolean> {
      // Jediný podmíněný UPDATE: ze souběžných volání pro tutéž smrt zapíše jen jedno.
      const rows = await db
        .update(house)
        .set({
          successionDay: input.deathDay,
          lordVillageId: input.lord.villageId,
          lordPersonId: input.lord.personId,
          pendingDeparture: input.pendingDeparture ?? sql`NULL`,
        })
        .where(
          and(
            eq(house.id, houseId),
            or(isNull(house.successionDay), lt(house.successionDay, input.deathDay)),
          ),
        )
        .returning({ id: house.id });
      return rows.length > 0;
    },
    async claimEnnoble(houseId, year): Promise<boolean> {
      // Podmíněný UPDATE: povýšení letos zapíše jen jedno ze souběžných volání.
      const rows = await db
        .update(house)
        .set({ lastEnnobleYear: year })
        .where(
          and(
            eq(house.id, houseId),
            or(isNull(house.lastEnnobleYear), lt(house.lastEnnobleYear, year)),
          ),
        )
        .returning({ id: house.id });
      return rows.length > 0;
    },
    async playerHousesSince(since): Promise<House[]> {
      const rows = await db
        .select()
        .from(house)
        .where(
          and(
            eq(house.kind, 'player'),
            isNull(house.endedAt),
            // ochrana běží od umístění na mapu světa – odříznutý rod ji ještě nemá
            gt(sql`coalesce(${house.placedAt}, ${house.createdAt})`, since),
          ),
        );
      return rows.map(toHouse);
    },
    async markNewcomerSince(houseId, at): Promise<Date | null> {
      // Podmíněný UPDATE: týden začne první žádostí, další žádosti ho neposunou.
      await db
        .update(house)
        .set({ newcomerSince: at })
        .where(and(eq(house.id, houseId), isNull(house.placedAt), isNull(house.newcomerSince)));
      const [row] = await db
        .select({ since: house.newcomerSince, placedAt: house.placedAt })
        .from(house)
        .where(eq(house.id, houseId));
      return row && row.placedAt === null ? row.since : null;
    },
    async waitingNewcomers(): Promise<House[]> {
      const rows = await db
        .select()
        .from(house)
        .where(and(eq(house.kind, 'player'), isNull(house.endedAt), isNull(house.placedAt)));
      return rows.map(toHouse);
    },
    async clearPendingDeparture(houseId, sonId): Promise<boolean> {
      // Podmíněný UPDATE: smaže jen odchod tohoto syna, ze souběžných volání uspěje jedno.
      const rows = await db
        .update(house)
        .set({ pendingDeparture: sql`NULL` })
        .where(
          and(eq(house.id, houseId), sql`(${house.pendingDeparture}->>'sonId')::int = ${sonId}`),
        )
        .returning({ id: house.id });
      return rows.length > 0;
    },
  };
}
