// Bariéra ves × tažení (plán 2026-11-03 – Úloha 6.7): mez vsí u tažení z kontrolního bodu
// (`throughDay`, skupiny na mapě vsi nebo políčko od ní), nedoručené události, přednostní vsi
// a fronta workeru s mezemi.
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  foundVillage,
  type AlarmFlight,
  type AlarmMessenger,
  type AlarmVillage,
  type CampaignAlarm,
  type CampaignState,
  type JourneyState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createCampaignRepository } from '../campaign-repository';
import { createJourneyRepository } from '../journey-repository';
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

/** Běžící výjezd hráče `a` – skupina na políčku (5, 0), domov mimo testované vsi. */
function journeyState(extra: Partial<JourneyState> = {}): JourneyState {
  return {
    kind: 'journey',
    id: '00000000-0000-4000-8000-0000000000e1',
    seed: 1,
    tick: 3_400_000_000,
    day: DAY,
    throughDay: DAY - 2,
    phase: 'out',
    playerId: 'a',
    houseId: 'h',
    leaderName: 'Bořivoj',
    home: { villageId: 'x', cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } },
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
    arrivedTick: null,
    ...extra,
  } as JourneyState;
}

describe('VillageHolds a přednostní vsi', () => {
  it('výjezd ukončený restartem (`end`) nedrží nic', async () => {
    const journeys = createJourneyRepository(db);
    const all = [ids.near, ids.adjacent, ids.far];
    await journeys.create(journeyState(), NOW);
    expect((await holds.limitOf(all)).size).toBe(2);
    await journeys.end(journeyState().id);
    expect(await holds.limitOf(all)).toEqual(new Map());
    expect(await villagesNearCampaigns(db)).toEqual([]);
  });

  it('domovská ves běžícího výjezdu drží do throughDay jako ves u skupiny a jde přednostně', async () => {
    const journeys = createJourneyRepository(db);
    const all = [ids.near, ids.adjacent, ids.far];
    const away = journeyState({
      home: { villageId: ids.far, cell: { x: 8, y: 0 }, pos: { x: 0, z: 0 } },
    });
    await journeys.create(away, NOW);
    expect(await holds.limitOf(all)).toEqual(
      new Map([
        [ids.near, DAY - 2],
        [ids.adjacent, DAY - 2],
        [ids.far, DAY - 2],
      ]),
    );
    expect((await villagesNearCampaigns(db)).sort()).toEqual(
      [ids.near, ids.adjacent, ids.far].sort(),
    );
    const queue = createWorldQueue(db);
    expect(await queue.priorityVillages()).toHaveLength(3);
    // skončený výjezd domov nedrží – ani s nedoručenými událostmi jinam
    await journeys.saveCheckpoint(away.id, {
      fromTick: away.tick,
      seenIntents: 0,
      state: { ...away, tick: away.tick + 10, phase: 'done' },
      outbox: {
        villageEvents: [
          {
            villageId: ids.near,
            day: DAY + 4,
            ref: 'r1',
            body: { kind: 'raid-day', campaignId: away.id },
          },
        ],
        notices: [],
      } as never,
    });
    expect((await holds.limitOf(all)).has(ids.far)).toBe(false);
  });

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

  it('výjezd drží ves na mapě skupiny i políčko od ní do throughDay; skončený bez událostí ne', async () => {
    const journeys = createJourneyRepository(db);
    const journey: JourneyState = {
      kind: 'journey',
      id: '00000000-0000-4000-8000-0000000000e1',
      seed: 1,
      tick: 3_400_000_000,
      day: DAY,
      throughDay: DAY - 2,
      phase: 'out',
      playerId: 'a',
      houseId: 'h',
      leaderName: 'Bořivoj',
      home: { villageId: 'x', cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } },
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
      arrivedTick: null,
    } as JourneyState;
    const all = [ids.near, ids.adjacent, ids.far];
    await journeys.create(journey, NOW);
    expect(await holds.limitOf(all)).toEqual(
      new Map([
        [ids.near, DAY - 2],
        [ids.adjacent, DAY - 2],
      ]),
    );
    expect((await villagesNearCampaigns(db)).sort()).toEqual([ids.near, ids.adjacent].sort());
    // s tažením se bere nižší mez
    await createCampaignRepository(db).create(campaign({}), NOW);
    expect((await holds.limitOf(all)).get(ids.near)).toBe(DAY - 2);
    // skončený výjezd bez nedoručených událostí nedrží nic
    await db.execute(sql`DELETE FROM campaign`);
    await journeys.saveCheckpoint(journey.id, {
      fromTick: journey.tick,
      seenIntents: 0,
      state: { ...journey, tick: journey.tick + 10, phase: 'done' },
      outbox: null,
    });
    expect(await holds.limitOf(all)).toEqual(new Map());
    expect(await villagesNearCampaigns(db)).toEqual([]);
    // nedoručená událost ho drží dál
    await journeys.saveCheckpoint(journey.id, {
      fromTick: journey.tick + 10,
      seenIntents: 0,
      state: { ...journey, tick: journey.tick + 20, phase: 'done' },
      outbox: {
        villageEvents: [
          {
            villageId: ids.far,
            day: DAY - 4,
            ref: 'r1',
            body: { kind: 'raid-day', campaignId: journey.id },
          },
        ],
        notices: [],
      } as never,
    });
    expect((await holds.limitOf(all)).get(ids.far)).toBe(DAY - 5);
  });

  it('bod bez varování i s prázdným varováním – meze jako dřív (Ú3 f)', async () => {
    const repo = createCampaignRepository(db);
    await repo.create(campaign({ alarm: alarm({}) }), NOW);
    const all = [ids.near, ids.adjacent, ids.far];
    expect(await holds.limitOf(all)).toEqual(
      new Map([
        [ids.near, DAY - 1],
        [ids.adjacent, DAY - 1],
      ]),
    );
    expect((await villagesNearCampaigns(db)).sort()).toEqual([ids.near, ids.adjacent].sort());
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

// Varování a útěk do hradiště (plán 2026-11-09 – Úloha 3; war.md – Varování, poslové a útěk do
// hradiště): tažení drží i vsi ve varování, hostitele skupin uprchlíků, kandidáty hradišť a vsi
// u běžícího posla – mez = `throughDay` jako u skupin vojska.

const PLACE = { cell: { x: 5, y: 0 }, pos: { x: 0, z: 0 } };

function alarm(extra: Partial<CampaignAlarm>): CampaignAlarm {
  return { villages: [], messengers: [], flights: [], nextRef: 0, ...extra };
}

function alarmVillage(villageId: string, extra: Partial<AlarmVillage> = {}): AlarmVillage {
  return {
    villageId,
    owner: { playerId: 'd', npc: false, houseId: null },
    seenTick: 3_399_999_000,
    seenAt: PLACE,
    warnTick: 3_399_999_500,
    by: 'villager',
    ...extra,
  };
}

function flight(hostVillageId: string | null, extra: Partial<AlarmFlight> = {}): AlarmFlight {
  return {
    ...PLACE,
    route: [],
    leg: null,
    target: PLACE,
    refId: `${CAMPAIGN}:a0`,
    villageId: 'x',
    mode: 'people',
    hostVillageId,
    people: [{ id: 1, bornDay: 0, man: true, line: false }],
    foodKg: 0,
    herd: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    carts: 0,
    status: 'marching',
    departTick: 3_399_999_600,
    ...extra,
  };
}

function messenger(x: number, status: AlarmMessenger['status']): AlarmMessenger {
  return {
    cell: { x, y: 0 },
    pos: { x: 0, z: 0 },
    route: [],
    leg: null,
    target: PLACE,
    refId: `${CAMPAIGN}:a1`,
    fromVillageId: 'x',
    personId: 1,
    toVillageId: 'y',
    mounted: false,
    status,
    departTick: 3_399_999_600,
  };
}

/** Tažení se skupinou daleko od všech vsí (políčko 0) – drží jen varování. */
function alarming(a: CampaignAlarm, extra: Partial<CampaignState> = {}): CampaignState {
  const base = campaign(extra);
  return { ...base, groups: base.groups.map((g) => ({ ...g, cell: { x: 0, y: 0 } })), alarm: a };
}

describe('VillageHolds – varování (Ú3)', () => {
  it('ves ve varování daleko od vojska drží do throughDay a jde přednostně (a)', async () => {
    await createCampaignRepository(db).create(
      alarming(alarm({ villages: [alarmVillage(ids.far)] })),
      NOW,
    );
    const all = [ids.near, ids.adjacent, ids.far];
    expect(await holds.limitOf(all)).toEqual(new Map([[ids.far, DAY - 1]]));
    expect(await villagesNearCampaigns(db)).toEqual([ids.far]);
  });

  it('hostitel skupiny uprchlíků na cestě drží; skupina do lesa nic (b)', async () => {
    await createCampaignRepository(db).create(
      alarming(alarm({ flights: [flight(ids.adjacent), flight(null, { refId: 'z' })] })),
      NOW,
    );
    expect(await holds.limitOf([ids.near, ids.adjacent, ids.far])).toEqual(
      new Map([[ids.adjacent, DAY - 1]]),
    );
  });

  it('kandidát hradiště cizí vsi (id mimo uuid) drží (c)', async () => {
    await createCampaignRepository(db).create(
      alarming(alarm({ villages: [alarmVillage('x', { hosts: [ids.near, 'ne-uuid'] })] })),
      NOW,
    );
    expect(await holds.limitOf([ids.near, ids.adjacent, ids.far])).toEqual(
      new Map([[ids.near, DAY - 1]]),
    );
    expect(await villagesNearCampaigns(db)).toEqual([ids.near]);
  });

  it('běžící posel drží vsi na své mapě a políčko od ní, doběhlý ne (návrh Clauda)', async () => {
    const repo = createCampaignRepository(db);
    await repo.create(
      alarming(alarm({ messengers: [messenger(7, 'running'), messenger(4, 'arrived')] })),
      NOW,
    );
    expect(await holds.limitOf([ids.near, ids.adjacent, ids.far])).toEqual(
      new Map([
        [ids.adjacent, DAY - 1],
        [ids.far, DAY - 1],
      ]),
    );
  });

  it('skončené tažení varováním nedrží (d)', async () => {
    await createCampaignRepository(db).create(
      alarming(
        alarm({
          villages: [alarmVillage(ids.far, { hosts: [ids.near] })],
          flights: [flight(ids.adjacent)],
        }),
        { phase: 'done' },
      ),
      NOW,
    );
    expect(await holds.limitOf([ids.near, ids.adjacent, ids.far])).toEqual(new Map());
    expect(await villagesNearCampaigns(db)).toEqual([]);
  });
});
