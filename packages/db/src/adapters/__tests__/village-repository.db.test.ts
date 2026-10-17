import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  advanceVillage,
  dayIndexOf,
  foundVillage,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const villages = createVillageRepository(db);
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
let settlementId = '';

const state = (): VillageState =>
  foundVillage({
    seed: 11,
    day: DAY,
    dwellingPosition: { x: -50.25, z: 12.125, rotation: 0.3 },
    firstField: {
      outline: [
        [0, 0],
        [40, 0],
        [40, 40],
      ],
      parts: Array.from({ length: 12 }, (_, i) => ({
        areaM2: 133.333333,
        distanceM: 40 + i * 3.7,
        naturalFertility: 61,
        surface: 'meadow' as const,
        obstacleCost: 0,
        cell: { x: 60 + i, y: 64 },
      })),
    },
  });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
  const settlement = await createSettlementRepository(db).createSeat({
    ownerId: 'hrac-1',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  settlementId = settlement.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe('createVillageRepository', () => {
  it('create založí ves s verzí 1 a find ji vrátí beze změny stavu', async () => {
    const created = await villages.create(settlementId, 'Libice', state());
    expect(created).toEqual({ settlementId, name: 'Libice', state: state(), version: 1 });
    expect(await villages.find(settlementId)).toEqual(created);
  });

  it('druhé create vrátí null a ves nezmění', async () => {
    await villages.create(settlementId, 'Libice', state());
    expect(await villages.create(settlementId, 'Jiná', state())).toBeNull();
    expect((await villages.find(settlementId))?.name).toBe('Libice');
  });

  it('find neznámého sídla vrátí null', async () => {
    expect(await villages.find('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('save s aktuální verzí uloží stav a zvýší verzi, se starou verzí vrátí null', async () => {
    await villages.create(settlementId, 'Libice', state());
    const next = advanceVillage(state(), DAY + 10);
    const saved = await villages.save(settlementId, next, 1);
    expect(saved).toMatchObject({ version: 2, state: next });
    expect(await villages.save(settlementId, state(), 1)).toBeNull();
    expect((await villages.find(settlementId))?.state.lastDay).toBe(DAY + 10);
  });

  it('ze souběžných save se stejnou verzí projde jediný', async () => {
    await villages.create(settlementId, 'Libice', state());
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => villages.save(settlementId, advanceVillage(state(), DAY + n), 1)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await villages.find(settlementId))?.version).toBe(2);
  });

  it('dopočítání po uložení a načtení dá totéž jako bez databáze (JSON nic nezmění)', async () => {
    const stored = advanceVillage(state(), DAY + 400);
    await villages.create(settlementId, 'Libice', stored);
    const loaded = await villages.find(settlementId);
    const later = DAY + 900;
    expect(advanceVillage(loaded!.state, later)).toEqual(advanceVillage(stored, later));
  });

  it('rename změní jméno, stav ani verzi ne; bez vsi vrátí false', async () => {
    await villages.create(settlementId, 'Libice', state());
    expect(await villages.rename(settlementId, 'Testovice')).toBe(true);
    expect(await villages.find(settlementId)).toMatchObject({
      name: 'Testovice',
      version: 1,
      state: state(),
    });
    expect(await villages.rename('00000000-0000-0000-0000-000000000000', 'Jiná')).toBe(false);
  });

  it('smazání hráče smaže sídlo i ves', async () => {
    await villages.create(settlementId, 'Libice', state());
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.village)).toHaveLength(0);
  });
});
