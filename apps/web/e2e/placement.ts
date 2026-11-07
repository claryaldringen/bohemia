import { Client } from 'pg';
import { placeNewPlayer, type OccupiedCell } from '@bohemia/game';
import { TEST_DATABASE_URL } from '../playwright.config';

/**
 * Nováček bez pozvánky začíná v odříznuté krajině (newcomers.md); volbu „Svobodný“ v rozhraní
 * přinese další úloha. Testy, které počítají s nezávislým hráčem na mapě světa, ho umístí zápisem
 * do `bohemia_test` stejně jako dřív vstup do hry (`placeNewPlayer` – nejbližší volné políčko od
 * středu světa s odstupem). Vrací true, když hráče umístil (pozvaný už na mapě je).
 */
export async function placeIsolatedPlayer(email: string): Promise<boolean> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    // sídlo zakládá vykreslení /game – chvíli na něj počkat
    let owner: string | null = null;
    for (let i = 0; i < 60 && owner === null; i++) {
      const { rows } = await client.query<{ id: string; isolated: boolean }>(
        `SELECT u.id, (s.local_x IS NOT NULL) AS isolated FROM "user" u
           JOIN settlement s ON s.owner_id = u.id AND s.is_seat
          WHERE u.email = $1`,
        [email],
      );
      const row = rows[0];
      if (row && !row.isolated) return false;
      if (row) owner = row.id;
      else await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (owner === null) throw new Error(`Hráč ${email} nemá sídlo.`);
    const { rows } = await client.query<{ owner_id: string; grid_x: number; grid_y: number }>(
      `SELECT owner_id, grid_x, grid_y FROM settlement
        WHERE archived_at IS NULL AND grid_x IS NOT NULL AND grid_y IS NOT NULL`,
    );
    const occupied: OccupiedCell[] = rows.map((r) => ({
      ownerId: r.owner_id,
      cell: { x: r.grid_x, y: r.grid_y },
    }));
    const cell = placeNewPlayer(occupied, { kind: 'independent' });
    await client.query('BEGIN');
    await client.query(
      `UPDATE settlement SET grid_x = local_x + $2, grid_y = local_y + $3, local_x = NULL, local_y = NULL
        WHERE owner_id = $1 AND archived_at IS NULL AND local_x IS NOT NULL`,
      [owner, cell.x, cell.y],
    );
    await client.query(
      `UPDATE house SET placed_at = now()
        WHERE player_id = $1 AND ended_at IS NULL AND placed_at IS NULL`,
      [owner],
    );
    await client.query('COMMIT');
    return true;
  } finally {
    await client.end();
  }
}
