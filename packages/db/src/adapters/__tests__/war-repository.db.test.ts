import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';
import { createWarRepository } from '../war-repository';

// Války mezi rody (war.md): jedna aktivní válka na dvojici i při souběhu, utichnutí, vymření.

const db = createDatabase(testDatabaseUrl());
const wars = createWarRepository(db);
const houses = createHouseRepository(db);
const NOW = new Date('2026-11-06T12:00:00Z');
const PLAYERS = ['a', 'b', 'c'];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(PLAYERS.map((id) => ({ id, name: '', email: `${id}@example.com` })));
});

afterAll(async () => {
  await db.$client.end();
});

const newHouse = (playerId: string): ReturnType<typeof houses.create> =>
  houses.create({ playerId, kind: 'player', createdAt: NOW });

describe('war repository', () => {
  it('souběžné opovědi téže dvojice (v obou směrech) založí jedinou aktivní válku', async () => {
    const a = await newHouse('a');
    const b = await newHouse('b');
    const input = { startedAt: NOW, startedDay: 10, how: 'declared' as const };
    const results = await Promise.all([
      wars.start({ ...input, houses: [a.id, b.id] }),
      wars.start({ ...input, houses: [b.id, a.id] }),
      wars.start({ ...input, houses: [a.id, b.id] }),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.war.id)).size).toBe(1);
    expect(await wars.activeOf(a.id)).toHaveLength(1);
    expect((await wars.activeBetween(b.id, a.id))?.houses).toEqual(
      a.id < b.id ? [a.id, b.id] : [b.id, a.id],
    );
  });

  it('po konci války smí vzniknout nová, střet posouvá jen dopředu', async () => {
    const a = await newHouse('a');
    const b = await newHouse('b');
    const first = await wars.start({
      houses: [a.id, b.id],
      startedAt: NOW,
      startedDay: 10,
      how: 'ambush',
    });
    await wars.touchClash(first.war.id, 50);
    await wars.touchClash(first.war.id, 20);
    expect((await wars.listActive())[0]!.lastClashDay).toBe(50);
    expect(await wars.end(first.war.id, 'quiet', NOW)).toBe(true);
    expect(await wars.end(first.war.id, 'peace', NOW)).toBe(false);
    const second = await wars.start({
      houses: [b.id, a.id],
      startedAt: NOW,
      startedDay: 400,
      how: 'declared',
    });
    expect(second.created).toBe(true);
    expect(second.war.id).not.toBe(first.war.id);
  });

  it('vymření rodu ukončí jeho války; vlastní útok a upozornění se zapisují jednou', async () => {
    const a = await newHouse('a');
    const b = await newHouse('b');
    const c = await newHouse('c');
    const base = { startedAt: NOW, startedDay: 1, how: 'declared' as const };
    await wars.start({ ...base, houses: [a.id, b.id] });
    await wars.start({ ...base, houses: [a.id, c.id] });
    expect(await wars.extinctOf(a.id, NOW)).toBe(2);
    expect(await wars.listActive()).toHaveLength(0);
    const first = new Date(NOW.getTime() + 1000);
    await wars.markAttack(a.id, NOW);
    await wars.markAttack(a.id, first);
    expect(await wars.ownAttackAt(a.id)).toEqual(NOW);
    expect(await wars.ownAttackAt(b.id)).toBeNull();
    expect(await wars.claimProtectionNotice(a.id, NOW)).toBe(true);
    expect(await wars.claimProtectionNotice(a.id, NOW)).toBe(false);
    expect(await houses.playerHousesSince(new Date(NOW.getTime() - 1000))).toHaveLength(3);
  });
});
