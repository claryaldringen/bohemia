import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  emptyCellLandscape,
  foundVillage,
  loadVillage,
  newSteward,
  settlementLandscape,
  settlersOf,
  settleStewardDepartures,
  skeletonSlice,
  trailStops,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { testDatabaseUrl } from '../../test-database';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

// Ves syna na stezce nad skutečnými adaptéry (markets.md – Rozhodnutí plánu 4, bod 11): výřez
// sídla přes jsonb, krajina z něj a zastávky kupců z uloženého výřezu.

const db = createDatabase(testDatabaseUrl());
const PLAYER = 'hrac-1';
const DAY = dayIndexOf({ year: 503, month: 8, day: 31 });
// seed světa 1: políčkem (7, −1) vede stezka bez řeky z jihu na sever (world.md – Kostra světa)
const WORLD_SEED = 1;
const CELL = { x: 7, y: -1 };

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: PLAYER, name: '', email: 'hrac-1@example.com' });
});

afterAll(async () => {
  await db.$client.end();
});

describe('ves syna na stezce', () => {
  it('sídlo nese výřez políčka, krajinu prázdné mapy, ves hotovou stezku a zastávky kupců', async () => {
    const settlements = createSettlementRepository(db);
    const villages = createVillageRepository(db, WORLD_SEED);
    const seat = (await settlements.createSeat({
      ownerId: PLAYER,
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 8, y: -1 },
    }))!;
    const base = foundVillage({
      seed: 11,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: null,
    });
    const mother = (await villages.create(seat.id, 'Libice', {
      ...base,
      steward: {
        ...newSteward(DAY, true),
        departures: [
          {
            id: DAY,
            sonId: 1,
            seed: 5,
            name: 'Lhota',
            directions: [{ direction: 'W', travelDays: 2 }],
            settlers: { ...settlersOf(base), stewarded: true },
          },
        ],
      },
    }))!;
    const [son] = await settleStewardDepartures(
      { settlements, villages, worldSeed: WORLD_SEED },
      { playerId: PLAYER, villageId: mother.id },
    );
    const settlement = (await settlements.find(son!.settlementId))!;
    expect(settlement.worldCell).toEqual(CELL);
    expect(settlement.skeleton).toEqual(skeletonSlice(WORLD_SEED, CELL));
    expect(settlement.layerVersions).toEqual({ ...CURRENT_LAYER_VERSIONS, skeleton: 1 });
    const landscape = settlementLandscape(settlement);
    expect(landscape).toEqual(emptyCellLandscape(WORLD_SEED, CELL).landscape);
    await loadVillage({ villages }, { villageId: son!.id, today: DAY + 4, landscape });
    const stored = (await villages.find(son!.id))!.state;
    expect(stored.foundedDay).toBe(DAY + 2);
    expect(stored.trails?.map((t) => [t.direction, t.builtDay])).toEqual([
      ['N', DAY + 2],
      ['S', DAY + 2],
    ]);
    expect(stored.merchantStops).toEqual(trailStops(WORLD_SEED, CELL));
    expect(stored.merchantStops).toMatchObject([{ key: '0,-1,N', index: 13, length: 30 }]);
  }, 60_000);
});
