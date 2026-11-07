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

/** Převod dat z migrace 0014 (poslední příkaz po vytvoření tabulky a indexu). */
const conversion = readFileSync(path.join(folder, '0014_house.sql'), 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean)
  .at(-1)!;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: folder });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "house" CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

let seed = 1;
let cell = 0;
const addSettlement = async (
  ownerId: string,
  createdAt: string,
  archived = false,
): Promise<void> => {
  await db.insert(schema.settlement).values({
    ownerId,
    landscapeSeed: seed++,
    layerVersions: CURRENT_LAYER_VERSIONS,
    createdAt: new Date(createdAt),
    archivedAt: archived ? new Date(createdAt) : null,
    gridX: cell++,
    gridY: 0,
  });
};

describe('migrace 0014 – rod hráče', () => {
  it('každý hráč s aktivním sídlem dostane jeden živý rod od nejstaršího sídla', async () => {
    for (const id of ['a', 'b', 'c']) {
      await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
    }
    await addSettlement('a', '2026-10-03T00:00:00Z');
    await addSettlement('a', '2026-10-01T00:00:00Z');
    await addSettlement('b', '2026-10-02T00:00:00Z');
    await addSettlement('c', '2026-10-01T00:00:00Z', true);

    await db.execute(sql.raw(conversion));

    const rows = await db.select().from(schema.house);
    expect(rows.map((r) => r.playerId).sort()).toEqual(['a', 'b']);
    const a = rows.find((r) => r.playerId === 'a')!;
    expect(a).toMatchObject({ kind: 'player', endedAt: null });
    expect(a.createdAt).toEqual(new Date('2026-10-01T00:00:00Z'));
  });
});
