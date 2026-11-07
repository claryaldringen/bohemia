import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  isCurrentDigest,
  type DirectoryEntry,
  VILLAGE_DIGEST_VERSION,
  type GridCell,
  type OfferCandidate,
  type VillageDigestRecord,
  type WorldDirectory,
} from '@bohemia/game';
import type { Database } from '../client';
import { house, settlement, village } from '../schema';
import { toHouse } from './house-repository';

/**
 * Drizzle adaptér portu WorldDirectory. Jeden dotaz na nejbližší živé rody (řazení podle
 * Čebyševovy vzdálenosti sídelních sídel, pak id) a jeden na souhrny jejich vsí – stav vsí se
 * nenačítá ani nepřenáší.
 */
export function createWorldDirectory(db: Database): WorldDirectory {
  return {
    async nearestHouses(center, limit, excludeHouseId): Promise<DirectoryEntry[]> {
      const distance = sql`greatest(abs(${settlement.gridX} - ${center.x}), abs(${settlement.gridY} - ${center.y}))`;
      const rows = await db
        .select({ house, gridX: settlement.gridX, gridY: settlement.gridY })
        .from(house)
        .innerJoin(
          settlement,
          and(
            eq(settlement.ownerId, house.playerId),
            eq(settlement.isSeat, true),
            isNull(settlement.archivedAt),
          ),
        )
        .where(
          and(
            eq(house.kind, 'player'),
            isNull(house.endedAt),
            // odříznutý nováček (newcomers.md) na mapě světa není – nikdo ho nevidí
            isNotNull(house.placedAt),
            sql`${house.id} <> ${excludeHouseId}`,
            sql`${settlement.gridX} IS NOT NULL AND ${settlement.gridY} IS NOT NULL`,
          ),
        )
        .orderBy(distance, house.id)
        .limit(limit);
      return entriesFor(db, rows);
    },
    async entriesOf(houseIds): Promise<DirectoryEntry[]> {
      if (houseIds.length === 0) return [];
      const rows = await db
        .select({ house, gridX: settlement.gridX, gridY: settlement.gridY })
        .from(house)
        .innerJoin(
          settlement,
          and(
            eq(settlement.ownerId, house.playerId),
            eq(settlement.isSeat, true),
            isNull(settlement.archivedAt),
          ),
        )
        .where(
          and(
            eq(house.kind, 'player'),
            isNull(house.endedAt),
            inArray(house.id, houseIds),
            sql`${settlement.gridX} IS NOT NULL AND ${settlement.gridY} IS NOT NULL`,
          ),
        );
      return entriesFor(db, rows);
    },
    async isolatedEntriesOf(houseIds): Promise<DirectoryEntry[]> {
      if (houseIds.length === 0) return [];
      // odříznutý rod: bez `placed_at`, sídlo jen v místní mřížce – poloha sídla je místní
      const rows = await db
        .select({ house, gridX: settlement.localX, gridY: settlement.localY })
        .from(house)
        .innerJoin(
          settlement,
          and(
            eq(settlement.ownerId, house.playerId),
            eq(settlement.isSeat, true),
            isNull(settlement.archivedAt),
          ),
        )
        .where(
          and(
            eq(house.kind, 'player'),
            isNull(house.endedAt),
            isNull(house.placedAt),
            inArray(house.id, houseIds),
          ),
        );
      return entriesFor(
        db,
        rows.map((r) => ({ ...r, gridX: r.gridX ?? 0, gridY: r.gridY ?? 0 })),
      );
    },
    async offerCandidates(): Promise<OfferCandidate[]> {
      // živé vsi = souhrn k uložené verzi stavu, současná verze souhrnu, ves nevymřelá ani
      // opuštěná (jako `publicHouseOf`); odříznuté rody (bez `placed_at`) se nenabízejí
      const awake = sql<number>`count(*) FILTER (WHERE ${village.digestVersion} = ${village.version}
        AND (${village.digest}->>'v')::int = ${VILLAGE_DIGEST_VERSION}
        AND ${village.digest}->>'extinctDay' IS NULL
        AND ${village.digest}->>'abandonedDay' IS NULL)`.mapWith(Number);
      const rows = await db
        .select({ id: house.id, kind: house.kind, language: house.language, villages: awake })
        .from(house)
        .innerJoin(
          settlement,
          and(
            eq(settlement.ownerId, house.playerId),
            isNull(settlement.archivedAt),
            isNull(settlement.pendingOwnerId),
          ),
        )
        .innerJoin(village, eq(village.settlementId, settlement.id))
        .where(and(eq(house.kind, 'player'), isNull(house.endedAt), isNotNull(house.placedAt)))
        .groupBy(house.id);
      return rows.map((r) => ({
        houseId: r.id,
        kind: r.kind,
        alive: true,
        villages: r.villages,
        language: r.language,
      }));
    },
  };
}

type SeatRow = { house: typeof house.$inferSelect; gridX: number | null; gridY: number | null };

/** Z řádků rodů se sídelním sídlem složí záznamy adresáře (jeden dotaz na souhrny vsí všech). */
async function entriesFor(db: Database, rows: SeatRow[]): Promise<DirectoryEntry[]> {
  if (rows.length === 0) return [];

  const owners = rows.flatMap((r) => (r.house.playerId === null ? [] : [r.house.playerId]));
  // souhrn jen k uložené verzi stavu (jako `digestsOf`); vsi aktivních sídel majitelů
  const digestRows = await db
    .select({
      ownerId: settlement.ownerId,
      id: village.id,
      settlementId: village.settlementId,
      name: village.name,
      version: village.version,
      digest: village.digest,
    })
    .from(village)
    .innerJoin(settlement, eq(settlement.id, village.settlementId))
    .where(
      and(
        inArray(settlement.ownerId, owners),
        isNull(settlement.archivedAt),
        eq(village.digestVersion, village.version),
      ),
    )
    .orderBy(village.createdAt, village.id);
  const byOwner = new Map<string, VillageDigestRecord[]>();
  for (const { ownerId, digest, ...rest } of digestRows) {
    if (!isCurrentDigest(digest)) continue;
    byOwner.set(ownerId, [...(byOwner.get(ownerId) ?? []), { ...rest, digest }]);
  }

  return rows.map((r): DirectoryEntry => {
    const seat: GridCell = { x: r.gridX!, y: r.gridY! };
    return {
      house: toHouse(r.house),
      seat,
      digests: byOwner.get(r.house.playerId ?? '') ?? [],
    };
  });
}
