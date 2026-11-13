import { sql } from 'drizzle-orm';
import { holdDay, type VillageHolds } from '@bohemia/game';
import type { Database } from '../client';

// Bariéra ves × tažení (plán 2026-11-03 – rozhodnutí 13, Úloha 6.7; docs/code/war.md – Bariéra
// dopočtu): které vsi drží tažení a do kterého dne. Čte jen skupiny kontrolního bodu
// (`state->'groups'`), varování (`state->'alarm'` – plán 2026-11-09, Úloha 3) a události v `outbox`
// aktivních tažení. Aktivní tažení najde index `campaign_status_idx`; body s nedoručenými
// událostmi (`outbox IS NOT NULL`) index nemají – ta větev projde tabulku bodů, i skončených tažení
// (částečný index by ji zkrátil – návrh Clauda, potřebuje migraci).
// Mez z bodu (`throughDay` – den bez hodin) počítá `holdDay` (herní jádro).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SQL = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Tažení, která ještě něco drží (aktivní, nebo s nedoručenými událostmi), políčka jejich skupin
 * a běžících poslů (`cells` – drží vsi na políčku a políčko od něj), vsi, které drží varováním
 * (`alarmed` – vsi ve varování, kandidáti hradišť a hradiště skupin uprchlíků, bez ohledu na
 * vzdálenost; id mimo uuid se zahodí) a dny jejich nedoručených událostí do vsí – JSON bodu se
 * rozbalí jednou na tažení.
 *
 * Obě podmínky jako sjednocení id, ne `OR` přes spojení tabulek: s `OR` plánovač spojil všechna
 * tažení se všemi body a filtroval až potom (20 tis. skončených tažení: medián 7,7 ms na dotaz,
 * takhle 2,9 ms – měřeno 13. 11. 2026). Bod má právě jedno tažení (primární klíč = cizí klíč),
 * vybrané body jsou tytéž.
 */
const LIVE = sql`
  live AS MATERIALIZED (
    SELECT cp.campaign_id, cp.state->'groups' AS groups, cp.state->'alarm' AS alarm,
           coalesce((cp.state->>'throughDay')::int, (cp.state->>'day')::int - 1) AS through,
           coalesce(cp.outbox->'villageEvents', '[]'::jsonb) AS events
    FROM campaign_checkpoint cp
    WHERE cp.campaign_id IN (
      SELECT id FROM campaign WHERE status = 'active'
      UNION
      SELECT campaign_id FROM campaign_checkpoint WHERE outbox IS NOT NULL
    )
  ),
  cells AS MATERIALIZED (
    SELECT DISTINCT live.campaign_id, (g->'cell'->>'x')::int AS x, (g->'cell'->>'y')::int AS y
    FROM live CROSS JOIN LATERAL jsonb_array_elements(
      coalesce(live.groups, '[]'::jsonb)
      || coalesce(
        jsonb_path_query_array(live.alarm, '$.messengers[*] ? (@.status == "running")'),
        '[]'::jsonb
      )
    ) g
  ),
  alarmed AS MATERIALIZED (
    SELECT DISTINCT live.campaign_id,
           CASE WHEN a.id ~* ${UUID_SQL} THEN a.id::uuid END AS village_id
    FROM live CROSS JOIN LATERAL jsonb_array_elements_text(
      jsonb_path_query_array(live.alarm, '$.villages[*].villageId')
      || jsonb_path_query_array(live.alarm, '$.villages[*].hosts[*]')
      || jsonb_path_query_array(live.alarm, '$.flights[*].hostVillageId')
    ) a(id)
    WHERE a.id ~* ${UUID_SQL}
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
               ) OR EXISTS (
                 SELECT 1 FROM alarmed
                 WHERE alarmed.campaign_id = live.campaign_id AND alarmed.village_id = v.id
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

/**
 * Vsi, které tažení drží (skupina nebo běžící posel na mapě vsi nebo políčko od ní, varování) –
 * přednost ve workeru; fronta (`world-queue.ts`) bere za „na mezi“ jen tyto vsi.
 */
export async function villagesNearCampaigns(db: Database): Promise<string[]> {
  const result = await db.execute<{ villageId: string }>(sql`
    WITH ${LIVE}
    SELECT v.id AS "villageId"
    FROM cells
    JOIN settlement s
      ON s.grid_x BETWEEN cells.x - 1 AND cells.x + 1
     AND s.grid_y BETWEEN cells.y - 1 AND cells.y + 1
     AND s.archived_at IS NULL
    JOIN village v ON v.settlement_id = s.id AND NOT v.asleep
    UNION
    SELECT v.id
    FROM alarmed
    JOIN village v ON v.id = alarmed.village_id AND NOT v.asleep
    JOIN settlement s ON s.id = v.settlement_id AND s.archived_at IS NULL`);
  return result.rows.map((row) => row.villageId);
}
