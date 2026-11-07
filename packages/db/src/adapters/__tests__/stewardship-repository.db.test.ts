import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createHouseRepository } from '../house-repository';
import { createStewardshipRepository } from '../stewardship-repository';
import { createVassalageRepository } from '../vassalage-repository';

const db = createDatabase(testDatabaseUrl());
const stewardships = createStewardshipRepository(db);
const houses = createHouseRepository(db);
const vassalages = createVassalageRepository(db);

const NOW = new Date('2026-11-06T12:00:00Z');
const VILLAGE = '00000000-0000-4000-8000-000000000001';
const ids: string[] = [];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  ids.length = 0;
  for (const id of ['a', 'b', 'c']) {
    await db.insert(schema.user).values({ id, name: '', email: `${id}@example.com` });
    ids.push((await houses.create({ playerId: id, kind: 'player', createdAt: NOW })).id);
  }
});

afterAll(async () => {
  await db.$client.end();
});

const input = (steward: number, vassalageId: string | null = null) => ({
  villageId: VILLAGE,
  stewardHouseId: ids[steward]!,
  holderHouseId: ids[0]!,
  kind: 'player' as const,
  vassalageId,
  since: NOW,
});

describe('stewardship repository', () => {
  it('založí správu, najde ji a vypíše ji správci i držiteli', async () => {
    const started = await stewardships.start(input(1));
    expect(started).toMatchObject({ villageId: VILLAGE, stewardHouseId: ids[1], kind: 'player' });
    expect(await stewardships.of(VILLAGE)).toMatchObject({ stewardHouseId: ids[1] });
    expect(await stewardships.listByStewardHouse(ids[1]!)).toHaveLength(1);
    expect(await stewardships.listByHolderHouse(ids[0]!)).toHaveLength(1);
    expect(await stewardships.listByStewardHouse(ids[2]!)).toHaveLength(0);
  });

  it('souběžné založení: jedna správa na ves, druhé start vrátí null', async () => {
    const results = await Promise.all([
      stewardships.start(input(1)),
      stewardships.start(input(2)),
      stewardships.start(input(1)),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const rows = await db.select().from(schema.stewardship);
    expect(rows).toHaveLength(1);
  });

  it('odvolání ukončí správu, ves pak smí dostat nového správce', async () => {
    await stewardships.start(input(1));
    expect(await stewardships.end(VILLAGE, 'dismissed', NOW)).toBe(true);
    expect(await stewardships.end(VILLAGE, 'dismissed', NOW)).toBe(false);
    expect(await stewardships.of(VILLAGE)).toBeNull();
    expect(await stewardships.listByStewardHouse(ids[1]!)).toHaveLength(0);
    expect(await stewardships.start(input(2))).toMatchObject({ stewardHouseId: ids[2] });
  });

  it('konec dohody ukončí správy, které na ní stojí', async () => {
    const agreement = await vassalages.create({
      lordHouseId: ids[0]!,
      vassalHouseId: ids[1]!,
      terms: {},
      origin: 'negotiation',
      sinceAt: NOW,
      sinceDay: 1,
    });
    await stewardships.start(input(1, agreement.id));
    expect(await stewardships.endByVassalage(agreement.id, 'vassalage-ended', NOW)).toEqual([
      VILLAGE,
    ]);
    expect(await stewardships.of(VILLAGE)).toBeNull();
    expect(await stewardships.endByVassalage(agreement.id, 'vassalage-ended', NOW)).toEqual([]);
  });
});
