import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  foundVillage,
  type NewVillageEvent,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase(testDatabaseUrl());
const villages = createVillageRepository(db);
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

  it('pruneNearby smaže jen snímky okolí vsi do dne včetně, verzi nezvedá, ref jde zapsat znovu', async () => {
    const nearby = (day: number): NewVillageEvent => ({
      villageId,
      day,
      ref: `nearby:${villageId}:${day}`,
      body: { kind: 'nearby', nearby: { day, self: { villageId, name: 'Lhota' }, villages: [] } },
    });
    for (const day of [DAY + 30, DAY + 60, DAY + 90]) await inbox.post(nearby(day));
    await inbox.post(event('jina', DAY + 30));
    const version = (await villages.find(villageId))!.version;
    expect(await inbox.pruneNearby(villageId, DAY + 60)).toBe(2);
    const left = await inbox.pending(villageId, -1, DAY + 365);
    expect(left.map((e) => [e.body.kind, e.day])).toEqual([
      ['chronicle', DAY + 30],
      ['nearby', DAY + 90],
    ]);
    expect((await villages.find(villageId))!.version).toBe(version);
    // smazaný řádek už `ref` neblokuje (úklid jde jen na dny, které se znovu nezapisují)
    expect(await inbox.post(nearby(DAY + 30))).not.toBeNull();
    expect(await inbox.pruneNearby(UNKNOWN, DAY + 365)).toBe(0);
  });
});

describe('výsledky trhu s lidmi ve schránkách zaniklých vsí (markets.md – Rozhodnutí plánu 3, bod 13)', () => {
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
});
