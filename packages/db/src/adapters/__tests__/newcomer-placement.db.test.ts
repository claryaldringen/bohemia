import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import {
  acceptNegotiation,
  CURRENT_LAYER_VERSIONS,
  NEWCOMER_REASONS,
  NEWCOMERS,
  openNegotiation,
  WORLD,
  cellDistance,
  type NegotiateDeps,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';
import { createNegotiationRepository } from '../negotiation-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createWorldDirectory } from '../world-directory';

const db = createDatabase(testDatabaseUrl());
const houses = createHouseRepository(db);
const settlements = createSettlementRepository(db);
const NOW = new Date('2026-11-07T12:00:00Z');

const deps: NegotiateDeps = {
  houses,
  negotiations: createNegotiationRepository(db),
  worldDirectory: createWorldDirectory(db),
  villages: {
    find: () => Promise.resolve(null),
    inbox: { post: () => Promise.resolve(null), pending: () => Promise.resolve([]) },
  },
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.execute(sql`TRUNCATE "house" CASCADE`);
});

afterAll(async () => {
  await db.$client.end();
});

async function user(id: string): Promise<void> {
  await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
}

/** Rod na mapě světa se sídlem na políčku (x, 0). */
async function lord(id: string, x: number): Promise<string> {
  await user(id);
  const house = await houses.create({ playerId: id, kind: 'player', createdAt: NOW });
  await settlements.createSeat({
    ownerId: id,
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  return house.id;
}

/** Odříznutý nováček se dvěma sídly v místní mřížce – (0, 0) a (1, 0). */
async function newcomer(): Promise<string> {
  await user('n');
  const house = await houses.create({
    playerId: 'n',
    kind: 'player',
    createdAt: NOW,
    placedAt: null,
  });
  const base = { ownerId: 'n', landscapeSeed: 2, layerVersions: CURRENT_LAYER_VERSIONS };
  await settlements.createSeat({ ...base, localCell: { x: 0, y: 0 } });
  await settlements.create({ ...base, localCell: { x: 1, y: 0 } });
  return house.id;
}

describe('umístění nováčka (Drizzle)', () => {
  it('dva páni přijmou naráz → jedno vazalství, druhý „Nováček už má pána.“; shluk vedle pána', async () => {
    const a = await lord('a', 0);
    const b = await lord('b', 12);
    const n = await newcomer();
    const ids: Record<string, string> = {};
    for (const [key, to] of [
      ['a', a],
      ['b', b],
    ] as const) {
      const opened = await openNegotiation(deps, {
        playerId: 'n',
        to,
        items: [{ kind: 'oath', lord: to, vassal: n }],
        message: null,
        now: NOW,
        today: 10,
        newcomer: true,
      });
      if (!opened.ok) throw new Error(opened.reason);
      ids[key] = opened.negotiation.id;
    }
    const results = await Promise.all(
      (['a', 'b'] as const).map((key) =>
        acceptNegotiation(deps, { playerId: key, negotiationId: ids[key]!, now: NOW, today: 10 }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: NEWCOMER_REASONS.taken }]);
    const vassalages = await db.select().from(schema.vassalage);
    expect(vassalages).toHaveLength(1);
    expect(vassalages[0]).toMatchObject({ vassalHouseId: n, origin: 'newcomer' });
    const winnerSeat = vassalages[0]!.lordHouseId === a ? { x: 0, y: 0 } : { x: 12, y: 0 };

    const [seat, second] = await settlements.listActive('n');
    expect(seat?.localCell).toBeNull();
    expect(second!.worldCell!.x - seat!.worldCell!.x).toBe(1);
    expect(second!.worldCell!.y).toBe(seat!.worldCell!.y);
    expect(cellDistance(seat!.worldCell!, winnerSeat)).toBe(WORLD.invitedGap);
    expect((await houses.byId(n))?.placedAt).toEqual(NOW);
    // obě žádosti jsou uzavřené – přijatá a zaniklá
    const statuses = (await db.select().from(schema.negotiation)).map((r) => r.status).sort();
    expect(statuses).toEqual(['accepted', 'ended']);
  });

  it('souběžné žádosti nováčka – nejvýš 5 otevřených; po umístění žádná a místní sídlo nevznikne', async () => {
    const lords = await Promise.all(
      Array.from({ length: 7 }, (_, i) => lord(`l${i}`, 10 * (i + 1))),
    );
    const n = await newcomer();
    const open = (to: string): ReturnType<typeof openNegotiation> =>
      openNegotiation(deps, {
        playerId: 'n',
        to,
        items: [{ kind: 'oath', lord: to, vassal: n }],
        message: null,
        now: NOW,
        today: 10,
        newcomer: true,
      });
    const results = await Promise.all(lords.slice(0, 6).map(open));
    expect(results.filter((r) => r.ok)).toHaveLength(NEWCOMERS.maxChoices);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: NEWCOMER_REASONS.choices }]);
    await db
      .update(schema.house)
      .set({ placedAt: NOW })
      .where(sql`id = ${n}`);
    await db.execute(sql`UPDATE negotiation SET status = 'withdrawn'`);
    expect(await open(lords[6]!)).toEqual({ ok: false, reason: NEWCOMER_REASONS.placed });
    // odchod syna u umístěného rodu nezapíše sídlo v místní mřížce (podmíněný zápis)
    const created = await settlements.create({
      ownerId: 'n',
      landscapeSeed: 9,
      layerVersions: CURRENT_LAYER_VERSIONS,
      localCell: { x: 2, y: 0 },
    });
    expect(created).toBeNull();
  });
});
