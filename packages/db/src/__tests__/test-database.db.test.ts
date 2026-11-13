import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { CURRENT_LAYER_VERSIONS } from '@bohemia/game';
import { createDatabase } from '../client';
import { schema } from '../index';
import { prepareTestDatabase, testDatabaseUrl } from '../test-database';

// Příprava testovací databáze (globalSetup `test:db` i e2e) vrací indexy tabulky `settlement` do
// stavu z migrací. Test migrace 0013 je za běhu mění; přerušený běh by databázi nechal bez
// unikátního indexu políčka a testy „obsazené políčko“ dalšího běhu by spadly.

const db = createDatabase(testDatabaseUrl());

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

let seed = 1;
const addSettlement = async (ownerId: string, x: number, y: number): Promise<void> => {
  await db
    .insert(schema.user)
    .values({ id: ownerId, name: '', email: `${ownerId}@example.com` })
    .onConflictDoNothing();
  await db.insert(schema.settlement).values({
    ownerId,
    landscapeSeed: seed++,
    layerVersions: CURRENT_LAYER_VERSIONS,
    gridX: x,
    gridY: y,
  });
};

const settlementIndexes = async (): Promise<string[]> => {
  const found = await db.$client.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'settlement'`,
  );
  return found.rows.map((r) => r.indexname);
};

describe('příprava testovací databáze', () => {
  it('po přerušeném testu migrace 0013 vrátí unikátní index políčka', async () => {
    // stav, který přerušený test nechá: starý index místo nového a dva hráči na stejném políčku
    await db.execute(sql`DROP INDEX IF EXISTS "settlement_grid_idx"`);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "settlement_owner_grid_idx" ON "settlement" ("owner_id","grid_x","grid_y") WHERE "archived_at" IS NULL`,
    );
    await addSettlement('a', 0, 0);
    await addSettlement('b', 0, 0);

    await prepareTestDatabase();

    const indexes = await settlementIndexes();
    expect(indexes).toContain('settlement_grid_idx');
    expect(indexes).not.toContain('settlement_owner_grid_idx');
    // index zase drží: na políčku světa leží nejvýš jedna aktivní mapa
    await addSettlement('a', 3, 3);
    await expect(addSettlement('b', 3, 3)).rejects.toThrow();
  });

  it('v pořádku databázi nechá být – data ani indexy nemění', async () => {
    await addSettlement('a', 1, 1);
    const before = await settlementIndexes();

    await prepareTestDatabase();

    expect((await settlementIndexes()).sort()).toEqual(before.sort());
    expect(await db.select().from(schema.settlement)).toHaveLength(1);
  });
});
