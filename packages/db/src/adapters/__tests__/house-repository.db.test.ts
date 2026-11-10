import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';

const db = createDatabase(testDatabaseUrl());
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

  it('rod dostane jazyk při založení, bez něj češtinu', async () => {
    const polish = await houses.create({
      playerId: 'p1',
      kind: 'player',
      createdAt: NOW,
      language: 'pl',
    });
    expect((await houses.byId(polish.id))?.language).toBe('pl');
    const npc = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
    expect(npc.language).toBe('cs');
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

  it('commitSuccession: souběh dvou volání pro tutéž smrt zapíše jedno, pozdější smrt projde', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    const village = '33333333-3333-4333-8333-333333333333';
    const results = await Promise.all([
      houses.commitSuccession(house.id, {
        deathDay: 500,
        lord: { villageId: village, personId: 1 },
        pendingDeparture: { villageId: village, sonId: 1, deathDay: 500, deadlineDay: 530 },
      }),
      houses.commitSuccession(house.id, {
        deathDay: 500,
        lord: { villageId: village, personId: 2 },
        pendingDeparture: null,
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await houses.byId(house.id);
    expect(stored?.successionDay).toBe(500);
    expect(stored?.lord?.villageId).toBe(village);
    // stejný nebo dřívější den už neprojde, pozdější ano
    const again = { lord: { villageId: village, personId: 3 }, pendingDeparture: null };
    expect(await houses.commitSuccession(house.id, { deathDay: 500, ...again })).toBe(false);
    expect(await houses.commitSuccession(house.id, { deathDay: 400, ...again })).toBe(false);
    expect(await houses.commitSuccession(house.id, { deathDay: 900, ...again })).toBe(true);
    const later = await houses.byId(house.id);
    expect(later?.lord?.personId).toBe(3);
    expect(later?.pendingDeparture).toBeNull();
  });

  it('clearPendingDeparture smaže odchod jen jednou a jen daného syna', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    const village = '44444444-4444-4444-8444-444444444444';
    await houses.commitSuccession(house.id, {
      deathDay: 500,
      lord: { villageId: village, personId: 1 },
      pendingDeparture: { villageId: village, sonId: 1, deathDay: 500, deadlineDay: 530 },
    });
    expect((await houses.byId(house.id))?.pendingDeparture?.deadlineDay).toBe(530);
    expect(await houses.clearPendingDeparture(house.id, 2)).toBe(false);
    const results = await Promise.all([
      houses.clearPendingDeparture(house.id, 1),
      houses.clearPendingDeparture(house.id, 1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await houses.byId(house.id))?.pendingDeparture).toBeNull();
  });

  it('claimEnnoble pustí nejvýš jedno povýšení za herní rok, i souběžně', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    expect(house.lastEnnobleYear).toBeNull();
    const results = await Promise.all([
      houses.claimEnnoble(house.id, 100),
      houses.claimEnnoble(house.id, 100),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await houses.byId(house.id))?.lastEnnobleYear).toBe(100);
    expect(await houses.claimEnnoble(house.id, 100)).toBe(false);
    expect(await houses.claimEnnoble(house.id, 101)).toBe(true);
  });

  it('rod zná křesťanství a je pokřtěný jen jednou, křest až po objevu', async () => {
    const house = await houses.create({ playerId: 'p1', kind: 'player', createdAt: NOW });
    expect(house.christianityKnownYear).toBeNull();
    expect(house.baptizedDay).toBeNull();
    expect(await houses.markBaptized(house.id, 50)).toBe(false);
    expect(await houses.markChristianityKnown(house.id, 700)).toBe(true);
    expect(await houses.markChristianityKnown(house.id, 705)).toBe(false);
    expect((await houses.byId(house.id))?.christianityKnownYear).toBe(700);
    const results = await Promise.all([
      houses.markBaptized(house.id, 100),
      houses.markBaptized(house.id, 100),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await houses.markBaptized(house.id, 200)).toBe(false);
    expect((await houses.byId(house.id))?.baptizedDay).toBe(100);
  });

  it('NPC rod nemá hráče', async () => {
    const npc = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
    expect(npc).toMatchObject({ kind: 'npc', playerId: null });
  });
});
