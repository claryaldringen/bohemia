import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  advanceVillage,
  dayIndexOf,
  foundVillage,
  newSteward,
  settleStewardDepartures,
  settlersOf,
  stewardDepartureOrigin,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const villages = createVillageRepository(db);
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const UNKNOWN = '00000000-0000-0000-0000-000000000000';
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
  it('create založí ves s vlastním id a verzí 1, find ji podle id vrátí beze změny stavu', async () => {
    const created = await villages.create(settlementId, 'Libice', state());
    expect(created).toEqual({
      id: expect.any(String),
      settlementId,
      name: 'Libice',
      state: state(),
      version: 1,
    });
    expect(created!.id).not.toBe(settlementId);
    expect(await villages.find(created!.id)).toEqual(created);
  });

  it('druhé create vrátí null a ves nezmění – první ves sídla jen jednou', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    expect(await villages.create(settlementId, 'Jiná', state())).toBeNull();
    expect(await villages.listBySettlement(settlementId)).toEqual([first]);
  });

  it('z pěti souběžných create projde jediné', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => villages.create(settlementId, `Ves ${n}`, state())),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await db.select().from(schema.village)).toHaveLength(1);
  });

  it('create neznámého sídla nic nezaloží', async () => {
    expect(await villages.create(UNKNOWN, 'Libice', state())).toBeNull();
    expect(await db.select().from(schema.village)).toHaveLength(0);
  });

  it('add založí další ves téhož sídla, listBySettlement je vrátí v pořadí založení', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    const second = await villages.add(settlementId, 'Budeč', state());
    expect(second).toMatchObject({ settlementId, name: 'Budeč', version: 1 });
    expect(second.id).not.toBe(first!.id);
    expect((await villages.listBySettlement(settlementId)).map((v) => v.id)).toEqual([
      first!.id,
      second.id,
    ]);
    // po další vsi první ves znovu založit nejde
    expect(await villages.create(settlementId, 'Jiná', state())).toBeNull();
    expect(await villages.listBySettlement(UNKNOWN)).toEqual([]);
  });

  it('stampsOf vrátí id, sídlo, jméno, verzi a den dopočtu vsí sídel – bez stavu', async () => {
    const first = await villages.create(settlementId, 'Libice', state());
    const second = await villages.add(settlementId, 'Budeč', state());
    const later = advanceVillage(state(), DAY + 5, null);
    await villages.save(second.id, later, 1);
    const stamps = await villages.stampsOf([settlementId, UNKNOWN]);
    expect(stamps.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { id: second.id, settlementId, name: 'Budeč', version: 2, lastDay: later.lastDay },
      { id: first!.id, settlementId, name: 'Libice', version: 1, lastDay: state().lastDay },
    ]);
    expect(await villages.stampsOf([])).toEqual([]);
    expect(await villages.stampsOf([UNKNOWN])).toEqual([]);
  });

  it('weatherSeedOf vrátí seed počasí sídla – každé sídlo jiný, neznámé null', async () => {
    const seed = await villages.weatherSeedOf(settlementId);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 31);
    expect(await villages.weatherSeedOf(settlementId)).toBe(seed);
    const other = await createSettlementRepository(db).create({
      ownerId: 'hrac-1',
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    if (!other) throw new Error('Druhé sídlo nešlo založit.');
    expect(await villages.weatherSeedOf(other.id)).not.toBe(seed);
    expect(await villages.weatherSeedOf(UNKNOWN)).toBeNull();
    expect(await villages.weatherSeedOf('neni-uuid')).toBeNull();
  });

  it('find neznámé vsi i řetězce, který není UUID, vrátí null', async () => {
    expect(await villages.find(UNKNOWN)).toBeNull();
    expect(await villages.find('village-1')).toBeNull();
  });

  it('save s aktuální verzí uloží stav a zvýší verzi, se starou verzí vrátí null', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    const next = advanceVillage(state(), DAY + 10, null);
    const saved = await villages.save(id, next, 1);
    // záznam nese předaný stav – databáze ho zpátky neposílá
    expect(saved?.state).toBe(next);
    expect(saved).toMatchObject({ id, settlementId, name: 'Libice' });
    expect(saved).toMatchObject({ id, version: 2, state: next });
    expect(await villages.save(id, state(), 1)).toBeNull();
    expect((await villages.find(id))?.state.lastDay).toBe(DAY + 10);
  });

  it('save jedné vsi sídla druhou ves nezmění', async () => {
    const first = (await villages.create(settlementId, 'Libice', state()))!;
    const second = await villages.add(settlementId, 'Budeč', state());
    await villages.save(second.id, advanceVillage(state(), DAY + 3, null), 1);
    expect(await villages.find(first.id)).toEqual(first);
    expect((await villages.find(second.id))?.version).toBe(2);
  });

  it('ze souběžných save se stejnou verzí projde jediný', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => villages.save(id, advanceVillage(state(), DAY + n, null), 1)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect((await villages.find(id))?.version).toBe(2);
  });

  it('dopočítání po uložení a načtení dá totéž jako bez databáze (JSON nic nezmění)', async () => {
    const stored = advanceVillage(state(), DAY + 400, null);
    const { id } = (await villages.create(settlementId, 'Libice', stored))!;
    const loaded = await villages.find(id);
    const later = DAY + 900;
    expect(advanceVillage(loaded!.state, later, null)).toEqual(advanceVillage(stored, later, null));
  });

  it('rename změní jméno, stav ani verzi ne; neznámá ves vrátí false', async () => {
    const { id } = (await villages.create(settlementId, 'Libice', state()))!;
    expect(await villages.rename(id, 'Testovice')).toBe(true);
    expect(await villages.find(id)).toMatchObject({
      name: 'Testovice',
      version: 1,
      state: state(),
    });
    expect(await villages.rename(UNKNOWN, 'Jiná')).toBe(false);
  });

  it('addOnce založí ves s klíčem jen jednou, findByOrigin ji najde – i z pěti souběžných', async () => {
    const keyed = { ...state(), origin: 'steward-son:a:1' };
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => villages.addOnce(settlementId, `Ves ${n}`, keyed)),
    );
    const ids = new Set(results.map((r) => r?.id));
    expect(ids.size).toBe(1);
    expect(await db.select().from(schema.village)).toHaveLength(1);
    expect((await villages.findByOrigin('steward-son:a:1'))?.id).toBe(results[0]?.id);
    expect(await villages.findByOrigin('steward-son:a:2')).toBeNull();
    expect(await villages.addOnce(UNKNOWN, 'Ves', { ...keyed, origin: 'x' })).toBeNull();
  });

  it('settleStewardDepartures s adaptérem: souběžné vybavení schránky založí ves syna jednou', async () => {
    const base = state();
    const mother: VillageState = {
      ...base,
      steward: {
        ...newSteward(DAY, true),
        departures: [
          { id: DAY, sonId: 1, seed: 5, name: 'Lhota', directions: [], settlers: settlersOf(base) },
        ],
      },
    };
    const added = await villages.add(settlementId, 'Libice', mother);
    const deps = {
      settlements: createSettlementRepository(db),
      villages,
      seeds: { nextSeed: (): number => 7 },
    };
    const input = { playerId: 'hrac-1', villageId: added.id };
    await Promise.all([settleStewardDepartures(deps, input), settleStewardDepartures(deps, input)]);
    expect(await settleStewardDepartures(deps, input)).toEqual([]);
    const all = await villages.listBySettlement(settlementId);
    const sons = all.filter((v) => v.state.origin === stewardDepartureOrigin(added.id, DAY));
    expect(sons).toHaveLength(1);
    expect(sons[0]?.name).toBe('Lhota');
    const marked = (await villages.find(added.id))?.state.steward?.departures?.[0];
    expect(marked?.villageId).toBe(sons[0]?.id);
    expect(marked?.settlers).toBeUndefined();
  });

  it('smazání hráče smaže sídlo i všechny jeho vsi', async () => {
    await villages.create(settlementId, 'Libice', state());
    await villages.add(settlementId, 'Budeč', state());
    await db.execute(sql`DELETE FROM "user" WHERE id = 'hrac-1'`);
    expect(await db.select().from(schema.village)).toHaveLength(0);
  });
});
