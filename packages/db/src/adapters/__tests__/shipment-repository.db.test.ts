import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  foundVillage,
  type ShipmentBody,
  type VillageState,
} from '@bohemia/game';
import { createDatabase } from '../../client';
import { schema } from '../../index';
import { createSettlementRepository } from '../settlement-repository';
import { createShipmentRepository } from '../shipment-repository';
import { createVillageRepository } from '../village-repository';

const db = createDatabase('postgres://postgres@127.0.0.1:5432/bohemia_test');
const shipments = createShipmentRepository(db);
const villages = createVillageRepository(db);
const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
let fromId = '';
let toId = '';

const state = (): VillageState =>
  foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: -50.25, z: 12.125, rotation: 0.3 } });

const body = (key: string): ShipmentBody => ({
  key,
  fromVillageId: fromId,
  fromName: 'Dub',
  direction: 'W',
  grainKg: 100,
  hayKg: 0,
  logs: 3,
  cattle: { cows: 1, youngOxen: 0, trainedOxen: 0 },
  horses: [{ bornDay: DAY - 2000, sex: 'female', training: 0 }],
  families: [2],
  men: 1,
  women: 0,
});

const input = (refId: string): Parameters<typeof shipments.reserve>[0] => ({
  fromVillageId: fromId,
  toVillageId: toId,
  body: body(`ship:${refId}`),
  purpose: 'levy',
  refId,
  sentDay: DAY,
  arrivesDay: DAY + 6,
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
  const settlements = createSettlementRepository(db);
  const seat = await settlements.createSeat({
    ownerId: 'hrac-1',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  fromId = (await villages.create(seat!.id, 'Dub', state()))!.id;
  const far = await settlements.create({
    ownerId: 'hrac-1',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 2, y: 0 },
  });
  toId = (await villages.create(far!.id, 'Lhota', state()))!.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe('ShipmentRepository (Drizzle)', () => {
  it('reserve je idempotentní podle refId a tělo projde jsonb beze změny', async () => {
    const first = await shipments.reserve(input('r1'));
    expect(first.created).toBe(true);
    expect(first.record).toMatchObject({ postedAt: null, settledAt: null, body: body('ship:r1') });
    const again = await shipments.reserve(input('r1'));
    expect(again.created).toBe(false);
    expect(again.record.id).toBe(first.record.id);
    expect(await shipments.findByRef('r1')).toEqual(first.record);
    expect(await shipments.findByRef('nikdy')).toBeNull();
  });

  it('životní cyklus: unposted → open/onTheWay → settled', async () => {
    const { record } = await shipments.reserve(input('r2'));
    expect((await shipments.unposted()).map((r) => r.id)).toEqual([record.id]);
    expect(await shipments.open()).toEqual([]);
    await shipments.markPosted(record.id, new Date(1000));
    expect(await shipments.unposted()).toEqual([]);
    expect((await shipments.open()).map((r) => r.id)).toEqual([record.id]);
    expect((await shipments.onTheWay(toId)).map((r) => r.id)).toEqual([record.id]);
    expect(await shipments.onTheWay(fromId)).toEqual([]);
    // druhé označení čas nepřepíše
    await shipments.markPosted(record.id, new Date(2000));
    expect((await shipments.findByRef('r2'))!.postedAt).toEqual(new Date(1000));
    await shipments.settle(record.id, new Date(3000));
    expect(await shipments.open()).toEqual([]);
    expect(await shipments.onTheWay(toId)).toEqual([]);
  });

  it('remove zruší jen nezapsanou rezervaci', async () => {
    const a = await shipments.reserve(input('r3'));
    const b = await shipments.reserve(input('r4'));
    await shipments.markPosted(b.record.id, new Date(0));
    await shipments.remove(a.record.id);
    await shipments.remove(b.record.id);
    expect(await shipments.findByRef('r3')).toBeNull();
    expect(await shipments.findByRef('r4')).not.toBeNull();
  });

  it('řádek zmizí se zaniklou vsí', async () => {
    await shipments.reserve(input('r5'));
    await db.delete(schema.village).where(sql`id = ${toId}`);
    expect(await shipments.findByRef('r5')).toBeNull();
  });
});
