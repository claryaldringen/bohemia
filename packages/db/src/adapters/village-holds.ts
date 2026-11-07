import { sql } from 'drizzle-orm';
import { holdDay, type VillageHolds } from '@bohemia/game';
import type { Database } from '../client';

// Bariéra ves × tažení (plán 2026-11-03 – rozhodnutí 13, Úloha 6.7; docs/code/war.md – Bariéra
// dopočtu): které vsi drží tažení a do kterého dne. Čte jen skupiny kontrolního bodu
// (`state->'groups'`) a události v `outbox` aktivních tažení – tažení je málo, dotaz bez tažení
// skončí hned na indexu `campaign_status_idx`. Mez z bodu (`throughDay` – den bez hodin) počítá
// `holdDay` (herní jádro).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tažení, která ještě něco drží (aktivní, nebo s nedoručenými událostmi), políčka jejich skupin
 * a dny jejich nedoručených událostí do vsí – JSON bodu se rozbalí jednou na tažení.
 */
const LIVE = sql`
  live AS MATERIALIZED (
    SELECT cp.campaign_id, cp.state->'groups' AS groups,
           coalesce((cp.state->>'throughDay')::int, (cp.state->>'day')::int - 1) AS through,
           coalesce(cp.outbox->'villageEvents', '[]'::jsonb) AS events
    FROM campaign c
    JOIN campaign_checkpoint cp ON cp.campaign_id = c.id
    WHERE c.status = 'active' OR cp.outbox IS NOT NULL
  ),
  cells AS MATERIALIZED (
    SELECT DISTINCT live.campaign_id, (g->'cell'->>'x')::int AS x, (g->'cell'->>'y')::int AS y
    FROM live CROSS JOIN LATERAL jsonb_array_elements(live.groups) g
  ),
  outbox AS MATERIALIZED (
    SELECT live.campaign_id, e->>'villageId' AS village_id, (e->>'day')::int AS day
    FROM live CROSS JOIN LATERAL jsonb_array_elements(live.events) e
  )`;

/** Drizzle adaptér portu VillageHolds. */
export function createVillageHolds(db: Database): VillageHolds {
  return {
    async limitOf(villageIds): Promise<Map<string, number>> {
      const limits = new Map<string, number>();
      const ids = [...new Set(villageIds)].filter((id) => UUID.test(id));
      if (ids.length === 0) return limits;
      const rows = await db.execute<{
        villageId: string;
        through: number | null;
        outboxDays: number[];
      }>(sql`
        WITH ${LIVE}
        SELECT v.id AS "villageId",
               CASE WHEN EXISTS (
                 SELECT 1 FROM cells
                 WHERE cells.campaign_id = live.campaign_id
                   AND abs(cells.x - s.grid_x) <= 1 AND abs(cells.y - s.grid_y) <= 1
               ) THEN live.through END AS through,
               coalesce((
                 SELECT array_agg(o.day) FROM outbox o
                 WHERE o.campaign_id = live.campaign_id AND o.village_id = v.id::text
               ), '{}') AS "outboxDays"
        FROM live
        JOIN village v ON v.id = ANY(${`{${ids.join(',')}}`}::uuid[])
        JOIN settlement s ON s.id = v.settlement_id`);
      for (const row of rows.rows) {
        const through = row.through === null ? null : Number(row.through);
        const day = holdDay(through, row.outboxDays.map(Number));
        if (!Number.isFinite(day)) continue;
        limits.set(row.villageId, Math.min(limits.get(row.villageId) ?? Infinity, day));
      }
      return limits;
    },
  };
}

/** Vsi, u kterých stojí tažení (skupina na mapě vsi nebo políčko od ní) – přednost ve workeru. */
export async function villagesNearCampaigns(db: Database): Promise<string[]> {
  const result = await db.execute<{ villageId: string }>(sql`
    WITH ${LIVE}
    SELECT DISTINCT v.id AS "villageId"
    FROM cells
    JOIN settlement s
      ON s.grid_x BETWEEN cells.x - 1 AND cells.x + 1
     AND s.grid_y BETWEEN cells.y - 1 AND cells.y + 1
     AND s.archived_at IS NULL
    JOIN village v ON v.settlement_id = s.id AND NOT v.asleep`);
  return result.rows.map((row) => row.villageId);
}
