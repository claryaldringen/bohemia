import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { CURRENT_LAYER_VERSIONS } from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createWorldDirectory } from '../world-directory';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const directory = createWorldDirectory(db);
const layers = JSON.stringify(CURRENT_LAYER_VERSIONS);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "house" CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

/** Hráč s rodem, sídelním sídlem na políčku (x, y) a vsí se souhrnem. */
async function player(id: string, x: number, y: number, extra = true): Promise<string> {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
  const [h] = await db.insert(schema.house).values({ playerId: id, kind: 'player' }).returning();
  const [s] = await db
    .insert(schema.settlement)
    .values({
      ownerId: id,
      isSeat: true,
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      gridX: x,
      gridY: y,
    })
    .returning();
  if (extra) {
    await db.insert(schema.village).values({
      settlementId: s!.id,
      name: `Ves ${id}`,
      state: {} as never,
      digest: { v: 2, publicLineMen: [] } as never,
      digestVersion: 1,
    });
  }
  return h!.id;
}

describe('WorldDirectory (Drizzle)', () => {
  it('řadí podle Čebyševovy vzdálenosti, pak id; limit; vynechá vlastní rod', async () => {
    const mine = await player('me', 0, 0);
    const far = await player('far', 7, -2);
    const near = await player('near', -1, 1);
    const mid = await player('mid', 3, 3);
    const none = await player('none', 1, 1, false);
    const entries = await directory.nearestHouses({ x: 0, y: 0 }, 3, mine);
    // vzdálenost 1: near a none (podle id), pak mid (3); far (7) se do limitu nevejde
    expect(entries.map((e) => e.house.id)).toEqual([...[near, none].sort(), mid]);
    expect(entries.map((e) => e.house.id)).not.toContain(far);
    expect(entries.map((e) => e.house.id)).not.toContain(mine);
    expect(entries.find((e) => e.house.id === near)?.digests).toHaveLength(1);
    expect(entries.find((e) => e.house.id === none)?.digests).toEqual([]);
  });

  it('entriesOf vrátí jen vyjmenované živé rody (i vlastní), i se souhrny', async () => {
    const mine = await player('me', 0, 0);
    const other = await player('other', 4, 1);
    await player('third', 2, 2);
    const entries = await directory.entriesOf([
      mine,
      other,
      '00000000-0000-4000-8000-000000000000',
    ]);
    expect(entries.map((e) => e.house.id).sort()).toEqual([mine, other].sort());
    expect(entries.find((e) => e.house.id === other)?.seat).toEqual({ x: 4, y: 1 });
    expect(entries.find((e) => e.house.id === other)?.digests).toHaveLength(1);
    expect(await directory.entriesOf([])).toEqual([]);
  });

  it('skončený rod a archivované sídlo v adresáři nejsou', async () => {
    const mine = await player('me', 0, 0);
    const ended = await player('ended', 1, 0);
    await db.execute(sql`UPDATE house SET ended_at = now() WHERE id = ${ended}`);
    await player('arch', 2, 0);
    await db.execute(sql`UPDATE settlement SET archived_at = now() WHERE owner_id = 'arch'`);
    expect(await directory.nearestHouses({ x: 0, y: 0 }, 10, mine)).toEqual([]);
  });

  it('dotaz na 1 000 rodech (čas do docs/code/world.md)', async () => {
    const mine = await player('me', 0, 0);
    await db.execute(sql`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      SELECT 'u' || g, '', 'u' || g || '@example.com', false, now(), now() FROM generate_series(1, 1000) g`);
    await db.execute(sql`
      INSERT INTO house (player_id, kind) SELECT 'u' || g, 'player' FROM generate_series(1, 1000) g`);
    await db.execute(sql`
      INSERT INTO settlement (owner_id, is_seat, landscape_seed, layer_versions, grid_x, grid_y)
      SELECT 'u' || g, true, g, ${layers}::jsonb, (g % 40) - 20, (g / 40) + 1 FROM generate_series(1, 1000) g`);
    await db.execute(sql`
      INSERT INTO village (settlement_id, name, state, digest, digest_version)
      SELECT id, 'Ves', '{}'::jsonb, '{"v":2,"publicLineMen":[]}'::jsonb, 1 FROM settlement WHERE owner_id <> 'me'`);
    await db.execute(sql`ANALYZE`);
    await directory.nearestHouses({ x: 0, y: 0 }, 20, mine); // zahřátí
    const times: number[] = [];
    let result = await directory.nearestHouses({ x: 0, y: 0 }, 20, mine);
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      result = await directory.nearestHouses({ x: 0, y: 0 }, 20, mine);
      times.push(performance.now() - t);
    }
    console.log(
      `nearestHouses(1000 rodů, limit 20): ${times.map((t) => t.toFixed(1)).join(' / ')} ms`,
    );
    expect(result).toHaveLength(20);
    expect(result.every((e) => e.digests.length === 1)).toBe(true);
    const dist = result.map((e) => Math.max(Math.abs(e.seat.x), Math.abs(e.seat.y)));
    expect(dist).toEqual([...dist].sort((a, b) => a - b));
  });
});
