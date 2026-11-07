import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createTimeOffsetRepository } from '../time-offset-repository';

const db = createDatabase(testDatabaseUrl());
const repository = createTimeOffsetRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
});

afterAll(async () => {
  await db.$client.end();
});

describe('createTimeOffsetRepository', () => {
  it('hráč bez záznamu má posun 0', async () => {
    expect(await repository.offsetOf('hrac-1')).toBe(0);
    expect(await repository.offsetOf('nikdo')).toBe(0);
  });

  it('extend založí záznam a posuny sčítá', async () => {
    expect(await repository.extend('hrac-1', 30, 1000)).toBe(30);
    expect(await repository.extend('hrac-1', 365, 1000)).toBe(395);
    expect(await repository.offsetOf('hrac-1')).toBe(395);
  });

  it('extend nepřekročí nejvyšší posun a nikdy posun nezmenší', async () => {
    expect(await repository.extend('hrac-1', 365, 100)).toBe(100);
    expect(await repository.extend('hrac-1', 30, 50)).toBe(100);
    expect(await repository.offsetOf('hrac-1')).toBe(100);
  });

  it('souběžná přeskočení se sečtou', async () => {
    await Promise.all([1, 2, 3, 4, 5].map(() => repository.extend('hrac-1', 30, 10_000)));
    expect(await repository.offsetOf('hrac-1')).toBe(150);
  });

  it('nový hráč má vývojový režim vypnutý', async () => {
    const [row] = await db
      .select({ devMode: schema.user.devMode })
      .from(schema.user)
      .where(eq(schema.user.id, 'hrac-1'));
    expect(row?.devMode).toBe(false);
  });

  it('smazání hráče smaže i jeho posun', async () => {
    await repository.extend('hrac-1', 30, 1000);
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.playerTimeOffset)).toHaveLength(0);
  });
});
