// Mapa vsi v místní mřížce rodu (`villageMapOf` – hunting.md, Lov odříznutého nováčka) proti
// `bohemia_test`: lov odříznutého nováčka běží na krajině jeho vsi, ne na políčku světa se stejnými
// čísly (to je cizí mapa). Sídlo se hledá podle vsi, takže mapa platí i po umístění rodu na mapu
// světa uprostřed lovu; neznámá ves a sídlo v archivu jsou chyba.
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createHouseRepository,
  createSettlementRepository,
  createVillageRepository,
  schema,
} from '@bohemia/db';
import { testDatabaseUrl } from '@bohemia/db/test-database';
import { CURRENT_LAYER_VERSIONS, type Landscape, type LandscapeSource } from '@bohemia/game';
import { village } from '../../../game/src/domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../../game/src/domain/village/__tests__/placement-fixtures';
import { createCampaignCells } from '../campaign-cells';

const db = createDatabase(testDatabaseUrl());
const settlements = createSettlementRepository(db);
const villages = createVillageRepository(db, 4242);
const NOW = new Date('2026-11-23T12:00:00Z');

/** Krajina podle seedu sídla – jeden objekt na seed (shoda = táž krajina). */
const lands = new Map<number, Landscape>();
const landscapes: LandscapeSource = {
  landscapeOf: (seed) => {
    let land = lands.get(seed);
    if (!land) {
      land = makeLandscape();
      lands.set(seed, land);
    }
    return land;
  },
};
const cells = createCampaignCells({ settlements, villages, landscapes, worldSeed: 4242 });

/** Odříznutý rod `a` (sídlo a ves syna v místní mřížce) a rod `b` na políčku světa (0, 0). */
interface World {
  seat: string;
  son: string;
  foreign: string;
  seatSettlement: string;
}

async function seed(): Promise<World> {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'b'].map((id) => ({ id, name: '', email: `${id}@example.com`, createdAt: NOW })));
  // odříznutý rod bez místa na mapě světa – ves syna se zakládá jen pod jeho řádkem (`placed_at` null)
  const houses = createHouseRepository(db);
  await houses.create({ playerId: 'a', kind: 'player', createdAt: NOW, placedAt: null });
  await houses.create({ playerId: 'b', kind: 'player', createdAt: NOW });
  const layerVersions = CURRENT_LAYER_VERSIONS;
  const seat = await settlements.createSeat({
    ownerId: 'a',
    landscapeSeed: 11,
    layerVersions,
    localCell: { x: 0, y: 0 },
  });
  const son = await settlements.create({
    ownerId: 'a',
    landscapeSeed: 33,
    layerVersions,
    localCell: { x: 1, y: 0 },
  });
  const foreign = await settlements.createSeat({
    ownerId: 'b',
    landscapeSeed: 22,
    layerVersions,
    worldCell: { x: 0, y: 0 },
  });
  const add = async (settlementId: string, name: string): Promise<string> =>
    (await villages.create(settlementId, name, village([])))!.id;
  return {
    seat: await add(seat!.id, 'Lhota'),
    son: await add(son!.id, 'Synkov'),
    foreign: await add(foreign!.id, 'Cizov'),
    seatSettlement: seat!.id,
  };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../db/drizzle') });
});

afterAll(async () => {
  await db.$client.end();
});

describe('createCampaignCells – mapa vsi v místní mřížce rodu (villageMapOf)', () => {
  let w: World;
  beforeEach(async () => {
    w = await seed();
  });

  it('mapa sídla odříznuté vsi je její krajina – ne políčko světa (0, 0) se stejnými čísly', async () => {
    const map = await cells.villageMapOf(w.seat);
    expect(map.landscape).toBe(lands.get(11));
    expect(map.villageIds).toEqual([w.seat]);
    expect(map.trailEntries).toEqual([]);
    // políčko světa (0, 0) je cizí mapa rodu `b`
    const world = await cells.mapOf({ x: 0, y: 0 });
    expect(world.landscape).toBe(lands.get(22));
    expect(world.villageIds).toEqual([w.foreign]);
  });

  it('ves syna v místní mřížce má krajinu svého sídla', async () => {
    const map = await cells.villageMapOf(w.son);
    expect(map.landscape).toBe(lands.get(33));
    expect(map.villageIds).toEqual([w.son]);
  });

  it('rod umístěný na mapu světa uprostřed lovu – mapa vsi zůstane krajinou jejího sídla', async () => {
    await db.execute(
      sql`UPDATE settlement SET grid_x = 7, grid_y = -3, local_x = NULL, local_y = NULL
          WHERE id = ${w.seatSettlement}`,
    );
    expect((await cells.villageMapOf(w.seat)).landscape).toBe(lands.get(11));
  });

  it('neznámá ves a sídlo v archivu (Začít znovu) – chyba', async () => {
    await expect(cells.villageMapOf('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      /neexistuje/,
    );
    await settlements.archive(w.seatSettlement);
    await expect(cells.villageMapOf(w.seat)).rejects.toThrow(/není aktivní/);
  });
});
