import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createDialogRepository } from '../dialog-repository';

const db = createDatabase(testDatabaseUrl());
const dialogs = createDialogRepository(db);

const input = (refId = 'v1', playerId = 'hrac-1'): Parameters<typeof dialogs.openOnce>[1] => ({
  playerId,
  kind: 'levy',
  refId,
  year: 503,
  body: { vassalageId: refId },
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  for (const id of ['hrac-1', 'hrac-2']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
  }
});

afterAll(async () => {
  await db.$client.end();
});

describe('DialogRepository (Drizzle)', () => {
  it('souběžné openOnce se stejným klíčem vytvoří jediný dialog', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => dialogs.openOnce('levy:v1:503', input())),
    );
    expect(results.filter((d) => d !== null)).toHaveLength(1);
    expect(await dialogs.listOpen('hrac-1')).toHaveLength(1);
    // zodpovězený dialog klíč neuvolní
    const [created] = await dialogs.listOpen('hrac-1');
    await dialogs.answer(created!.id, 'open');
    expect(await dialogs.openOnce('levy:v1:503', input())).toBeNull();
  });

  it('souběžné answer uspěje jednou a jen s očekávaným stavem', async () => {
    const created = (await dialogs.openOnce('levy:v1:503', input()))!;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => dialogs.answer(created.id, 'open')),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await dialogs.answer(created.id, 'open')).toBe(false);
    expect((await dialogs.byId(created.id))?.status).toBe('answered');
    expect(await dialogs.listOpen('hrac-1')).toHaveLength(0);
  });

  it('bumpYears posune rok a přičte rozdíl jen jednou', async () => {
    const created = (await dialogs.openOnce('levy:v1:503', input()))!;
    const bumps = await Promise.all(
      Array.from({ length: 5 }, () => dialogs.bumpYears(created.key, 504)),
    );
    expect(bumps.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await dialogs.bumpYears(created.key, 504)).toBe(0);
    expect(await dialogs.bumpYears(created.key, 506)).toBe(2);
    expect(await dialogs.byId(created.id)).toMatchObject({ year: 506, years: 4 });
  });

  it('openFor a dropFor pracují jen s otevřenými dialogy příslušné reference', async () => {
    await dialogs.openOnce('levy:v1:503', input('v1'));
    await dialogs.openOnce('levy:v2:503', input('v2', 'hrac-2'));
    expect((await dialogs.openFor('v1', 'levy'))?.playerId).toBe('hrac-1');
    expect(await dialogs.openFor('v1', 'summons')).toBeNull();
    await dialogs.dropFor('v1');
    expect(await dialogs.openFor('v1', 'levy')).toBeNull();
    expect(await dialogs.listOpen('hrac-2')).toHaveLength(1);
  });
});
