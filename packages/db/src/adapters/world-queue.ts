import { sql } from 'drizzle-orm';
import { LAST_WORLD_DAY, type PlayerBehind, type WorldQueue } from '@bohemia/game';
import type { Database } from '../client';
import { villagesNearCampaigns } from './village-holds';

// Fronta workeru (docs/superpowers/plans/2026-10-31-worker.md – 1. Co worker dělá): jeden levný
// dotaz nad uloženými sloupci `last_day` / `asleep` (index `village_awake_day_idx`) – stav vsí
// (JSON) se nečte.

/**
 * Drizzle adaptér portu WorldQueue. Dnešek hráče = `LEAST(den světa + posun, poslední den světa)`
 * jako `playerDay`; `last_day` null (poškozený stav) bere jako 0 jako `stampsOf`. Pořadí id hráče
 * `COLLATE "C"` (bajty) – nezávisí na locale databáze a shoduje se s porovnáním řetězců v JS.
 */
export function createWorldQueue(db: Database): WorldQueue {
  return {
    async behind(worldDay, limit, holds = new Map()): Promise<PlayerBehind[]> {
      const today = sql`LEAST(${worldDay}::int + coalesce(o.offset_days, 0), ${LAST_WORLD_DAY}::int)`;
      // meze bariéry (village-holds.ts): ves na mezi není pozadu, hráč s přednostní vsí pod mezí
      // jde první; bez mezí stejný dotaz jako dřív
      const ids = `{${[...holds.keys()].join(',')}}`;
      const days = `{${[...holds.values()].join(',')}}`;
      const target = sql`LEAST(${today}, coalesce(h.day, ${today}))`;
      const result = await db.execute<{ playerId: string; today: number; oldestDay: number }>(sql`
        WITH h AS (SELECT * FROM unnest(${ids}::uuid[], ${days}::int[]) AS h(id, day))
        SELECT "playerId", today, "oldestDay"
        FROM (
          SELECT coalesce(s.pending_owner_id, s.owner_id) AS "playerId",
                 ${today} AS today,
                 min(coalesce(v.last_day, 0))
                   FILTER (WHERE coalesce(v.last_day, 0) < ${target}) AS "oldestDay",
                 bool_or(h.id IS NOT NULL AND coalesce(v.last_day, 0) < ${target}) AS first
          FROM village v
          JOIN settlement s ON s.id = v.settlement_id AND s.archived_at IS NULL
          LEFT JOIN player_time_offset o
            ON o.player_id = coalesce(s.pending_owner_id, s.owner_id)
          LEFT JOIN h ON h.id = v.id
          WHERE NOT v.asleep
          GROUP BY coalesce(s.pending_owner_id, s.owner_id), o.offset_days
        ) players
        WHERE "oldestDay" < today
        ORDER BY first DESC, today - "oldestDay" DESC, "playerId" COLLATE "C"
        LIMIT ${limit}::int`);
      return result.rows.map((row) => ({
        playerId: row.playerId,
        today: Number(row.today),
        oldestDay: Number(row.oldestDay),
      }));
    },
    priorityVillages: () => villagesNearCampaigns(db),
  };
}
