import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CURRENT_LAYER_VERSIONS, dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { createDatabase } from '../../client';
import { testDatabaseUrl } from '../../test-database';
import { schema } from '../../index';
import { createRefugeRepository } from '../refuge-repository';
import { createSettlementRepository } from '../settlement-repository';
import { createVillageRepository } from '../village-repository';

// Vsi na útěku (plán 2026-11-09 – Úloha 10): jen vsi s `refuge` ve stavu, spící ne, podle id.

const db = createDatabase(testDatabaseUrl());
const refugees = createRefugeRepository(db);
const villages = createVillageRepository(db, 1);
const DAY = dayIndexOf({ year: 503, month: 10, day: 2 });

const base = (): VillageState =>
  foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });

async function addVillage(x: number, name: string, state: VillageState): Promise<string> {
  const seat = await createSettlementRepository(db).create({
    ownerId: 'hrac-1',
    landscapeSeed: x + 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  return (await villages.create(seat!.id, name, state))!.id;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../../drizzle') });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user" CASCADE`);
  await db.insert(schema.user).values({ id: 'hrac-1', name: '', email: 'hrac-1@example.com' });
});

afterAll(async () => {
  await db.$client.end();
});

describe('RefugeRepository (Drizzle)', () => {
  it('awayVillages: hradiště i les, bez útěku a spící ves ne', async () => {
    const refuge = (refId: string, hostVillageId?: string): VillageState => ({
      ...base(),
      refuge: {
        refId,
        campaignId: 'c1',
        mode: hostVillageId ? 'all' : 'forest',
        ...(hostVillageId ? { hostVillageId } : {}),
        departedDay: DAY,
      },
    });
    const host = await addVillage(0, 'Hradiště', base());
    const fled = await addVillage(1, 'Kněžice', refuge('c1:a1', host));
    const forest = await addVillage(2, 'Lhota', refuge('c1:a2'));
    await addVillage(3, 'Mrtvá', { ...refuge('c1:a3'), extinctDay: DAY });
    const rows = await refugees.awayVillages();
    expect(rows).toEqual(
      [
        { villageId: fled, refId: 'c1:a1', hostVillageId: host },
        { villageId: forest, refId: 'c1:a2', hostVillageId: null },
      ].sort((a, b) => (a.villageId < b.villageId ? -1 : 1)),
    );
  });
});
