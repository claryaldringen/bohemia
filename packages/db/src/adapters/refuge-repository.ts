import { sql } from 'drizzle-orm';
import type { RefugeAway, RefugeRepository } from '@bohemia/game';
import type { Database } from '../client';

// Vsi na útěku (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Úloha 10): dotaz
// nad sloupci `refuge_ref_id` / `refuge_host_village_id` (odvozené z `VillageState.refuge` při
// každém zápisu stavu) bez rozbalení stavu – úloha světa návratu se ptá 1× za minutu.

/** Drizzle adaptér portu RefugeRepository (tabulka `village`). */
export function createRefugeRepository(db: Database): RefugeRepository {
  return {
    async awayVillages(): Promise<RefugeAway[]> {
      const result = await db.execute<{
        id: string;
        ref_id: string | null;
        host_village_id: string | null;
      }>(sql`
        SELECT id, refuge_ref_id AS ref_id, refuge_host_village_id AS host_village_id
        FROM village
        WHERE refuge_ref_id IS NOT NULL AND NOT asleep
        ORDER BY id
      `);
      return result.rows
        .filter((r) => r.ref_id !== null)
        .map((r) => ({ villageId: r.id, refId: r.ref_id!, hostVillageId: r.host_village_id }));
    },
  };
}
