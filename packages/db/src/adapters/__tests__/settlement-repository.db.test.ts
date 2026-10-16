import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS } from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const repository = createSettlementRepository(db);

const addPlayer = async (id: string): Promise<void> => {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await addPlayer('hrac-1');
});

afterAll(async () => {
  await db.$client.end();
});

const seat = { ownerId: 'hrac-1', landscapeSeed: 1234, layerVersions: CURRENT_LAYER_VERSIONS };

describe('createSettlementRepository', () => {
  it('createSeat založí sídlo a findSeat ho najde', async () => {
    const created = await repository.createSeat(seat);
    expect(created).toMatchObject({ ...seat, isSeat: true });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await repository.findSeat('hrac-1')).toEqual(created);
  });

  it('druhé createSeat vrátí původní sídlo a seed se nezmění', async () => {
    const first = await repository.createSeat(seat);
    const second = await repository.createSeat({ ...seat, landscapeSeed: 9999 });
    expect(second).toEqual(first);
    expect(second.landscapeSeed).toBe(1234);
  });

  it('pět souběžných createSeat vytvoří jediný řádek', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => repository.createSeat({ ...seat, landscapeSeed: n })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const rows = await db.select().from(schema.settlement);
    expect(rows).toHaveLength(1);
  });

  it('findSeat neznámého hráče vrátí null', async () => {
    expect(await repository.findSeat('nikdo')).toBeNull();
  });

  it('smazání hráče smaže i jeho sídla', async () => {
    await repository.createSeat(seat);
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.settlement)).toHaveLength(0);
  });
});
