import path from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  foundVillage,
  dayIndexOf,
  type CampaignState,
  type JourneyState,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { CHANGE_CHANNEL, notifyChange, parseChange, type DbChange } from '../../changes';
import { schema } from '../../index';
import { createCampaignRepository } from '../campaign-repository';
import { createHouseRepository } from '../house-repository';
import { createJourneyRepository } from '../journey-repository';
import { createNoticeRepository } from '../notice-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';
import { createWarRepository } from '../war-repository';

// Triggery oznamující změny (migrace 0053; plán 2026-11-15 – Úloha 1): vlastní spojení s LISTEN
// sbírá náklady, test je filtruje podle id svých řádků. Čekání na doručení a „nic nepřišlo“ řeší
// značka – NOTIFY jedné relace se doručují v pořadí.

const db = createDatabase(testDatabaseUrl());
const villages = createVillageRepository(db);
const campaigns = createCampaignRepository(db);
const journeys = createJourneyRepository(db);
const NOW = new Date('2026-11-15T12:00:00Z');
const JOURNEY = '00000000-0000-4000-8000-0000000000f1';
const CAMPAIGN = '00000000-0000-4000-8000-0000000000f2';
const VILLAGE_V = '00000000-0000-4000-8000-0000000000a1';
const TARGET_T = '00000000-0000-4000-8000-0000000000a2';

let listener: Client;
let raw: string[] = [];
let seen: DbChange[] = [];
let marker = 0;
let settlementId = '';
let warId = '';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
  listener = new Client({ connectionString: testDatabaseUrl() });
  await listener.connect();
  listener.on('notification', (message) => {
    if (message.payload === undefined) return;
    raw.push(message.payload);
    const change = parseChange(message.payload);
    if (change) seen.push(change);
  });
  await listener.query(`LISTEN ${CHANGE_CHANNEL}`);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['a', 'b'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const settlement = await createSettlementRepository(db).createSeat({
    ownerId: 'a',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  settlementId = settlement!.id;
  const houses = createHouseRepository(db);
  const ha = await houses.create({ playerId: 'a', kind: 'player', createdAt: NOW });
  const hb = await houses.create({ playerId: 'b', kind: 'player', createdAt: NOW });
  warId = (
    await createWarRepository(db).start({
      houses: [ha.id, hb.id],
      startedAt: NOW,
      startedDay: 1,
      how: 'declared',
    })
  ).war.id;
  await flush();
  raw = [];
  seen = [];
});

afterAll(async () => {
  await listener.end();
  await db.$client.end();
});

/** Počká, až dorazí vše, co bylo odesláno před voláním (značka jde za nimi), a vrátí nasbírané. */
async function flush(): Promise<DbChange[]> {
  marker += 1;
  const p = `marker-${marker}`;
  await notifyChange(db, { k: 'n', p });
  for (let i = 0; i < 200; i++) {
    if (seen.some((c) => c.k === 'n' && c.p === p)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return seen.filter((c) => !(c.k === 'n' && c.p.startsWith('marker-')));
}

const villageState = (): VillageState =>
  foundVillage({
    seed: 11,
    day: dayIndexOf({ year: 503, month: 4, day: 12 }),
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

const cell = (x: number, y: number): { cell: { x: number; y: number } } => ({ cell: { x, y } });

function journeyState(tick: number, x: number, y: number): JourneyState {
  return {
    kind: 'journey',
    id: JOURNEY,
    tick,
    phase: 'out',
    playerId: 'a',
    home: { villageId: 'v', ...cell(0, 0) },
    groups: [{ id: 0, ...cell(x, y) }],
  } as unknown as JourneyState;
}

function campaignState(tick: number, extra: Record<string, unknown> = {}): CampaignState {
  return {
    id: CAMPAIGN,
    warId,
    tick,
    day: 3,
    phase: 'marching',
    playerId: 'a',
    target: { villageId: TARGET_T, ...cell(5, 5) },
    groups: [{ id: 0, ...cell(1, 1) }],
    ...extra,
  } as unknown as CampaignState;
}

describe('triggery oznamující změny', () => {
  it('uložení vsi pošle v s novou verzí a vlastníkem sídla', async () => {
    const created = (await villages.create(settlementId, 'Libice', villageState()))!;
    await flush();
    seen = [];
    const saved = await villages.save(created.id, villageState(), created.version);
    expect(saved).not.toBeNull();
    expect(await flush()).toEqual([{ k: 'v', id: created.id, ver: created.version + 1, p: 'a' }]);
  });

  it('přejmenování vsi pošle týž druh, uložení s konfliktem verze nic', async () => {
    const created = (await villages.create(settlementId, 'Libice', villageState()))!;
    await flush();
    seen = [];
    expect(await villages.rename(created.id, 'Nová')).toBe(true);
    expect(await flush()).toEqual([{ k: 'v', id: created.id, ver: created.version, p: 'a' }]);
    seen = [];
    expect(await villages.save(created.id, villageState(), created.version + 41)).toBeNull();
    expect(await flush()).toEqual([]);
  });

  it('vložení upozornění pošle n', async () => {
    await createNoticeRepository(db).post({
      playerId: 'b',
      kind: 'invite-accepted',
      payload: {},
      gameDay: 1,
    });
    expect(await flush()).toEqual([{ k: 'n', p: 'b' }]);
  });

  it('změna vlastníka sídla pošle s s novým a starým, vložení s op null', async () => {
    await db
      .update(schema.settlement)
      .set({ ownerId: 'b' })
      .where(eq(schema.settlement.id, settlementId));
    expect(await flush()).toEqual([{ k: 's', p: 'b', op: 'a' }]);
    seen = [];
    await createSettlementRepository(db).create({
      ownerId: 'a',
      landscapeSeed: 2,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 3, y: 0 },
    });
    expect(await flush()).toEqual([{ k: 's', p: 'a', op: null }]);
  });

  it('výprava: založení a bod pošlou j s políčky, posun obě políčka, clearOutbox nic', async () => {
    await journeys.create(journeyState(10, 3, 4), NOW);
    expect(await flush()).toEqual([
      { k: 'j', id: JOURNEY, t: 10, p: 'a', c: [[3, 4]], big: false },
    ]);
    seen = [];
    await journeys.saveCheckpoint(JOURNEY, {
      fromTick: 10,
      seenIntents: 0,
      state: journeyState(12, 4, 4),
      outbox: null,
    });
    const moved = await flush();
    expect(moved).toHaveLength(1);
    const change = moved[0]!;
    expect(change).toMatchObject({ k: 'j', id: JOURNEY, t: 12, p: 'a', big: false });
    expect(change.k === 'j' && [...change.c].sort()).toEqual([
      [3, 4],
      [4, 4],
    ]);
    seen = [];
    await journeys.clearOutbox(JOURNEY, 12);
    expect(await flush()).toEqual([]);
  });

  it('konec výpravy pošle j s t null', async () => {
    await journeys.create(journeyState(10, 3, 4), NOW);
    await flush();
    seen = [];
    await journeys.end(JOURNEY);
    const changes = await flush();
    expect(changes.at(-1)).toMatchObject({ k: 'j', id: JOURNEY, t: null, p: 'a' });
  });

  it('tažení: políčka skupin, poslů a uprchlíků, varované vsi a cíl; konec t null', async () => {
    await campaigns.create(campaignState(100), NOW);
    expect(await flush()).toEqual([
      { k: 'c', id: CAMPAIGN, t: 100, c: [[1, 1]], a: [TARGET_T], big: false },
    ]);
    seen = [];
    const alarm = {
      villages: [{ villageId: VILLAGE_V, hosts: [], seenTick: 1 }],
      messengers: [
        { status: 'running', ...cell(2, 1) },
        { status: 'arrived', ...cell(9, 9) },
      ],
      flights: [{ ...cell(2, 2), hostVillageId: 'h' }],
      nextRef: 0,
    };
    await campaigns.saveCheckpoint(CAMPAIGN, {
      fromTick: 100,
      seenIntents: 0,
      state: campaignState(110, { alarm }),
      outbox: null,
    });
    const [change] = await flush();
    expect(change).toMatchObject({ k: 'c', id: CAMPAIGN, t: 110, big: false });
    if (change?.k !== 'c') throw new Error('čekal se druh c');
    expect(change.c).toEqual(
      expect.arrayContaining([
        [1, 1],
        [2, 1],
        [2, 2],
      ]),
    );
    expect(change.c).not.toContainEqual([9, 9]);
    expect(change.a).toEqual(expect.arrayContaining([VILLAGE_V, TARGET_T]));
    seen = [];
    await db
      .update(schema.campaign)
      .set({ status: 'done' })
      .where(eq(schema.campaign.id, CAMPAIGN));
    const ended = (await flush()).at(-1);
    expect(ended).toMatchObject({ k: 'c', id: CAMPAIGN, t: null, big: false });
    expect(ended?.k === 'c' && ended.a).toEqual(expect.arrayContaining([VILLAGE_V, TARGET_T]));
  });

  it('UPDATE bodu tažení nese sjednocení starého a nového stavu (políčka, vsi, cíl)', async () => {
    const OLD_V = '00000000-0000-4000-8000-0000000000b1';
    const NEW_V = '00000000-0000-4000-8000-0000000000b2';
    const NEW_T = '00000000-0000-4000-8000-0000000000b3';
    const alarm = (villageId: string): Record<string, unknown> => ({
      villages: [{ villageId, hosts: [] }],
      messengers: [],
      flights: [],
      nextRef: 0,
    });
    await campaigns.create(campaignState(100, { alarm: alarm(OLD_V) }), NOW);
    await flush();
    seen = [];
    await campaigns.saveCheckpoint(CAMPAIGN, {
      fromTick: 100,
      seenIntents: 0,
      state: campaignState(110, {
        alarm: alarm(NEW_V),
        groups: [{ id: 0, ...cell(7, 7) }],
        target: { villageId: NEW_T, ...cell(8, 8) },
      }),
      outbox: null,
    });
    const [change] = await flush();
    if (change?.k !== 'c') throw new Error('čekal se druh c');
    expect([...change.c].sort()).toEqual([
      [1, 1],
      [7, 7],
    ]);
    expect([...change.a].sort()).toEqual([OLD_V, NEW_V, TARGET_T, NEW_T].sort());
  });

  it('podivné políčko v bodu zápis neshodí – uloží se a oznámení se vynechá nebo zkrátí', async () => {
    await journeys.create(journeyState(10, 3, 4), NOW);
    await flush();
    seen = [];
    const odd = journeyState(12, 3, 4);
    (odd.groups[0] as unknown as { cell: unknown }).cell = { x: 3.5, y: 'a' };
    await journeys.saveCheckpoint(JOURNEY, {
      fromTick: 10,
      seenIntents: 0,
      state: odd,
      outbox: null,
    });
    expect((await journeys.checkpoint(JOURNEY))?.state.tick).toBe(12);
    const [change] = await flush();
    expect(change).toMatchObject({ k: 'j', id: JOURNEY, t: 12 });
    // staré políčko zůstává ve sjednocení, podivné y se zahodí
    expect(change?.k === 'j' && change.c).toEqual([[3, 4]]);
    await campaigns.create(
      campaignState(100, { groups: [{ id: 0, cell: { x: 1e300, y: 2 } }] }),
      NOW,
    );
    expect(await campaigns.checkpoint(CAMPAIGN)).not.toBeNull();
  });

  it('300 varovaných vsí: náklad ≤ 7900 B a big', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      villageId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      hosts: [],
    }));
    await campaigns.create(
      campaignState(100, { alarm: { villages: many, messengers: [], flights: [] } }),
      NOW,
    );
    await flush();
    const payload = raw.find((text) => text.includes(CAMPAIGN));
    expect(payload).toBeDefined();
    expect(Buffer.byteLength(payload!)).toBeLessThanOrEqual(7900);
    expect(seen.find((c) => c.k === 'c')).toEqual({
      k: 'c',
      id: CAMPAIGN,
      t: 100,
      c: [],
      a: [],
      big: true,
    });
  });

  it('transakce s rollbackem nic nepošle, s commitem pošle', async () => {
    await expect(
      db.transaction(async (tx) => {
        await createNoticeRepository(tx).post({
          playerId: 'a',
          kind: 'invite-accepted',
          payload: {},
          gameDay: 1,
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await flush()).toEqual([]);
    await db.transaction(async (tx) => {
      await createNoticeRepository(tx).post({
        playerId: 'a',
        kind: 'invite-accepted',
        payload: {},
        gameDay: 1,
      });
    });
    expect(await flush()).toEqual([{ k: 'n', p: 'a' }]);
  });
});
