import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  MAIL_KEEP_DAYS,
  dayIndexOf,
  foundVillage,
  pruneSettledMail,
  type NewVillageEvent,
  type VillageMail,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase(testDatabaseUrl());
const villages = createVillageRepository(db, 1);
const inbox = villages.inbox;
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const UNKNOWN = '00000000-0000-0000-0000-000000000000';
let villageId = '';

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

const event = (ref: string, day: number): NewVillageEvent => ({
  villageId,
  day,
  ref,
  body: { kind: 'chronicle', event: { day, kind: 'line-named', name: ref } },
});

/** Sídelní sídlo hráče `ownerId` s vsí `name` na políčku (x, 0). */
async function villageOf(ownerId: string, name: string, x: number): Promise<string> {
  await db.insert(schema.user).values({ id: ownerId, name: '', email: `${ownerId}@example.com` });
  const settlement = await createSettlementRepository(db).createSeat({
    ownerId,
    landscapeSeed: 1 + x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  return (await villages.create(settlement!.id, name, state()))!.id;
}

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
    worldCell: { x: 0, y: 0 },
  });
  const record = await villages.create(settlement!.id, 'Lhota', state());
  villageId = record!.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe('VillageInbox (Drizzle)', () => {
  it('post zvedne verzi i verzi souhrnu a rozběhnutý save s původní verzí selže', async () => {
    const before = (await villages.find(villageId))!;
    const posted = await inbox.post(event('a', DAY + 5));
    expect(posted).toMatchObject({ villageId, day: DAY + 5 });
    const after = (await villages.find(villageId))!;
    expect(after.version).toBe(before.version + 1);
    const [row] = await db.select().from(schema.village).where(eq(schema.village.id, villageId));
    expect(row!.digestVersion).toBe(after.version);
    // dopočet, který začal před zápisem, narazí na konflikt verze
    expect(await villages.save(villageId, before.state, before.version)).toBeNull();
    expect(await villages.save(villageId, after.state, after.version)).not.toBeNull();
  });

  it('opakovaný post se stejným ref nic nezdvojí ani nezvedne verzi', async () => {
    expect(await inbox.post(event('a', DAY + 5))).not.toBeNull();
    const version = (await villages.find(villageId))!.version;
    expect(await inbox.post(event('a', DAY + 9))).toBeNull();
    expect((await villages.find(villageId))!.version).toBe(version);
    const rows = await db.select().from(schema.villageInbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.day).toBe(DAY + 5);
  });

  it('den už spočítaného dne se posune na last_day + 1', async () => {
    const lastDay = (await villages.find(villageId))!.state.lastDay;
    expect((await inbox.post(event('past', lastDay - 3)))!.day).toBe(lastDay + 1);
    expect((await inbox.post(event('now', lastDay)))!.day).toBe(lastDay + 1);
    expect((await inbox.post(event('future', lastDay + 4)))!.day).toBe(lastDay + 4);
  });

  it('pending vrací události z úseku podle (day, seq)', async () => {
    const lastDay = (await villages.find(villageId))!.state.lastDay;
    await inbox.post(event('c', lastDay + 3));
    await inbox.post(event('a', lastDay + 1));
    await inbox.post(event('d', lastDay + 3));
    await inbox.post(event('b', lastDay + 2));
    await inbox.post(event('z', lastDay + 9));
    const names = async (after: number, to: number): Promise<string[]> =>
      (await inbox.pending(villageId, after, to)).map((e) =>
        e.body.kind === 'chronicle' && 'name' in e.body.event ? String(e.body.event.name) : '',
      );
    expect(await names(lastDay, lastDay + 3)).toEqual(['a', 'b', 'c', 'd']);
    // levá mez je otevřená, pravá uzavřená
    expect(await names(lastDay + 1, lastDay + 2)).toEqual(['b']);
    expect(await names(lastDay, lastDay)).toEqual([]);
    // meze mimo rozsah sloupce (od počátku / navždy) se oříznou – Postgres je neodmítne
    expect(await names(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'z',
    ]);
  });

  it('neznámá ves je chyba a nic nezapíše', async () => {
    await expect(inbox.post({ ...event('x', DAY), villageId: UNKNOWN })).rejects.toThrow(
      /neexistuje/,
    );
    expect(await db.select().from(schema.villageInbox)).toHaveLength(0);
  });

  it('pruneUsed smaže jen snímky okolí a zprávy bez nákladu vsi do dne včetně, verzi nezvedá, ref jde zapsat znovu', async () => {
    const nearby = (day: number): NewVillageEvent => ({
      villageId,
      day,
      ref: `nearby:${villageId}:${day}`,
      body: { kind: 'nearby', nearby: { day, self: { villageId, name: 'Lhota' }, villages: [] } },
    });
    const from = { fromVillageId: 'b', fromName: 'Lhota', cells: 1, firstStep: 'E' as const };
    const report = { day: DAY, people: 1, houses: 1, crafts: [], traders: [] };
    // zprávy bez nákladu plánu 3 (dotaz na kováře a na partnera, ohlášení zakázky) a výsledek trhu
    const messages: NewVillageEvent[] = [
      {
        villageId,
        day: DAY + 10,
        ref: `smith:b:${DAY}:ask`,
        body: { kind: 'smith-ask', ask: { key: `smith:b:${DAY}`, ...from, horses: 1, report } },
      },
      {
        villageId,
        day: DAY + 20,
        ref: `kin:b:${DAY}:7:ask`,
        body: {
          kind: 'kin-ask',
          ask: {
            key: `kin:b:${DAY}:7`,
            ...from,
            seeker: { personId: 7, sex: 'male', bornDay: DAY - 9_000, widowed: false },
            report,
          },
        },
      },
      {
        villageId,
        day: DAY + 70,
        ref: `order:b:${villageId}:tools:${DAY}`,
        body: {
          kind: 'order-ready',
          ready: { villageId: 'b', name: 'Lhota', good: 'tools', amount: 5 },
        },
      },
      {
        villageId,
        day: DAY + 20,
        ref: `market:b:1:out`,
        body: {
          kind: 'market-result',
          result: { key: 'market:b:1', sold: {}, bought: {}, unsold: {}, horses: [] },
        },
      },
    ];
    for (const day of [DAY + 30, DAY + 60, DAY + 90]) await inbox.post(nearby(day));
    for (const message of messages) await inbox.post(message);
    await inbox.post(event('jina', DAY + 30));
    const version = (await villages.find(villageId))!.version;
    expect(await inbox.pruneUsed(villageId, DAY + 60)).toBe(4);
    const left = await inbox.pending(villageId, -1, DAY + 365);
    expect(left.map((e) => [e.body.kind, e.day])).toEqual([
      ['market-result', DAY + 20],
      ['chronicle', DAY + 30],
      ['order-ready', DAY + 70],
      ['nearby', DAY + 90],
    ]);
    expect((await villages.find(villageId))!.version).toBe(version);
    // smazaný řádek už `ref` neblokuje (úklid jde jen na dny, které se znovu nezapisují)
    expect(await inbox.post(nearby(DAY + 30))).not.toBeNull();
    expect(await inbox.post(messages[0]!)).not.toBeNull();
    expect(await inbox.pruneUsed(UNKNOWN, DAY + 365)).toBe(0);
  });
});

describe('výsledky trhu s lidmi nebo mincemi ve schránkách zaniklých vsí (markets.md – Rozhodnutí plánu 3, bod 13, a plánu 4, bod 9)', () => {
  /** Výsledek trhu `key` pro ves `target` – s koupenou rodinou (`fromHost`), nebo bez lidí. */
  const result = (
    key: string,
    day: number,
    people: boolean,
    target = villageId,
  ): NewVillageEvent => ({
    villageId: target,
    day,
    ref: `${key}:out`,
    body: {
      kind: 'market-result',
      result: {
        key,
        sold: {},
        bought: {},
        unsold: {},
        horses: [],
        ...(people
          ? {
              newcomers: [
                {
                  good: 'families' as const,
                  people: [{ id: 5, bornDay: DAY - 9_000, dwellingId: 1, sex: 'male' as const }],
                  fromHost: true as const,
                },
              ],
            }
          : {}),
      },
    },
  });

  it('strandedResults: jen s lidmi ve spící vsi a ve vsi se sídlem v archivu; dropStranded je smaže bez verze', async () => {
    const archivedId = await villageOf('hrac-2', 'Vlkov', 1);
    const liveId = await villageOf('hrac-3', 'Hradec', 2);
    await inbox.post(result('market:a:1', DAY + 3, true));
    await inbox.post(result('market:a:2', DAY + 4, false));
    await inbox.post(event('jina', DAY + 3));
    await inbox.post(result('market:b:1', DAY + 5, true, archivedId));
    await inbox.post(result('market:c:1', DAY + 2, true, liveId));
    // nic nezaniklo
    expect(await inbox.strandedResults()).toEqual([]);
    // Lhota vymřela (sloupec `asleep` ze stavu), sídlo Vlkova je v archivu
    const lhota = (await villages.find(villageId))!;
    const dead = { ...lhota.state, extinctDay: lhota.state.lastDay };
    expect(await villages.save(villageId, dead, lhota.version)).not.toBeNull();
    const vlkov = (await villages.find(archivedId))!;
    expect(await createSettlementRepository(db).archive(vlkov.settlementId)).toBe(true);
    const stranded = await inbox.strandedResults();
    expect(
      stranded.map((e) => [
        e.villageId,
        e.day,
        e.body.kind === 'market-result' && e.body.result.key,
      ]),
    ).toEqual([
      [villageId, DAY + 3, 'market:a:1'],
      [archivedId, DAY + 5, 'market:b:1'],
    ]);
    expect(stranded[0]!.body).toMatchObject({ result: { newcomers: [{ fromHost: true }] } });
    const version = (await villages.find(villageId))!.version;
    const live = (await inbox.pending(liveId, -1, DAY + 365))[0]!;
    // výsledek živé vsi ani id mimo UUID nesmaže
    const ids = [...stranded.map((e) => e.id), live.id, UNKNOWN, 'event-1'];
    expect(await inbox.dropStranded(ids)).toBe(2);
    expect(await inbox.strandedResults()).toEqual([]);
    expect(await inbox.pending(liveId, -1, DAY + 365)).toHaveLength(1);
    expect((await inbox.pending(villageId, -1, DAY + 365)).map((e) => e.body.kind)).toEqual([
      'chronicle',
      'market-result',
    ]);
    expect((await villages.find(villageId))!.version).toBe(version);
    // smazaný výsledek už `ref` neblokuje
    expect(await inbox.post(result('market:a:1', DAY + 3, true))).not.toBeNull();
    expect(await inbox.dropStranded([])).toBe(0);
  });

  it('strandedResults: i výsledek s mincemi bez lidí ve spící vsi a v archivu, ne s nulou mincí a bez lidí', async () => {
    // plán 4, bod 9 – měšec výpravy při odjezdu z trhu (`unsold.coins`)
    const unsold = (
      key: string,
      day: number,
      goods: Record<string, number>,
      target = villageId,
    ): NewVillageEvent => ({
      villageId: target,
      day,
      ref: `${key}:out`,
      body: {
        kind: 'market-result',
        result: { key, sold: {}, bought: { pottery: 65 }, unsold: goods, horses: [] },
      },
    });
    const archivedId = await villageOf('hrac-2', 'Vlkov', 1);
    const liveId = await villageOf('hrac-3', 'Hradec', 2);
    await inbox.post(unsold('market:a:1', DAY + 3, { coins: 17 }));
    await inbox.post(unsold('market:a:2', DAY + 4, { coins: 0 }));
    await inbox.post(unsold('market:a:3', DAY + 5, { grain: 17 }));
    await inbox.post(unsold('market:a:4', DAY + 6, {}));
    await inbox.post(result('market:a:5', DAY + 7, true));
    await inbox.post(unsold('market:b:1', DAY + 8, { grain: 5, coins: 1 }, archivedId));
    await inbox.post(unsold('market:c:1', DAY + 2, { coins: 40 }, liveId));
    // příjezd s mincemi není výsledek
    await inbox.post({
      villageId,
      day: DAY + 3,
      ref: 'market:d:1:in',
      body: {
        kind: 'market-arrive',
        arrival: {
          key: 'market:d:1',
          fromVillageId: 'd',
          fromName: 'Lhota',
          stayDays: 1,
          travelDays: 0,
          goods: { coins: 9 },
          horses: [],
          wants: {},
          report: { day: DAY, people: 1, houses: 1, crafts: [], traders: [] },
        },
      },
    });
    // nic nezaniklo
    expect(await inbox.strandedResults()).toEqual([]);
    const lhota = (await villages.find(villageId))!;
    const dead = { ...lhota.state, extinctDay: lhota.state.lastDay };
    expect(await villages.save(villageId, dead, lhota.version)).not.toBeNull();
    const vlkov = (await villages.find(archivedId))!;
    expect(await createSettlementRepository(db).archive(vlkov.settlementId)).toBe(true);
    const stranded = await inbox.strandedResults();
    expect(
      stranded.map((e) => [
        e.villageId,
        e.day,
        e.body.kind === 'market-result' && e.body.result.unsold,
      ]),
    ).toEqual([
      [villageId, DAY + 3, { coins: 17 }],
      [villageId, DAY + 7, {}],
      [archivedId, DAY + 8, { grain: 5, coins: 1 }],
    ]);
    const version = (await villages.find(villageId))!.version;
    expect(await inbox.dropStranded(stranded.map((e) => e.id))).toBe(3);
    expect(await inbox.strandedResults()).toEqual([]);
    expect((await villages.find(villageId))!.version).toBe(version);
    // živé vsi výsledek zůstal
    expect(await inbox.pending(liveId, -1, DAY + 365)).toHaveLength(1);
  });

  it('strandedResults: i výsledek s vlastními neprodanými lidmi (`people`, ne `newcomers`)', async () => {
    const own = (key: string, day: number, people: unknown[]): NewVillageEvent =>
      ({
        villageId,
        day,
        ref: `${key}:out`,
        body: {
          kind: 'market-result',
          result: { key, sold: {}, bought: {}, unsold: {}, horses: [], people },
        },
      }) as NewVillageEvent;
    const family = {
      good: 'families',
      people: [{ id: 5, bornDay: DAY - 9_000, dwellingId: 1, sex: 'male' }],
    };
    await inbox.post(own('market:a:1', DAY + 3, [family]));
    await inbox.post(own('market:a:2', DAY + 4, []));
    const lhota = (await villages.find(villageId))!;
    const dead = { ...lhota.state, extinctDay: lhota.state.lastDay };
    expect(await villages.save(villageId, dead, lhota.version)).not.toBeNull();
    const keys = (await inbox.strandedResults()).map((e) =>
      e.body.kind === 'market-result' ? e.body.result.key : '',
    );
    expect(keys).toEqual(['market:a:1']);
  });

  it('strandedResults: poškozené hodnoty dotaz neshodí – ostatní výsledky se vrátí', async () => {
    const damaged = (key: string, day: number, fields: Record<string, unknown>): NewVillageEvent =>
      ({
        villageId,
        day,
        ref: `${key}:out`,
        body: {
          kind: 'market-result',
          result: { key, sold: {}, bought: {}, unsold: {}, horses: [], ...fields },
        },
      }) as unknown as NewVillageEvent;
    const coins = (value: unknown): Record<string, unknown> => ({ unsold: { coins: value } });
    await inbox.post(damaged('market:a:1', DAY + 1, coins(true)));
    await inbox.post(damaged('market:a:2', DAY + 2, coins(17.5)));
    await inbox.post(damaged('market:a:3', DAY + 3, coins(17)));
    await inbox.post(damaged('market:a:4', DAY + 4, coins(1e20)));
    await inbox.post(damaged('market:a:5', DAY + 5, coins('17')));
    await inbox.post(damaged('market:a:6', DAY + 6, coins(null)));
    await inbox.post(damaged('market:a:7', DAY + 7, coins(-3)));
    await inbox.post(damaged('market:a:8', DAY + 8, { unsold: 17 }));
    await inbox.post(damaged('market:a:9', DAY + 9, { people: null, newcomers: {} }));
    await inbox.post(damaged('market:a:10', DAY + 10, { people: true, ...coins(2) }));
    await inbox.post(result('market:a:11', DAY + 11, true));
    await inbox.post(damaged('market:a:12', DAY + 12, { people: [], newcomers: [] }));
    const lhota = (await villages.find(villageId))!;
    const dead = { ...lhota.state, extinctDay: lhota.state.lastDay };
    expect(await villages.save(villageId, dead, lhota.version)).not.toBeNull();
    const keys = (await inbox.strandedResults()).map((e) =>
      e.body.kind === 'market-result' ? e.body.result.key : '',
    );
    expect(keys).toEqual(['market:a:2', 'market:a:3', 'market:a:4', 'market:a:10', 'market:a:11']);
  });
});

describe('vyřízená pošta výprav (markets.md – Rozhodnutí plánu 4, bod 10)', () => {
  const report = { day: DAY, people: 1, houses: 1, crafts: [], traders: [] };

  /** Příjezd výpravy `key` ve schránce vsi `target`; `fields` navíc v těle (`from`, i poškozené). */
  const arrive = (
    key: string,
    day: number,
    fields: Record<string, unknown> = {},
    target = villageId,
  ): NewVillageEvent =>
    ({
      villageId: target,
      day,
      ref: `${key}:in`,
      body: {
        kind: 'market-arrive',
        arrival: {
          key,
          fromVillageId: 'b',
          fromName: 'Vlkov',
          stayDays: 1,
          travelDays: 0,
          goods: {},
          horses: [],
          wants: {},
          report,
        },
        ...fields,
      },
    }) as NewVillageEvent;

  /** Výsledek výpravy `key` ve schránce vsi `target`. */
  const result = (
    key: string,
    day: number,
    fields: Record<string, unknown> = {},
    target = villageId,
  ): NewVillageEvent =>
    ({
      villageId: target,
      day,
      ref: `${key}:out`,
      body: {
        kind: 'market-result',
        result: { key, sold: {}, bought: {}, unsold: {}, horses: [] },
        ...fields,
      },
    }) as NewVillageEvent;

  /** Zprávy, kterých se úklid pošty nesmí dotknout (den `day`). */
  const others = (day: number): NewVillageEvent[] => [
    event('jina', day),
    {
      villageId,
      day,
      ref: `market:${UNKNOWN}:9:out:back`,
      body: {
        kind: 'stranded-people',
        key: `market:${UNKNOWN}:9`,
        people: [],
        coins: 17,
        from: undefined,
      },
    },
    {
      villageId,
      day,
      ref: `order:${UNKNOWN}:${villageId}:tools:${DAY}`,
      body: {
        kind: 'order-ready',
        ready: { villageId: UNKNOWN, name: 'Vlkov', good: 'tools', amount: 5 },
      },
    },
  ];

  it('settledMail: jen příjezdy a výsledky do dne včetně podle dne, odesílatel z `from` a z `ref`', async () => {
    const other = await villageOf('hrac-2', 'Vlkov', 1);
    const ours = `market:${villageId}`;
    for (const mail of [
      result(`${ours}:1`, DAY + 9, { from: other }),
      arrive(`market:${other}:2`, DAY + 3),
      arrive(`market:${other}:3`, DAY + 4, { from: other }),
      // starší výsledek bez `from` – odesílatel není známý
      result(`${ours}:4`, DAY + 5),
      // poškozené řádky: odesílatel null, dotaz nespadne; příjezd s vadným `from` ho má v `ref`
      arrive('market:neni-uuid:5', DAY + 6),
      arrive('market:', DAY + 6),
      result(`${ours}:6`, DAY + 7, { from: 'Vlkov' }),
      result(`${ours}:7`, DAY + 7, { from: 17 }),
      result(`${ours}:8`, DAY + 7, { from: { id: other } }),
      result(`${ours}:9`, DAY + 7, { from: null }),
      arrive(`market:${other}:10`, DAY + 8, { from: true }),
      // pole `from` platí i u příjezdu, jehož `ref` ves nejmenuje
      arrive('market:neni-uuid:13', DAY + 8, { from: other }),
      ...others(DAY + 3),
      // po mezi a v cizí schránce
      arrive(`market:${other}:11`, DAY + 10),
      arrive(`market:${villageId}:12`, DAY + 3, { from: villageId }, other),
    ]) {
      expect(await inbox.post(mail)).not.toBeNull();
    }
    const rows = await inbox.settledMail(villageId, DAY + 9);
    expect(rows.map((m) => [m.ref, m.day, m.kind, m.sender])).toEqual([
      [`market:${other}:2:in`, DAY + 3, 'market-arrive', other],
      [`market:${other}:3:in`, DAY + 4, 'market-arrive', other],
      [`${ours}:4:out`, DAY + 5, 'market-result', null],
      ['market:neni-uuid:5:in', DAY + 6, 'market-arrive', null],
      ['market::in', DAY + 6, 'market-arrive', null],
      [`${ours}:6:out`, DAY + 7, 'market-result', null],
      [`${ours}:7:out`, DAY + 7, 'market-result', null],
      [`${ours}:8:out`, DAY + 7, 'market-result', null],
      [`${ours}:9:out`, DAY + 7, 'market-result', null],
      [`market:${other}:10:in`, DAY + 8, 'market-arrive', other],
      ['market:neni-uuid:13:in', DAY + 8, 'market-arrive', other],
      [`${ours}:1:out`, DAY + 9, 'market-result', other],
    ]);
    // lehké řádky bez těl, id jako v `pending`
    expect(Object.keys(rows[0]!).sort()).toEqual(['day', 'id', 'kind', 'ref', 'sender']);
    const pending = await inbox.pending(villageId, -1, DAY + 365);
    expect(pending.map((e) => e.id)).toEqual(expect.arrayContaining(rows.map((m) => m.id)));
    // mez mimo rozsah sloupce se ořízne, prázdná schránka nic
    expect(await inbox.settledMail(villageId, Number.MIN_SAFE_INTEGER)).toEqual([]);
    expect(await inbox.settledMail(villageId, Number.MAX_SAFE_INTEGER)).toHaveLength(13);
    expect(await inbox.settledMail(UNKNOWN, DAY + 365)).toEqual([]);
  });

  it('dropSettledMail: smaže jen příjezdy a výsledky té vsi, verzi nezvedne a ref jde zapsat znovu', async () => {
    const other = await villageOf('hrac-2', 'Vlkov', 1);
    const mine = arrive(`market:${other}:1`, DAY + 3, { from: other });
    for (const mail of [mine, result(`market:${villageId}:2`, DAY + 4), ...others(DAY + 5)]) {
      expect(await inbox.post(mail)).not.toBeNull();
    }
    const foreign = (await inbox.post(
      arrive(`market:${villageId}:3`, DAY + 3, { from: villageId }, other),
    ))!;
    const ids = (await inbox.pending(villageId, -1, DAY + 365)).map((e) => e.id);
    const version = (await villages.find(villageId))!.version;
    expect(await inbox.dropSettledMail(villageId, [])).toBe(0);
    expect(await inbox.dropSettledMail(villageId, ['event-1', UNKNOWN])).toBe(0);
    // i s id jiných druhů a cizí vsi zmizí jen příjezd a výsledek
    expect(await inbox.dropSettledMail(villageId, [...ids, foreign.id, 'event-1'])).toBe(2);
    expect((await inbox.pending(villageId, -1, DAY + 365)).map((e) => e.body.kind)).toEqual([
      'chronicle',
      'stranded-people',
      'order-ready',
    ]);
    expect(await inbox.pending(other, -1, DAY + 365)).toHaveLength(1);
    expect((await villages.find(villageId))!.version).toBe(version);
    expect(await inbox.dropSettledMail(villageId, ids)).toBe(0);
    expect(await inbox.post(mine)).not.toBeNull();
  });

  it('pruneSettledMail nad databází: odesílatel o rok dál a bez nevyřízené výpravy – jinak řádek zůstane', async () => {
    const vlkov = await villageOf('hrac-2', 'Vlkov', 1);
    const lhota = `market:${villageId}`;
    const waiting = arrive(`market:${vlkov}:1`, DAY + 5, { from: vlkov });
    for (const mail of [
      waiting,
      result(`${lhota}:2`, DAY + 5, { from: vlkov }),
      result(`${lhota}:3`, DAY + 5),
      arrive(`market:${UNKNOWN}:4`, DAY + 5),
      arrive('market:neni-uuid:5', DAY + 5),
      ...others(DAY + 5),
    ]) {
      expect(await inbox.post(mail)).not.toBeNull();
    }
    const save = async (id: string, change: (s: VillageState) => void): Promise<void> => {
      const record = (await villages.find(id))!;
      const next = structuredClone(record.state);
      change(next);
      expect(await villages.save(id, next, record.version)).not.toBeNull();
    };
    const now = DAY + 5 + MAIL_KEEP_DAYS;
    const left = async (): Promise<string[]> =>
      (await inbox.settledMail(villageId, now)).map((m) => m.ref);
    const all = [waiting.ref, `${lhota}:2:out`, `${lhota}:3:out`].concat(
      `market:${UNKNOWN}:4:in`,
      'market:neni-uuid:5:in',
    );
    await save(villageId, (s) => {
      s.lastDay = now;
    });
    // Vlkov o den méně
    await save(vlkov, (s) => {
      s.lastDay = now - 1;
    });
    expect(await pruneSettledMail({ villages }, villageId, now)).toBe(0);
    // Vlkov o rok dál, příjezd ještě nese v odchozí schránce (pád mezi zápisem a smazáním)
    await save(vlkov, (s) => {
      s.lastDay = now;
      s.outbox = [waiting as VillageMail];
    });
    expect(await left()).toEqual(all);
    // souhrn uložený před `openTrips` (25. 11. 2026) – neví se, co Vlkov ještě řeší: nic se nesmaže
    await db.execute(
      sql`UPDATE ${schema.village} SET digest = digest - 'openTrips' WHERE id = ${vlkov}`,
    );
    expect((await villages.digestsOf([vlkov]))[0]!.digest.openTrips).toBeUndefined();
    expect(await pruneSettledMail({ villages }, villageId, now)).toBe(0);
    expect(await left()).toEqual(all);
    // další uložení Vlkova souhrn obnoví
    await save(vlkov, () => undefined);
    const version = (await villages.find(villageId))!.version;
    expect(await pruneSettledMail({ villages }, villageId, now)).toBe(1);
    expect(await left()).toEqual(all.filter((ref) => ref !== `${lhota}:2:out`));
    // Vlkov spí
    await save(vlkov, (s) => {
      delete s.outbox;
      s.extinctDay = now;
    });
    expect(await pruneSettledMail({ villages }, villageId, now)).toBe(0);
    await save(vlkov, (s) => {
      delete s.extinctDay;
    });
    // dva úklidy najednou: řádek zmizí jednou, nic nespadne
    const dropped = await Promise.all([
      pruneSettledMail({ villages }, villageId, now),
      pruneSettledMail({ villages }, villageId, now),
    ]);
    expect(dropped[0] + dropped[1]).toBe(1);
    expect(await left()).toEqual(all.slice(2));
    expect((await villages.find(villageId))!.version).toBe(version);
    // napojení úložiště: další příjezd uklidí dopočet přes den obnovy okolí (`villages.nearby`)
    expect(await inbox.post(arrive(`market:${vlkov}:6`, now + 1, { from: vlkov }))).not.toBeNull();
    const later = now + 1 + MAIL_KEEP_DAYS;
    for (const id of [villageId, vlkov]) {
      await save(id, (s) => {
        s.lastDay = later;
      });
    }
    const rows = async (): Promise<string[]> =>
      (await inbox.settledMail(villageId, later)).map((m) => m.ref);
    expect(await rows()).toEqual([...all.slice(2), `market:${vlkov}:6:in`]);
    const home = (await villages.find(villageId))!;
    expect(await villages.nearby!.post(home, later, later + 30, [])).toBe(true);
    expect(await rows()).toEqual(all.slice(2));
  });
});
