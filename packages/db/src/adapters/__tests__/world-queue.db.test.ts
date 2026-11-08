import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  LAST_WORLD_DAY,
  dayIndexOf,
  foundVillage,
  playerDay,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createActivityRepository } from '../activity-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createTimeOffsetRepository } from '../time-offset-repository';
import { createVillageRepository } from '../village-repository';
import { createWorldQueue } from '../world-queue';

const db = createDatabase(testDatabaseUrl());
const settlements = createSettlementRepository(db);
const villages = createVillageRepository(db);
const offsets = createTimeOffsetRepository(db);
const queue = createWorldQueue(db);
const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const PLAYERS = ['hrac-a', 'hrac-b', 'hrac-c', 'hrac-d', 'hrac-e', 'hrac-f', 'hrac-g'];

/** Stav vsi – fronta čte jen sloupce `last_day` a `asleep` (generované ze stavu). */
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
const state = (lastDay: number, sleep?: 'extinct' | 'abandoned'): VillageState => ({
  ...founded,
  lastDay,
  ...(sleep === 'extinct' ? { extinctDay: lastDay } : {}),
  ...(sleep === 'abandoned' ? { abandonedDay: lastDay } : {}),
});

let nextPlayer = 0;

/** Hráč se vsemi – první na sídelní mapě, další na mapách vedle. Vrátí id sídel. */
async function player(ownerId: string, states: VillageState[]): Promise<string[]> {
  const ids: string[] = [];
  const base = 16 * nextPlayer++; // každý hráč ve svém pásu mřížky
  for (const [i, s] of states.entries()) {
    const place = { ownerId, landscapeSeed: 1 + i, layerVersions: CURRENT_LAYER_VERSIONS };
    const settlement =
      i === 0
        ? await settlements.createSeat({ ...place, worldCell: { x: base, y: 0 } })
        : await settlements.create({ ...place, worldCell: { x: base + i, y: 0 } });
    await villages.create(settlement!.id, `Ves ${i}`, s);
    ids.push(settlement!.id);
  }
  return ids;
}

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

describe('createWorldQueue', () => {
  it('nejvíc pozadu první, pak podle id; spící vsi, archiv a dohnaní hráči venku', async () => {
    await player('hrac-a', [state(TODAY - 2)]);
    await player('hrac-c', [state(TODAY - 8)]);
    // nejstarší nespící ves rozhoduje, spící (i hodně stará) se nepočítá
    await player('hrac-b', [state(TODAY), state(TODAY - 8), state(TODAY - 30, 'extinct')]);
    await player('hrac-d', [state(TODAY - 30, 'extinct'), state(TODAY - 25, 'abandoned')]);
    const [archived] = await player('hrac-e', [state(TODAY - 20)]);
    await settlements.archive(archived!);
    await player('hrac-f', [state(TODAY)]);
    await offsets.extend('hrac-f', 5, 1000);
    await player('hrac-g', [state(TODAY)]);

    expect(await queue.behind(TODAY, 10)).toEqual([
      { playerId: 'hrac-b', today: TODAY, oldestDay: TODAY - 8 },
      { playerId: 'hrac-c', today: TODAY, oldestDay: TODAY - 8 },
      { playerId: 'hrac-f', today: TODAY + 5, oldestDay: TODAY },
      { playerId: 'hrac-a', today: TODAY, oldestDay: TODAY - 2 },
    ]);
    expect((await queue.behind(TODAY, 2)).map((p) => p.playerId)).toEqual(['hrac-b', 'hrac-c']);
  });

  it('posun času hráče může hráče do fronty dostat i ho předběhnout', async () => {
    await player('hrac-a', [state(TODAY - 4)]);
    await player('hrac-b', [state(TODAY - 1)]);
    expect((await queue.behind(TODAY, 10)).map((p) => p.playerId)).toEqual(['hrac-a', 'hrac-b']);
    await offsets.extend('hrac-b', 30, 1000);
    expect(await queue.behind(TODAY, 10)).toEqual([
      { playerId: 'hrac-b', today: TODAY + 30, oldestDay: TODAY - 1 },
      { playerId: 'hrac-a', today: TODAY, oldestDay: TODAY - 4 },
    ]);
  });

  it('dnešek hráče nesahá za konec světa – jako playerDay', async () => {
    const worldDay = LAST_WORLD_DAY - 2;
    await player('hrac-a', [state(LAST_WORLD_DAY - 1)]);
    await player('hrac-b', [state(LAST_WORLD_DAY)]);
    await offsets.extend('hrac-a', 10, 1000);
    await offsets.extend('hrac-b', 10, 1000);
    expect(await queue.behind(worldDay, 10)).toEqual([
      { playerId: 'hrac-a', today: playerDay(worldDay, 10), oldestDay: LAST_WORLD_DAY - 1 },
    ]);
    expect(playerDay(worldDay, 10)).toBe(LAST_WORLD_DAY);
  });

  it('nikdo pozadu – prázdná fronta', async () => {
    await player('hrac-a', [state(TODAY)]);
    expect(await queue.behind(TODAY, 10)).toEqual([]);
    expect(await queue.behind(TODAY + 1, 10)).toEqual([
      { playerId: 'hrac-a', today: TODAY + 1, oldestDay: TODAY },
    ]);
  });

  it('uspání nečinných: vzhůru a spící zvlášť; dotek tažením a aktivní správce budí', async () => {
    const since = '2026-11-09';
    const awake = { awakeSince: since, asleep: false };
    const asleep = { awakeSince: since, asleep: true };
    const activity = createActivityRepository(db);
    await player('hrac-a', [state(TODAY - 5)]);
    await activity.record('hrac-a', since);
    await player('hrac-b', [state(TODAY - 5)]);
    await activity.record('hrac-b', '2026-11-08');
    await player('hrac-c', [state(TODAY - 5)]); // nikdy nehrál
    const [raided] = await player('hrac-d', [state(TODAY - 6)]);
    const [stewarded] = await player('hrac-e', [state(TODAY - 4)]);
    await activity.record('hrac-f', '2026-11-12');
    const [holder, steward] = await db
      .insert(schema.house)
      .values([
        { playerId: 'hrac-e', kind: 'player' as const },
        { playerId: 'hrac-f', kind: 'player' as const },
      ])
      .returning({ id: schema.house.id });
    const villageOf = async (settlementId: string): Promise<string> =>
      (await villages.listBySettlement(settlementId))[0]!.id;
    await db.insert(schema.stewardship).values({
      villageId: await villageOf(stewarded!),
      holderHouseId: holder!.id,
      stewardHouseId: steward!.id,
      sinceAt: new Date(),
    });
    const holds = new Map([[await villageOf(raided!), TODAY - 2]]);

    const ids = async (h: Map<string, number>, sleep?: typeof awake): Promise<string[]> =>
      (await queue.behind(TODAY, 10, h, sleep)).map((p) => p.playerId);
    expect(await ids(holds, awake)).toEqual(['hrac-d', 'hrac-a', 'hrac-e']);
    expect(await ids(holds, asleep)).toEqual(['hrac-b', 'hrac-c']);
    // bez uspání se nerozlišuje
    expect(await ids(holds)).toEqual(['hrac-d', 'hrac-a', 'hrac-b', 'hrac-c', 'hrac-e']);
    // ves na mezi tažení už dotekem není – hráč „d“ spí
    const reached = new Map([[await villageOf(raided!), TODAY - 6]]);
    expect(await ids(reached, awake)).toEqual(['hrac-a', 'hrac-e']);
    expect(await ids(new Map(), asleep)).toEqual(['hrac-d', 'hrac-b', 'hrac-c']);
  });
});
