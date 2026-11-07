import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createDialogRepository } from '../dialog-repository';
import { createHouseRepository } from '../house-repository';
import { createPassageRepository } from '../passage-repository';

// Ohlášený průchod (war.md – Pohyb): podmíněná odpověď, zrušení válkou; odpověď na Svolání se
// zapíše do těla dialogu jednou.

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const passages = createPassageRepository(db);
const dialogs = createDialogRepository(db);
const houses = createHouseRepository(db);
const NOW = new Date('2026-11-07T12:00:00Z');
const PLAYERS = ['vojsko', 'soused'];

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

describe('passage repository', () => {
  it('ze dvou souběžných odpovědí projde jedna; válka ohlášení zruší v obou směrech', async () => {
    const a = await newHouse('vojsko');
    const b = await newHouse('soused');
    const announced = await passages.announce({
      fromHouseId: a.id,
      toHouseId: b.id,
      cells: [{ x: 1, y: -2 }],
      etaDay: 40,
      message: 'Jen projdeme.',
      announcedAt: NOW,
      announcedDay: 30,
    });
    expect(await passages.openTo(b.id)).toHaveLength(1);
    const results = await Promise.all([
      passages.answer(announced.id, false, 'Nevěřím.', NOW),
      passages.answer(announced.id, true, null, NOW),
      passages.answer(announced.id, true, 'Dobře.', NOW),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await passages.byId(announced.id);
    expect(stored?.cells).toEqual([{ x: 1, y: -2 }]);
    expect(stored?.answeredAt).not.toBeNull();
    expect(await passages.openTo(b.id)).toEqual([]);
    expect(await passages.validBetween(a.id, b.id)).toHaveLength(1);
    expect(await passages.voidBetween(b.id, a.id, NOW)).toBe(1);
    expect(await passages.validBetween(a.id, b.id)).toEqual([]);
    expect(await passages.voidBetween(a.id, b.id, NOW)).toBe(0);
  });

  it('odpověď na dialog se přidá do těla jednou; propadnutí jen otevřeného', async () => {
    const opened = (await dialogs.openOnce('summons:v1:0', {
      playerId: 'soused',
      kind: 'summons',
      refId: 'v1',
      year: 503,
      body: { men: 2, days: 30 },
    }))!;
    const results = await Promise.all([
      dialogs.answer(opened.id, 'open', { sent: 1 }),
      dialogs.answer(opened.id, 'open', { sent: 3 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const [stored] = await dialogs.listFor('v1', 'summons');
    expect(stored?.body.men).toBe(2);
    expect([1, 3]).toContain(stored?.body.sent);
    expect(await dialogs.lapse(opened.id)).toBe(false);
    const second = (await dialogs.openOnce('summons:v1:1', {
      playerId: 'soused',
      kind: 'summons',
      refId: 'v1',
      year: 503,
      body: { men: 2, days: 10 },
    }))!;
    expect((await dialogs.openOfKind('summons')).map((d) => d.id)).toEqual([second.id]);
    expect(await dialogs.lapse(second.id)).toBe(true);
    expect(await dialogs.openOfKind('summons')).toEqual([]);
  });
});
