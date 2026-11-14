import { sql, type SQL } from 'drizzle-orm';
import { WAR, type AlarmOwner, type AlarmOwnerPort, type VillageCell } from '@bohemia/game';
import type { Database } from '../client';

// Kdo za varovanou ves rozhoduje a kam se utíká (war.md – Varování, poslové a útěk do hradiště;
// plán 2026-11-09 – Úloha 6, Otevřené 1, 5, 6). Rod vsi = živý rod hráče, kterému patří sídlo vsi
// (`settlement.owner_id` → `house`); páni a vazalové přes živé hrany `vassalage` – jen jeden stupeň.
// Vsi bez políčka světa, v archivovaném sídle a spící (vymřelé, opuštěné – `village.asleep`) se
// nepočítají. Stav vsi se nečte.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ves, její políčko a rod (jen ves s živým rodem a políčkem světa). */
const me = (villageId: string): SQL => sql`
  me AS (
    SELECT v.id, s.grid_x AS x, s.grid_y AS y, h.id AS house
    FROM village v
    JOIN settlement s ON s.id = v.settlement_id
    JOIN house h ON h.player_id = s.owner_id AND h.kind = 'player' AND h.ended_at IS NULL
    WHERE v.id = ${villageId}::uuid AND s.grid_x IS NOT NULL AND s.grid_y IS NOT NULL
  )`;

/** Vsi rodů z CTE `houses` s políčkem, od nejbližší vsi `me` (shoda – menší id). */
const villagesOf = (where: SQL): SQL => sql`
  SELECT v.id, s.grid_x AS x, s.grid_y AS y
  FROM houses
  JOIN house h ON h.id = houses.id AND h.kind = 'player' AND h.ended_at IS NULL
  JOIN settlement s ON s.owner_id = h.player_id AND s.archived_at IS NULL
    AND s.grid_x IS NOT NULL AND s.grid_y IS NOT NULL
  JOIN village v ON v.settlement_id = s.id AND NOT v.asleep
  CROSS JOIN me
  WHERE ${where}
  ORDER BY (s.grid_x - me.x) * (s.grid_x - me.x) + (s.grid_y - me.y) * (s.grid_y - me.y), v.id`;

type Row = { id: string; x: number; y: number } & Record<string, unknown>;

const cells = (rows: readonly Row[]): VillageCell[] =>
  rows.map((r) => ({ villageId: r.id, cell: { x: r.x, y: r.y } }));

export function createAlarmOwners(db: Database): AlarmOwnerPort {
  return {
    async ownerOf(villageId): Promise<AlarmOwner | null> {
      if (!UUID.test(villageId)) return null;
      const result = await db.execute<{
        owner_id: string;
        house_id: string | null;
        npc: boolean;
        lord_id: number | null;
      }>(sql`
        SELECT s.owner_id, h.id AS house_id,
               EXISTS (
                 SELECT 1 FROM stewardship st
                 WHERE st.village_id = v.id AND st.ended_at IS NULL AND st.kind = 'npc'
               ) AS npc,
               CASE WHEN h.lord_village_id = v.id THEN h.lord_person_id END AS lord_id
        FROM village v
        JOIN settlement s ON s.id = v.settlement_id
        LEFT JOIN house h ON h.player_id = s.owner_id AND h.kind = 'player' AND h.ended_at IS NULL
        WHERE v.id = ${villageId}::uuid
      `);
      const row = result.rows[0];
      if (!row) return null;
      const owner: AlarmOwner = { playerId: row.owner_id, npc: row.npc, houseId: row.house_id };
      if (row.lord_id !== null) owner.lordId = row.lord_id;
      return owner;
    },

    async refugeHostsOf(villageId): Promise<VillageCell[]> {
      if (!UUID.test(villageId)) return [];
      const result = await db.execute<Row>(sql`
        WITH ${me(villageId)},
        houses AS (
          SELECT house AS id FROM me
          UNION
          SELECT vs.lord_house_id FROM vassalage vs
          JOIN me ON vs.vassal_house_id = me.house
          WHERE vs.ended_at IS NULL
        )
        ${villagesOf(sql`v.id <> me.id
          AND greatest(abs(s.grid_x - me.x), abs(s.grid_y - me.y)) <= ${WAR.alarm.refugeMaxCells}`)}
      `);
      return cells(result.rows);
    },

    async domainOf(villageId): Promise<VillageCell[]> {
      if (!UUID.test(villageId)) return [];
      const result = await db.execute<Row>(sql`
        WITH ${me(villageId)},
        houses AS (
          SELECT house AS id FROM me
          UNION
          SELECT vs.vassal_house_id FROM vassalage vs
          JOIN me ON vs.lord_house_id = me.house
          WHERE vs.ended_at IS NULL
        )
        ${villagesOf(sql`true`)}
      `);
      return cells(result.rows);
    },
  };
}
