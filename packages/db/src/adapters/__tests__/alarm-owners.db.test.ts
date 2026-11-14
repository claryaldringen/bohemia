// Kdo za varovanou ves rozhoduje, kandidáti hradišť a doména hradiště (plán 2026-11-09 – Úloha 6,
// Otevřené 1, 5, 6): rod s pánem a vazalem, vazal vazala, NPC správce, hráč bez rodu, vsi mimo
// dosah, archivované sídlo a vymřelá ves.
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, foundVillage } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createAlarmOwners } from '../alarm-owners';
import { createHouseRepository } from '../house-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createStewardshipRepository } from '../stewardship-repository';
import { createVassalageRepository } from '../vassalage-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase(testDatabaseUrl());
const port = createAlarmOwners(db);
const NOW = new Date('2026-11-09T12:00:00Z');
const STATE = foundVillage({ seed: 1, day: 7300, dwellingPosition: { x: 0, z: 0, rotation: 0 } });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});
afterAll(async () => {
  await db.$client.end();
});

/**
 * Pán P (vsi p1 0,0 a p2 3,0), jeho vazal Q (q1 1,0, q2 10,0 – od q1 dál než 8 políček, q3 1,3; q1 spravuje
 * NPC rod), vazal vazala R (r1 2,0), cizí N (n1 4,0), hráč Z bez rodu (z1 5,5). Q má ještě vymřelou
 * ves (q4 1,1) a archivované sídlo (q5 0,1).
 */
let v: Record<string, string>;
let house: Record<string, string>;
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db
    .insert(schema.user)
    .values(['p', 'q', 'r', 'n', 'z'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const houses = createHouseRepository(db);
  house = {};
  for (const id of ['p', 'q', 'r', 'n']) {
    house[id] = (await houses.create({ playerId: id, kind: 'player', createdAt: NOW })).id;
  }
  const npc = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
  const vassalages = createVassalageRepository(db);
  const swear = async (lord: string, vassal: string): Promise<string> =>
    (
      await vassalages.create({
        lordHouseId: lord,
        vassalHouseId: vassal,
        terms: {},
        origin: 'negotiation',
        sinceAt: NOW,
        sinceDay: 1,
      })
    ).id;
  await swear(house.p!, house.q!);
  await swear(house.q!, house.r!);
  const npcOath = await swear(house.q!, npc.id);
  const settlements = createSettlementRepository(db);
  const villages = createVillageRepository(db);
  v = {};
  const seats = new Set<string>();
  const at = async (name: string, owner: string, x: number, y: number): Promise<string> => {
    const place = {
      ownerId: owner,
      landscapeSeed: 11,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x, y },
    };
    const seat = !seats.has(owner);
    seats.add(owner);
    const s = seat ? await settlements.createSeat(place) : await settlements.create(place);
    const state = name === 'q4' ? { ...STATE, extinctDay: 7000 } : STATE;
    v[name] = (await villages.create(s!.id, name, state))!.id;
    if (name === 'q5') await settlements.archive(s!.id);
    return v[name];
  };
  await at('p1', 'p', 0, 0);
  await at('p2', 'p', 3, 0);
  await at('q1', 'q', 1, 0);
  await at('q2', 'q', 10, 0);
  await at('q3', 'q', 1, 3);
  await at('q4', 'q', 1, 1);
  await at('q5', 'q', 0, 1);
  await at('r1', 'r', 2, 0);
  await at('n1', 'n', 4, 0);
  await at('z1', 'z', 5, 5);
  await createStewardshipRepository(db).start({
    villageId: v.q1!,
    stewardHouseId: npc.id,
    holderHouseId: house.q!,
    kind: 'npc',
    vassalageId: npcOath,
    since: NOW,
  });
});

const ids = (list: { villageId: string }[]): string[] => {
  const names = new Map(Object.entries(v).map(([name, id]) => [id, name]));
  return list.map((x) => names.get(x.villageId) ?? x.villageId);
};

describe('createAlarmOwners', () => {
  it('ownerOf – držitel a jeho rod, NPC správce, hráč bez rodu, neznámá ves', async () => {
    expect(await port.ownerOf(v.p1!)).toEqual({ playerId: 'p', npc: false, houseId: house.p });
    expect(await port.ownerOf(v.q1!)).toEqual({ playerId: 'q', npc: true, houseId: house.q });
    expect(await port.ownerOf(v.z1!)).toEqual({ playerId: 'z', npc: false, houseId: null });
    expect(await port.ownerOf('00000000-0000-4000-8000-0000000000ff')).toBeNull();
    expect(await port.ownerOf('knezice')).toBeNull();
  });

  it('ownerOf – lordId jen u sídelní vsi rodu (house.lord_village_id)', async () => {
    await db.execute(
      sql`UPDATE house SET lord_village_id = ${v.p1}::uuid, lord_person_id = 4 WHERE id = ${house.p}::uuid`,
    );
    expect(await port.ownerOf(v.p1!)).toEqual({
      playerId: 'p',
      npc: false,
      houseId: house.p,
      lordId: 4,
    });
    // jiná ves téhož rodu – bez lordId
    expect(await port.ownerOf(v.p2!)).toEqual({ playerId: 'p', npc: false, houseId: house.p });
    // NPC ves jako dřív
    expect(await port.ownerOf(v.q1!)).toEqual({ playerId: 'q', npc: true, houseId: house.q });
  });

  it('refugeHostsOf – vlastní rod a přímý pán do 8 políček, od nejbližší', async () => {
    const hosts = await port.refugeHostsOf(v.q1!);
    expect(ids(hosts)).toEqual(['p1', 'p2', 'q3']);
    expect(hosts[0]).toEqual({ villageId: v.p1, cell: { x: 0, y: 0 } });
    // vazal vazala za pánem neutíká k vazalovi, cizí rod nic, hráč bez rodu nic
    expect(ids(await port.refugeHostsOf(v.r1!))).toEqual(['q1', 'q3', 'q2']);
    expect(await port.refugeHostsOf(v.n1!)).toEqual([]);
    expect(await port.refugeHostsOf(v.z1!)).toEqual([]);
    expect(await port.refugeHostsOf('knezice')).toEqual([]);
  });

  it('domainOf – vlastní rod a přímí vazalové (vazal vazala ne), od nejbližší', async () => {
    expect(ids(await port.domainOf(v.p1!))).toEqual(['p1', 'q1', 'p2', 'q3', 'q2']);
    expect(ids(await port.domainOf(v.q1!))).toEqual(['q1', 'r1', 'q3', 'q2']);
    expect(ids(await port.domainOf(v.n1!))).toEqual(['n1']);
    expect(await port.domainOf(v.z1!)).toEqual([]);
  });

  it('konec vazalství – pán už hradištěm není, vazal v doméně není', async () => {
    await db.execute(
      sql`UPDATE vassalage SET ended_at = ${NOW} WHERE vassal_house_id = ${house.q}`,
    );
    expect(ids(await port.refugeHostsOf(v.q1!))).toEqual(['q3']);
    expect(ids(await port.domainOf(v.p1!))).toEqual(['p1', 'p2']);
  });
});
