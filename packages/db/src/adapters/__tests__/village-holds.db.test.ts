// Bariéra ves × tažení (plán 2026-11-03 – Úloha 6.7): mez vsí u tažení z kontrolního bodu
// (`throughDay`, skupiny na mapě vsi nebo políčko od ní), nedoručené události, přednostní vsi
// a fronta workeru s mezemi.
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, foundVillage, type CampaignState } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createCampaignRepository } from '../campaign-repository';
import { createHouseRepository } from '../house-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';
import { createVillageHolds, villagesNearCampaigns } from '../village-holds';
import { createWarRepository } from '../war-repository';
import { createWorldQueue } from '../world-queue';

const db = createDatabase(testDatabaseUrl());
const holds = createVillageHolds(db);
const NOW = new Date('2026-11-07T12:00:00Z');
const DAY = 7300;
const CAMPAIGN = '00000000-0000-4000-8000-0000000000d1';
const FOUNDED = foundVillage({
  seed: 1,
  day: DAY - 5,
  dwellingPosition: { x: 0, z: 0, rotation: 0 },
});
/** Den, do kterého jsou založené vsi dopočítané. */
const LAST = FOUNDED.lastDay;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});
afterAll(async () => {
  await db.$client.end();
});

let ids: Record<'near' | 'adjacent' | 'far', string>;
let warId = '';
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'd'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const houses = createHouseRepository(db);
  const a = await houses.create({ playerId: 'a', kind: 'player', createdAt: NOW });
  const d = await houses.create({ playerId: 'd', kind: 'player', createdAt: NOW });
  warId = (
    await createWarRepository(db).start({
      houses: [a.id, d.id],
      startedAt: NOW,
      startedDay: 1,
      how: 'declared',
    })
  ).war.id;
  const settlements = createSettlementRepository(db);
  const villages = createVillageRepository(db);
  const state = FOUNDED;
  const at = async (x: number, seat: boolean): Promise<string> => {
    const place = { ownerId: 'd', landscapeSeed: 11, layerVersions: CURRENT_LAYER_VERSIONS };
    const s = seat
      ? await settlements.createSeat({ ...place, worldCell: { x, y: 0 } })
      : await settlements.create({ ...place, worldCell: { x, y: 0 } });
    return (await villages.create(s!.id, `v${x}`, state))!.id;
  };
  ids = { near: await at(5, true), adjacent: await at(6, false), far: await at(8, false) };
});

function campaign(extra: Partial<CampaignState>): CampaignState {
  return {
    id: CAMPAIGN,
    warId,
    seed: 1,
    tick: 3_400_000_000,
    day: DAY,
    throughDay: DAY - 1,
    phase: 'marching',
    playerId: 'a',
    leaderName: 'Bořivoj',
    commander: { villageId: 'x', personId: 1 },
    deputy: null,
    assembly: { villageId: 'x', cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } },
    target: { villageId: ids.adjacent, cell: { x: 6, y: 0 }, pos: { x: 0, z: 0 } },
    members: [],
    groups: [
      {
        id: 0,
        order: 'follow-leader',
        cell: { x: 5, y: 0 },
        pos: { x: 0, z: 0 },
        goal: null,
        route: [],
        leg: null,
        arrived: false,
      },
    ],
    supplies: { foodKg: 0 },
    loot: { foodKg: 0, herd: 0 },
    captives: [],
    liveCommand: false,
    discovered: [],
    returnReason: null,
    ...extra,
  } as CampaignState;
}

describe('VillageHolds a přednostní vsi', () => {
  it('bez tažení nic nedrží; tažení drží ves na mapě i políčko od ní do throughDay', async () => {
    const all = [ids.near, ids.adjacent, ids.far, 'ne-uuid'];
    expect(await holds.limitOf(all)).toEqual(new Map());
    expect(await villagesNearCampaigns(db)).toEqual([]);
    await createCampaignRepository(db).create(campaign({}), NOW);
    expect(await holds.limitOf(all)).toEqual(
      new Map([
        [ids.near, DAY - 1],
        [ids.adjacent, DAY - 1],
      ]),
    );
    expect((await villagesNearCampaigns(db)).sort()).toEqual([ids.near, ids.adjacent].sort());
    expect(await createWorldQueue(db).priorityVillages()).toHaveLength(2);
  });

  it('nedoručená událost drží i ves daleko pod svým dnem; bod bez throughDay → day − 1', async () => {
    const repo = createCampaignRepository(db);
    await repo.create(campaign({ throughDay: undefined, day: DAY + 1 }), NOW);
    await db.execute(
      sql`UPDATE campaign_checkpoint SET outbox = ${JSON.stringify({
        villageEvents: [
          {
            villageId: ids.far,
            day: DAY - 2,
            ref: 'r1',
            body: { kind: 'raid-day', campaignId: CAMPAIGN },
          },
        ],
        notices: [],
      })}::jsonb`,
    );
    const limits = await holds.limitOf([ids.near, ids.far]);
    expect(limits.get(ids.near)).toBe(DAY);
    expect(limits.get(ids.far)).toBe(DAY - 3);
  });

  it('fronta: ves na mezi není pozadu, hráč s vsí pod mezí jde první', async () => {
    const queue = createWorldQueue(db);
    const today = DAY + 3;
    expect((await queue.behind(today, 5)).map((p) => p.oldestDay)).toEqual([LAST]);
    const atLimit = new Map([
      [ids.near, LAST],
      [ids.adjacent, LAST],
      [ids.far, LAST],
    ]);
    expect(await queue.behind(today, 5, atLimit)).toEqual([]);
    const below = new Map([[ids.near, DAY]]);
    expect(await queue.behind(today, 5, below)).toEqual([
      { playerId: 'd', today, oldestDay: LAST },
    ]);
  });
});
