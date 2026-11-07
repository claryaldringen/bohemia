import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS, dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createEscheatRepository } from '../escheat-repository';
import { createHouseRepository } from '../house-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';
import { createWorldQueue } from '../world-queue';

// Odúmrť (vassalage.md – Vymření rodu – odúmrť): záznam odúmrti a převod držitele po krocích.

const db = createDatabase(testDatabaseUrl());
const escheats = createEscheatRepository(db);
const houses = createHouseRepository(db);
const settlements = createSettlementRepository(db);
const villages = createVillageRepository(db);
const queue = createWorldQueue(db);
const NOW = new Date('2026-11-06T12:00:00Z');
const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const PLAYERS = ['mrtvy', 'pan', 'pan2'];

const founded = foundVillage({
  seed: 11,
  day: TODAY - 40,
  dwellingPosition: { x: -50, z: 12, rotation: 0 },
  firstField: {
    outline: [
      [0, 0],
      [40, 0],
      [40, 40],
    ],
    parts: [
      {
        areaM2: 1600,
        distanceM: 40,
        naturalFertility: 61,
        surface: 'meadow' as const,
        obstacleCost: 0,
        cell: { x: 60, y: 64 },
      },
    ],
  },
});
const state = (lastDay: number): VillageState => ({ ...founded, lastDay });

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

async function deadWithVillage(): Promise<{ settlementId: string; villageId: string }> {
  const seat = await settlements.createSeat({
    ownerId: 'mrtvy',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  const village = await villages.create(seat!.id, 'Vdovín', state(TODAY - 20));
  return { settlementId: seat!.id, villageId: village!.id };
}

describe('escheat repository', () => {
  it('jedna odúmrť na rod i při souběhu, páni ji vidí, návrh platí jen ve verzi', async () => {
    const dead = await houses.create({ playerId: 'mrtvy', kind: 'player', createdAt: NOW });
    const lord = await houses.create({ playerId: 'pan', kind: 'player', createdAt: NOW });
    const lord2 = await houses.create({ playerId: 'pan2', kind: 'player', createdAt: NOW });
    const input = {
      deadHouseId: dead.id,
      lordHouseIds: [lord.id, lord2.id],
      villageIds: ['v-1'],
      vassalIds: [],
      createdAt: NOW,
    };
    const [a, b] = await Promise.all([escheats.create(input), escheats.create(input)]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ status: 'open', plan: null, consents: [], version: 0 });
    expect((await escheats.openOfLord(lord2.id)).map((e) => e.id)).toEqual([a.id]);
    expect(await escheats.openOfLord(dead.id)).toEqual([]);
    const plan = [{ toHouseId: lord.id, villageIds: ['v-1'], vassalIds: [] }];
    const saved = await escheats.update(a.id, { plan, consents: [lord.id], status: 'open' }, 0);
    expect(saved).toMatchObject({ plan, consents: [lord.id], version: 1 });
    // souběžný souhlas se starou verzí neprojde – rozhodnutí se zapíše jednou
    const [x, y] = await Promise.all([
      escheats.update(a.id, { plan, consents: [lord.id, lord2.id], status: 'decided' }, 1),
      escheats.update(a.id, { plan, consents: [lord.id, lord2.id], status: 'decided' }, 1),
    ]);
    expect([x, y].filter((r) => r !== null)).toHaveLength(1);
    expect(await escheats.openOfLord(lord.id)).toEqual([]);
  });
});

describe('transferHolder – převod držitele po krocích', () => {
  it('čekající sídlo nepočítá nikdo, fronta ho dá novému držiteli, převzetí je jednou', async () => {
    const { settlementId } = await deadWithVillage();
    expect(await settlements.transferHolder(settlementId, 'pan', 'pan2')).toBe(false);
    const [first, second] = await Promise.all([
      settlements.transferHolder(settlementId, 'mrtvy', 'pan'),
      settlements.transferHolder(settlementId, 'mrtvy', 'pan2'),
    ]);
    // z obou souběžných převodů uspěje jeden – další se dělí až s ním
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const winner = first ? 'pan' : 'pan2';
    expect(await settlements.listActive('mrtvy')).toEqual([]);
    expect(await settlements.listActive(winner)).toEqual([]);
    // vymřelý hráč už sídelní sídlo nemá – při novém začátku dostane nové
    expect(await settlements.findSeat('mrtvy')).toBeNull();
    expect((await queue.behind(TODAY, 10)).map((p) => p.playerId)).toEqual([winner]);
    const taken = await settlements.acceptTransfers(winner);
    expect(taken.map((s) => [s.id, s.ownerId, s.isSeat])).toEqual([[settlementId, winner, false]]);
    expect(await settlements.acceptTransfers(winner)).toEqual([]);
    expect((await settlements.listActive(winner)).map((s) => s.id)).toEqual([settlementId]);
  });

  it('převod souběžně s dopočtem vsi – uložení dopočtu projde, nic se neztratí', async () => {
    const { settlementId, villageId } = await deadWithVillage();
    const loaded = await villages.find(villageId);
    // dopočet vsi běží (načetl verzi), mezitím 1. i 2. krok převodu
    const [moved, saved] = await Promise.all([
      (async (): Promise<boolean> => {
        const ok = await settlements.transferHolder(settlementId, 'mrtvy', 'pan');
        await settlements.acceptTransfers('pan');
        return ok;
      })(),
      villages.save(villageId, state(TODAY - 10), loaded!.version),
    ]);
    expect(moved).toBe(true);
    expect(saved?.state.lastDay).toBe(TODAY - 10);
    const after = await villages.find(villageId);
    expect(after).toMatchObject({ settlementId, version: loaded!.version + 1 });
    expect(after?.state.lastDay).toBe(TODAY - 10);
    expect((await settlements.find(settlementId))?.ownerId).toBe('pan');
  });
});
