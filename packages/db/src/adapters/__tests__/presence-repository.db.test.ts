import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createPresenceRepository } from '../presence-repository';

const db = createDatabase(testDatabaseUrl());
const repository = createPresenceRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values([
    { id: 'hrac-1', name: '', email: 'hrac-1@example.com' },
    { id: 'hrac-2', name: '', email: 'hrac-2@example.com' },
  ]);
});

afterAll(async () => {
  await db.$client.end();
});

describe('createPresenceRepository', () => {
  it('starší zápis nepřepíše novější', async () => {
    const t1 = new Date('2027-01-01T10:00:00Z');
    const t2 = new Date('2027-01-01T10:00:30Z');
    await repository.note('hrac-1', t2);
    await repository.note('hrac-1', t1);
    expect((await repository.lastSeen(['hrac-1'])).get('hrac-1')).toBe(t2.getTime());
  });

  it('novější zápis přepíše starší', async () => {
    await repository.note('hrac-1', new Date(1000));
    await repository.note('hrac-1', new Date(5000));
    expect((await repository.lastSeen(['hrac-1'])).get('hrac-1')).toBe(5000);
  });

  it('hráč bez zápisu v mapě chybí a prázdný seznam vrátí prázdnou mapu', async () => {
    await repository.note('hrac-1', new Date(1000));
    const seen = await repository.lastSeen(['hrac-1', 'hrac-2']);
    expect(seen.has('hrac-2')).toBe(false);
    expect(seen.size).toBe(1);
    expect((await repository.lastSeen([])).size).toBe(0);
  });

  it('smazaný uživatel odstraní i řádek přítomnosti', async () => {
    await repository.note('hrac-1', new Date(1000));
    await db.delete(schema.user).where(eq(schema.user.id, 'hrac-1'));
    expect((await repository.lastSeen(['hrac-1'])).size).toBe(0);
  });
});
