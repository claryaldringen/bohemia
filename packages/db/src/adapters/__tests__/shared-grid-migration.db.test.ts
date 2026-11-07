import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS } from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const folder = path.join(import.meta.dirname, '../../../drizzle');

/** Příkazy migrace 0013 (společná mřížka světa) – převod dat, zrušení starého a nový index. */
const statements = readFileSync(path.join(folder, '0013_shared_world_grid.sql'), 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: folder });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  // stav před migrací 0013: mřížka každého hráče zvlášť
  await db.execute(sql`DROP INDEX IF EXISTS "settlement_grid_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "settlement_owner_grid_idx"`);
  await db.execute(
    sql`CREATE UNIQUE INDEX "settlement_owner_grid_idx" ON "settlement" ("owner_id","grid_x","grid_y") WHERE "archived_at" IS NULL`,
  );
});

afterAll(async () => {
  await db.$client.end();
});

const addPlayer = async (id: string): Promise<void> => {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
};

let seed = 1;
const addSettlement = async (
  ownerId: string,
  createdAt: string,
  cell: { x: number; y: number } | null,
  isSeat = false,
): Promise<void> => {
  await db.insert(schema.settlement).values({
    ownerId,
    isSeat,
    landscapeSeed: seed++,
    layerVersions: CURRENT_LAYER_VERSIONS,
    createdAt: new Date(createdAt),
    gridX: cell?.x ?? null,
    gridY: cell?.y ?? null,
  });
};

const cellsOf = async (ownerId: string): Promise<string[]> => {
  const rows = await db.select().from(schema.settlement);
  return rows
    .filter((r) => r.ownerId === ownerId)
    .map((r) => `${r.gridX},${r.gridY}`)
    .sort();
};

describe('migrace 0013 – společná mřížka světa', () => {
  it('tři hráči s mapami v (0, 0) a (1, 0) po převodu nekolidují, relativní poloha zůstane', async () => {
    for (const id of ['a', 'b', 'c']) await addPlayer(id);
    // pořadí podle prvního sídla: b (k = 0), c (k = 1), a (k = 2)
    await addSettlement('b', '2026-10-01T00:00:00Z', { x: 0, y: 0 }, true);
    await addSettlement('b', '2026-10-05T00:00:00Z', { x: 1, y: 0 });
    await addSettlement('c', '2026-10-02T00:00:00Z', { x: 0, y: 0 }, true);
    await addSettlement('c', '2026-10-06T00:00:00Z', { x: 1, y: 0 });
    await addSettlement('a', '2026-10-03T00:00:00Z', { x: 0, y: 0 }, true);
    await addSettlement('a', '2026-10-07T00:00:00Z', { x: -1, y: 1 });

    for (const statement of statements) await db.execute(sql.raw(statement));

    expect(await cellsOf('b')).toEqual(['0,0', '1,0']);
    expect(await cellsOf('c')).toEqual(['16,0', '17,0']);
    expect(await cellsOf('a')).toEqual(['31,1', '32,0']);
    // nový unikátní index ve světě drží
    await expect(addSettlement('a', '2026-10-09T00:00:00Z', { x: 16, y: 0 })).rejects.toThrow();
  });

  it('sídelní sídlo bez polohy dostane (16 × k, 0), archivovaná sídla index neblokují', async () => {
    for (const id of ['a', 'b']) await addPlayer(id);
    await addSettlement('a', '2026-10-01T00:00:00Z', null, true);
    await addSettlement('b', '2026-10-02T00:00:00Z', null, true);
    await db.execute(sql`UPDATE "settlement" SET "archived_at" = now() WHERE FALSE`);

    for (const statement of statements) await db.execute(sql.raw(statement));

    expect(await cellsOf('a')).toEqual(['0,0']);
    expect(await cellsOf('b')).toEqual(['16,0']);
  });
});
