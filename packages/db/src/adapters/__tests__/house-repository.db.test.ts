import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const houses = createHouseRepository(db);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "house" CASCADE`);
  await db.insert(schema.user).values({ id: 'p1', name: '', email: 'p1@example.com' });
});

afterAll(async () => {
  await db.$client.end();
});

const NOW = new Date('2026-11-05T12:00:00Z');

describe('HouseRepository (Drizzle)', () => {
  it('souběžné create pro téhož hráče dají jediný řádek', async () => {
    const created = await Promise.all(
      [1, 2, 3, 4].map(() => houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW })),
    );
    expect(new Set(created.map((h) => h.id)).size).toBe(1);
    expect(await db.select().from(schema.house)).toHaveLength(1);
    expect((await houses.activeOf('p1'))?.id).toBe(created[0]!.id);
  });

  it('end uspěje jen jednou; po konci jde založit nový rod', async () => {
    const first = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    expect(await houses.end(first.id, NOW, 123)).toBe(true);
    expect(await houses.end(first.id, NOW, 124)).toBe(false);
    expect(await houses.byId(first.id)).toMatchObject({ endedAt: NOW, endedDay: 123 });
    expect(await houses.activeOf('p1')).toBeNull();
    const second = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    expect(second.id).not.toBe(first.id);
  });

  it('setLord zapíše a vymaže hlavu rodu; NPC rody se neslučují', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    const villageId = '11111111-1111-4111-8111-111111111111';
    await houses.setLord(house.id, { villageId, personId: 7 });
    expect((await houses.byId(house.id))?.lord).toEqual({ villageId, personId: 7 });
    await houses.setLord(house.id, null);
    expect((await houses.byId(house.id))?.lord).toBeNull();
    const a = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
    const b = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
    expect(a.id).not.toBe(b.id);
  });

  it('setSenior zapíše a vymaže seniora rodu, hlavu rodu nemění', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    expect(house.senior).toBeNull();
    const villageId = '22222222-2222-4222-8222-222222222222';
    await houses.setSenior(house.id, { villageId, personId: 3 });
    const stored = await houses.byId(house.id);
    expect(stored?.senior).toEqual({ villageId, personId: 3 });
    expect(stored?.lord).toBeNull();
    await houses.setSenior(house.id, null);
    expect((await houses.byId(house.id))?.senior).toBeNull();
  });
});
