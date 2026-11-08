import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  foundVillage,
  type DomainDelivery,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createDomainFoodRepository } from '../domain-food-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase(testDatabaseUrl());
const rounds = createDomainFoodRepository(db);
const DAY = dayIndexOf({ year: 503, month: 10, day: 2 });
let a = '';
let b = '';

const deliveries = (grainKg: number): DomainDelivery[] => [
  { toVillageId: b, grainKg, cattle: { cows: 1, youngOxen: 0, trainedOxen: 2 } },
];

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
  const settlements = createSettlementRepository(db);
  const villages = createVillageRepository(db);
  const state = foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  const seat = await settlements.createSeat({
    ownerId: 'hrac-1',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  a = (await villages.create(seat!.id, 'Dub', state))!.id;
  const far = await settlements.create({
    ownerId: 'hrac-1',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 2, y: 0 },
  });
  b = (await villages.create(far!.id, 'Lhota', state))!.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe('DomainFoodRepository (Drizzle)', () => {
  it('reserve dvakrát: druhý zápis vrátí první plán beze změny, plán projde jsonb', async () => {
    const first = await rounds.reserve({
      villageId: a,
      year: 503,
      day: DAY,
      deliveries: deliveries(100),
    });
    expect(first).toEqual({
      villageId: a,
      year: 503,
      day: DAY,
      deliveries: deliveries(100),
      finishedAt: null,
    });
    const again = await rounds.reserve({
      villageId: a,
      year: 503,
      day: DAY + 1,
      deliveries: deliveries(999),
    });
    expect(again).toEqual(first);
  });

  it('souběžné reserve zapíšou jediný plán', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        rounds.reserve({ villageId: a, year: 503, day: DAY, deliveries: deliveries(n) }),
      ),
    );
    expect(new Set(results.map((r) => r.deliveries[0]!.grainKg)).size).toBe(1);
    expect(await db.select().from(schema.domainFoodRound)).toHaveLength(1);
  });

  it('decided jen pro daný rok a dané vsi, prázdný plán se počítá', async () => {
    await rounds.reserve({ villageId: a, year: 503, day: DAY, deliveries: [] });
    await rounds.reserve({ villageId: b, year: 502, day: DAY - 365, deliveries: [] });
    expect([...(await rounds.decided([a, b], 503))]).toEqual([a]);
    expect([...(await rounds.decided([a, b], 502))]).toEqual([b]);
    expect([...(await rounds.decided([b], 503))]).toEqual([]);
    expect((await rounds.decided([], 503)).size).toBe(0);
  });

  it('unfinished vrací jen neprovedené, nejstarší napřed; finish plán uzavře', async () => {
    await rounds.reserve({ villageId: b, year: 503, day: DAY, deliveries: deliveries(5) });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await rounds.reserve({ villageId: a, year: 503, day: DAY, deliveries: deliveries(7) });
    expect((await rounds.unfinished()).map((r) => r.villageId)).toEqual([b, a]);
    await rounds.finish(b, 503);
    expect((await rounds.unfinished()).map((r) => r.villageId)).toEqual([a]);
    // provedený plán zůstává rozhodnutím roku a reserve ho vrátí s časem provedení
    const kept = await rounds.reserve({ villageId: b, year: 503, day: DAY, deliveries: [] });
    expect(kept.finishedAt).toBeInstanceOf(Date);
    expect(kept.deliveries).toEqual(deliveries(5));
    // opakované finish čas nepřepíše
    await rounds.finish(b, 503);
    const [row] = await db
      .select()
      .from(schema.domainFoodRound)
      .where(eq(schema.domainFoodRound.villageId, b));
    expect(row!.finishedAt).toEqual(kept.finishedAt);
  });

  it('smazání vsi smaže její kola', async () => {
    await rounds.reserve({ villageId: a, year: 503, day: DAY, deliveries: [] });
    await rounds.reserve({ villageId: b, year: 503, day: DAY, deliveries: [] });
    await db.delete(schema.village).where(eq(schema.village.id, a));
    const left = await db.select().from(schema.domainFoodRound);
    expect(left.map((r) => r.villageId)).toEqual([b]);
  });
});
